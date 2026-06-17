import {
  compact,
  CHARACTER_REFERENCE_PRIORITY,
  LOCATION_REFERENCE_PRIORITY,
  REFERENCE_IMAGE_TIMEOUT_MS,
  REFERENCE_IMAGE_MAX_BYTES,
  MAX_REFERENCE_IMAGES,
  STORAGE_UPLOAD_TIMEOUT_MS,
  TARGET_ASPECT_RATIO,
  ASPECT_RATIO_TOLERANCE,
  MAX_RETRIES,
} from "./shotImageConstants.js";

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

export function inferImageMimeType(url, headerValue) {
  const header = String(headerValue || "").split(";")[0].trim().toLowerCase();
  if (header.startsWith("image/")) return header;
  const lowerUrl = String(url || "").toLowerCase();
  if (lowerUrl.includes(".jpg") || lowerUrl.includes(".jpeg")) return "image/jpeg";
  if (lowerUrl.includes(".webp")) return "image/webp";
  return "image/png";
}

export function normalizeReferenceImage(image, index) {
  let imageData = image;
  if (typeof image === "string") {
    const text = image.trim();
    if (text.charAt(0) === "{") {
      try {
        imageData = JSON.parse(text);
      } catch {
        imageData = { url: text };
      }
    } else {
      imageData = { url: text };
    }
  }

  if (!imageData || typeof imageData !== "object") return null;
  const url = imageData.url || imageData.src || imageData.image_url || imageData.publicUrl;
  if (!url || !/^https?:\/\//i.test(url)) return null;

  return {
    url,
    label: compact(imageData.label || imageData.name || `Reference ${index + 1}`, 80),
  };
}

export function scoreReferenceLabel(kind, label, index) {
  const lowerLabel = String(label || "").toLowerCase();
  const priorities = kind === "character" ? CHARACTER_REFERENCE_PRIORITY : LOCATION_REFERENCE_PRIORITY;
  const priorityIndex = priorities.findIndex(term => lowerLabel.includes(term));
  const priorityScore = priorityIndex === -1 ? priorities.length + 1 : priorityIndex;
  return priorityScore * 100 + index;
}

export function getAssetReferenceImages(asset, kind, perAssetLimit) {
  const images = Array.isArray(asset?.images) ? asset.images : [];
  const references = images
    .map((image, index) => {
      const ref = normalizeReferenceImage(image, index);
      if (!ref) return null;
      return {
        ...ref,
        kind,
        name: asset?.name || (kind === "character" ? "Character" : "Location"),
        score: scoreReferenceLabel(kind, ref.label, index),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)
    .slice(0, perAssetLimit);

  if (!references.length && asset?.sheetUrl && /^https?:\/\//i.test(asset.sheetUrl)) {
    references.push({
      kind,
      name: asset?.name || (kind === "character" ? "Character" : "Location"),
      label: "Full reference sheet",
      url: asset.sheetUrl,
      score: 999,
    });
  }

  return references;
}

export function normalizeLookupName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function wantedSet(names = []) {
  return new Set((Array.isArray(names) ? names : []).map(normalizeLookupName).filter(Boolean));
}

export function matchesWanted(value, wanted) {
  if (!wanted.size) return true;
  return wanted.has(normalizeLookupName(value));
}

export function isLegacyOutfitFallback(outfitName, characterName, locationName) {
  const normalizedName = normalizeLookupName(outfitName);
  if (!normalizedName) return false;
  return normalizedName === `${normalizeLookupName(characterName)} outfit for ${normalizeLookupName(locationName)}`;
}

export function hasWardrobeOverride(outfit, characterName, locationName) {
  const outfitName = compact(outfit?.outfit_name || outfit?.name, 160);
  const description = compact(outfit?.description || outfit?.outfit_description || outfit?.prompt, 360);
  const hasImage = Boolean(outfit?.image_url || outfit?.imageUrl || outfit?.url);
  const onlyLegacyName = outfitName && !description && !hasImage && isLegacyOutfitFallback(outfitName, characterName, locationName);
  return Boolean(
    !onlyLegacyName && (
      outfitName ||
      description ||
      hasImage
    )
  );
}

export function collectWardrobeItems(wardrobe = [], shotCharacters = [], shotLocations = []) {
  if (!Array.isArray(wardrobe)) return [];
  const wantedCharacters = wantedSet(shotCharacters);
  const wantedLocations = wantedSet(shotLocations);
  if (!wantedCharacters.size) return [];

  return wardrobe.flatMap((entry, entryIndex) => {
    const characterScoped = entry?.scope === "character" || entry?.character_name || entry?.character_id;
    const locationName = characterScoped ? "" : (entry?.location_name || entry?.name || `Location ${entryIndex + 1}`);
    const locationId = characterScoped ? "" : (entry?.location_id || entry?.id || "");
    const locationMatches = characterScoped || matchesWanted(locationName, wantedLocations) || matchesWanted(locationId, wantedLocations);
    if (!locationMatches) return [];

    return (Array.isArray(entry?.outfits) ? entry.outfits : [])
      .filter(outfit => {
        const characterName = outfit?.character_name || entry?.character_name || outfit?.name;
        const characterId = outfit?.character_id || entry?.character_id || outfit?.id;
        if (!hasWardrobeOverride(outfit, characterName, locationName || "wardrobe")) return false;
        return matchesWanted(characterName, wantedCharacters) || matchesWanted(characterId, wantedCharacters);
      })
      .map(outfit => ({
        location_name: locationName,
        character_name: outfit?.character_name || entry?.character_name || outfit?.name || "Character",
        outfit_name: isLegacyOutfitFallback(outfit?.outfit_name || outfit?.name, outfit?.character_name || entry?.character_name || outfit?.name, locationName) ? "" : (outfit?.outfit_name || outfit?.name || ""),
        description: outfit?.description || outfit?.outfit_description || outfit?.prompt || "",
        image_url: outfit?.image_url || outfit?.imageUrl || outfit?.url || "",
      }));
  });
}

export function getWardrobeReferenceImages(wardrobe, shotCharacters, shotLocations) {
  return collectWardrobeItems(wardrobe, shotCharacters, shotLocations)
    .map((item, index) => {
      if (!item.image_url || !/^https?:\/\//i.test(item.image_url)) return null;
      return {
        kind: "wardrobe",
        name: item.location_name ? `${item.character_name} @ ${item.location_name}` : `${item.character_name} wardrobe`,
        label: compact(item.outfit_name || `Outfit reference ${index + 1}`, 80),
        url: item.image_url,
        score: index,
      };
    })
    .filter(Boolean);
}

export function dedupeReferenceImages(references = []) {
  const seen = new Set();
  return references
    .filter(reference => {
      if (seen.has(reference.url)) return false;
      seen.add(reference.url);
      return true;
    })
    .slice(0, MAX_REFERENCE_IMAGES);
}

export function collectFocusedReferenceImages(matchedCharacters, matchedLocations, wardrobe = [], shotCharacters = [], shotLocations = []) {
  const references = [];

  const characterByName = new Map(
    (Array.isArray(matchedCharacters) ? matchedCharacters : [])
      .map(character => [normalizeLookupName(character?.name), character])
      .filter(([name]) => Boolean(name))
  );
  const orderedCharacter = (Array.isArray(shotCharacters) ? shotCharacters : [])
    .map(name => characterByName.get(normalizeLookupName(name)))
    .find(Boolean);
  const primaryCharacter = orderedCharacter || (Array.isArray(matchedCharacters) ? matchedCharacters[0] : null);
  const hasNamedMainCharacter = Boolean(primaryCharacter);

  if (primaryCharacter) {
    if (primaryCharacter.anchor_image_url && /^https?:\/\//i.test(primaryCharacter.anchor_image_url)) {
      references.push({
        kind: "character",
        name: primaryCharacter.name,
        label: "Character anchor — identity lock",
        url: primaryCharacter.anchor_image_url,
        score: 0,
      });
    } else {
      const images = Array.isArray(primaryCharacter?.images) ? primaryCharacter.images : [];
      const facePriority = [
        "face close-up front",
        "face close-up",
        "close-up",
        "face front",
        "portrait front",
        "mid portrait",
        "full body front",
        "front",
      ];
      const bestFace = images
        .map((image, index) => {
          const ref = normalizeReferenceImage(image, index);
          if (!ref) return null;
          const lowerLabel = ref.label.toLowerCase();
          const score = facePriority.findIndex((term) => lowerLabel.includes(term));
          return {
            ...ref,
            kind: "character",
            name: primaryCharacter.name,
            score: score === -1 ? 99 : score,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score)[0];

      if (bestFace) references.push(bestFace);
    }
  }

  const wardrobeItems = hasNamedMainCharacter
    ? collectWardrobeItems(wardrobe, shotCharacters, shotLocations)
    : [];
  const bestWardrobe = wardrobeItems.find((item) => (
    item.image_url &&
    /^https?:\/\//i.test(item.image_url) &&
    normalizeLookupName(item.character_name) === normalizeLookupName(primaryCharacter?.name)
  )) || wardrobeItems.find((item) => item.image_url && /^https?:\/\//i.test(item.image_url));
  if (bestWardrobe) {
    references.push({
      kind: "wardrobe",
      name: bestWardrobe.location_name
        ? `${bestWardrobe.character_name} @ ${bestWardrobe.location_name}`
        : `${bestWardrobe.character_name} wardrobe`,
      label: compact(bestWardrobe.outfit_name || "Outfit reference", 80),
      url: bestWardrobe.image_url,
      score: 1,
    });
  }

  const primaryLocation = Array.isArray(matchedLocations) ? matchedLocations[0] : null;
  if (primaryLocation) {
    const images = Array.isArray(primaryLocation?.images) ? primaryLocation.images : [];
    const locationPriority = [
      "establishing",
      "wide",
      "wide shot",
      "interior wide",
      "exterior",
      "ground level",
      "atmosphere",
    ];
    const bestLocation = images
      .map((image, index) => {
        const ref = normalizeReferenceImage(image, index);
        if (!ref) return null;
        const lowerLabel = ref.label.toLowerCase();
        const score = locationPriority.findIndex((term) => lowerLabel.includes(term));
        return {
          ...ref,
          kind: "location",
          name: primaryLocation.name,
          score: score === -1 ? 99 : score,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)[0];
    if (bestLocation) references.push(bestLocation);
  }

  const seen = new Set();
  return references.filter((reference) => {
    if (seen.has(reference.url)) return false;
    seen.add(reference.url);
    return true;
  }).slice(0, 3);
}

export function collectShotReferenceImages(matchedCharacters, matchedLocations, wardrobe = [], shotCharacters = [], shotLocations = []) {
  const wardrobeRefs = getWardrobeReferenceImages(wardrobe, shotCharacters, shotLocations);
  const remaining = Math.max(MAX_REFERENCE_IMAGES - wardrobeRefs.length, 0);

  const charBudget = Math.ceil(remaining * 0.6);
  const locBudget = remaining - charBudget;
  const perChar = matchedCharacters.length ? Math.max(Math.floor(charBudget / matchedCharacters.length), 1) : 0;
  const perLoc = matchedLocations.length ? Math.max(Math.floor(locBudget / matchedLocations.length), 1) : 0;

  const charRefs = matchedCharacters.flatMap(c => getAssetReferenceImages(c, "character", perChar));
  const locRefs = matchedLocations.flatMap(l => getAssetReferenceImages(l, "location", perLoc));

  return dedupeReferenceImages([...charRefs, ...wardrobeRefs, ...locRefs]);
}

export function parsePngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export function parseJpegDimensions(buffer) {
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

export function assertNativeWidescreenImage(buffer, label) {
  const dimensions = parsePngDimensions(buffer) || parseJpegDimensions(buffer);
  const ratio = dimensions?.height ? dimensions.width / dimensions.height : null;

  if (!ratio || Math.abs(ratio - TARGET_ASPECT_RATIO) > ASPECT_RATIO_TOLERANCE) {
    const actual = dimensions ? `${dimensions.width}x${dimensions.height}` : "unknown dimensions";
    const err = new Error(`${label} must be native 16:9, but got ${actual}.`);
    err.status = 502;
    err.retryable = true;
    throw err;
  }

  return dimensions;
}

export async function fetchRemoteImageBuffer(url) {
  const response = await withTimeout(
    () => fetch(url),
    STORAGE_UPLOAD_TIMEOUT_MS,
    "ByteDance image download"
  );

  if (!response.ok) {
    throw createProviderError(`Generated image download failed with ${response.status}`, {
      status: response.status,
      retryable: response.status >= 500,
    });
  }

  const mimeType = response.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mimeType };
}

export async function fetchReferenceImage(reference, shotIndex) {
  const response = await withTimeout(
    () => fetch(reference.url),
    REFERENCE_IMAGE_TIMEOUT_MS,
    `Shot ${shotIndex + 1} reference image download`
  );

  if (!response.ok) {
    throw createProviderError(`Reference image download failed with ${response.status}`, {
      status: response.status,
      retryable: response.status >= 500,
    });
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > REFERENCE_IMAGE_MAX_BYTES) {
    throw createProviderError("Reference image is too large for prompt conditioning", {
      status: 413,
      retryable: false,
    });
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > REFERENCE_IMAGE_MAX_BYTES) {
    throw createProviderError("Reference image is too large for prompt conditioning", {
      status: 413,
      retryable: false,
    });
  }

  const mimeType = inferImageMimeType(reference.url, response.headers.get("content-type"));
  return {
    ...reference,
    mimeType,
    imageBase64: Buffer.from(arrayBuffer).toString("base64"),
  };
}

export async function loadReferenceImages(references, shotIndex) {
  if (!Array.isArray(references) || !references.length) return [];

  const loaded = await Promise.all(references.map(async (reference) => {
    try {
      return await fetchReferenceImage(reference, shotIndex);
    } catch (error) {
      console.warn(`Shot ${shotIndex + 1} skipped ${reference.kind} reference ${reference.name}:`, serializeError(error));
      return null;
    }
  }));

  return loaded.filter(Boolean).slice(0, MAX_REFERENCE_IMAGES);
}
