import {
  MAX_RETRIES,
  BYTEDANCE_IMAGE_TIMEOUT_MS,
  BYTEDANCE_IMAGE_BASE_URL,
} from "./shotImageConstants.js";
import {
  withTimeout,
  withRetry,
  createProviderError,
  fetchRemoteImageBuffer,
  assertNativeWidescreenImage,
} from "./referenceImages.js";

function getByteDanceApiKey() {
  return process.env.BYTEDANCE_API_KEY || process.env.ARK_API_KEY || process.env.SEEDANCE_API_KEY || "";
}

async function readJsonOrText(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function providerErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload;
  return (
    payload.error?.message ||
    payload.error ||
    payload.message ||
    payload.msg ||
    payload.code ||
    fallback
  );
}

export async function generateByteDanceImage({ prompt, modelName, shotIndex }) {
  const apiKey = getByteDanceApiKey();
  if (!apiKey) {
    throw createProviderError("BYTEDANCE_API_KEY is not configured for Seedream image generation.", {
      status: 500,
      retryable: false,
    });
  }

  const response = await withRetry(
    () => withTimeout(
      () => fetch(`${BYTEDANCE_IMAGE_BASE_URL}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          prompt,
          size: process.env.BYTEDANCE_IMAGE_SIZE || "1280x720",
          response_format: "b64_json",
          sequential_image_generation: "disabled",
          stream: false,
          watermark: false,
        }),
      }),
      BYTEDANCE_IMAGE_TIMEOUT_MS,
      `Seedream image request (${modelName})`
    ),
    {
      label: `Shot ${shotIndex + 1} Seedream image generation`,
      attempts: MAX_RETRIES,
      baseDelayMs: 1600,
    }
  );
  const payload = await readJsonOrText(response);

  if (!response.ok || payload?.error) {
    throw createProviderError(providerErrorMessage(payload, `Seedream image request failed with ${response.status}`), {
      status: response.status || 500,
      retryable: response.status === 429 || response.status >= 500,
    });
  }

  const item = payload?.data?.[0] || payload?.result?.data?.[0] || payload?.result?.[0];
  const b64Json = item?.b64_json || item?.b64 || item?.base64 || item?.image_base64;
  const imageUrl = item?.url || item?.image_url || item?.image;
  let buffer;
  let mimeType = "image/jpeg";

  if (b64Json) {
    buffer = Buffer.from(String(b64Json).replace(/^data:image\/\w+;base64,/, ""), "base64");
  } else if (imageUrl) {
    const fetchedImage = await fetchRemoteImageBuffer(imageUrl);
    buffer = fetchedImage.buffer;
    mimeType = fetchedImage.mimeType;
  } else {
    throw createProviderError("Seedream image model returned no image data", {
      status: 502,
      retryable: true,
    });
  }

  assertNativeWidescreenImage(buffer, `Shot ${shotIndex + 1} Seedream source frame`);

  return {
    result: {
      imageBase64: buffer.toString("base64"),
      mimeType,
    },
    model: modelName,
    attempts: [],
  };
}
