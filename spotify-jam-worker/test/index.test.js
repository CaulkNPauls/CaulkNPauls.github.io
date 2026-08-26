import assert from "node:assert/strict";
import test from "node:test";
import worker, { isAllowedSpotifyUrl } from "../src/index.js";

class MemoryKv {
  constructor() { this.values = new Map(); }
  async get(key, format) {
    const value = this.values.get(key) ?? null;
    return format === "json" && value !== null ? JSON.parse(value) : value;
  }
  async put(key, value) { this.values.set(key, value); }
}

function environment() {
  return { JAM_STORE: new MemoryKv(), ADMIN_TOKEN: "test-secret", ENVIRONMENT: "development" };
}

function request(path, options = {}) { return new Request(`https://worker.example${path}`, options); }

test("accepts official Spotify HTTPS hosts", () => {
  assert.equal(isAllowedSpotifyUrl("https://spotify.link/abc"), true);
  assert.equal(isAllowedSpotifyUrl("https://open.spotify.com/jam/abc"), true);
  assert.equal(isAllowedSpotifyUrl("https://spotify.com/jam/abc"), true);
});

test("rejects unsafe or malformed destinations", () => {
  for (const value of ["http://spotify.com/x", "https://google.com/", "https://spotify.com.evil.test/", "javascript:alert(1)", "data:text/plain,no", "", "not a url"]) {
    assert.equal(isAllowedSpotifyUrl(value), false, value);
  }
});

test("POST requires a valid admin token", async () => {
  const env = environment();
  const body = JSON.stringify({ url: "https://spotify.link/house" });
  assert.equal((await worker.fetch(request("/api/jam/house", { method: "POST", body }), env)).status, 401);
  assert.equal((await worker.fetch(request("/api/jam/house", { method: "POST", body, headers: { Authorization: "Bearer wrong" } }), env)).status, 401);
});

test("updates remain isolated and GET returns current state", async () => {
  const env = environment();
  const post = (type, url) => worker.fetch(request(`/api/jam/${type}`, {
    method: "POST",
    headers: { Authorization: "Bearer test-secret", "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }), env);
  assert.equal((await worker.fetch(request("/api/jam/house"), env)).status, 404);
  assert.equal((await post("house", "https://spotify.link/house")).status, 200);
  assert.equal((await worker.fetch(request("/api/jam/car"), env)).status, 404);
  assert.equal((await post("car", "https://open.spotify.com/jam/car")).status, 200);
  const house = await (await worker.fetch(request("/api/jam/house"), env)).json();
  const car = await (await worker.fetch(request("/api/jam/car"), env)).json();
  assert.equal(house.url, "https://spotify.link/house");
  assert.equal(car.url, "https://open.spotify.com/jam/car");
  assert.ok(house.updatedAt);
  assert.equal((await (await post("house", house.url)).json()).changed, false);
});

test("invalid destinations return 400", async () => {
  const env = environment();
  for (const url of ["", "http://spotify.com/no", "https://google.com/no", "javascript:alert(1)", "bad"]) {
    const response = await worker.fetch(request("/api/jam/house", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret", "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }), env);
    assert.equal(response.status, 400, url);
  }
});

test("CORS is limited to approved production origins", async () => {
  const env = environment();
  const approved = await worker.fetch(request("/api/jam/house", { headers: { Origin: "https://paulpoleon.com" } }), env);
  const denied = await worker.fetch(request("/api/jam/house", { headers: { Origin: "https://evil.example" } }), env);
  assert.equal(approved.headers.get("Access-Control-Allow-Origin"), "https://paulpoleon.com");
  assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
});
