const SPOTIFY_HOSTS = ["spotify.com", "spotify.link"];
const MAX_URL_LENGTH = 2048;
const PRODUCTION_ORIGINS = new Set(["https://paulpoleon.com", "https://www.paulpoleon.com"]);

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  let allowed = PRODUCTION_ORIGINS.has(origin);
  if (!allowed && env.ENVIRONMENT === "development") {
    try {
      const hostname = new URL(origin).hostname;
      allowed = hostname === "localhost" || hostname === "127.0.0.1";
    } catch {
      allowed = false;
    }
  }
  return allowed ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}

export function isAllowedSpotifyUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && SPOTIFY_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

function secureEqual(left, right) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left || "");
  const rightBytes = encoder.encode(right || "");
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
}

function isAuthorized(request, env) {
  const expected = `Bearer ${env.ADMIN_TOKEN || ""}`;
  return Boolean(env.ADMIN_TOKEN) && secureEqual(request.headers.get("Authorization") || "", expected);
}

async function getJam(type, env, headers) {
  const stored = await env.JAM_STORE.get(type, "json");
  if (!stored || !isAllowedSpotifyUrl(stored.url)) return json({ error: "No active Jam" }, 404, headers);
  return json({ type, url: stored.url, updatedAt: stored.updatedAt }, 200, headers);
}

async function updateJam(request, type, env) {
  if (!isAuthorized(request, env)) return json({ error: "Unauthorized" }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad Request" }, 400);
  }
  if (!body || !isAllowedSpotifyUrl(body.url)) return json({ error: "Bad Request" }, 400);
  const current = await env.JAM_STORE.get(type, "json");
  if (current?.url === body.url) return json({ success: true, type, changed: false });
  const record = { url: body.url, updatedAt: new Date().toISOString() };
  await env.JAM_STORE.put(type, JSON.stringify(record));
  return json({ success: true, type, changed: true });
}

export default {
  async fetch(request, env) {
    try {
      const match = new URL(request.url).pathname.match(/^\/api\/jam\/(house|car)$/);
      if (!match) return json({ error: "Not Found" }, 404);
      const type = match[1];
      const headers = corsHeaders(request, env);
      if (request.method === "OPTIONS") {
        if (!headers["Access-Control-Allow-Origin"]) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" } });
      }
      if (request.method === "GET") return await getJam(type, env, headers);
      if (request.method === "POST") return await updateJam(request, type, env);
      return json({ error: "Method Not Allowed" }, 405, { Allow: "GET, POST, OPTIONS" });
    } catch {
      return json({ error: "Service Unavailable" }, 503);
    }
  },
};
