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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Downscale + re-encode as JPEG before upload — keeps full-resolution phone
// photos (often 5-15MB) safely under the Contents API's practical request
// size, and keeps the site fast. Falls back to the original file untouched
// if decoding fails for any reason (e.g. an exotic format the browser can't
// draw to canvas), so a photo never silently fails to upload because of this.
const MAX_PHOTO_DIM = 2000;
const PHOTO_QUALITY = 0.85;

function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function resizeImageFile(file) {
  if (!file.type.startsWith("image/")) return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageEl(objectUrl);
    const scale = Math.min(1, MAX_PHOTO_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return null; // already small enough

    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY));
    if (!blob) return null;
    return { base64: await fileToBase64(blob), ext: "jpg" };
  } catch (_) {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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

  if (idx === null) {
    let id = slugify(entity.labelOf(item));
    let n = 2;
    const base = id;
    while (list.some((it) => it.id === id)) id = `${base}-${n++}`;
    item.id = id;
    list.push(item);
  } else {
    item.id = list[idx].id;
    list[idx] = item;
  }

  if (!entity.rootIsList) entity.setList(file.data, list);
  else file.data = list;

  try {
    await saveFile(entity.file, `Update ${entity.file} via edit mode`);
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
function wireInline(el, field, itemIndex, subfield) {
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

  el.addEventListener("blur", () => applyInlineEdit(el));
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
    // each Q&A pair renders as two sibling sections sharing one index
    if (card.classList.contains("snap__section--q")) {
      wireInline(card.querySelector(".snap__kicker"), "kicker");
      wireInline(card.querySelector("h1"), "question");
    } else if (card.classList.contains("snap__section--a")) {
      wireInlineList(card.querySelector(".snap__copy"), "answer");
    }
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

function wireHomeInlineFields() {
  if (!document.getElementById("heroKicker")) return; // only present on the homepage

  wireHomeField(document.getElementById("heroKicker"), "home-hero", "kicker");
  wireHomeField(document.getElementById("heroNameMain"), "home-hero", "nameMain");
  wireHomeField(document.getElementById("heroNameAccent"), "home-hero", "nameAccent");
  wireHomeField(document.getElementById("heroLede"), "home-hero", "lede");
  wireHomeField(document.getElementById("heroPlaceholderNote"), "home-hero", "placeholderNote");

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
  wireHomeField(document.getElementById("originPlaceholderNote"), "home-origin", "placeholderNote");
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
function promptPhotoUpload(entityKey, idx) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;

    setToolbarStatus("Uploading photo…");
    try {
      const entity = ENTITIES[entityKey];
      let safeName = file.name.toLowerCase().replace(/[^a-z0-9.\-]+/g, "-");
      let base64 = await fileToBase64(file);

      const resized = await resizeImageFile(file);
      if (resized) {
        base64 = resized.base64;
        safeName = safeName.replace(/\.[a-z0-9]+$/, "") + "." + resized.ext;
      }

      const path = `assets/photos/${Date.now().toString(36)}-${safeName}`;
      await ghPutBinary(path, base64, null, `Upload photo ${safeName} via edit mode`);

      const file2 = await loadFile(entity.file);
      const list = entity.rootIsList ? file2.data : entity.getList(file2.data);
      const item = list[idx];
      if (entityKey === "projects-featured") {
        item.image = { src: `/${path}`, alt: item.title || "" };
      } else {
        item.photo = `/${path}`;
      }
      if (!entity.rootIsList) entity.setList(file2.data, list);
      else file2.data = list;

      await saveFile(entity.file, `Update ${entity.file} via edit mode (photo)`);
      refreshMountsFor(entityKey);
    } catch (err) {
      setToolbarStatus(`Photo upload failed: ${err.message}`, true);
    }
  });
  input.click();
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

  // About's mount is a full-viewport scroll-snap container locked inside an
  // overflow:hidden page — a sibling placed after it would be unreachable,
  // so the tile has to live *inside* the scrollable area instead.
  if (root.id === "aboutMount") {
    if (root.querySelector(":scope > .edit-add-tile")) return;
    const tile = mkEl("button", {
      className: "edit-add-tile",
      text: `+ Add ${ADD_TILE_LABEL[entityKey]}`,
      attrs: { type: "button" },
    });
    tile.addEventListener("click", () => openForm(entityKey, null));
    root.appendChild(tile);
    return;
  }

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
