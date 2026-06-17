async function readDashboardJson(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok || data.error) {
    const error = new Error(data.error || `Dashboard request failed with ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function authHeaders(accessToken, extra = {}) {
  return {
    ...extra,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

export function accessTokenFromRuntime() {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_STUDIO_ACCESS_TOKEN || "";
  }

  const params = new URLSearchParams(window.location.search);
  let storedToken = "";

  try {
    storedToken = window.localStorage?.getItem("studioAccessToken") || "";
  } catch {
    storedToken = "";
  }

  return (
    params.get("accessToken")
    || storedToken
    || process.env.NEXT_PUBLIC_STUDIO_ACCESS_TOKEN
    || ""
  );
}

export async function listDashboardProjects({ accessToken } = {}) {
  const response = await fetch("/api/dashboard/projects", {
    method: "GET",
    headers: authHeaders(accessToken),
    credentials: "include",
    cache: "no-store",
  });

  return readDashboardJson(response);
}

export async function getDashboardProject({ projectId, accessToken } = {}) {
  const response = await fetch(`/api/dashboard/projects/${encodeURIComponent(projectId)}`, {
    method: "GET",
    headers: authHeaders(accessToken),
    credentials: "include",
    cache: "no-store",
  });

  return readDashboardJson(response);
}

export async function createDashboardProject({ title, accessToken }) {
  const response = await fetch("/api/dashboard/projects", {
    method: "POST",
    headers: authHeaders(accessToken, { "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({ title }),
  });

  return readDashboardJson(response);
}

export async function deleteDashboardProject({ projectId, accessToken }) {
  const response = await fetch(`/api/dashboard/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
    credentials: "include",
  });

  return readDashboardJson(response);
}
