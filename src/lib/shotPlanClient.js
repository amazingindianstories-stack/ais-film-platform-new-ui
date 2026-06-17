async function readJson(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok || data.error) {
    throw new Error(data.error || data.detail || `Request failed with ${response.status}`);
  }
  return data;
}

function looseShots(text) {
  return String(text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const cleaned = line.replace(/^\s*(shot\s*)?\d+[\).\-\s:]+/i, '').trim();
      const parts = cleaned.split(/\s[-:]\s/);
      const title = parts.length > 1 ? parts[0].trim() : `Shot ${index + 1}`;
      const prompt = parts.length > 1 ? parts.slice(1).join(' - ').trim() : cleaned;
      return { n: title || `Shot ${index + 1}`, p: prompt, duration: 6 };
    });
}

export function parseShotPlanText(text) {
  const value = String(text || '').trim();
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    return parsed?.shots || parsed?.shot_list || parsed?.shotList || [];
  } catch {
    return looseShots(value);
  }
}

export async function generateShotPlan(projectState) {
  const response = await fetch('/api/generate-shot-list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectState }),
  });

  return readJson(response);
}

export async function saveShotPlan({ projectId, shots, source, coverage_notes }) {
  const response = await fetch('/api/studio/save-shot-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, shots, source, coverage_notes }),
  });

  return readJson(response);
}

export async function saveShotTiming({ projectId, shots }) {
  const response = await fetch('/api/studio/save-shot-timing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, shots }),
  });

  return readJson(response);
}
