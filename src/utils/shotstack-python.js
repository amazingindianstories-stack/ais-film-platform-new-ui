const DEFAULT_TIMEOUT_MS = 90000;
const PYTHON_SERVICE = process.env.PYTHON_SERVICE_URL || 'http://localhost:8001';

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function actionPath(action) {
  if (action === 'render') return '/shotstack/render';
  if (action === 'status') return '/shotstack/status';
  if (action === 'build') return '/shotstack/build';
  throw new Error(`Unsupported Shotstack action: ${action}`);
}

export async function runShotstackPython(action, payload = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${PYTHON_SERVICE}${actionPath(action)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const result = await readJsonResponse(response);

    if (!response.ok || result.error) {
      const error = new Error(result.error || result.detail || `Shotstack Python service failed with ${response.status}`);
      error.status = result.status || response.status;
      throw error;
    }

    return result;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Shotstack Python service timed out.');
      timeoutError.status = 504;
      throw timeoutError;
    }

    if (!error.status) {
      error.status = 503;
      error.message = `${error.message || 'Shotstack Python service unavailable.'} Start it with npm run py.`;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
