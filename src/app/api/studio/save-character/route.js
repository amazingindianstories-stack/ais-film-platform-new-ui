import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

// Additive new-UI bridge route. Uploads character reference / wardrobe images to
// Supabase storage and merges the character (name, description, images) into
// project_state.characters — the same slice the frozen knowledge-base builder reads.
function isAuthorized(req) {
  const expected = process.env.STUDIO_BACKEND_SHARED_SECRET;
  if (!expected) return true;
  return req.headers.get("x-studio-backend-key") === expected;
}

function sanitize(value, fallback = "item") {
  return String(value || fallback)
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || fallback;
}

const normalizeName = (value) => String(value || "").trim().toLowerCase();

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

  const projectId = String(formData.get("projectId") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const bio = formData.get("bio");
  const kind = String(formData.get("kind") || "reference").trim() === "wardrobe" ? "wardrobe" : "reference";
  const removePath = String(formData.get("removePath") || "").trim();
  const files = formData.getAll("files").filter((f) => f && typeof f.arrayBuffer === "function");

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Character needs a name." }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("project_state")
      .eq("id", projectId)
      .single();

    if (fetchError || !project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    // Upload any provided images.
    const uploaded = [];
    for (const file of files) {
      if (Number(file.size) > MAX_IMAGE_BYTES) continue;
      const path = `${projectId}/characters/${sanitize(name)}/${kind}/${Date.now()}-${sanitize(file.name, "image")}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from("assets")
        .upload(path, buffer, { contentType: file.type || "image/png", upsert: false });
      if (uploadError) continue;
      const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(path);
      uploaded.push({ url: publicUrl, path, kind, label: `${name} ${kind}`, uploaded_at: new Date().toISOString() });
    }

    const projectState = project.project_state || {};
    const characters = Array.isArray(projectState.characters) ? [...projectState.characters] : [];
    let index = characters.findIndex((c) => normalizeName(c?.name) === normalizeName(name));
    if (index === -1) {
      characters.push({ name, description: "", visual_prompt: "", images: [], wardrobe_images: [] });
      index = characters.length - 1;
    }

    const existing = { ...characters[index] };
    existing.name = name;
    if (bio != null) {
      existing.description = String(bio);
      if (!existing.visual_prompt) existing.visual_prompt = String(bio);
    }
    if (removePath) {
      existing.images = (existing.images || []).filter((img) => img?.path !== removePath);
      existing.wardrobe_images = (existing.wardrobe_images || []).filter((img) => img?.path !== removePath);
      try {
        await supabase.storage.from("assets").remove([removePath]);
      } catch (cleanupError) {
        console.warn("[studio/save-character] storage cleanup failed:", cleanupError?.message);
      }
    }
    if (uploaded.length) {
      if (kind === "wardrobe") {
        existing.wardrobe_images = [...(existing.wardrobe_images || []), ...uploaded];
      } else {
        existing.images = [...(existing.images || []), ...uploaded];
      }
    }
    characters[index] = existing;

    const newState = { ...projectState, characters };
    const { error: updateError } = await supabase
      .from("projects")
      .update({ project_state: newState })
      .eq("id", projectId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, projectId, character: existing, entity: existing, characters });
  } catch (error) {
    console.error("[studio/save-character] failed:", error);
    return NextResponse.json({ error: error.message || "Failed to save character." }, { status: 500 });
  }
}
