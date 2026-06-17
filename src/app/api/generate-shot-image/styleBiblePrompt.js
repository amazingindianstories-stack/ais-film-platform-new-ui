import { compact } from "./shotImageConstants.js";

function normalizeStyleBibleForPrompt(styleBible) {
  let source = styleBible;
  if (typeof source === "string") {
    const text = source.trim();
    if (!text) return null;
    try {
      source = JSON.parse(text);
    } catch {
      return null;
    }
  }

  if (!source || typeof source !== "object") return null;
  const colourGrade = source.colour_grade && typeof source.colour_grade === "object"
    ? source.colour_grade
    : {};

  const primaryPalette = Array.isArray(colourGrade.primary_palette)
    ? colourGrade.primary_palette
      .map((value) => compact(value, 40))
      .filter(Boolean)
    : [];

  return {
    colour_grade: {
      primary_palette: primaryPalette.length ? primaryPalette : ["unspecified"],
      shadow_tone: compact(colourGrade.shadow_tone || "unspecified", 220),
      highlight_tone: compact(colourGrade.highlight_tone || "unspecified", 220),
      saturation: compact(colourGrade.saturation || "unspecified", 60),
      contrast: compact(colourGrade.contrast || "unspecified", 60),
    },
    lighting_style: compact(source.lighting_style || "unspecified", 260),
    camera_rules: compact(source.camera_rules || "unspecified", 260),
    visual_tone: compact(source.visual_tone || "unspecified", 280),
    negative_constraints: compact(source.negative_constraints || "none provided", 420),
    reference_summary: compact(source.reference_summary || "No style summary provided.", 460),
  };
}

export function buildStyleBibleContext(styleBible) {
  const normalized = normalizeStyleBibleForPrompt(styleBible);
  if (!normalized) return "";

  return `STYLE BIBLE - APPLY TO EVERY SHOT
These are locked visual rules for the entire music video. Every frame must conform.

Colour grade:
- Primary palette: ${normalized.colour_grade.primary_palette.join(", ")}
- Shadows: ${normalized.colour_grade.shadow_tone}
- Highlights: ${normalized.colour_grade.highlight_tone}
- Saturation: ${normalized.colour_grade.saturation}
- Contrast: ${normalized.colour_grade.contrast}

Lighting: ${normalized.lighting_style}
Camera rules: ${normalized.camera_rules}
Visual tone: ${normalized.visual_tone}

STRICTLY AVOID in every shot: ${normalized.negative_constraints}

Reference aesthetic: ${normalized.reference_summary}

These style rules override any conflicting aesthetic suggestion in the shot prompt.
Every generated frame must look like it belongs to the same film as every other frame.
`;
}
