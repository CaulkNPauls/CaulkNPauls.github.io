// ===============================
// /dev/ admin — edits Projects, Experience, Skills, and Photos by
// committing directly to the GitHub repo via the Contents API.
// Nothing here runs without a valid token typed in by the site owner;
// the token lives only in this browser's localStorage.
// ===============================

const OWNER = "CaulkNPauls";
const REPO = "CaulkNPauls.github.io";
const API = "https://api.github.com";

const TOKEN_KEY = "admin_gh_token";
const BRANCH_KEY = "admin_branch";

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
    idOf: (item) => item.id,
    labelOf: (item) => item.title,
    empty: () => ({ id: "", title: "", meta: "", blurbShort: "", blurbLong: "", tags: [], href: "", image: null, placeholderNote: "" }),
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "meta", label: 'Meta line (e.g. "Manufacturing systems · 2026")', type: "text" },
      { key: "blurbShort", label: "Short blurb (homepage card)", type: "textarea" },
      { key: "blurbLong", label: "Long blurb (projects page card)", type: "textarea" },
      { key: "tags", label: "Tags (comma-separated)", type: "csv" },
      { key: "href", label: "Link to the case-study page", type: "text" },
      { key: "imageSrc", label: "Image path (from Photos tab, optional)", type: "text" },
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
    idOf: (item) => item.id,
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
    idOf: (item) => item.id,
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
      { key: "photo", label: "Photo path (from Photos tab, optional)", type: "text" },
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
    idOf: (item) => item.id,
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
    idOf: (item) => item.id,
    labelOf: (item) => item.title,
    empty: skillCardConvert.empty,
    fields: skillCardFields,
    fromForm: skillCardConvert.fromForm,
    toForm: skillCardConvert.toForm,
  },
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
  if (!meta) return { json: null, sha: null };
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

async function loadFile(path) {
  if (fileCache[path] && fileCache[path].loaded) return fileCache[path];
  const { json, sha } = await ghGetFile(path);
  fileCache[path] = { data: json, sha, loaded: true };
  return fileCache[path];
}

async function saveFile(path, message) {
  const file = fileCache[path];
  setStatus("saveStatus", "Saving…");
  try {
    const result = await ghPutJSON(path, file.data, file.sha, message);
    file.sha = result.content.sha;
    setStatus("saveStatus", "Saved — live in about a minute.");
  } catch (err) {
    setStatus("saveStatus", `Save failed: ${err.message}`, true);
    throw err;
  }
}

function setStatus(id, msg, isError) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#b3261e" : "";
}

// ===== list rendering =====
async function renderList(entityKey) {
  const entity = ENTITIES[entityKey];
  const mount = document.getElementById(`list-${entityKey}`);
  if (!mount) return;
  mount.innerHTML = "Loading…";
  try {
    const file = await loadFile(entity.file);
    const list = entity.rootIsList ? file.data : entity.getList(file.data);
    mount.innerHTML = "";
    if (!list.length) {
      mount.appendChild(mkEl("p", { className: "muted small", text: "Nothing here yet." }));
    }
    list.forEach((item, idx) => {
      const row = mkEl("div", { className: "admin-row" });
      row.appendChild(mkEl("span", { className: "admin-row__label", text: entity.labelOf(item) || "(untitled)" }));
      const editBtn = mkEl("button", { className: "btn btn--ghost", text: "Edit", attrs: { type: "button" } });
      editBtn.addEventListener("click", () => openForm(entityKey, idx));
      row.appendChild(editBtn);
      mount.appendChild(row);
    });
  } catch (err) {
    mount.innerHTML = "";
    mount.appendChild(mkEl("p", { className: "muted small", text: `Couldn't load: ${err.message}` }));
  }
}

function renderAllLists() {
  Object.keys(ENTITIES).forEach(renderList);
}

// ===== form modal =====
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

function openForm(entityKey, idx) {
  const entity = ENTITIES[entityKey];
  const isNew = idx === null || idx === undefined;
  let values;
  if (isNew) {
    values = entity.toForm(entity.empty());
  } else {
    const file = fileCache[entity.file];
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
  const file = fileCache[entity.file];
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
    await saveFile(entity.file, `Update ${entity.file} via /dev/ admin`);
    closeForm();
    renderList(entityKey);
  } catch (_) {
    // status already shown by saveFile
  }
}

async function handleFormDelete() {
  if (!formCtx || formCtx.idx === null) return;
  const { entityKey, idx } = formCtx;
  const entity = ENTITIES[entityKey];
  const file = fileCache[entity.file];
  const list = entity.rootIsList ? file.data : entity.getList(file.data);
  list.splice(idx, 1);

  if (!entity.rootIsList) entity.setList(file.data, list);
  else file.data = list;

  try {
    await saveFile(entity.file, `Remove entry from ${entity.file} via /dev/ admin`);
    closeForm();
    renderList(entityKey);
  } catch (_) {
    // status already shown by saveFile
  }
}

// ===== photos =====
async function uploadPhoto() {
  const fileInput = document.getElementById("photoFile");
  const file = fileInput.files[0];
  if (!file) return;

  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.\-]+/g, "-");
  const path = `assets/photos/${safeName}`;
  setStatus("photoStatus", "Uploading…");
  try {
    const base64 = await fileToBase64(file);
    const existing = await ghGetMeta(path);
    await ghPutBinary(path, base64, existing ? existing.sha : null, `Upload photo ${safeName} via /dev/ admin`);
    setStatus("photoStatus", `Uploaded — path: /${path}`);
    fileInput.value = "";
    loadPhotoGrid();
  } catch (err) {
    setStatus("photoStatus", `Upload failed: ${err.message}`, true);
  }
}

async function loadPhotoGrid() {
  const grid = document.getElementById("photoGrid");
  grid.innerHTML = "Loading…";
  try {
    const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/assets/photos?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders() });
    if (res.status === 404) {
      grid.innerHTML = "";
      return;
    }
    if (!res.ok) throw new Error(`${res.status}`);
    const items = await res.json();
    grid.innerHTML = "";
    items
      .filter((it) => it.type === "file")
      .forEach((it) => {
        const card = mkEl("div", { className: "admin-photo" });
        const img = document.createElement("img");
        img.src = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${branch}/assets/photos/${it.name}`;
        img.alt = it.name;
        img.loading = "lazy";
        card.appendChild(img);
        card.appendChild(mkEl("span", { className: "admin-photo__name", text: it.name }));

        const copyBtn = mkEl("button", { className: "btn btn--ghost", text: "Copy path", attrs: { type: "button" } });
        copyBtn.addEventListener("click", () => {
          navigator.clipboard.writeText(`/assets/photos/${it.name}`).then(() => {
            copyBtn.textContent = "Copied!";
            setTimeout(() => (copyBtn.textContent = "Copy path"), 1200);
          });
        });
        card.appendChild(copyBtn);
        grid.appendChild(card);
      });
  } catch (err) {
    grid.innerHTML = "";
    grid.appendChild(mkEl("p", { className: "muted small", text: `Couldn't load photos: ${err.message}` }));
  }
}

// ===== connect / tabs / wiring =====
async function tryConnect(newToken) {
  setStatus("gateStatus", "Checking token…");
  try {
    const res = await fetch(`${API}/repos/${OWNER}/${REPO}`, {
      headers: { Authorization: `Bearer ${newToken}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(res.status === 401 ? "Invalid token" : `GitHub error ${res.status}`);
    token = newToken;
    localStorage.setItem(TOKEN_KEY, token);
    showApp();
  } catch (err) {
    setStatus("gateStatus", `Couldn't connect: ${err.message}`, true);
  }
}

function showApp() {
  document.getElementById("gateView").hidden = true;
  document.getElementById("appView").hidden = false;
  document.getElementById("signOutBtn").hidden = false;
  renderAllLists();
  loadPhotoGrid();
}

function wireTabs() {
  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach((b) => b.classList.remove("is-active"));
      document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("is-active"));
      btn.classList.add("is-active");
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add("is-active");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireTabs();

  document.getElementById("connectBtn").addEventListener("click", () => {
    const val = document.getElementById("tokenInput").value.trim();
    if (val) tryConnect(val);
  });

  document.getElementById("signOutBtn").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
  });

  document.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => openForm(btn.dataset.add, null));
  });

  document.getElementById("formSaveBtn").addEventListener("click", handleFormSave);
  document.getElementById("formDeleteBtn").addEventListener("click", handleFormDelete);

  const modal = document.getElementById("formModal");
  modal.addEventListener("click", (e) => {
    if (e.target.dataset.close === "true") closeForm();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) closeForm();
  });

  document.getElementById("uploadPhotoBtn").addEventListener("click", uploadPhoto);

  if (token) tryConnect(token);
});
