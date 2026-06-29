import { NextResponse } from "next/server";
import { prisma } from "@/utils/prisma";
import { storage } from "@/utils/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function isAuthorized(req) {
  const expected = process.env.STUDIO_BACKEND_SHARED_SECRET;
  if (!expected) return true;
  return req.headers.get("x-studio-backend-key") === expected;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lookup(value) {
  return clean(value).toLowerCase();
}

function sanitize(value, fallback = "item") {
  return String(value || fallback)
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || fallback;
}

function findByName(items, name, id) {
  const needle = lookup(name);
  const idNeedle = lookup(id);
  return (Array.isArray(items) ? items : []).find((item) => (
    (idNeedle && lookup(item?.id || item?.location_id || item?.character_id) === idNeedle)
    || (needle && lookup(item?.name || item?.location_name || item?.character_name) === needle)
  )) || null;
}

function imageList(outfit) {
  const images = Array.isArray(outfit?.images) ? outfit.images : [];
  const primary = outfit?.image_url || outfit?.imageUrl || outfit?.url;
  if (!primary) return images;
  const alreadyIncluded = images.some((image) => image?.url === primary || image?.path === outfit?.image_path);
  return alreadyIncluded ? images : [{ url: primary, path: outfit?.image_path || "", kind: "wardrobe" }, ...images];
}

function matchesIdentifier(current, expected) {
  const left = lookup(current);
  const right = lookup(expected);
  return Boolean(left && right && left === right);
}

export async function POST(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized backend bridge request." }, { status: 401 });
  }

  let formData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const projectId = clean(formData.get("projectId"));
  const characterName = clean(formData.get("characterName"));
  const locationName = clean(formData.get("locationName"));
  const characterId = clean(formData.get("characterId"));
  const locationId = clean(formData.get("locationId"));
  const outfitId = clean(formData.get("outfitId"));
  const outfitName = clean(formData.get("outfitName"));
  const description = formData.get("description");
  const removePath = clean(formData.get("removePath"));
  const files = formData.getAll("files").filter((file) => file && typeof file.arrayBuffer === "function");

  if (!projectId) return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
  if (!characterName) return NextResponse.json({ error: "Choose a character first." }, { status: 400 });

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { project_state: true }
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const projectState = project.project_state || {};
    const matchedCharacter = findByName(projectState.characters, characterName, characterId);
    const matchedLocation = locationName ? findByName(projectState.locations, locationName, locationId) : null;
    const safeCharacterName = clean(matchedCharacter?.name || characterName);
    const safeLocationName = clean(matchedLocation?.name || locationName);
    const safeOutfitLabel = clean(outfitName) || "Outfit";

    const uploaded = [];
    for (const file of files) {
      if (Number(file.size) > MAX_IMAGE_BYTES) continue;
      const folder = safeLocationName
        ? `${sanitize(safeLocationName)}/${sanitize(safeCharacterName)}`
        : `${sanitize(safeCharacterName)}/outfits`;
      const path = `${projectId}/wardrobe/${folder}/${Date.now()}-${sanitize(file.name, "image")}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await storage.from("assets").upload(path, buffer, { contentType: file.type || "image/png" });
      if (uploadError) continue;
      const { data: { publicUrl } } = storage.from("assets").getPublicUrl(path);
      uploaded.push({
        url: publicUrl,
        path,
        kind: "wardrobe",
        label: safeLocationName ? `${safeCharacterName} @ ${safeLocationName}` : `${safeCharacterName} - ${safeOutfitLabel}`,
        uploaded_at: new Date().toISOString(),
      });
    }

    const wardrobe = Array.isArray(projectState.wardrobe) ? [...projectState.wardrobe] : [];
    let outfit = null;

    if (!safeLocationName) {
      let characterIndex = wardrobe.findIndex((entry) => (
        (entry?.scope === "character" || entry?.character_name || entry?.character_id)
        && (
          matchesIdentifier(entry?.character_id || entry?.id, matchedCharacter?.id || characterId)
          || matchesIdentifier(entry?.character_name || entry?.name, safeCharacterName)
        )
      ));
      if (characterIndex === -1) {
        wardrobe.push({
          scope: "character",
          character_id: matchedCharacter?.id || characterId || sanitize(safeCharacterName),
          character_name: safeCharacterName,
          outfits: [],
        });
        characterIndex = wardrobe.length - 1;
      }

      const characterRow = { ...wardrobe[characterIndex] };
      const outfits = Array.isArray(characterRow.outfits) ? [...characterRow.outfits] : [];
      const outfitNeedle = lookup(outfitName);
      let outfitIndex = outfits.findIndex((item) => (
        matchesIdentifier(item?.outfit_id || item?.id, outfitId)
        || (outfitNeedle && lookup(item?.outfit_name || item?.name) === outfitNeedle)
      ));

      if (outfitIndex === -1) {
        outfits.push({
          outfit_id: outfitId || sanitize(outfitName || `outfit-${outfits.length + 1}`),
          outfit_name: outfitName || `Outfit ${outfits.length + 1}`,
          description: "",
          present: true,
          locked: true,
          images: [],
        });
        outfitIndex = outfits.length - 1;
      }

      outfit = { ...outfits[outfitIndex] };
      const images = imageList(outfit).filter((image) => image?.path !== removePath);
      if (description != null) outfit.description = String(description);
      outfit.outfit_id = outfit.outfit_id || outfitId || sanitize(outfitName || `outfit-${outfitIndex + 1}`);
      outfit.outfit_name = outfitName || outfit.outfit_name || `Outfit ${outfitIndex + 1}`;
      outfit.character_id = matchedCharacter?.id || characterId || outfit.character_id;
      outfit.character_name = safeCharacterName;
      outfit.images = [...images, ...uploaded];
      outfit.image_url = outfit.images[0]?.url || "";
      outfit.image_path = outfit.images[0]?.path || "";
      outfit.has_image_reference = Boolean(outfit.image_url);
      outfit.updated_at = new Date().toISOString();
      outfits[outfitIndex] = outfit;

      characterRow.scope = "character";
      characterRow.character_id = matchedCharacter?.id || characterId || characterRow.character_id;
      characterRow.character_name = safeCharacterName;
      characterRow.outfits = outfits;
      characterRow.updated_at = new Date().toISOString();
      wardrobe[characterIndex] = characterRow;
    } else {
      let locationIndex = wardrobe.findIndex((entry) => (
        matchesIdentifier(entry?.location_id || entry?.id, matchedLocation?.id || locationId)
        || matchesIdentifier(entry?.location_name || entry?.name, safeLocationName)
      ));
      if (locationIndex === -1) {
        wardrobe.push({
          location_id: matchedLocation?.id || locationId || sanitize(safeLocationName),
          location_name: safeLocationName,
          outfits: [],
        });
        locationIndex = wardrobe.length - 1;
      }

      const locationRow = { ...wardrobe[locationIndex] };
      const outfits = Array.isArray(locationRow.outfits) ? [...locationRow.outfits] : [];
      const outfitNeedle = lookup(outfitName);
      let outfitIndex = outfits.findIndex((outfit) => (
        matchesIdentifier(outfit?.character_id || outfit?.id, matchedCharacter?.id || characterId)
        || matchesIdentifier(outfit?.character_name || outfit?.name, safeCharacterName)
      ) && (!outfitNeedle || lookup(outfit?.outfit_name || outfit?.name) === outfitNeedle));

      if (outfitIndex === -1) {
        outfits.push({
          character_id: matchedCharacter?.id || characterId || sanitize(safeCharacterName),
          character_name: safeCharacterName,
          outfit_name: outfitName,
          description: "",
          present: true,
          locked: true,
          images: [],
        });
        outfitIndex = outfits.length - 1;
      }

      outfit = { ...outfits[outfitIndex] };
      const images = imageList(outfit).filter((image) => image?.path !== removePath);
      if (description != null) outfit.description = String(description);
      if (outfitName) outfit.outfit_name = outfitName;
      outfit.character_id = matchedCharacter?.id || characterId || outfit.character_id;
      outfit.character_name = safeCharacterName;
      outfit.images = [...images, ...uploaded];
      outfit.image_url = outfit.images[0]?.url || "";
      outfit.image_path = outfit.images[0]?.path || "";
      outfit.has_image_reference = Boolean(outfit.image_url);
      outfit.updated_at = new Date().toISOString();
      outfits[outfitIndex] = outfit;

      locationRow.location_id = matchedLocation?.id || locationId || locationRow.location_id;
      locationRow.location_name = safeLocationName;
      locationRow.outfits = outfits;
      locationRow.updated_at = new Date().toISOString();
      wardrobe[locationIndex] = locationRow;
    }

    if (removePath) {
      try {
        await storage.from("assets").remove([removePath]);
      } catch (cleanupError) {
        console.warn("[studio/save-wardrobe] storage cleanup failed:", cleanupError?.message);
      }
    }

    const newState = {
      ...projectState,
      wardrobe,
      current_step: Math.max(Number(projectState.current_step) || 0, 6),
    };

    try {
      await prisma.project.update({
        where: { id: projectId },
        data: { project_state: newState }
      });
    } catch (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true, projectId, wardrobe, outfit });
  } catch (error) {
    console.error("[studio/save-wardrobe] failed:", error);
    return NextResponse.json({ error: error.message || "Failed to save wardrobe." }, { status: 500 });
  }
}
