// ===============================
// Edit mode — live, in-place editing of Projects, Experience, Skills,
// and Photos, directly on the real pages ("Squarespace-style" editing
// rather than a separate dashboard).
//
// Loaded two ways:
//  1. Directly by dev/index.html (the connect gate).
//  2. Dynamically by script.js on any page, only when the URL has
//     ?edit=1 — see the loader near the top of script.js.
//
// Everything here is inert until a valid GitHub token is present; the
// token lives only in this browser's localStorage and is sent only to
// api.github.com. Saves commit straight to the chosen branch via the
// GitHub Contents API — there is no other backend.
// ===============================

const OWNER = "CaulkNPauls";
const REPO = "CaulkNPauls.github.io";
const API = "https://api.github.com";

const TOKEN_KEY = "admin_gh_token";
const BRANCH_KEY = "admin_branch";
const DEV_AUTH_KEY = "admin_dev_authed";

// Username/password screen in front of the GitHub-token gate. This is a
// casual deterrent, not real security — the whole site (including this
// hash) is public source on GitHub, so anyone determined enough could read
// it and compute a match offline. The actual gate that matters is the
// GitHub token below: without a fine-grained PAT scoped to this repo (which
// only the site owner holds), nothing can be saved even if someone gets
// past this screen. Credentials are hashed only so a casual view-source
// doesn't show the literal password.
const DEV_USERNAME = "Dev_Paul";
const DEV_PASSWORD_HASH = "67a4ea9dc1e7369917a469984d1c81bbc6ba0bf03101b874886e3cd047928261";

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

let token = localStorage.getItem(TOKEN_KEY) || "";
let branch = localStorage.getItem(BRANCH_KEY) || "main";
let formCtx = null; // { entityKey, idx } while the edit/add modal is open

const fileCache = {}; // path -> { data, sha, loaded }

// ===== small DOM helper =====
function mkEl(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) {
      if (v !== null && v !== undefined) node.setAttribute(k, v);
    }
  }
  children.forEach((c) => c && node.appendChild(c));
  return node;
}

// ===== text <-> structured-field conversion helpers =====
function parseCSV(text) {
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}
function toCSV(arr) {
  return (arr || []).join(", ");
}
function parseLines(text) {
  return text.split("\n").map((s) => s.trim()).filter(Boolean);
}
function toLines(arr) {
  return (arr || []).join("\n");
}
function parseChipsTextarea(text) {
  return parseLines(text).map((line) => {
    const m = line.match(/^(.*)\s+\(in progress\)$/i);
    return m ? { label: m[1].trim(), inProgress: true } : line;
  });
}
function chipsToTextarea(chips) {
  return (chips || [])
    .map((c) => (typeof c === "string" ? c : `${c.label}${c.inProgress ? " (in progress)" : ""}`))
    .join("\n");
}
function parseLinksTextarea(text) {
  return parseLines(text).map((line) => {
    const [label, href] = line.split("|").map((s) => (s || "").trim());
    return { label: label || href || "", href: href || "#" };
  });
}
function linksToTextarea(links) {
  return (links || []).map((l) => `${l.label} | ${l.href}`).join("\n");
}
function slugify(s) {
  const base = (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return base.slice(0, 60) || `item-${Date.now().toString(36)}`;
}

const FIELD_TYPES = {
  text: { toForm: (v) => v || "", fromForm: (v) => v.trim() },
  textarea: { toForm: (v) => v || "", fromForm: (v) => v.trim() },
  select: { toForm: (v) => v || "", fromForm: (v) => v },
  csv: { toForm: toCSV, fromForm: parseCSV },
  lines: { toForm: toLines, fromForm: parseLines },
  chips: { toForm: chipsToTextarea, fromForm: parseChipsTextarea },
  links: { toForm: linksToTextarea, fromForm: parseLinksTextarea },
};

// ===== entity schemas =====
const skillCardFields = [
  { key: "icon", label: "Icon", type: "select", options: ["wrench-plug", "flow", "star", "bars", "trend", "building", "heart", "briefcase", "wrench", "tag", "landmark"] },
  { key: "title", label: "Card title", type: "text" },
  { key: "description", label: "Description", type: "text" },
  { key: "chips", label: 'Chips (one per line — add " (in progress)" at the end of a line to flag it)', type: "chips" },
];
const skillCardConvert = {
  fromForm: (v) => ({ icon: v.icon, title: v.title, description: v.description, chips: v.chips }),
  toForm: (item) => ({ icon: item.icon, title: item.title, description: item.description, chips: item.chips }),
  empty: () => ({ id: "", icon: "wrench-plug", title: "", description: "", chips: [] }),
};

const ENTITIES = {
  "projects-featured": {
    file: "data/projects.json",
    getList: (data) => data.featured,
    setList: (data, list) => { data.featured = list; },
    labelOf: (item) => item.title,
    empty: () => ({ id: "", title: "", meta: "", blurbShort: "", blurbLong: "", tags: [], href: "", image: null, placeholderNote: "" }),
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "meta", label: 'Meta line (e.g. "Manufacturing systems · 2026")', type: "text" },
      { key: "blurbShort", label: "Short blurb (homepage card)", type: "textarea" },
      { key: "blurbLong", label: "Long blurb (projects page card)", type: "textarea" },
      { key: "tags", label: "Tags (comma-separated)", type: "csv" },
      { key: "href", label: "Link to the case-study page", type: "text" },
      { key: "imageSrc", label: "Image path (use the Photo button on the card instead, or paste one here)", type: "text" },
      { key: "imageAlt", label: "Image alt text", type: "text" },
      { key: "placeholderNote", label: "Placeholder note (shown if no image yet)", type: "text" },
    ],
    fromForm: (v) => ({
      title: v.title, meta: v.meta, blurbShort: v.blurbShort, blurbLong: v.blurbLong,
      tags: v.tags, href: v.href,
      image: v.imageSrc ? { src: v.imageSrc, alt: v.imageAlt } : null,
      placeholderNote: v.placeholderNote,
    }),
    toForm: (item) => ({
      title: item.title, meta: item.meta, blurbShort: item.blurbShort, blurbLong: item.blurbLong,
      tags: item.tags, href: item.href,
      imageSrc: item.image ? item.image.src : "", imageAlt: item.image ? item.image.alt : "",
      placeholderNote: item.placeholderNote,
    }),
  },

  "projects-quickview": {
    file: "data/projects.json",
    getList: (data) => data.quickview,
    setList: (data, list) => { data.quickview = list; },
    labelOf: (item) => item.title,
    empty: () => ({ id: "", title: "", filter: "", cardText: "", summary: "", tags: [], tools: [], results: [], links: [] }),
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "filter", label: "Filter category (analytics / humanfactors / cad / prototype)", type: "text" },
      { key: "cardText", label: "Card text (short, shown on the card)", type: "textarea" },
      { key: "summary", label: "Summary (longer, shown in Quick View)", type: "textarea" },
      { key: "tags", label: "Tags (comma-separated)", type: "csv" },
      { key: "tools", label: "Tools & methods (comma-separated)", type: "csv" },
      { key: "results", label: "Results (one per line)", type: "lines" },
      { key: "links", label: "Links (one per line: Label | https://url)", type: "links" },
    ],
    fromForm: (v) => ({
      title: v.title, filter: v.filter, cardText: v.cardText, summary: v.summary,
      tags: v.tags, tools: v.tools, results: v.results, links: v.links,
    }),
    toForm: (item) => ({
      title: item.title, filter: item.filter, cardText: item.cardText, summary: item.summary,
      tags: item.tags, tools: item.tools, results: item.results, links: item.links,
    }),
  },

  experience: {
    file: "data/experience.json",
    rootIsList: true,
    labelOf: (item) => `${item.title} — ${item.company}`,
    empty: () => ({ id: "", featured: false, icon: "briefcase", date: "", location: "", company: "", title: "", summary: "", bullets: [], tags: [], photo: null, photoNote: "", link: null }),
    fields: [
      { key: "featured", label: "Featured (larger card, first in the timeline)", type: "checkbox" },
      { key: "icon", label: "Icon", type: "select", options: ["briefcase", "wrench", "tag", "landmark"] },
      { key: "date", label: 'Date range (e.g. "2026 – Present")', type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "company", label: "Company / organization", type: "text" },
      { key: "title", label: "Role title", type: "text" },
      { key: "summary", label: "One-line summary", type: "textarea" },
      { key: "bullets", label: "Bullets (one per line)", type: "lines" },
      { key: "tags", label: "Tags (comma-separated)", type: "csv" },
      { key: "photo", label: "Photo path (use the Photo button on the card instead, or paste one here)", type: "text" },
      { key: "photoNote", label: "Placeholder note (shown if no photo yet)", type: "text" },
      { key: "linkLabel", label: "Related link label (optional)", type: "text" },
      { key: "linkHref", label: "Related link URL (optional)", type: "text" },
    ],
    fromForm: (v) => ({
      featured: v.featured, icon: v.icon, date: v.date, location: v.location, company: v.company, title: v.title,
      summary: v.summary, bullets: v.bullets, tags: v.tags,
      photo: v.photo || null, photoNote: v.photoNote,
      link: v.linkLabel && v.linkHref ? { label: v.linkLabel, href: v.linkHref } : null,
    }),
    toForm: (item) => ({
      featured: item.featured, icon: item.icon, date: item.date, location: item.location, company: item.company, title: item.title,
      summary: item.summary, bullets: item.bullets, tags: item.tags,
      photo: item.photo || "", photoNote: item.photoNote || "",
      linkLabel: item.link ? item.link.label : "", linkHref: item.link ? item.link.href : "",
    }),
  },

  "skills-core": {
    file: "data/skills.json",
    getList: (data) => data.core,
    setList: (data, list) => { data.core = list; },
    labelOf: (item) => item.title,
    empty: skillCardConvert.empty,
    fields: skillCardFields,
    fromForm: skillCardConvert.fromForm,
    toForm: skillCardConvert.toForm,
  },

  "skills-coursework": {
    file: "data/skills.json",
    getList: (data) => data.coursework,
    setList: (data, list) => { data.coursework = list; },
    labelOf: (item) => item.title,
    empty: skillCardConvert.empty,
    fields: skillCardFields,
    fromForm: skillCardConvert.fromForm,
    toForm: skillCardConvert.toForm,
  },

  about: {
    file: "data/about.json",
    rootIsList: true,
    labelOf: (item) => item.question,
    empty: () => ({ id: "", kicker: "", question: "", answer: [""] }),
    fields: [
      { key: "kicker", label: "Kicker label", type: "text" },
      { key: "question", label: "Question", type: "text" },
      { key: "answer", label: "Answer (one paragraph per line)", type: "lines" },
    ],
    fromForm: (v) => ({ kicker: v.kicker, question: v.question, answer: v.answer }),
    toForm: (item) => ({ kicker: item.kicker, question: item.question, answer: item.answer }),
  },

  // Homepage hero / summary / "In brief" / origin / contact / footer copy —
  // singleton objects (no list, no idx) wired directly by field id in
  // wireHomeInlineFields() below rather than through the card-decoration
  // system, since there's nothing to add/delete/toggle here — just text.
  "home-hero": { file: "data/home.json", singleton: true, getItem: (d) => d.hero },
  "home-summary": { file: "data/home.json", singleton: true, getItem: (d) => d.summary },
  "home-brief": { file: "data/home.json", singleton: true, getItem: (d) => d.brief },
  "home-brief-strengths": { file: "data/home.json", singleton: true, getItem: (d) => (d.brief || {}).strengths },
  "home-brief-curious": { file: "data/home.json", singleton: true, getItem: (d) => (d.brief || {}).curious },
  "home-origin": { file: "data/home.json", singleton: true, getItem: (d) => d.origin },
  "home-contact": { file: "data/home.json", singleton: true, getItem: (d) => d.contact },
  "home-footer": { file: "data/home.json", singleton: true, getItem: (d) => d.footer },

  // File registration only (no getList/fields) — case-study blocks are a
  // nested per-project structure the flat ENTITIES shape doesn't fit. This
  // just gets data/case-studies.json into the shared fileCache/preload/save
  // machinery; the block editor below (initCaseStudyEditor) reads and
  // writes it directly.
  "case-study": { file: "data/case-studies.json" },
};

const ADD_TILE_LABEL = {
  about: "Q&A pair",
  experience: "role",
  "projects-featured": "featured project",
  "projects-quickview": "project",
  "skills-core": "skill card",
  "skills-coursework": "coursework card",
};
// mount element id -> entity key it should offer an "+ Add" tile for
const ADD_TILE_MAP = {
  experienceTimelineMount: "experience",
  projectsFeaturedMount: "projects-featured",
  projectGrid: "projects-quickview",
  skillsCoreMount: "skills-core",
  skillsCourseworkMount: "skills-coursework",
  aboutMount: "about",
};

// ===== GitHub API =====
function ghHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function b64EncodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64DecodeUtf8(str) {
  return decodeURIComponent(escape(atob(str.replace(/\n/g, ""))));
}

async function ghGetMeta(path) {
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${path}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status})`);
  return res.json();
}

async function ghGetFile(path) {
  const meta = await ghGetMeta(path);
  if (!meta) {
    throw new Error(`${path} not found on branch "${branch}" — has this branch been pushed with that file?`);
  }
  return { json: JSON.parse(b64DecodeUtf8(meta.content)), sha: meta.sha };
}

async function ghPutJSON(path, obj, sha, message) {
  const body = { message, content: b64EncodeUtf8(JSON.stringify(obj, null, 2)), branch };
  if (sha) body.sha = sha;
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `PUT ${path} failed (${res.status})`);
  }
  return res.json();
}

async function ghPutBinary(path, base64, sha, message) {
  const body = { message, content: base64, branch };
  if (sha) body.sha = sha;
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Upload failed (${res.status})`);
  }
  return res.json();
}

// Same as ghPutJSON, minus the JSON.stringify step — for committing a raw
// text file (new-project page scaffolding writes an HTML file this way).
async function ghPutText(path, text, sha, message) {
  const body = { message, content: b64EncodeUtf8(text), branch };
  if (sha) body.sha = sha;
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `PUT ${path} failed (${res.status})`);
  }
  return res.json();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const PHOTO_QUALITY = 0.85;

function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Contain-fit downscale with no crop/pan UI — for case-study gallery photos,
// which are screenshots/diagrams at varied natural aspect ratios rather than
// slots that need a fixed crop like the featured-project cover photo does.
// Resizing only kicks in above maxDim; a Blob that's already small enough
// still gets re-encoded as JPEG at PHOTO_QUALITY for consistent file size.
function downscaleImage(file, maxDim = 1600) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not process image"))), "image/jpeg", PHOTO_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Could not read image file")); };
    img.src = objectUrl;
  });
}

async function loadFile(path) {
  if (fileCache[path] && fileCache[path].loaded) return fileCache[path];
  const { json, sha } = await ghGetFile(path);
  fileCache[path] = { data: json, sha, loaded: true };
  return fileCache[path];
}

async function saveFile(path, message) {
  const file = fileCache[path];
  setToolbarStatus("Saving…");
  try {
    const result = await ghPutJSON(path, file.data, file.sha, message);
    file.sha = result.content.sha;
    setToolbarStatus("Saved — live in about a minute.");
  } catch (err) {
    setToolbarStatus(`Save failed: ${err.message}`, true);
    throw err;
  }
}

function setToolbarStatus(msg, isError) {
  const el = document.getElementById("editToolbarStatus");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#ffb4a8" : "";
}

// ===== form modal (injected into the page, not static markup) =====
function injectFormModal() {
  if (document.getElementById("formModal")) return;

  const modal = mkEl("div", { className: "modal", attrs: { id: "formModal", "aria-hidden": "true" } });
  modal.appendChild(mkEl("div", { className: "modal__backdrop", attrs: { "data-close": "true" } }));

  const panel = mkEl("div", { className: "modal__panel", attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "formModalTitle" } });
  const closeBtn = mkEl("button", { className: "modal__close", text: "✕", attrs: { type: "button", "data-close": "true", "aria-label": "Close" } });
  panel.appendChild(closeBtn);
  panel.appendChild(mkEl("h3", { text: "Edit entry", attrs: { id: "formModalTitle" } }));
  panel.appendChild(mkEl("div", { attrs: { id: "formModalBody" } }));

  const actions = mkEl("div", { className: "admin-form__actions" });
  const deleteBtn = mkEl("button", { className: "btn btn--ghost", text: "Delete", attrs: { type: "button", id: "formDeleteBtn", hidden: "" } });
  const saveBtn = mkEl("button", { className: "btn", text: "Save", attrs: { type: "button", id: "formSaveBtn" } });
  actions.appendChild(deleteBtn);
  actions.appendChild(saveBtn);
  panel.appendChild(actions);

  modal.appendChild(panel);
  document.body.appendChild(modal);

  modal.addEventListener("click", (e) => {
    if (e.target.dataset.close === "true") closeForm();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) closeForm();
  });
  saveBtn.addEventListener("click", handleFormSave);
  deleteBtn.addEventListener("click", handleFormDelete);
}

function buildField(field, value) {
  const wrap = mkEl("label", { className: "admin-field" });
  wrap.appendChild(mkEl("span", { className: "admin-field__label", text: field.label }));

  let input;
  if (field.type === "checkbox") {
    input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!value;
  } else if (field.type === "select") {
    input = document.createElement("select");
    input.className = "input";
    field.options.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (opt === value) o.selected = true;
      input.appendChild(o);
    });
  } else if (field.type === "textarea" || field.type === "lines" || field.type === "chips" || field.type === "links") {
    input = document.createElement("textarea");
    input.className = "input admin-field__textarea";
    input.value = FIELD_TYPES[field.type].toForm(value);
  } else {
    input = document.createElement("input");
    input.type = "text";
    input.className = "input";
    input.value = FIELD_TYPES[field.type].toForm(value);
  }
  input.dataset.fieldKey = field.key;
  input.dataset.fieldType = field.type;
  wrap.appendChild(input);
  return wrap;
}

function readForm() {
  const values = {};
  document.querySelectorAll("#formModalBody [data-field-key]").forEach((input) => {
    const key = input.dataset.fieldKey;
    const type = input.dataset.fieldType;
    values[key] = type === "checkbox" ? input.checked : FIELD_TYPES[type].fromForm(input.value);
  });
  return values;
}

async function openForm(entityKey, idx) {
  const entity = ENTITIES[entityKey];
  const isNew = idx === null || idx === undefined;

  let values;
  if (isNew) {
    values = entity.toForm(entity.empty());
  } else {
    let file;
    try {
      file = await loadFile(entity.file);
    } catch (err) {
      setToolbarStatus(err.message, true);
      return;
    }
    const list = entity.rootIsList ? file.data : entity.getList(file.data);
    values = entity.toForm(list[idx]);
  }

  formCtx = { entityKey, idx: isNew ? null : idx };
  document.getElementById("formModalTitle").textContent = isNew ? "Add entry" : "Edit entry";

  const body = document.getElementById("formModalBody");
  body.innerHTML = "";
  entity.fields.forEach((f) => body.appendChild(buildField(f, values[f.key])));

  document.getElementById("formDeleteBtn").hidden = isNew;
  const modal = document.getElementById("formModal");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeForm() {
  const modal = document.getElementById("formModal");
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  formCtx = null;
}

async function handleFormSave() {
  if (!formCtx) return;
  const { entityKey, idx } = formCtx;
  const entity = ENTITIES[entityKey];
  let file;
  try {
    file = await loadFile(entity.file);
  } catch (err) {
    setToolbarStatus(err.message, true);
    return;
  }
  const list = entity.rootIsList ? file.data : entity.getList(file.data);
  const values = readForm();
  const item = entity.fromForm(values);

  // A brand-new featured project gets its own case-study page scaffolded
  // (default blocks + a committed projects/<slug>/index.html) once its id
  // is known below — "quickview" post-it cards don't have pages, so this
  // only applies to projects-featured.
  const isNewProject = idx === null && entityKey === "projects-featured";
  let newSlug = null;

  if (idx === null) {
    let id = slugify(entity.labelOf(item));
    let n = 2;
    const base = id;
    while (list.some((it) => it.id === id)) id = `${base}-${n++}`;
    item.id = id;
    newSlug = id;
    if (isNewProject) item.href = `/projects/${id}/`;
    list.push(item);
  } else {
    item.id = list[idx].id;
    list[idx] = item;
  }

  if (!entity.rootIsList) entity.setList(file.data, list);
  else file.data = list;

  try {
    await saveFile(entity.file, `Update ${entity.file} via edit mode`);
    if (isNewProject) await scaffoldCaseStudyPage(newSlug, item);
    closeForm();
    refreshMountsFor(entityKey);
  } catch (_) {
    // status already shown by saveFile
  }
}

async function handleFormDelete() {
  if (!formCtx || formCtx.idx === null) return;
  const { entityKey, idx } = formCtx;
  const entity = ENTITIES[entityKey];
  let file;
  try {
    file = await loadFile(entity.file);
  } catch (err) {
    setToolbarStatus(err.message, true);
    return;
  }
  const list = entity.rootIsList ? file.data : entity.getList(file.data);
  list.splice(idx, 1);

  if (!entity.rootIsList) entity.setList(file.data, list);
  else file.data = list;

  try {
    await saveFile(entity.file, `Remove entry from ${entity.file} via edit mode`);
    closeForm();
    refreshMountsFor(entityKey);
  } catch (_) {
    // status already shown by saveFile
  }
}

// Re-renders whichever mount(s) on THIS page are backed by the entity
// that just changed, using the same render functions script.js uses at
// page load — the MutationObservers set up below notice the DOM change
// and re-decorate the fresh cards automatically.
function refreshMountsFor(entityKey) {
  const entity = ENTITIES[entityKey];
  const data = fileCache[entity.file].data;

  if (entityKey === "experience") {
    const mount = document.getElementById("experienceTimelineMount");
    if (mount && typeof renderExperience === "function") renderExperience(data, mount);
  } else if (entityKey === "projects-featured" || entityKey === "projects-quickview") {
    const featuredMount = document.getElementById("projectsFeaturedMount");
    if (featuredMount && typeof renderFeaturedProjects === "function") {
      renderFeaturedProjects(data.featured || [], featuredMount, featuredMount.dataset.variant || "home");
    }
    const quickviewMount = document.getElementById("projectGrid");
    if (quickviewMount && typeof renderQuickviewProjects === "function") {
      renderQuickviewProjects(data.quickview || [], quickviewMount);
      if (typeof initProjectGrid === "function") initProjectGrid();
    }
  } else if (entityKey === "skills-core" || entityKey === "skills-coursework") {
    if (typeof renderSkills === "function") {
      renderSkills(data, document.getElementById("skillsCoreMount"), document.getElementById("skillsCourseworkMount"));
    }
  } else if (entityKey === "about") {
    const mount = document.getElementById("aboutMount");
    if (mount && typeof renderAbout === "function") renderAbout(data, mount);
    if (typeof initFlashcards === "function") initFlashcards();
  } else if (entityKey.startsWith("home-")) {
    if (typeof renderHome === "function") renderHome(data);
  }
  if (typeof initReveal === "function") initReveal();
}

// ===== inline text editing (click straight on the text, type, it saves) =====
// Structural changes (add/remove items, links, icon, checkboxes) still go
// through the ✎ Edit form — inline is only for renaming/rewording text
// that's already visibly rendered on the card.
const INLINE_SAVE_DELAY = 1200;
const inlineDirtyFiles = new Set();
let inlineSaveTimer = null;

function scheduleInlineSave(entityKey) {
  inlineDirtyFiles.add(ENTITIES[entityKey].file);
  setToolbarStatus("Unsaved changes…");
  clearTimeout(inlineSaveTimer);
  inlineSaveTimer = setTimeout(flushInlineSaves, INLINE_SAVE_DELAY);
}

async function flushInlineSaves() {
  const files = [...inlineDirtyFiles];
  inlineDirtyFiles.clear();
  for (const path of files) {
    try {
      await saveFile(path, `Update ${path} via edit mode (inline)`);
    } catch (_) {
      inlineDirtyFiles.add(path); // save failed — keep it marked dirty rather than lose it silently
    }
  }
}

// Supports dotted paths (e.g. "link.label") so a nested object field can
// be wired to a single contenteditable element just like a flat one.
function getNestedField(item, field) {
  return field.split(".").reduce((o, k) => (o == null ? o : o[k]), item);
}
function setNestedField(item, field, value) {
  const parts = field.split(".");
  let obj = item;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]] || typeof obj[parts[i]] !== "object") obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
}

function getEntityItem(entityKey, idx) {
  const entity = ENTITIES[entityKey];
  const file = fileCache[entity.file];
  if (!file || !file.data) return null;
  if (entity.singleton) return entity.getItem(file.data) || null;
  const list = entity.rootIsList ? file.data : entity.getList(file.data);
  return list[idx] || null;
}

// Most inline fields live inside their card, so entity/index can be read
// off the nearest [data-edit-entity] ancestor. Elements wired from *outside*
// the card (the Quick View popup, which lives elsewhere in the DOM) carry
// their own entityKey/idx instead — checked first.
function resolveEntityContext(el) {
  if (el.dataset.entityKey) {
    return { entityKey: el.dataset.entityKey, idx: Number(el.dataset.entityIdx) };
  }
  const card = el.closest("[data-edit-entity]");
  if (!card) return null;
  return { entityKey: card.dataset.editEntity, idx: Number(card.dataset.editIndex) };
}

function applyInlineEdit(el) {
  const ctx = resolveEntityContext(el);
  if (!ctx) return;
  const { entityKey, idx } = ctx;
  const item = getEntityItem(entityKey, idx);
  if (!item) return;

  const field = el.dataset.editField;
  const itemIndexRaw = el.dataset.editItemIndex;
  const subfield = el.dataset.editItemSubfield;
  const text = el.textContent.trim();

  if (itemIndexRaw !== undefined) {
    if (!Array.isArray(item[field])) item[field] = [];
    const i = Number(itemIndexRaw);
    if (subfield) {
      if (!item[field][i] || typeof item[field][i] !== "object") item[field][i] = {};
      if (item[field][i][subfield] === text) return;
      item[field][i][subfield] = text;
    } else {
      if (item[field][i] === text) return;
      item[field][i] = text;
    }
  } else {
    if (getNestedField(item, field) === text) return;
    setNestedField(item, field, text);
  }

  scheduleInlineSave(entityKey);

  // Quick View's popup content isn't shown on the base card, so the card's
  // own data-* attributes (which the popup re-reads on every open) need to
  // be refreshed too, or the next open would show stale text.
  if (el.dataset.refreshAfter === "1") refreshMountsFor(entityKey);
}

const INLINE_SINGLE_LINE = new Set([
  "title", "company", "meta", "kicker", "question",
  "label", "nameMain", "nameAccent", "ctaPrimaryLabel", "ctaSecondaryLabel",
  "headingLead", "headingAccent", "headingLine1", "headingLine2", "linkText", "heading", "tagline",
]);

// subfield: for arrays of objects (e.g. links: [{label,href}]) — itemIndex
// picks the array entry, subfield picks which of its properties this
// element edits ("label"). Omit it for arrays of plain strings.
// onCommit: optional override for what happens on blur, in place of the
// default applyInlineEdit (which assumes the flat ENTITIES/[data-edit-entity]
// shape). The case-study block editor below passes its own commit handler,
// since its data lives nested by slug + block id instead.
function wireInline(el, field, itemIndex, subfield, onCommit) {
  if (!el || el.dataset.inlineWired === "1") return;
  el.dataset.inlineWired = "1";

  if (el.tagName === "A") {
    // an inline-editable title can itself be a link (hub project cards) —
    // stop it navigating away while the user is trying to edit it.
    el.addEventListener("click", (e) => e.preventDefault());
  }

  el.contentEditable = "true";
  el.classList.add("edit-inline");
  el.dataset.editField = field;
  if (itemIndex !== undefined) el.dataset.editItemIndex = String(itemIndex);
  if (subfield) el.dataset.editItemSubfield = subfield;

  el.addEventListener("blur", () => (onCommit ? onCommit(el) : applyInlineEdit(el)));
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && (itemIndex !== undefined || INLINE_SINGLE_LINE.has(field))) {
      e.preventDefault();
      el.blur();
    }
  });
}

function wireInlineList(listEl, field) {
  if (!listEl) return;
  Array.from(listEl.children).forEach((li, i) => wireInline(li, field, i));
}

// itemIndex present -> field is an array (e.g. links[itemIndex].href).
// Omitted -> field is a dotted path on the item itself (e.g. "link.href").
function addLinkUrlAffordance(anchorEl, entityKey, idx, field, itemIndex, refreshAfter) {
  if (!anchorEl || anchorEl.dataset.urlAffordance === "1") return;
  anchorEl.dataset.urlAffordance = "1";
  const btn = mkEl("button", {
    className: "edit-link-url",
    text: "🔗",
    attrs: { type: "button", title: "Edit link URL" },
  });
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const item = getEntityItem(entityKey, idx);
    if (!item) return;

    let current, apply;
    if (itemIndex !== undefined) {
      if (!Array.isArray(item[field])) item[field] = [];
      if (!item[field][itemIndex] || typeof item[field][itemIndex] !== "object") item[field][itemIndex] = {};
      current = item[field][itemIndex].href || "";
      apply = (v) => { item[field][itemIndex].href = v; };
    } else {
      current = getNestedField(item, field) || "";
      apply = (v) => setNestedField(item, field, v);
    }

    const next = prompt("Link URL:", current);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === current) return;
    apply(trimmed);
    scheduleInlineSave(entityKey);
    if (refreshAfter) refreshMountsFor(entityKey);
  });
  anchorEl.insertAdjacentElement("afterend", btn);
}

function wireInlineFields(entityKey, card, idx) {
  if (entityKey === "experience") {
    wireInline(card.querySelector("h3"), "title");
    wireInline(card.querySelector(".timeline-node__date"), "date");
    wireInline(card.querySelector(".timeline-node__location"), "location");
    wireInline(card.querySelector(".timeline-node__company"), "company");
    wireInline(card.querySelector(".timeline-node__card > p:not(.timeline-node__company):not(.timeline-node__dateline)"), "summary");
    wireInlineList(card.querySelector(".timeline-node__bullets"), "bullets");
    wireInlineList(card.querySelector(".timeline-node__tags"), "tags");
    wireInline(card.querySelector("a.editorial-text-link"), "link.label");
    addLinkUrlAffordance(card.querySelector("a.editorial-text-link"), entityKey, idx, "link.href");
    wireInline(card.querySelector(".timeline-node__photo p"), "photoNote"); // only present while there's no photo yet
  } else if (entityKey === "projects-featured") {
    wireInline(card.querySelector("h3 a") || card.querySelector("h3"), "title");
    wireInline(card.querySelector(".editorial-project__info > span"), "meta"); // home variant
    wireInline(card.querySelector(".editorial-project__info > p"), "blurbShort"); // home variant
    wireInline(card.querySelector(":scope > p"), "blurbLong"); // hub variant
    wireInlineList(card.querySelector(":scope > .tags"), "tags"); // hub variant
    wireInline(card.querySelector(".editorial-placeholder--project p"), "placeholderNote"); // only present while there's no image yet
  } else if (entityKey === "projects-quickview") {
    wireInline(card.querySelector("h3"), "title");
    wireInline(card.querySelector(":scope > p"), "cardText");
    wireInlineList(card.querySelector(":scope > .tags"), "tags");
  } else if (entityKey === "skills-core" || entityKey === "skills-coursework") {
    wireInline(card.querySelector(".skills-card__title"), "title");
    wireInline(card.querySelector(".skills-card__sub"), "description");
    const chipsWrap = card.querySelector(".skills-chips");
    if (chipsWrap) {
      Array.from(chipsWrap.children).forEach((chip, i) => {
        if (chip.classList.contains("skill-chip--ip")) return; // has a nested badge — edit via the form instead
        wireInline(chip, "chips", i);
      });
    }
  } else if (entityKey === "about") {
    wireInline(card.querySelector(".flashcard__kicker"), "kicker");
    wireInline(card.querySelector(".flashcard__question"), "question");
    wireInlineList(card.querySelector(".flashcard__answer"), "answer");
  }
}

async function preloadEntityFiles() {
  const files = [...new Set(Object.values(ENTITIES).map((e) => e.file))];
  const results = await Promise.allSettled(files.map((f) => loadFile(f)));
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length) {
    setToolbarStatus(failed[0].reason.message, true);
  }
}

// ===== Quick View popup as an editing surface =====
// A quick-view project's tools/results/links never appear on the base
// card (only inside this popup), so there's no page text to attach inline
// editing to without changing the compact-card design. script.js calls
// this hook (if present) every time the popup opens, wiring its content
// as click-and-type using the same engine as everywhere else.
function wireModalField(el, entityKey, idx, field, itemIndex, subfield) {
  if (!el) return;
  el.dataset.entityKey = entityKey;
  el.dataset.entityIdx = String(idx);
  wireInline(el, field, itemIndex, subfield);
  el.dataset.refreshAfter = "1";
}

window.__wireQuickViewEdit = function (card, modalEls) {
  if (!document.body.classList.contains("is-edit-mode")) return;
  const entityKey = card.dataset.editEntity;
  if (!entityKey) return;
  const idx = Number(card.dataset.editIndex);

  if (modalEls.modalSummary) wireModalField(modalEls.modalSummary, entityKey, idx, "summary");

  if (modalEls.modalTools) {
    Array.from(modalEls.modalTools.children).forEach((li, i) => wireModalField(li, entityKey, idx, "tools", i));
  }
  if (modalEls.modalResults) {
    Array.from(modalEls.modalResults.children).forEach((li, i) => wireModalField(li, entityKey, idx, "results", i));
  }
  if (modalEls.modalLinks) {
    Array.from(modalEls.modalLinks.querySelectorAll("a")).forEach((a, i) => {
      a.dataset.entityKey = entityKey;
      a.dataset.entityIdx = String(idx);
      wireModalField(a, entityKey, idx, "links", i, "label");
      addLinkUrlAffordance(a, entityKey, idx, "links", i, true);
    });
  }
};

// ===== homepage singleton copy (hero / summary / in brief / origin / contact / footer) =====
// No card, no ✎ Edit form, no add/delete — just click-and-type on the text
// already sitting in index.html, the same way Quick View's popup fields are
// wired from outside the normal [data-edit-entity] card system.
function wireHomeField(el, entityKey, field, itemIndex) {
  if (!el) return;
  el.dataset.entityKey = entityKey;
  wireInline(el, field, itemIndex);
}

// A field that's visually nested inside a whole-section <a> (the hero's
// primary CTA button) needs that ancestor link's click suppressed too, or
// clicking in to edit just navigates away — wireInline only does this for
// the case where the wired element itself is the <a>.
function guardEditableAnchor(el) {
  if (!el) return;
  const anchor = el.closest("a");
  if (!anchor || anchor.dataset.editAnchorGuard === "1") return;
  anchor.dataset.editAnchorGuard = "1";
  anchor.addEventListener("click", (e) => e.preventDefault());
}

// The scalar fields below already exist as empty elements at parse time, so
// wiring them once is enough. The list-backed fields (status/paragraphs/
// items) only exist once script.js's async fetch of data/home.json has run
// renderHome() — which can land before *or* after this script finishes
// loading (it's injected dynamically, so there's no reliable ordering) — so
// those need a MutationObserver, same as watchMount() does for every other
// entity's list mounts.
function watchHomeListMount(id, wireFn) {
  const el = document.getElementById(id);
  if (!el) return;
  wireFn();
  const obs = new MutationObserver(wireFn);
  obs.observe(el, { childList: true });
}

// Standalone (non-entity) photo slots — the hero portrait and the "beyond
// engineering" photo. renderHome() fully rebuilds these mounts' contents on
// every home-* refresh (not just their own), so both the placeholder-note
// text and the photo button need the same re-wire-on-mutation treatment as
// the list mounts above, not a one-time wire.
function wireHomePhotoSlot(mountId, entityKey, noteId) {
  watchHomeListMount(mountId, () => {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    wireHomeField(document.getElementById(noteId), entityKey, "placeholderNote");
    if (!mount.querySelector(".edit-affordance--photo")) {
      const photoBtn = mkEl("button", { className: "edit-affordance edit-affordance--photo", text: "📷 Photo", attrs: { type: "button" } });
      photoBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        promptPhotoUpload(entityKey, undefined);
      });
      mount.appendChild(photoBtn);
    }
  });
}

function wireHomeInlineFields() {
  if (!document.getElementById("heroKicker")) return; // only present on the homepage

  wireHomeField(document.getElementById("heroKicker"), "home-hero", "kicker");
  wireHomeField(document.getElementById("heroNameMain"), "home-hero", "nameMain");
  wireHomeField(document.getElementById("heroNameAccent"), "home-hero", "nameAccent");
  wireHomeField(document.getElementById("heroLede"), "home-hero", "lede");
  wireHomePhotoSlot("heroVisual", "home-hero", "heroPlaceholderNote");

  const ctaPrimary = document.getElementById("heroCtaPrimary");
  guardEditableAnchor(ctaPrimary);
  wireHomeField(ctaPrimary, "home-hero", "ctaPrimaryLabel");
  wireHomeField(document.getElementById("heroCtaSecondary"), "home-hero", "ctaSecondaryLabel");

  watchHomeListMount("heroStatus", () => {
    Array.from(document.getElementById("heroStatus").children).forEach((el, i) => wireHomeField(el, "home-hero", "status", i));
  });

  wireHomeField(document.getElementById("summaryLabel"), "home-summary", "label");
  wireHomeField(document.getElementById("summaryHeadingLead"), "home-summary", "headingLead");
  wireHomeField(document.getElementById("summaryHeadingAccent"), "home-summary", "headingAccent");
  wireHomeField(document.getElementById("summaryLinkText"), "home-summary", "linkText");
  watchHomeListMount("summaryParagraphs", () => {
    Array.from(document.getElementById("summaryParagraphs").children).forEach((el, i) => wireHomeField(el, "home-summary", "paragraphs", i));
  });

  wireHomeField(document.getElementById("briefLabel"), "home-brief", "label");
  wireHomeField(document.getElementById("briefStrengthsTitle"), "home-brief-strengths", "title");
  wireHomeField(document.getElementById("briefCuriousTitle"), "home-brief-curious", "title");
  watchHomeListMount("briefStrengthsList", () => {
    Array.from(document.getElementById("briefStrengthsList").children).forEach((li, i) =>
      wireHomeField(li.querySelector(".editorial-list-block__text"), "home-brief-strengths", "items", i));
  });
  watchHomeListMount("briefCuriousList", () => {
    Array.from(document.getElementById("briefCuriousList").children).forEach((li, i) =>
      wireHomeField(li.querySelector(".editorial-list-block__text"), "home-brief-curious", "items", i));
  });

  wireHomeField(document.getElementById("originLabel"), "home-origin", "label");
  wireHomePhotoSlot("originVisual", "home-origin", "originPlaceholderNote");
  wireHomeField(document.getElementById("originKicker"), "home-origin", "kicker");
  wireHomeField(document.getElementById("originHeading"), "home-origin", "heading");
  watchHomeListMount("originParagraphs", () => {
    Array.from(document.getElementById("originParagraphs").children).forEach((el, i) => wireHomeField(el, "home-origin", "paragraphs", i));
  });

  wireHomeField(document.getElementById("contactKicker"), "home-contact", "kicker");
  wireHomeField(document.getElementById("contactHeadingLine1"), "home-contact", "headingLine1");
  wireHomeField(document.getElementById("contactHeadingLine2"), "home-contact", "headingLine2");

  wireHomeField(document.getElementById("footerTagline"), "home-footer", "tagline");
}

// ===== contextual photo upload =====
// Target aspect ratio (width/height) each photo slot displays at on the
// real page — the crop stage below is locked to this ratio, so what's
// framed in the cropper is exactly what object-fit:cover will show live.
const PHOTO_ASPECTS = {
  experience: 16 / 10,
  "projects-featured": 16 / 10,
  "home-hero": 4 / 5,
  "home-origin": 4 / 3,
};
// Where the uploaded photo gets written on the entity, and in what shape —
// experience.photo is a bare path string; everything else is {src, alt}.
const PHOTO_FIELD = {
  "projects-featured": { key: "image", shape: "object" },
  experience: { key: "photo", shape: "string" },
  "home-hero": { key: "photo", shape: "object" },
  "home-origin": { key: "photo", shape: "object" },
};

function injectCropModal() {
  if (document.getElementById("cropModal")) return;

  const modal = mkEl("div", { className: "modal crop-modal", attrs: { id: "cropModal", "aria-hidden": "true" } });
  modal.appendChild(mkEl("div", { className: "modal__backdrop", attrs: { "data-close": "true" } }));

  const panel = mkEl("div", { className: "modal__panel crop-modal__panel", attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "cropModalTitle" } });
  panel.appendChild(mkEl("button", { className: "modal__close", text: "✕", attrs: { type: "button", "data-close": "true", "aria-label": "Close" } }));
  panel.appendChild(mkEl("h3", { text: "Crop & position photo", attrs: { id: "cropModalTitle" } }));
  panel.appendChild(mkEl("p", { className: "muted crop-modal__hint", text: "Drag to reposition, use the slider to zoom — this framing is exactly what will show on the page." }));

  const stage = mkEl("div", { className: "crop-stage", attrs: { id: "cropStage" } });
  stage.appendChild(mkEl("img", { attrs: { id: "cropImage", alt: "", draggable: "false" } }));
  panel.appendChild(stage);

  const zoom = document.createElement("input");
  zoom.type = "range";
  zoom.id = "cropZoom";
  zoom.min = "100";
  zoom.max = "320";
  zoom.value = "100";
  zoom.className = "crop-zoom";
  panel.appendChild(zoom);

  const actions = mkEl("div", { className: "admin-form__actions" });
  actions.appendChild(mkEl("button", { className: "btn btn--ghost", text: "Cancel", attrs: { type: "button", id: "cropCancelBtn" } }));
  actions.appendChild(mkEl("button", { className: "btn", text: "Use this photo", attrs: { type: "button", id: "cropConfirmBtn" } }));
  panel.appendChild(actions);

  modal.appendChild(panel);
  document.body.appendChild(modal);
}

// Resolves to a cropped/resized JPEG Blob, or null if the user cancels.
// The crop "stage" is a fixed-aspect viewport the source photo is panned
// and zoomed inside of — since it's locked to the same aspect ratio the
// photo will actually render at (object-fit:cover), it doubles as an exact
// live preview of the final framing rather than a separate mockup.
function openCropModal(file, aspect) {
  injectCropModal();
  return new Promise((resolve) => {
    const modal = document.getElementById("cropModal");
    const stage = document.getElementById("cropStage");
    const img = document.getElementById("cropImage");
    const zoom = document.getElementById("cropZoom");
    const cancelBtn = document.getElementById("cropCancelBtn");
    const confirmBtn = document.getElementById("cropConfirmBtn");

    const objectUrl = URL.createObjectURL(file);
    let naturalW, naturalH, scaleCover, scale, tx, ty;
    let dragging = false, dragStartX, dragStartY, dragStartTx, dragStartTy;

    function applyTransform() {
      img.style.width = `${naturalW * scale}px`;
      img.style.height = `${naturalH * scale}px`;
      img.style.transform = `translate(${tx}px, ${ty}px)`;
    }

    function clamp() {
      const stageW = stage.clientWidth, stageH = stage.clientHeight;
      const dispW = naturalW * scale, dispH = naturalH * scale;
      tx = Math.min(0, Math.max(stageW - dispW, tx));
      ty = Math.min(0, Math.max(stageH - dispH, ty));
    }

    function setScale(newScale) {
      const stageW = stage.clientWidth, stageH = stage.clientHeight;
      // Anchor the point currently at the stage's center so zooming feels
      // like it's zooming into what you're looking at, not the corner.
      const cx = (stageW / 2 - tx) / scale;
      const cy = (stageH / 2 - ty) / scale;
      scale = newScale;
      tx = stageW / 2 - cx * scale;
      ty = stageH / 2 - cy * scale;
      clamp();
      applyTransform();
    }

    function onPointerDown(e) {
      dragging = true;
      dragStartX = e.clientX; dragStartY = e.clientY;
      dragStartTx = tx; dragStartTy = ty;
      stage.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e) {
      if (!dragging) return;
      tx = dragStartTx + (e.clientX - dragStartX);
      ty = dragStartTy + (e.clientY - dragStartY);
      clamp();
      applyTransform();
    }
    function onPointerUp(e) {
      dragging = false;
      try { stage.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    function onZoomInput() {
      setScale(scaleCover * (Number(zoom.value) / 100));
    }

    function cleanup() {
      URL.revokeObjectURL(objectUrl);
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", onPointerUp);
      stage.removeEventListener("pointercancel", onPointerUp);
      zoom.removeEventListener("input", onZoomInput);
      cancelBtn.removeEventListener("click", onCancel);
      confirmBtn.removeEventListener("click", onConfirm);
      modal.removeEventListener("click", onBackdropClick);
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
    }
    function onCancel() { cleanup(); resolve(null); }
    function onBackdropClick(e) { if (e.target.dataset.close === "true") onCancel(); }
    function onConfirm() {
      const stageW = stage.clientWidth, stageH = stage.clientHeight;
      const sx = -tx / scale, sy = -ty / scale;
      const sw = stageW / scale, sh = stageH / scale;
      const outW = aspect >= 1 ? 1600 : Math.round(1600 * aspect);
      const outH = aspect >= 1 ? Math.round(1600 / aspect) : 1600;
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      canvas.toBlob((blob) => { cleanup(); resolve(blob); }, "image/jpeg", PHOTO_QUALITY);
    }

    img.onload = () => {
      // Show the modal before measuring — a display:none ancestor reports
      // clientWidth/Height as 0, which would poison every calc below.
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      stage.style.aspectRatio = String(aspect);

      naturalW = img.naturalWidth;
      naturalH = img.naturalHeight;
      const stageW = stage.clientWidth, stageH = stage.clientHeight;
      scaleCover = Math.max(stageW / naturalW, stageH / naturalH);
      scale = scaleCover;
      tx = (stageW - naturalW * scale) / 2;
      ty = (stageH - naturalH * scale) / 2;
      zoom.value = "100";
      applyTransform();

      stage.addEventListener("pointerdown", onPointerDown);
      stage.addEventListener("pointermove", onPointerMove);
      stage.addEventListener("pointerup", onPointerUp);
      stage.addEventListener("pointercancel", onPointerUp);
      zoom.addEventListener("input", onZoomInput);
      cancelBtn.addEventListener("click", onCancel);
      confirmBtn.addEventListener("click", onConfirm);
      modal.addEventListener("click", onBackdropClick);
    };
    img.src = objectUrl;
  });
}

function promptPhotoUpload(entityKey, idx) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;

    const cropped = await openCropModal(file, PHOTO_ASPECTS[entityKey] || 16 / 10);
    if (!cropped) return; // user cancelled — nothing uploaded, nothing changed

    setToolbarStatus("Uploading photo…");
    try {
      const entity = ENTITIES[entityKey];
      const path = `assets/photos/${Date.now().toString(36)}-photo.jpg`;
      await ghPutBinary(path, await fileToBase64(cropped), null, "Upload photo via edit mode");

      const file2 = await loadFile(entity.file);
      const item = entity.singleton
        ? entity.getItem(file2.data)
        : (entity.rootIsList ? file2.data : entity.getList(file2.data))[idx];

      const fieldCfg = PHOTO_FIELD[entityKey] || { key: "photo", shape: "string" };
      item[fieldCfg.key] = fieldCfg.shape === "object"
        ? { src: `/${path}`, alt: item.title || item.heading || "" }
        : `/${path}`;

      await saveFile(entity.file, `Update ${entity.file} via edit mode (photo)`);
      refreshMountsFor(entityKey);
    } catch (err) {
      setToolbarStatus(`Photo upload failed: ${err.message}`, true);
    }
  });
  input.click();
}

// ===== case-study block editor (/projects/<slug>/ pages) =====
// Blocks live in data/case-studies.json, keyed by slug, addressed by the
// block's own "id" rather than a numeric list index (see the "case-study"
// ENTITIES registration above) — everything here reads/writes that JSON
// directly instead of going through the generic ENTITIES getList/fromForm
// machinery, which assumes a flat list of same-shaped items.
const CASE_STUDY_BLOCK_LABELS = { text: "Text", list: "Bulleted list", stats: "Stat callout", tags: "Tag list", gallery: "Photo gallery" };
const CASE_STUDY_FONTS = {
  default: "inherit",
  "DM Sans": '"DM Sans", sans-serif',
  Manrope: '"Manrope", sans-serif',
  Caveat: '"Caveat", cursive',
  "IBM Plex Mono": '"IBM Plex Mono", monospace',
};
const CASE_STUDY_DEFAULT_ACCENT = "#2b5c82";

function currentCaseStudySlug() {
  const m = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  return m ? m[1] : null;
}

function getCaseStudyEntry(slug) {
  const file = fileCache["data/case-studies.json"];
  if (!slug || !file || !file.data) return null;
  return file.data[slug] || null;
}

function findCaseStudyBlock(slug, blockId) {
  const cs = getCaseStudyEntry(slug);
  if (!cs) return null;
  return (cs.blocks || []).find((b) => b.id === blockId) || null;
}

function rerenderCaseStudyPage() {
  const slug = currentCaseStudySlug();
  const mount = document.getElementById("caseStudyBlocks");
  if (!slug || !mount || typeof renderCaseStudy !== "function") return;
  renderCaseStudy(getCaseStudyEntry(slug), slug, mount);
  if (typeof initReveal === "function") initReveal();
}

// ---- hero (eyebrow/title/subtitle/factline/CTAs) ----
function wireCaseStudyHeroField(el, field, subfield) {
  if (!el) return;
  if (subfield) guardEditableAnchor(el);
  wireInline(el, field, undefined, subfield, (element) => {
    const slug = currentCaseStudySlug();
    const cs = getCaseStudyEntry(slug);
    if (!cs) return;
    if (!cs.hero) cs.hero = {};
    const text = element.textContent.trim();
    if (subfield) {
      if (!cs.hero[field] || typeof cs.hero[field] !== "object") cs.hero[field] = {};
      cs.hero[field][subfield] = text;
    } else {
      cs.hero[field] = text;
    }
    scheduleInlineSave("case-study");
  });
}

function wireCaseStudyHeroFields() {
  wireCaseStudyHeroField(document.getElementById("csEyebrow"), "eyebrow");
  wireCaseStudyHeroField(document.getElementById("csTitle"), "title");
  wireCaseStudyHeroField(document.getElementById("csSubtitle"), "subtitle");
  wireCaseStudyHeroField(document.getElementById("csFactline"), "factline");
  wireCaseStudyHeroField(document.getElementById("csCtaPrimary"), "ctaPrimary", "label");
  wireCaseStudyHeroField(document.getElementById("csCtaSecondary"), "ctaSecondary", "label");
}

// ---- per-block text fields ----
// text blocks render one <p> per paragraph with no per-paragraph index, so
// editing one re-serializes every paragraph in the block (joined back with
// blank lines) rather than trying to track which <p> is "paragraph 2".
function applyCaseStudyInlineEdit(el) {
  const slug = currentCaseStudySlug();
  const section = el.closest("[data-block-id]");
  if (!slug || !section) return;
  const block = findCaseStudyBlock(slug, section.dataset.blockId);
  if (!block) return;

  const field = el.dataset.editField;
  const itemIndexRaw = el.dataset.editItemIndex;
  const subfield = el.dataset.editItemSubfield;

  if (field === "body") {
    const paras = Array.from(section.querySelectorAll('[data-block-field="body"]')).map((p) => p.textContent.trim());
    block.body = paras.join("\n\n");
  } else if (field === "images" && (subfield === "__label" || subfield === "__note")) {
    // Empty gallery slots show as a bold label + smaller note (matching the
    // dashed-placeholder look), stored as one "Label — note" caption string.
    const i = Number(itemIndexRaw);
    const wrap = el.closest(".evidence-placeholder");
    const label = wrap.querySelector(".evidence-placeholder__label");
    const note = wrap.querySelector(".evidence-placeholder__note");
    const labelText = label ? label.textContent.trim() : "";
    const noteText = note ? note.textContent.trim() : "";
    if (!block.images[i]) block.images[i] = { src: "", alt: "", caption: "" };
    block.images[i].caption = noteText ? `${labelText} — ${noteText}` : labelText;
  } else if (itemIndexRaw !== undefined) {
    const i = Number(itemIndexRaw);
    if (!Array.isArray(block[field]) && field !== "images") block[field] = [];
    if (subfield) {
      if (!block[field][i] || typeof block[field][i] !== "object") block[field][i] = {};
      block[field][i][subfield] = el.textContent.trim();
    } else {
      block[field][i] = el.textContent.trim();
    }
  } else {
    block[field] = el.textContent.trim();
  }
  scheduleInlineSave("case-study");
}

function wireCaseStudyBlockFields(section) {
  const type = section.dataset.blockType;
  const heading = section.querySelector('[data-block-field="heading"]');
  if (heading) wireInline(heading, "heading", undefined, undefined, applyCaseStudyInlineEdit);

  if (type === "text") {
    section.querySelectorAll('[data-block-field="body"]').forEach((p) => wireInline(p, "body", undefined, undefined, applyCaseStudyInlineEdit));
  } else if (type === "list") {
    const ul = section.querySelector('[data-block-field="items"]');
    if (ul) Array.from(ul.children).forEach((li, i) => wireInline(li, "items", i, undefined, applyCaseStudyInlineEdit));
  } else if (type === "tags") {
    const ul = section.querySelector('[data-block-field="items"]');
    if (ul) Array.from(ul.children).forEach((li, i) => wireInline(li, "items", i, undefined, applyCaseStudyInlineEdit));
    const note = section.querySelector('[data-block-field="note"]');
    if (note) wireInline(note, "note", undefined, undefined, applyCaseStudyInlineEdit);
  } else if (type === "stats") {
    section.querySelectorAll(".result-callout__stat").forEach((stat, i) => {
      const value = stat.querySelector(".result-callout__value");
      const label = stat.querySelector(".result-callout__label");
      if (value) wireInline(value, "stats", i, "value", applyCaseStudyInlineEdit);
      if (label) wireInline(label, "stats", i, "label", applyCaseStudyInlineEdit);
    });
    const note = section.querySelector('[data-block-field="note"]');
    if (note) wireInline(note, "note", undefined, undefined, applyCaseStudyInlineEdit);
  } else if (type === "gallery") {
    const caption = section.querySelector('[data-block-field="caption"]');
    if (caption) wireInline(caption, "caption", undefined, undefined, applyCaseStudyInlineEdit);
    section.querySelectorAll(".evidence-placeholder").forEach((ph, i) => {
      wireInline(ph.querySelector(".evidence-placeholder__label"), "images", i, "__label", applyCaseStudyInlineEdit);
      wireInline(ph.querySelector(".evidence-placeholder__note"), "images", i, "__note", applyCaseStudyInlineEdit);
    });
    section.querySelectorAll(".evidence-photo figcaption").forEach((cap, i) => {
      wireInline(cap, "images", i, "caption", applyCaseStudyInlineEdit);
    });
    wireCaseStudyGalleryControls(section);
  }
}

// ---- whole-block move/delete + add ----
function moveCaseStudyBlock(slug, blockId, dir) {
  const cs = getCaseStudyEntry(slug);
  if (!cs) return;
  const blocks = cs.blocks || [];
  const i = blocks.findIndex((b) => b.id === blockId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= blocks.length) return;
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  scheduleInlineSave("case-study");
  rerenderCaseStudyPage();
}

function deleteCaseStudyBlock(slug, blockId) {
  const cs = getCaseStudyEntry(slug);
  if (!cs) return;
  if (!confirm("Delete this block? This can't be undone.")) return;
  cs.blocks = (cs.blocks || []).filter((b) => b.id !== blockId);
  scheduleInlineSave("case-study");
  rerenderCaseStudyPage();
}

function buildBlockToolbar(section, index, total) {
  const slug = currentCaseStudySlug();
  const blockId = section.dataset.blockId;
  const bar = mkEl("div", { className: "cs-block-toolbar" });

  const up = mkEl("button", { className: "cs-block-toolbar__btn", text: "↑", attrs: { type: "button", title: "Move up" } });
  if (index === 0) up.disabled = true;
  up.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); moveCaseStudyBlock(slug, blockId, -1); });
  bar.appendChild(up);

  const down = mkEl("button", { className: "cs-block-toolbar__btn", text: "↓", attrs: { type: "button", title: "Move down" } });
  if (index === total - 1) down.disabled = true;
  down.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); moveCaseStudyBlock(slug, blockId, 1); });
  bar.appendChild(down);

  const del = mkEl("button", { className: "cs-block-toolbar__btn cs-block-toolbar__btn--danger", text: "🗑", attrs: { type: "button", title: "Delete block" } });
  del.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); deleteCaseStudyBlock(slug, blockId); });
  bar.appendChild(del);

  return bar;
}

function defaultCaseStudyBlock(type) {
  const id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const shapes = {
    text: { heading: "New section", body: "Click to add your text here." },
    list: { heading: "New list", items: ["Click to add an item."] },
    stats: { heading: "Quantified result", stats: [{ value: "0", label: "Click to edit this label." }], note: "" },
    tags: { heading: "Technologies & tools", items: ["Click to edit"], note: "" },
    gallery: { heading: "Photos", caption: "", layout: "grid", images: [] },
  };
  return { id, type, ...shapes[type] };
}

function addCaseStudyBlock(type) {
  const slug = currentCaseStudySlug();
  const cs = getCaseStudyEntry(slug);
  if (!cs) return;
  if (!cs.blocks) cs.blocks = [];
  cs.blocks.push(defaultCaseStudyBlock(type));
  scheduleInlineSave("case-study");
  rerenderCaseStudyPage();
}

function closeBlockPickerModal() {
  const modal = document.getElementById("blockPickerModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

function openCaseStudyBlockPicker() {
  if (!document.getElementById("blockPickerModal")) {
    const modal = mkEl("div", { className: "modal", attrs: { id: "blockPickerModal", "aria-hidden": "true" } });
    modal.appendChild(mkEl("div", { className: "modal__backdrop", attrs: { "data-close": "true" } }));
    const panel = mkEl("div", { className: "modal__panel cs-block-picker__panel", attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "blockPickerTitle" } });
    panel.appendChild(mkEl("button", { className: "modal__close", text: "✕", attrs: { type: "button", "data-close": "true", "aria-label": "Close" } }));
    panel.appendChild(mkEl("h3", { text: "Add a block", attrs: { id: "blockPickerTitle" } }));
    const list = mkEl("div", { className: "cs-block-picker__list" });
    Object.keys(CASE_STUDY_BLOCK_LABELS).forEach((type) => {
      const btn = mkEl("button", { className: "btn btn--ghost cs-block-picker__option", text: CASE_STUDY_BLOCK_LABELS[type], attrs: { type: "button" } });
      btn.addEventListener("click", () => { addCaseStudyBlock(type); closeBlockPickerModal(); });
      list.appendChild(btn);
    });
    panel.appendChild(list);
    modal.appendChild(panel);
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target.dataset.close === "true") closeBlockPickerModal(); });
  }
  const modal = document.getElementById("blockPickerModal");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function ensureCaseStudyAddTile(mount) {
  if (!mount.parentNode || mount.parentNode.querySelector(".cs-block-add")) return;
  const tile = mkEl("button", { className: "edit-add-tile cs-block-add", text: "+ Add block", attrs: { type: "button" } });
  tile.addEventListener("click", openCaseStudyBlockPicker);
  mount.parentNode.insertBefore(tile, mount.nextSibling);
}

// ---- gallery images: add/replace/reorder/caption/remove ----
function moveCaseStudyImage(slug, blockId, i, dir) {
  const block = findCaseStudyBlock(slug, blockId);
  if (!block || !block.images) return;
  const j = i + dir;
  if (j < 0 || j >= block.images.length) return;
  [block.images[i], block.images[j]] = [block.images[j], block.images[i]];
  scheduleInlineSave("case-study");
  rerenderCaseStudyPage();
}

function removeCaseStudyImage(slug, blockId, i) {
  const block = findCaseStudyBlock(slug, blockId);
  if (!block || !block.images) return;
  if (!confirm("Remove this photo?")) return;
  block.images.splice(i, 1);
  scheduleInlineSave("case-study");
  rerenderCaseStudyPage();
}

// i === null appends every uploaded file as a new slot ("+ Add photos",
// multi-select); a numeric i replaces just that one slot.
function promptCaseStudyImageUpload(slug, blockId, i) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  if (i === null) input.multiple = true;
  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    setToolbarStatus("Uploading photo…");
    try {
      for (const file of files) {
        const downscaled = await downscaleImage(file);
        const path = `assets/photos/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-cs.jpg`;
        await ghPutBinary(path, await fileToBase64(downscaled), null, "Upload case-study photo via edit mode");
        const block = findCaseStudyBlock(slug, blockId);
        if (!block) continue;
        if (!block.images) block.images = [];
        const entry = { src: `/${path}`, alt: "", caption: block.images[i] ? block.images[i].caption || "" : "" };
        if (i === null) block.images.push(entry);
        else block.images[i] = entry;
      }
      await saveFile("data/case-studies.json", "Update data/case-studies.json via edit mode (photo)");
      rerenderCaseStudyPage();
    } catch (err) {
      setToolbarStatus(`Photo upload failed: ${err.message}`, true);
    }
  });
  input.click();
}

function editCaseStudyImageCaption(slug, blockId, i) {
  const block = findCaseStudyBlock(slug, blockId);
  if (!block || !block.images || !block.images[i]) return;
  const next = prompt("Caption:", block.images[i].caption || "");
  if (next === null) return;
  block.images[i].caption = next.trim();
  scheduleInlineSave("case-study");
  rerenderCaseStudyPage();
}

function wireCaseStudyGalleryControls(section) {
  const slug = currentCaseStudySlug();
  const blockId = section.dataset.blockId;
  const container = section.querySelector(".container");
  const grid = section.querySelector('[data-block-field="images"]');
  if (!grid || !container) return;

  const layoutBtn = mkEl("button", {
    className: "cs-gallery-layout-toggle",
    text: grid.dataset.layout === "row" ? "⇄ Switch to grid" : "⇄ Switch to row (side-by-side)",
    attrs: { type: "button", title: "Toggle a 2-up row layout for side-by-side comparisons" },
  });
  layoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const block = findCaseStudyBlock(slug, blockId);
    if (!block) return;
    block.layout = block.layout === "row" ? "grid" : "row";
    scheduleInlineSave("case-study");
    rerenderCaseStudyPage();
  });
  container.insertBefore(layoutBtn, grid);

  const items = Array.from(grid.children);
  items.forEach((item, i) => {
    item.classList.add("cs-gallery-item");
    const controls = mkEl("div", { className: "cs-gallery-item-controls" });
    if (i > 0) {
      const left = mkEl("button", { className: "cs-gallery-item-controls__btn", text: "←", attrs: { type: "button", title: "Move earlier" } });
      left.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); moveCaseStudyImage(slug, blockId, i, -1); });
      controls.appendChild(left);
    }
    const editBtn = mkEl("button", { className: "cs-gallery-item-controls__btn", text: "✏️", attrs: { type: "button", title: "Edit caption" } });
    editBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); editCaseStudyImageCaption(slug, blockId, i); });
    controls.appendChild(editBtn);
    const photoBtn = mkEl("button", { className: "cs-gallery-item-controls__btn", text: "📷", attrs: { type: "button", title: "Upload photo" } });
    photoBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); promptCaseStudyImageUpload(slug, blockId, i); });
    controls.appendChild(photoBtn);
    if (i < items.length - 1) {
      const right = mkEl("button", { className: "cs-gallery-item-controls__btn", text: "→", attrs: { type: "button", title: "Move later" } });
      right.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); moveCaseStudyImage(slug, blockId, i, 1); });
      controls.appendChild(right);
    }
    const removeBtn = mkEl("button", { className: "cs-gallery-item-controls__btn cs-gallery-item-controls__btn--danger", text: "✕", attrs: { type: "button", title: "Remove" } });
    removeBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); removeCaseStudyImage(slug, blockId, i); });
    controls.appendChild(removeBtn);
    item.appendChild(controls);
  });

  const addBtn = mkEl("button", { className: "edit-add-tile cs-gallery-add", text: "+ Add photos", attrs: { type: "button" } });
  addBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); promptCaseStudyImageUpload(slug, blockId, null); });
  container.appendChild(addBtn);
}

// ---- style panel (font / text size / accent color) ----
function applyCaseStudyStyle(style) {
  const mount = document.getElementById("caseStudyBlocks");
  if (!mount || !style) return;
  mount.style.setProperty("--cs-font-family", CASE_STUDY_FONTS[style.fontFamily] || "inherit");
  mount.style.setProperty("--cs-font-size-scale", String(style.fontSizeScale || 1));
  if (style.accentColor) mount.style.setProperty("--cs-accent", style.accentColor);
  else mount.style.removeProperty("--cs-accent");
}

function injectCaseStudyStylePanel(slug) {
  if (document.getElementById("csStylePanel")) return;
  const cs = getCaseStudyEntry(slug);
  const style = (cs && cs.style) || { fontFamily: "default", fontSizeScale: 1, accentColor: "" };

  const panel = mkEl("div", { className: "cs-style-panel", attrs: { id: "csStylePanel" } });
  panel.appendChild(mkEl("div", { className: "cs-style-panel__title", text: "Page style" }));

  const fontRow = mkEl("label", { className: "cs-style-panel__row" });
  fontRow.appendChild(mkEl("span", { text: "Font" }));
  const fontSelect = document.createElement("select");
  fontSelect.className = "input";
  Object.keys(CASE_STUDY_FONTS).forEach((name) => {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name === "default" ? "Default" : name;
    if (name === style.fontFamily) o.selected = true;
    fontSelect.appendChild(o);
  });
  fontRow.appendChild(fontSelect);
  panel.appendChild(fontRow);

  const sizeRow = mkEl("label", { className: "cs-style-panel__row" });
  sizeRow.appendChild(mkEl("span", { text: "Text size" }));
  const sizeSelect = document.createElement("select");
  sizeSelect.className = "input";
  [0.9, 1, 1.1, 1.2].forEach((scale) => {
    const o = document.createElement("option");
    o.value = String(scale);
    o.textContent = `${Math.round(scale * 100)}%`;
    if (scale === (style.fontSizeScale || 1)) o.selected = true;
    sizeSelect.appendChild(o);
  });
  sizeRow.appendChild(sizeSelect);
  panel.appendChild(sizeRow);

  const colorRow = mkEl("label", { className: "cs-style-panel__row" });
  colorRow.appendChild(mkEl("span", { text: "Accent color" }));
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = style.accentColor || CASE_STUDY_DEFAULT_ACCENT;
  colorRow.appendChild(colorInput);
  panel.appendChild(colorRow);

  const resetBtn = mkEl("button", { className: "cs-style-panel__reset", text: "Reset to default", attrs: { type: "button" } });
  panel.appendChild(resetBtn);

  const commit = (newStyle) => {
    const entry = getCaseStudyEntry(slug);
    if (!entry) return;
    entry.style = newStyle;
    applyCaseStudyStyle(newStyle);
    scheduleInlineSave("case-study");
  };
  const commitFromControls = () => commit({ fontFamily: fontSelect.value, fontSizeScale: Number(sizeSelect.value), accentColor: colorInput.value });

  fontSelect.addEventListener("change", commitFromControls);
  sizeSelect.addEventListener("change", commitFromControls);
  colorInput.addEventListener("input", commitFromControls);
  resetBtn.addEventListener("click", () => {
    fontSelect.value = "default";
    sizeSelect.value = "1";
    colorInput.value = CASE_STUDY_DEFAULT_ACCENT;
    commit({ fontFamily: "default", fontSizeScale: 1, accentColor: "" });
  });

  document.body.appendChild(panel);
  applyCaseStudyStyle(style);
}

// ---- decoration + activation ----
function decorateCaseStudyBlocks(mount) {
  const sections = Array.from(mount.querySelectorAll("[data-block-id]"));
  sections.forEach((section, i) => {
    section.classList.add("cs-block");
    wireCaseStudyBlockFields(section);
    section.appendChild(buildBlockToolbar(section, i, sections.length));
  });
  ensureCaseStudyAddTile(mount);
}

function watchCaseStudyMount() {
  const mount = document.getElementById("caseStudyBlocks");
  if (!mount) return;
  const run = () => decorateCaseStudyBlocks(mount);
  run();
  const obs = new MutationObserver(run);
  obs.observe(mount, { childList: true });
}

function initCaseStudyEditor() {
  const slug = currentCaseStudySlug();
  if (!slug || !document.getElementById("caseStudyBlocks")) return;
  wireCaseStudyHeroFields();
  watchCaseStudyMount();
  loadFile("data/case-studies.json").then(() => injectCaseStudyStylePanel(slug)).catch(() => {});
}

// ---- new-project scaffolding (see handleFormSave's isNewProject branch) ----
function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function defaultCaseStudyBlocks() {
  return [
    { id: "b1", type: "text", heading: "Problem", body: "Click to describe the problem this project solved." },
    { id: "b2", type: "text", heading: "Why it mattered", body: "Click to describe why this problem mattered." },
    { id: "b3", type: "list", heading: "Constraints", items: ["Click to add a constraint."] },
    { id: "b4", type: "text", heading: "My role", body: "Click to describe your role on this project." },
    { id: "b5", type: "list", heading: "Data & engineering approach", items: ["Click to add an approach detail."] },
    { id: "b6", type: "text", heading: "Development process", body: "Click to describe how you built it." },
    { id: "b7", type: "text", heading: "Solution", body: "Click to describe the solution." },
    { id: "b8", type: "stats", heading: "Quantified result", stats: [{ value: "0", label: "Click to edit this result." }], note: "" },
    { id: "b9", type: "gallery", heading: "Visual evidence", caption: "Add photos below.", layout: "grid", images: [] },
    { id: "b10", type: "tags", heading: "Technologies & tools", items: ["Click to edit"], note: "" },
    { id: "b11", type: "text", heading: "What I learned", body: "Click to describe your takeaway." },
  ];
}

function caseStudyBoilerplateHTML(title, description, ogUrl) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(ogUrl);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${d}" />
    <title>${t} | Paul Poleon Jr</title>

  <link rel="icon" href="/assets/logo.website.png?v=2">
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${t} | Paul Poleon Jr" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${u}" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=Caveat:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="../../styles.css" />
  </head>

  <body class="editorial-theme fieldnotes-theme">
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <defs>
        <filter id="sketchy" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/>
        </filter>
      </defs>
    </svg>
    <a class="skip-link" href="#main">Skip to content</a>

    <header class="portfolio-nav">
      <a class="portfolio-nav__mark" href="/" aria-label="Home"><img src="/assets/logo.website.png" alt="Paul Poleon logo" class="portfolio-nav__logo"></a>
      <button class="nav__toggle" aria-expanded="false" aria-controls="navLinks">Menu</button>
      <nav id="navLinks" class="portfolio-nav__links" aria-label="Primary">
        <a href="/">Home</a>
        <a href="/about/">About</a>
        <a href="/experience/">Experience</a>
        <a href="/skills/">Skills</a>
        <a href="/projects/" aria-current="page">Projects</a>
        <a href="/assets/resume.pdf" target="_blank">Resume</a>
        <a href="/#contact">Contact</a>
      </nav>
    </header>

    <main id="main">
      <section class="page-hero">
        <div class="container page-hero__inner">
          <p class="muted small case-study-nav">
            <a class="link" href="/projects/">← Back to Projects</a>
          </p>

          <div class="page-hero__grid">
            <div class="page-hero__copy">
              <p class="page-hero__eyebrow" id="csEyebrow"></p>
              <h1 class="page-hero__title" id="csTitle"></h1>
              <p class="page-hero__subtitle muted" id="csSubtitle"></p>

              <div class="cta page-hero__cta">
                <a class="btn" href="/experience/" id="csCtaPrimary"></a>
                <a class="btn btn--ghost" href="/assets/resume.pdf" target="_blank" rel="noopener" id="csCtaSecondary"></a>
              </div>

              <p class="page-hero__factline" id="csFactline"></p>
            </div>
          </div>
        </div>

      </section>

      <div id="caseStudyBlocks" class="case-study-content"></div>

      <div class="container case-study-footer-cta">
        <div class="card experience-cta__card">
          <div>
            <div class="card__title">More of my work</div>
            <p class="muted" style="margin:0;">See the rest of my projects.</p>
          </div>
          <div class="experience-cta__actions">
            <a class="btn" href="/projects/">View all projects</a>
          </div>
        </div>
      </div>
    </main>

    <footer class="editorial-footer"><span>© <span id="year"></span> Paul Poleon Jr</span><span>Industrial engineer · problem solver · teammate</span><a href="#main">Back to top ↑</a></footer>

    <script src="../../script.js"></script>
  </body>
</html>
`;
}

async function scaffoldCaseStudyPage(slug, item) {
  try {
    const csFile = await loadFile("data/case-studies.json");
    csFile.data[slug] = {
      hero: {
        eyebrow: "",
        title: item.title || "",
        subtitle: item.blurbLong || item.blurbShort || "",
        factline: "",
        ctaPrimary: { label: "See Experience", href: "/experience/" },
        ctaSecondary: { label: "Download resume", href: "/assets/resume.pdf" },
      },
      style: { fontFamily: "default", fontSizeScale: 1, accentColor: "" },
      blocks: defaultCaseStudyBlocks(),
    };
    await saveFile("data/case-studies.json", `Add case study for ${slug} via edit mode`);

    const title = item.title || slug;
    const description = item.blurbShort || item.blurbLong || `Case study: ${title} by Paul Poleon Jr.`;
    const ogUrl = `https://paulpoleon.com/projects/${slug}/`;
    await ghPutText(`projects/${slug}/index.html`, caseStudyBoilerplateHTML(title, description, ogUrl), null, `Scaffold projects/${slug}/index.html via edit mode`);
  } catch (err) {
    setToolbarStatus(`Project page setup failed: ${err.message}`, true);
  }
}

// ===== in-page overlay: toolbar, card decoration, add tiles =====
function injectToolbar() {
  if (document.getElementById("editToolbar")) return;
  const bar = mkEl("div", { className: "edit-toolbar", attrs: { id: "editToolbar" } });
  bar.appendChild(mkEl("span", { className: "edit-toolbar__badge", text: `Editing: ${branch}${branch === "main" ? " (live site)" : ""}` }));
  bar.appendChild(mkEl("span", { className: "edit-toolbar__status", attrs: { id: "editToolbarStatus" } }));

  const exitLink = mkEl("a", { className: "edit-toolbar__exit", text: "Exit edit mode", attrs: { href: location.pathname } });
  const signOutLink = mkEl("a", { className: "edit-toolbar__exit", text: "Sign out", attrs: { href: "#" } });
  signOutLink.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DEV_AUTH_KEY);
    location.href = location.pathname;
  });

  bar.appendChild(exitLink);
  bar.appendChild(signOutLink);
  document.body.appendChild(bar);
}

function decorateCards(root) {
  root.querySelectorAll("[data-edit-entity]").forEach((el) => {
    if (el.dataset.decorated === "1") return;
    el.dataset.decorated = "1";
    el.classList.add("is-editable");

    const entityKey = el.dataset.editEntity;
    const idx = Number(el.dataset.editIndex);

    if (el.tagName === "A") {
      // home-variant featured cards are the whole card wrapped in a link —
      // don't navigate away while the user is trying to click into it to edit.
      el.addEventListener("click", (e) => e.preventDefault());
    }
    wireInlineFields(entityKey, el, idx);

    const editBtn = mkEl("button", { className: "edit-affordance edit-affordance--edit", text: "✎ Edit", attrs: { type: "button" } });
    editBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openForm(entityKey, idx);
    });
    el.appendChild(editBtn);

    if (el.dataset.editPhotoField) {
      const photoBtn = mkEl("button", { className: "edit-affordance edit-affordance--photo", text: "📷 Photo", attrs: { type: "button" } });
      photoBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        promptPhotoUpload(entityKey, idx);
      });
      el.appendChild(photoBtn);
    }

    // Fields that aren't plain text (icon choice, the Featured flag, a
    // project's filter category) become click-to-cycle / click-to-toggle
    // affordances on the element that already shows them, instead of
    // needing the form.
    if (entityKey === "experience") {
      const dot = el.querySelector(".timeline-node__dot");
      wireCycle(dot, entityKey, idx, "icon", ENTITIES.experience.fields.find((f) => f.key === "icon").options, "Click to change icon");

      const isFeatured = el.classList.contains("timeline-node--featured");
      const featuredBtn = mkEl("button", {
        className: "edit-affordance edit-affordance--toggle" + (isFeatured ? " is-on" : ""),
        text: isFeatured ? "★ Featured" : "☆ Featured",
        attrs: { type: "button" },
      });
      featuredBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleField(entityKey, idx, "featured");
      });
      el.appendChild(featuredBtn);
    } else if (entityKey === "skills-core" || entityKey === "skills-coursework") {
      wireCycle(el.querySelector(".skills-card__icon"), entityKey, idx, "icon", skillCardFields.find((f) => f.key === "icon").options, "Click to change icon");
    } else if (entityKey === "projects-quickview") {
      wireCycle(el.querySelector(".project__filter-badge"), entityKey, idx, "filter", QUICKVIEW_FILTERS, "Click to change category");
    }
  });
}

const QUICKVIEW_FILTERS = ["analytics", "humanfactors", "cad", "prototype"];

function cycleField(entityKey, idx, field, options) {
  const item = getEntityItem(entityKey, idx);
  if (!item || !options || !options.length) return;
  const i = options.indexOf(item[field]);
  item[field] = options[(i + 1 + options.length) % options.length];
  scheduleInlineSave(entityKey);
  refreshMountsFor(entityKey);
}

function toggleField(entityKey, idx, field) {
  const item = getEntityItem(entityKey, idx);
  if (!item) return;
  item[field] = !item[field];
  scheduleInlineSave(entityKey);
  refreshMountsFor(entityKey);
}

function wireCycle(el, entityKey, idx, field, options, hint) {
  if (!el) return;
  el.title = hint;
  el.classList.add("edit-cyclable");
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    cycleField(entityKey, idx, field, options);
  });
}

function ensureAddTile(root) {
  const entityKey = ADD_TILE_MAP[root.id];
  if (!entityKey) return;

  if (!root.parentNode) return;
  if (root.parentNode.querySelector(`.edit-add-tile[data-for="${root.id}"]`)) return;

  const tile = mkEl("button", {
    className: "edit-add-tile",
    text: `+ Add ${ADD_TILE_LABEL[entityKey]}`,
    attrs: { type: "button", "data-for": root.id },
  });
  tile.addEventListener("click", () => openForm(entityKey, null));
  root.parentNode.insertBefore(tile, root.nextSibling);
}

function scanAndDecorate(root) {
  decorateCards(root);
  ensureAddTile(root);
}

function watchMount(id) {
  const el = document.getElementById(id);
  if (!el) return;
  scanAndDecorate(el);
  const obs = new MutationObserver(() => scanAndDecorate(el));
  obs.observe(el, { childList: true });
}

function initEditOverlay() {
  document.body.classList.add("is-edit-mode");
  injectToolbar();
  injectFormModal();
  // Set up observers before the preload so an early page render (which can
  // beat the GitHub fetches below) still gets decorated.
  Object.keys(ADD_TILE_MAP).forEach(watchMount);
  wireHomeInlineFields();
  initCaseStudyEditor();
  // Inline edits need the underlying JSON in fileCache before they can be
  // applied on blur; load it in the background rather than blocking the UI.
  preloadEntityFiles();
}

// ===== gate (dev/index.html) =====
function wireGate() {
  const branchInput = document.getElementById("branchInput");
  branchInput.value = branch;

  document.getElementById("connectBtn").addEventListener("click", async () => {
    const val = document.getElementById("tokenInput").value.trim();
    if (!val) return;
    branch = branchInput.value.trim() || "main";
    localStorage.setItem(BRANCH_KEY, branch);

    setGateStatus("Checking token…");
    try {
      const res = await fetch(`${API}/repos/${OWNER}/${REPO}`, {
        headers: { Authorization: `Bearer ${val}`, Accept: "application/vnd.github+json" },
      });
      if (!res.ok) throw new Error(res.status === 401 ? "Invalid token" : `GitHub error ${res.status}`);
      token = val;
      localStorage.setItem(TOKEN_KEY, token);

      const params = new URLSearchParams(location.search);
      const returnTo = params.get("return") || "/";
      location.href = `${returnTo}${returnTo.includes("?") ? "&" : "?"}edit=1`;
    } catch (err) {
      setGateStatus(`Couldn't connect: ${err.message}`, true);
    }
  });

  // Already connected — skip straight to editing.
  if (token) {
    const params = new URLSearchParams(location.search);
    const returnTo = params.get("return") || "/";
    location.href = `${returnTo}${returnTo.includes("?") ? "&" : "?"}edit=1`;
  }
}

function setGateStatus(msg, isError) {
  const el = document.getElementById("gateStatus");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#b3261e" : "";
}

// ===== login gate (username/password screen in front of the GitHub-token
// gate on dev/index.html — see the DEV_USERNAME/DEV_PASSWORD_HASH comment
// above for what this does and doesn't protect against) =====
function setLoginStatus(msg, isError) {
  const el = document.getElementById("loginStatus");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#b3261e" : "";
}

function wireLoginGate() {
  const loginView = document.getElementById("loginView");
  const gateView = document.getElementById("gateView");

  const proceedToGate = () => {
    if (loginView) loginView.hidden = true;
    if (gateView) gateView.hidden = false;
    wireGate();
  };

  if (localStorage.getItem(DEV_AUTH_KEY) === "1") {
    proceedToGate();
    return;
  }

  const userInput = document.getElementById("loginUser");
  const passInput = document.getElementById("loginPass");
  const loginBtn = document.getElementById("loginBtn");
  if (!userInput || !passInput || !loginBtn) return;

  const attempt = async () => {
    const user = userInput.value.trim();
    const pass = passInput.value;
    if (!user || !pass) return;
    setLoginStatus("Checking…");
    const hash = await sha256Hex(`${user}:${pass}`);
    if (user === DEV_USERNAME && hash === DEV_PASSWORD_HASH) {
      localStorage.setItem(DEV_AUTH_KEY, "1");
      proceedToGate();
    } else {
      setLoginStatus("Incorrect username or password.", true);
    }
  };

  loginBtn.addEventListener("click", attempt);
  [userInput, passInput].forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") attempt();
    });
  });
}

// ===== bootstrap =====
// This script is often injected dynamically (see script.js), so it can
// finish loading after DOMContentLoaded has already fired — don't rely
// solely on that event.
function boot() {
  if (document.getElementById("gateView")) {
    wireLoginGate();
    return;
  }

  const editRequested = new URLSearchParams(location.search).get("edit") === "1";
  if (!editRequested) return;

  if (!token) {
    location.href = `/dev/?return=${encodeURIComponent(location.pathname)}`;
    return;
  }

  initEditOverlay();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
