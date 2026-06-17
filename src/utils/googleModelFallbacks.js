export const TEXT_MODEL_FALLBACKS = [
  "gemini-2.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-3-pro-preview",
  "gemini-2.0-flash",
];

export const TRANSCRIPT_MODEL_FALLBACKS = [
  "gemini-2.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-3-pro-preview",
  "gemini-2.0-flash",
];

export const IMAGE_MODEL_FALLBACKS = [
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation",
];

export const VIDEO_MODEL_FALLBACKS = [
  "veo-3.1-generate-preview",
  "veo-3.1-fast-generate-preview",
  "veo-3.0-generate-001",
  "veo-3.0-fast-generate-001",
];

function isFilteredSafetyOrPolicyError(message) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("video was filtered") ||
    text.includes("safety filter") ||
    text.includes("policy violation") ||
    text.includes("content policy") ||
    text.includes("rai")
  );
}

export function getErrorStatus(error) {
  return error?.status || error?.code || error?.cause?.status || error?.cause?.code;
}

export function isModelFallbackError(error) {
  const status = Number(getErrorStatus(error));
  const message = String(error?.message || "").toLowerCase();

  if (error?.retryable === false) return false;
  if (isFilteredSafetyOrPolicyError(message)) return false;

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
    message.includes("resource exhausted") ||
    message.includes("overloaded") ||
    message.includes("high traffic") ||
    message.includes("unavailable") ||
    message.includes("try again") ||
    message.includes("network")
  );
}

export function serializeModelError(error) {
  return {
    message: error?.message || "Unknown Google model error",
    status: getErrorStatus(error) || null,
    retryable: isModelFallbackError(error),
  };
}

function splitModels(value) {
  return String(value || "")
    .split(",")
    .map(model => model.trim())
    .filter(Boolean);
}

export function getFallbackModels(primary, fallbackModels) {
  const configuredModels = splitModels(primary);
  if (configuredModels.length) return [configuredModels[0]];

  const defaultModels = Array.isArray(fallbackModels)
    ? fallbackModels.filter(Boolean)
    : [];
  return defaultModels.length ? [defaultModels[0]] : [];
}

export async function runWithModelFallback({
  label,
  models,
  operation,
  shouldFallback = isModelFallbackError,
}) {
  const modelList = getFallbackModels(null, models);
  if (!modelList.length) throw new Error(`${label} has no configured Google models`);

  const attempts = [];
  const model = modelList[0];

  try {
    const result = await operation(model);
    return { result, model, attempts };
  } catch (error) {
    const serialized = serializeModelError(error);
    attempts.push({ model, ...serialized });
    console.warn(`${label} failed on model ${model}:`, serialized);
    if (shouldFallback(error)) {
      console.warn(`${label} model fallback is disabled; not retrying with alternate models.`);
    }
    const finalError = error instanceof Error
      ? error
      : new Error(String(error || `${label} failed`));
    finalError.modelFallbackAttempts = attempts;
    throw finalError;
  }
}
