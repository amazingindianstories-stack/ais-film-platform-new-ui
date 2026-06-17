export const IMAGE_MODEL_PROVIDER_GOOGLE = "google";
export const IMAGE_MODEL_PROVIDER_BYTEDANCE = "bytedance";
export const VIDEO_MODEL_PROVIDER_GOOGLE = "google";
export const VIDEO_MODEL_PROVIDER_SEEDANCE = "seedance";

export const DEFAULT_IMAGE_MODEL = "gemini-3-pro-image-preview";
export const DEFAULT_VIDEO_MODEL = "veo-3.1-generate-preview";

export const IMAGE_GENERATION_MODELS = [
  {
    value: DEFAULT_IMAGE_MODEL,
    label: "Gemini 3 Pro Image",
    provider: IMAGE_MODEL_PROVIDER_GOOGLE,
  },
  {
    value: "gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
    provider: IMAGE_MODEL_PROVIDER_GOOGLE,
  },
  {
    value: "seedream-4-0-250828",
    label: "Seedream 4.0",
    provider: IMAGE_MODEL_PROVIDER_BYTEDANCE,
  },
];

export const VIDEO_GENERATION_MODELS = [
  {
    value: DEFAULT_VIDEO_MODEL,
    label: "Veo 3.1",
    provider: VIDEO_MODEL_PROVIDER_GOOGLE,
    durations: [4, 6, 8],
  },
  {
    value: "veo-3.1-fast-generate-preview",
    label: "Veo 3.1 Fast",
    provider: VIDEO_MODEL_PROVIDER_GOOGLE,
    durations: [4, 6, 8],
  },
  {
    value: "seedance-2.0",
    label: "Seedance 2.0",
    provider: VIDEO_MODEL_PROVIDER_SEEDANCE,
    durations: [5, 10, 15],
  },
  {
    value: "seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    provider: VIDEO_MODEL_PROVIDER_SEEDANCE,
    durations: [5, 10, 15],
  },
];

function findOption(options, value, fallbackValue) {
  const normalizedValue = String(value || "").trim();
  return (
    options.find(option => option.value === normalizedValue) ||
    options.find(option => option.value === fallbackValue) ||
    options[0]
  );
}

export function resolveImageModelOption(value) {
  return findOption(IMAGE_GENERATION_MODELS, value, DEFAULT_IMAGE_MODEL);
}

export function resolveVideoModelOption(value) {
  return findOption(VIDEO_GENERATION_MODELS, value, DEFAULT_VIDEO_MODEL);
}

export function isByteDanceImageModel(value) {
  return resolveImageModelOption(value).provider === IMAGE_MODEL_PROVIDER_BYTEDANCE;
}

export function isSeedanceVideoModel(value) {
  return resolveVideoModelOption(value).provider === VIDEO_MODEL_PROVIDER_SEEDANCE;
}

export function getVideoDurationOptions(value) {
  return resolveVideoModelOption(value).durations || [4, 6, 8];
}

export function normalizeVideoDurationForModel(value, modelValue) {
  const options = getVideoDurationOptions(modelValue);
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return options[0];
  if (options.includes(numericValue)) return numericValue;
  return options.find(option => numericValue <= option) || options[options.length - 1];
}
