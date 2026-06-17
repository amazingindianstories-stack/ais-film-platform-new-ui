export const MAX_RETRIES = 3;
export const IMAGE_GENERATION_TIMEOUT_MS = 90000;
export const STORAGE_UPLOAD_TIMEOUT_MS = 30000;
export const BYTEDANCE_IMAGE_TIMEOUT_MS = Number(process.env.BYTEDANCE_IMAGE_TIMEOUT_MS || 120000);
export const BYTEDANCE_IMAGE_BASE_URL = (
  process.env.BYTEDANCE_IMAGE_BASE_URL ||
  process.env.BYTEDANCE_BASE_URL ||
  "https://ark.ap-southeast.bytepluses.com/api/v3"
).replace(/\/+$/, "");
export const TARGET_ASPECT_RATIO = 16 / 9;
export const ASPECT_RATIO_TOLERANCE = 0.08;
export const REFERENCE_IMAGE_TIMEOUT_MS = 25000;
export const REFERENCE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const MAX_REFERENCE_IMAGES = 12;
export const MAX_REFERENCE_IMAGES_PER_CHARACTER = 3;
export const MAX_REFERENCE_IMAGES_PER_LOCATION = 3;
export const QUALITY_CANDIDATE_COUNT = Number(process.env.IMAGE_QUALITY_CANDIDATES || 2);
export const FACE_SCORE_THRESHOLD = Number(process.env.FACE_SCORE_THRESHOLD || 9);
export const OUTFIT_SCORE_THRESHOLD = Number(process.env.OUTFIT_SCORE_THRESHOLD || 9);
export const STRICT_IDENTITY_LOCK = String(process.env.STRICT_IDENTITY_LOCK || "true").toLowerCase() !== "false";
export const QUALITY_CHECK_TIMEOUT_MS = 25000;
export const QUALITY_CHECK_MODEL = process.env.GOOGLE_QUALITY_CHECK_MODEL || "gemini-2.5-flash";
export const QUALITY_CHECK_MODEL_FALLBACKS = String(process.env.GOOGLE_QUALITY_CHECK_MODELS || "")
  .split(",")
  .map(model => model.trim())
  .filter(Boolean);

export const CHARACTER_REFERENCE_PRIORITY = [
  "face close-up front",
  "face close-up",
  "face front",
  "mid portrait",
  "face 3/4",
  "portrait front",
  "full body front",
  "outfit front",
  "full body",
  "portrait",
  "front",
  "outfit",
];

export const LOCATION_REFERENCE_PRIORITY = [
  "establishing",
  "wide",
  "ground level",
  "interior",
  "exterior",
  "night",
  "dusk",
  "golden hour",
  "day",
  "atmosphere",
  "detail",
  "texture",
];

export const compact = (value, maxLength = 900) => {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

export const RAW_SHOT_BLOCKED_PHRASES = /\b(?:smash cut|match cut|jump cut|cut to black|cut to|fade in|fade out|fade to black|dissolve|iris wipe|wipe|transition|blackout|title card|montage|split screen|curtain reveal|black wall|black bars|letterbox|pillarbox|lens cap pass|camera passes through darkness|object passes close to camera)\b/gi;

export const rawShotText = (value, maxLength = 900, fallback = '') => (
  compact(value, maxLength)
    .replace(RAW_SHOT_BLOCKED_PHRASES, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim() || fallback
);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function getErrorStatus(error) {
  return error?.status || error?.code || error?.cause?.status || error?.cause?.code;
}

export function isRetryableError(error) {
  const status = Number(getErrorStatus(error));
  const message = String(error?.message || '').toLowerCase();

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
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('temporarily') ||
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('overloaded') ||
    message.includes('unavailable') ||
    message.includes('network')
  );
}

export function serializeError(error) {
  return {
    message: error?.message || 'Unknown image generation error',
    status: getErrorStatus(error) || null,
    retryable: isRetryableError(error),
  };
}

export async function withTimeout(promiseFactory, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
      err.retryable = true;
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promiseFactory(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function withRetry(operation, { label, attempts = MAX_RETRIES, baseDelayMs = 900 }) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const retryable = isRetryableError(error);
      console.warn(`${label} failed on attempt ${attempt}/${attempts}:`, serializeError(error));

      if (!retryable || attempt === attempts) break;

      const jitter = Math.floor(Math.random() * 450);
      const backoff = baseDelayMs * (2 ** (attempt - 1)) + jitter;
      await sleep(backoff);
    }
  }

  throw lastError;
}

export function createProviderError(message, { status = 500, retryable = false } = {}) {
  const err = new Error(message);
  err.status = status;
  err.retryable = retryable;
  return err;
}
