import { GoogleGenAI } from "@google/genai";
import { writeFile } from "fs/promises";
import {
  MAX_POLL_RETRIES,
  IMAGE_FETCH_TIMEOUT_MS,
  VIDEO_OPERATION_TIMEOUT_MS,
  SOURCE_IMAGE_MAX_BYTES,
  TARGET_ASPECT_RATIO,
  ASPECT_RATIO_TOLERANCE,
} from "./shotVideoConstants.js";

export const ai = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
  : null;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getErrorStatus(error) {
  return error?.status || error?.code || error?.cause?.status || error?.cause?.code;
}

function isRetryableError(error) {
  const status = Number(getErrorStatus(error));
  const message = String(error?.message || "").toLowerCase();

  if (error?.retryable === false) return false;

  return (
    error?.retryable === true ||
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("temporarily") ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("overloaded") ||
    message.includes("unavailable") ||
    message.includes("network") ||
    message.includes("try again")
  );
}

export function isAudioFilteredVideoError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("video was filtered") &&
    (message.includes("audio") || message.includes("safety filter") || message.includes("processing issues"))
  );
}

export function serializeError(error) {
  return {
    message: error?.message || "Unknown video generation error",
    status: getErrorStatus(error) || null,
    retryable: isRetryableError(error),
  };
}

export function shouldFallbackVideoModel(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("still processing")) return false;
  if (isAudioFilteredVideoError(error)) return false;
  return isRetryableError(error);
}

export async function withTimeout(promiseFactory, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
      err.retryable = true;
      err.status = 408;
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promiseFactory(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function withRetry(operation, { label, attempts, baseDelayMs }) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const retryable = isRetryableError(error);
      console.warn(`${label} failed on attempt ${attempt}/${attempts}:`, serializeError(error));

      if (!retryable || attempt === attempts) break;

      const jitter = Math.floor(Math.random() * 650);
      const backoff = baseDelayMs * (2 ** (attempt - 1)) + jitter;
      await sleep(backoff);
    }
  }

  throw lastError;
}

function inferImageMimeType(url, headerValue) {
  const header = String(headerValue || "").split(";")[0].trim().toLowerCase();
  if (header.startsWith("image/")) return header;
  const lowerUrl = String(url || "").toLowerCase();
  if (lowerUrl.includes(".jpg") || lowerUrl.includes(".jpeg")) return "image/jpeg";
  if (lowerUrl.includes(".webp")) return "image/webp";
  return "image/png";
}

function parsePngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function parseJpegDimensions(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += 2 + length;
  }

  return null;
}

export function assertWidescreenDimensions(dimensions, label, { retryable = false } = {}) {
  const ratio = dimensions?.height ? dimensions.width / dimensions.height : null;

  if (!ratio || Math.abs(ratio - TARGET_ASPECT_RATIO) > ASPECT_RATIO_TOLERANCE) {
    const actual = dimensions ? `${dimensions.width}x${dimensions.height}` : "unknown dimensions";
    const err = new Error(`${label} must be native 16:9, but got ${actual}.`);
    err.status = 422;
    err.retryable = retryable;
    err.fatal = true;
    throw err;
  }

  return {
    width: dimensions.width,
    height: dimensions.height,
    aspectRatio: Number(ratio.toFixed(3)),
  };
}

function readMp4BoxHeader(buffer, offset) {
  if (offset + 8 > buffer.length) return null;
  let size = buffer.readUInt32BE(offset);
  const type = buffer.toString("ascii", offset + 4, offset + 8);
  let headerSize = 8;

  if (size === 1) {
    if (offset + 16 > buffer.length) return null;
    const largeSize = buffer.readBigUInt64BE(offset + 8);
    if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    size = Number(largeSize);
    headerSize = 16;
  } else if (size === 0) {
    size = buffer.length - offset;
  }

  if (size < headerSize || offset + size > buffer.length) return null;
  return { size, type, headerSize };
}

function parseMp4VideoDimensions(buffer) {
  const stack = [{ start: 0, end: buffer.length }];
  const containerTypes = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

  while (stack.length) {
    const { start, end } = stack.pop();
    let offset = start;

    while (offset < end - 8) {
      const header = readMp4BoxHeader(buffer, offset);
      if (!header) {
        offset += 1;
        continue;
      }

      const contentStart = offset + header.headerSize;
      const boxEnd = offset + header.size;
      if (header.type === "tkhd") {
        const version = buffer[contentStart];
        const widthOffset = contentStart + (version === 1 ? 88 : 76);
        if (widthOffset + 8 <= boxEnd) {
          const width = buffer.readUInt32BE(widthOffset) / 65536;
          const height = buffer.readUInt32BE(widthOffset + 4) / 65536;
          if (width > 0 && height > 0) return { width, height };
        }
      } else if (containerTypes.has(header.type)) {
        stack.push({ start: contentStart, end: boxEnd });
      }

      offset = boxEnd;
    }
  }

  return null;
}

export async function fetchSourceImage(imageUrl) {
  if (!imageUrl || !(/^https?:\/\//i.test(imageUrl) || String(imageUrl).startsWith('/uploads/'))) return null;

  return withTimeout(async () => {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      const err = new Error(`Source image fetch failed with ${response.status}`);
      err.status = response.status;
      err.retryable = response.status >= 500;
      throw err;
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > SOURCE_IMAGE_MAX_BYTES) {
      const err = new Error("Source image is too large for video conditioning");
      err.status = 413;
      err.retryable = false;
      throw err;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > SOURCE_IMAGE_MAX_BYTES) {
      const err = new Error("Source image is too large for video conditioning");
      err.status = 413;
      err.retryable = false;
      throw err;
    }

    const imageBuffer = Buffer.from(arrayBuffer);
    const dimensions = parsePngDimensions(imageBuffer) || parseJpegDimensions(imageBuffer);
    const verifiedDimensions = assertWidescreenDimensions(dimensions, "Source image for video conditioning");

    return {
      imageBytes: imageBuffer.toString("base64"),
      mimeType: inferImageMimeType(imageUrl, response.headers.get("content-type")),
      dimensions: verifiedDimensions,
    };
  }, IMAGE_FETCH_TIMEOUT_MS, "Source image fetch");
}

function formatOperationError(error) {
  if (!error) return "Video operation failed";
  if (typeof error === "string") return error;
  return error.message || error.details || error.status || JSON.stringify(error);
}

export async function pollVideoOperation(initialOperation) {
  let operation = initialOperation;
  let pollDelayMs = 9000;
  const startedAt = Date.now();

  while (!operation.done) {
    if (Date.now() - startedAt > VIDEO_OPERATION_TIMEOUT_MS) {
      const err = new Error("Video generation is still processing. Retry Generate Remaining later to resume this shot.");
      err.status = 408;
      err.retryable = true;
      throw err;
    }

    await sleep(pollDelayMs);
    operation = await withRetry(
      () => ai.operations.getVideosOperation({ operation }),
      {
        label: "Veo operation poll",
        attempts: MAX_POLL_RETRIES,
        baseDelayMs: 1200,
      }
    );
    pollDelayMs = Math.min(18000, pollDelayMs + 1500);
  }

  if (operation.error) {
    const err = new Error(formatOperationError(operation.error));
    err.status = operation.error.code || operation.error.status || 500;
    err.retryable = isRetryableError(err);
    throw err;
  }

  const generatedVideo = operation.response?.generatedVideos?.[0];
  if (!generatedVideo?.video) {
    const filteredReasons = operation.response?.raiMediaFilteredReasons;
    const err = new Error(
      filteredReasons?.length
        ? `Video was filtered: ${filteredReasons.join(", ")}`
        : "Video model completed but returned no video"
    );
    err.status = filteredReasons?.length ? 422 : 502;
    err.retryable = !filteredReasons?.length;
    throw err;
  }

  return operation;
}

function videoExtension(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("webm")) return "webm";
  if (mime.includes("quicktime") || mime.includes("mov")) return "mov";
  return "mp4";
}

export async function downloadGeneratedVideo(generatedVideo, tmpPath) {
  const video = generatedVideo?.video;
  if (!video) throw new Error("Generated video payload is empty");

  if (video.videoBytes) {
    await writeFile(tmpPath, Buffer.from(video.videoBytes, "base64"));
    return;
  }

  if (video.uri && (/^https?:\/\//i.test(video.uri) || String(video.uri).startsWith('/uploads/'))) {
    const isGoogleApi = video.uri.includes("generativelanguage.googleapis.com") || video.uri.includes("googleapis.com");
    const authenticatedUrl = isGoogleApi && !video.uri.includes("key=")
      ? `${video.uri}${video.uri.includes("?") ? "&" : "?"}key=${process.env.GOOGLE_AI_API_KEY}`
      : video.uri;

    const response = await withTimeout(
      () => fetch(authenticatedUrl, {
        headers: isGoogleApi ? { "x-goog-api-key": process.env.GOOGLE_AI_API_KEY } : {},
      }),
      60000,
      "Generated video download"
    );

    if (!response.ok) {
      const err = new Error(`Generated video download failed with ${response.status}`);
      err.status = response.status;
      err.retryable = response.status >= 500;
      throw err;
    }
    const arrayBuffer = await response.arrayBuffer();
    await writeFile(tmpPath, Buffer.from(arrayBuffer));
    return;
  }

  if (video.uri && !video.uri.startsWith("gs://")) {
    await ai.files.download({ file: video.uri, downloadPath: tmpPath });
    return;
  }

  await ai.files.download({ file: generatedVideo, downloadPath: tmpPath });
}

export function normalizeAspectRatio() {
  return "16:9";
}

export function normalizeResolution(value, durationSeconds) {
  if (value === "1080p" && durationSeconds === 8) return "1080p";
  return "720p";
}
