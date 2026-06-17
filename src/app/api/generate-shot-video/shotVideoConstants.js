export const MAX_SUBMIT_RETRIES = 3;
export const MAX_POLL_RETRIES = 4;
export const VIDEO_SUBMIT_TIMEOUT_MS = 65000;
export const IMAGE_FETCH_TIMEOUT_MS = 25000;
export const VIDEO_OPERATION_TIMEOUT_MS = Number(process.env.GOOGLE_VIDEO_TIMEOUT_MS || 540000);
export const STORAGE_UPLOAD_TIMEOUT_MS = 60000;
export const SOURCE_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
export const SEEDANCE_API_KEY_ENV_NAMES = ["BYTEDANCE_API_KEY", "SEEDANCE_API_KEY", "ARK_API_KEY"];
export const SEEDANCE_VIDEO_BASE_URL = (
  process.env.SEEDANCE_VIDEO_BASE_URL ||
  process.env.BYTEDANCE_VIDEO_BASE_URL ||
  "https://seedanceapi.org/v2"
).replace(/\/+$/, "");
export const TARGET_ASPECT_RATIO = 16 / 9;
export const ASPECT_RATIO_TOLERANCE = 0.08;

export const compact = (value, maxLength = 900) => {
  if (!value) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

export const RAW_CLIP_BLOCKED_PHRASES = /\b(?:smash cut|match cut|jump cut|cut to black|cut to|fade in|fade out|fade to black|dissolve|iris wipe|wipe|transition|blackout|title card|montage|split screen|curtain reveal|curtain opens?|opening curtain|stage curtain|drapes?|black wall|black bars|letterbox|pillarbox|matte box|matte boxes|lens cap pass|camera passes through darkness|object passes close to camera)\b/gi;

export const rawClipText = (value, maxLength = 900, fallback = "") => (
  compact(value, maxLength)
    .replace(RAW_CLIP_BLOCKED_PHRASES, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim() || fallback
);
