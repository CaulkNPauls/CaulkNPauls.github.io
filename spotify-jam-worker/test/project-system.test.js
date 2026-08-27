import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("project data has unique IDs and the requested placements", async () => {
  const data = JSON.parse(await read("data/projects.json"));
  const all = [...data.featured, ...data.quickview];
  assert.equal(new Set(all.map((project) => project.id)).size, all.length);
  assert.deepEqual(
    data.featured.slice(-2).map((project) => project.id),
    ["flowsafe-sales-workflow-epicor-integration", "valve-e-internal-assistant"],
  );
  const archive = new Map(data.quickview.map((project) => [project.id, project]));
  assert.equal(archive.get("pharmacy-facility-layout").projectType, "group");
  assert.equal(archive.get("saving-grace-client-website").projectType, "work");
  assert.equal(archive.get("nfc-spotify-jam-smart-link").projectType, "personal");
  all.forEach((project) => assert.ok(["solo", "personal", "group", "work"].includes(project.projectType)));
});

test("new featured case studies have data and routable pages", async () => {
  const studies = JSON.parse(await read("data/case-studies.json"));
  for (const slug of ["flowsafe-sales-workflow-epicor-integration", "valve-e-internal-assistant"]) {
    assert.ok(studies[slug]);
    assert.ok(studies[slug].blocks.length >= 6);
    await access(new URL(`projects/${slug}/index.html`, root));
  }
  const valveText = JSON.stringify(studies["valve-e-internal-assistant"]);
  assert.match(valveText, /Current Role/);
  assert.match(valveText, /In Development/);
  assert.match(valveText, /not represented as fully production-ready/);
});

test("renderer and editor retain dynamic project-management behavior", async () => {
  const [script, editor, styles, page] = await Promise.all([
    read("script.js"), read("dev/editor.js"), read("styles.css"), read("projects/index.html"),
  ]);
  assert.match(script, /updateProjectHubMeta/);
  assert.match(script, /status === "draft"/);
  assert.match(script, /safeProjectHref/);
  assert.match(editor, /changeProjectPlacement/);
  assert.match(editor, /moveProject/);
  assert.match(editor, /validateProjectForm/);
  assert.match(editor, /project-pin-preview/);
  assert.match(styles, /pin-key--solo\{background:#e4b62c\}/);
  assert.match(styles, /pin-key--personal\{background:#54a66c\}/);
  assert.match(styles, /pin-key--group\{background:#cf554d\}/);
  assert.match(styles, /pin-key--work\{background:#517b96\}/);
  assert.match(page, /id="featuredProjectCount">…/);
  assert.match(page, /id="archiveProjectCount">…/);
});
