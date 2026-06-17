const DEFAULT_BACKEND_ORIGIN = "http://localhost:3000";

function backendOrigin() {
  return (
    process.env.STUDIO_BACKEND_ORIGIN ||
    process.env.BACKEND_ORIGIN ||
    process.env.NEXT_PUBLIC_STUDIO_BACKEND_ORIGIN ||
    DEFAULT_BACKEND_ORIGIN
  ).replace(/\/+$/, "");
}

function targetUrl(pathSegments, request) {
  const path = Array.isArray(pathSegments) ? pathSegments.join("/") : "";
  const incomingUrl = new URL(request.url);
  const url = new URL(`/api/${path}`, backendOrigin());
  incomingUrl.searchParams.forEach((value, key) => url.searchParams.append(key, value));
  return url;
}

function shouldForwardCookies(pathSegments) {
  const path = Array.isArray(pathSegments) ? pathSegments.join("/") : "";
  return (
    process.env.STUDIO_BACKEND_FORWARD_COOKIES === "true"
    || path === "dashboard/projects"
    || path.startsWith("dashboard/projects/")
  );
}

function forwardedHeaders(request, pathSegments) {
  const incoming = request.headers;
  const headers = new Headers();
  const allowed = ["accept", "authorization", "content-type"];

  for (const name of allowed) {
    const value = incoming.get(name);
    if (value) headers.set(name, value);
  }

  if (shouldForwardCookies(pathSegments)) {
    const cookie = incoming.get("cookie");
    if (cookie) headers.set("cookie", cookie);
  }

  const bridgeSecret = process.env.STUDIO_BACKEND_SHARED_SECRET;
  if (bridgeSecret) {
    headers.set("x-studio-backend-key", bridgeSecret);
  }

  return headers;
}

async function proxiedRequest(request, context) {
  const { path } = await context.params;
  const method = request.method.toUpperCase();
  const init = {
    method,
    headers: forwardedHeaders(request, path),
    cache: "no-store",
  };

  if (!["GET", "HEAD"].includes(method)) {
    init.body = await request.arrayBuffer();
  }

  let backendResponse;
  try {
    backendResponse = await fetch(targetUrl(path, request), init);
  } catch (error) {
    return Response.json(
      {
        error: "Backend is not reachable.",
        detail: error.message,
        backendOrigin: backendOrigin(),
      },
      { status: 502 }
    );
  }

  const headers = new Headers();
  const contentType = backendResponse.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("cache-control", "no-store");

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers,
  });
}

export async function GET(request, context) {
  return proxiedRequest(request, context);
}

export async function POST(request, context) {
  return proxiedRequest(request, context);
}

export async function PUT(request, context) {
  return proxiedRequest(request, context);
}

export async function PATCH(request, context) {
  return proxiedRequest(request, context);
}

export async function DELETE(request, context) {
  return proxiedRequest(request, context);
}
