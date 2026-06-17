import {
  MAX_SUBMIT_RETRIES,
  MAX_POLL_RETRIES,
  VIDEO_SUBMIT_TIMEOUT_MS,
  VIDEO_OPERATION_TIMEOUT_MS,
  SEEDANCE_API_KEY_ENV_NAMES,
  SEEDANCE_VIDEO_BASE_URL,
  compact,
} from "./shotVideoConstants.js";

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

function serializeError(error) {
  return {
    message: error?.message || "Unknown video generation error",
    status: getErrorStatus(error) || null,
    retryable: isRetryableError(error),
  };
}

async function withTimeout(promiseFactory, timeoutMs, label) {
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

async function withRetry(operation, { label, attempts, baseDelayMs }) {
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

function createProviderError(message, { status = 500, retryable = false } = {}) {
  const err = new Error(message);
  err.status = status;
  err.retryable = retryable;
  return err;
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
    payload.error_message ||
    payload.error?.message ||
    payload.error ||
    payload.message ||
    payload.msg ||
    payload.code ||
    fallback
  );
}

export function getByteDanceApiKey() {
  return SEEDANCE_API_KEY_ENV_NAMES.map(name => process.env[name]).find(Boolean) || "";
}

async function submitSeedanceTask({ apiKey, modelName, prompt, imageUrl, durationSeconds }) {
  const response = await withRetry(
    () => withTimeout(
      () => fetch(`${SEEDANCE_VIDEO_BASE_URL}/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: compact(prompt, 6000),
          duration: durationSeconds,
          model: modelName,
          public: false,
          ...(imageUrl ? { images: [imageUrl] } : { aspect_ratio: "16:9" }),
        }),
      }),
      VIDEO_SUBMIT_TIMEOUT_MS,
      `Seedance video submission (${modelName})`
    ),
    {
      label: `Seedance video submission (${modelName})`,
      attempts: MAX_SUBMIT_RETRIES,
      baseDelayMs: 1800,
    }
  );
  const payload = await readJsonOrText(response);

  if (!response.ok || payload?.code >= 400 || payload?.error) {
    throw createProviderError(providerErrorMessage(payload, `Seedance video submission failed with ${response.status}`), {
      status: response.status || payload?.code || 500,
      retryable: response.status === 429 || response.status >= 500,
    });
  }

  const taskId = payload?.data?.task_id || payload?.task_id || payload?.id;
  if (!taskId) {
    throw createProviderError("Seedance video submission did not return a task id", {
      status: 502,
      retryable: true,
    });
  }

  return {
    taskId,
    consumedCredits: payload?.data?.consumed_credits || payload?.consumed_credits || null,
  };
}

async function pollSeedanceTask({ apiKey, taskId }) {
  let pollDelayMs = 9000;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= VIDEO_OPERATION_TIMEOUT_MS) {
    await sleep(pollDelayMs);
    const response = await withRetry(
      () => withTimeout(
        () => fetch(`${SEEDANCE_VIDEO_BASE_URL}/status?task_id=${encodeURIComponent(taskId)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
        VIDEO_SUBMIT_TIMEOUT_MS,
        "Seedance video status"
      ),
      {
        label: "Seedance video status",
        attempts: MAX_POLL_RETRIES,
        baseDelayMs: 1400,
      }
    );
    const payload = await readJsonOrText(response);

    if (!response.ok || payload?.code >= 400 || payload?.error) {
      throw createProviderError(providerErrorMessage(payload, `Seedance status failed with ${response.status}`), {
        status: response.status || payload?.code || 500,
        retryable: response.status === 429 || response.status >= 500,
      });
    }

    const data = payload?.data || payload;
    const status = String(data?.status || "").toUpperCase();
    if (status === "SUCCESS" || status === "COMPLETED" || status === "SUCCEEDED") {
      const videoUrl = Array.isArray(data?.response)
        ? data.response[0]
        : data?.video_url || data?.url || data?.output?.[0];

      if (!videoUrl) {
        throw createProviderError("Seedance completed but returned no video URL", {
          status: 502,
          retryable: true,
        });
      }

      return {
        name: taskId,
        response: {
          generatedVideos: [
            {
              video: {
                uri: videoUrl,
                mimeType: "video/mp4",
              },
            },
          ],
        },
        seedance: data,
      };
    }

    if (status === "FAILED" || status === "ERROR" || status === "CANCELED") {
      throw createProviderError(data?.error_message || "Seedance video generation failed", {
        status: 422,
        retryable: false,
      });
    }

    pollDelayMs = Math.min(18000, pollDelayMs + 1500);
  }

  throw createProviderError("Seedance video generation is still processing. Retry Generate Remaining later to resume this shot.", {
    status: 408,
    retryable: true,
  });
}

export async function runSeedanceVideoGeneration({ modelName, prompt, imageUrl, durationSeconds }) {
  const apiKey = getByteDanceApiKey();
  if (!apiKey) {
    throw createProviderError(`Seedance video generation requires ${SEEDANCE_API_KEY_ENV_NAMES.join(", ")}, or select a Veo model. Add the key to .env.local and restart Next.js.`, {
      status: 503,
      retryable: false,
    });
  }

  const submitted = await submitSeedanceTask({
    apiKey,
    modelName,
    prompt,
    imageUrl,
    durationSeconds,
  });
  const operation = await pollSeedanceTask({ apiKey, taskId: submitted.taskId });
  operation.seedance = {
    ...(operation.seedance || {}),
    consumed_credits: operation.seedance?.consumed_credits || submitted.consumedCredits,
  };
  return {
    result: operation,
    model: modelName,
    attempts: [],
  };
}
