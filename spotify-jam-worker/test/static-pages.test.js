import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("House and Car routes use the shared redirect client with correct types", async () => {
  const [house, car, client, config] = await Promise.all([
    readFile(new URL("jam/index.html", root), "utf8"),
    readFile(new URL("carjam/index.html", root), "utf8"),
    readFile(new URL("jam-redirect.js", root), "utf8"),
    readFile(new URL("jam-config.js", root), "utf8"),
  ]);
  assert.match(house, /data-jam-type="house"/);
  assert.match(house, /Open House Jam/);
  assert.match(car, /data-jam-type="car"/);
  assert.match(car, /Open Car Jam/);
  assert.match(client, /api\/jam\/\$\{type\}/);
  assert.match(client, /window\.location\.replace\(data\.url\)/);
  assert.match(client, /No active/);
  assert.match(client, /Try again in a moment/);
  assert.equal((config.match(/apiBase/g) || []).length, 1);
});
