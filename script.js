// ===============================
// Global site JS (safe on all pages)
// - Mobile nav toggle
// - Footer year
// - Optional: collapsible projects section (if you have #projectsToggle + #projects)
// - Reveal-on-scroll (.reveal)
// - Projects page Explore + modal (only runs if #projectGrid exists)
// ===============================

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const smoothOrAuto = prefersReducedMotion ? "auto" : "smooth";

// Always begin a newly opened page at its top. Browsers can otherwise restore
// the previous scroll position during cross-page transitions or back/forward
// navigation. Preserve explicit destinations such as /#contact.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

function resetPageScroll() {
  if (window.location.hash) return;
  window.requestAnimationFrame(() => window.scrollTo(0, 0));
}

window.addEventListener("pageshow", resetPageScroll);
document.addEventListener("DOMContentLoaded", resetPageScroll, { once: true });

// ===== Edit mode: load the in-page admin editor only when ?edit=1 is present =====
if (new URLSearchParams(location.search).get("edit") === "1" && !document.getElementById("gateView")) {
  const editorScript = document.createElement("script");
  editorScript.src = "/dev/editor.js";
  editorScript.defer = true;
  document.head.appendChild(editorScript);
}

// ===============================
// Data-driven content (Experience / Projects / Skills)
// Reads data/*.json and renders it into empty mount elements, so those
// lists can grow via the /dev/ admin without touching page HTML.
// All user-supplied text goes through textContent/setAttribute (never
// innerHTML) so nothing in the data can inject markup.
// ===============================

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
function safeProjectHref(value) {
  const href = String(value || "").trim();
  return href.startsWith("/") || /^https:\/\//i.test(href) ? href : "#";
}

// Fixed, trusted SVG path markup only — never built from data/user input.
const ICONS = {
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2.1-.6-.6-2.1 2.8-2.8Z"/>',
  tag: '<path d="M20 12 12.5 19.5a2 2 0 0 1-2.8 0l-6.2-6.2a2 2 0 0 1 0-2.8L11 3h6a3 3 0 0 1 3 3v6Z"/><circle cx="15" cy="8" r="1.4" fill="currentColor" stroke="none"/>',
  landmark: '<path d="M3 21h18"/><path d="M4 21V10M20 21V10M8 21V10M12 21V10M16 21V10"/><path d="M2 10 12 3l10 7"/>',
  "wrench-plug": '<path d="M14.7 6.3a5 5 0 0 0-6.9 6.9L3 18v3h3l4.8-4.8a5 5 0 0 0 6.9-6.9l-2.3 2.3-3-3 2.3-2.3Z"/>',
  flow: '<path d="M7 7h4v4H7V7Zm6 6h4v4h-4v-4ZM11 9h6M9 11v6"/>',
  star: '<path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/>',
  bars: '<path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6"/>',
  trend: '<path d="M5 17l6-6 4 4 4-8"/><path d="M5 17h14"/>',
  building: '<path d="M4 7h16M7 7v10M17 7v10M4 17h16"/>',
  heart: '<path d="M12 21s7-4.4 7-10a4 4 0 0 0-7-2.5A4 4 0 0 0 5 11c0 5.6 7 10 7 10Z"/>',
  photo: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
};

function iconSVG(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.innerHTML = ICONS[name] || ICONS.tag; // trusted lookup only, never data-derived
  return svg;
}

function experienceOrganizationMark(id) {
  const trusted = {
    "flowsafe-intern": ["/assets/organization-marks/flowsafe.png", "/assets/organization-marks/flowsafe-sketch.png", "FlowSafe"],
    "geek-squad-repair-agent": ["/assets/organization-marks/geek-squad.png", "/assets/organization-marks/geek-squad-sketch.png", "Geek Squad"],
    "kohls-retail-associate": ["/assets/organization-marks/kohls.png", "/assets/organization-marks/kohls-sketch.png", "Kohl's"],
    "common-council-intern": ["/assets/organization-marks/buffalo-seal.png", "/assets/organization-marks/buffalo-sketch.png", "City of Buffalo"],
  };
  if (!trusted[id]) return null;
  const [originalSrc, sketchSrc, label] = trusted[id];
  const mark = mkEl("span", { className: "timeline-node__org-mark", attrs: { "aria-label": label } });
  mark.append(
    mkEl("img", { className: "org-mark__original", attrs: { src: originalSrc, alt: "" } }),
    mkEl("img", { className: "org-mark__sketch", attrs: { src: sketchSrc, alt: "" } })
  );
  return mark;
}

function renderExperience(list, mount) {
  if (!mount) return;
  mount.innerHTML = "";

  list.forEach((role, i) => {
    const isLast = i === list.length - 1;
    const article = mkEl("article", {
      className: "timeline-node reveal timeline-node--" + role.id + (role.featured ? " timeline-node--featured" : ""),
      attrs: { "data-edit-entity": "experience", "data-edit-index": i, "data-edit-photo-field": "photo" },
    });

    const rail = mkEl("div", { className: "timeline-node__rail" });
    const dot = mkEl("span", { className: "timeline-node__dot", attrs: { "aria-hidden": "true" } });
    dot.appendChild(iconSVG(role.icon));
    rail.appendChild(dot);
    if (!isLast) {
      const seg = mkEl("span", { className: "timeline-node__seg" });
      seg.appendChild(mkEl("span", { className: "timeline-node__seg-fill" }));
      rail.appendChild(seg);
    }
    article.appendChild(rail);

    const card = mkEl("div", { className: "timeline-node__card" });
    const orgMark = experienceOrganizationMark(role.id);
    if (orgMark) {
      card.classList.add("timeline-node__card--branded");
      card.appendChild(orgMark);
    }
    const dateLine = mkEl("p", { className: "timeline-node__dateline" });
    dateLine.appendChild(mkEl("span", { className: "timeline-node__date", text: role.date }));
    dateLine.appendChild(document.createTextNode(" · "));
    dateLine.appendChild(mkEl("span", { className: "timeline-node__location", text: role.location }));
    card.appendChild(dateLine);
    card.appendChild(mkEl("p", { className: "timeline-node__company", text: role.company }));
    card.appendChild(mkEl("h3", { text: role.title }));
    if (role.summary) card.appendChild(mkEl("p", { text: role.summary }));

    if (role.bullets && role.bullets.length) {
      const ul = mkEl("ul", { className: "timeline-node__bullets" });
      role.bullets.forEach((b) => ul.appendChild(mkEl("li", { text: b })));
      card.appendChild(ul);
    }

    if (role.tags && role.tags.length) {
      const tagsUl = mkEl("ul", { className: "timeline-node__tags", attrs: { "aria-label": "Skills used" } });
      role.tags.forEach((t) => tagsUl.appendChild(mkEl("li", { text: t })));
      card.appendChild(tagsUl);
    }

    if (role.photo) {
      const img = mkEl("img", {
        className: "timeline-node__photo",
        attrs: { src: role.photo, alt: role.photoAlt || `${role.company} photo`, loading: "lazy" },
      });
      img.style.width = "100%";
      img.style.objectFit = "cover";
      img.style.display = "block";
      card.appendChild(img);
    } else if (role.photoNote) {
      const ph = mkEl("div", {
        className: "editorial-placeholder editorial-placeholder--project timeline-node__photo",
        attrs: { role: "img", "aria-label": "Photo placeholder" },
      });
      const wrap = document.createElement("div");
      wrap.appendChild(mkEl("strong", { text: "Add a photo" }));
      wrap.appendChild(mkEl("p", { text: role.photoNote }));
      ph.appendChild(wrap);
      card.appendChild(ph);
    }

    if (role.link) {
      card.appendChild(mkEl("a", { className: "editorial-text-link", text: role.link.label, attrs: { href: role.link.href } }));
    }

    article.appendChild(card);
    mount.appendChild(article);
  });
}

function renderFeaturedProjects(list, mount, variant) {
  if (!mount) return;
  mount.innerHTML = "";

  list.forEach((p, i) => {
    if (p.status === "draft" && new URLSearchParams(location.search).get("edit") !== "1") return;
    if (variant === "hub") {
      const article = mkEl("article", {
        className: "project reveal",
        attrs: { "data-edit-entity": "projects-featured", "data-edit-index": i, "data-edit-photo-field": "image", "data-project-number": String(i + 1).padStart(2, "0") },
      });

      if (p.image && p.image.src) {
        article.appendChild(mkEl("img", {
          className: "project__thumb",
          attrs: { src: p.image.src, alt: p.image.alt || p.title, loading: "lazy" },
        }));
      } else {
        const ph = mkEl("div", {
          className: "editorial-placeholder editorial-placeholder--project project__thumb project__thumb--placeholder",
          attrs: { role: "img", "aria-label": "Photo placeholder" },
        });
        const wrap = document.createElement("div");
        wrap.appendChild(mkEl("strong", { text: "Add a photo" }));
        wrap.appendChild(mkEl("p", { text: p.placeholderNote || "Add a project photo or screenshot." }));
        ph.appendChild(wrap);
        article.appendChild(ph);
      }

      const h3 = document.createElement("h3");
      h3.appendChild(mkEl("a", { className: "project__title-link", text: p.title, attrs: { href: safeProjectHref(p.href) } }));
      article.appendChild(h3);
      article.appendChild(mkEl("p", { text: p.blurbLong || p.blurbShort || "" }));

      const tagsUl = mkEl("ul", { className: "tags" });
      (p.tags || []).forEach((t) => tagsUl.appendChild(mkEl("li", { text: t })));
      article.appendChild(tagsUl);

      const meta = mkEl("div", { className: "project__meta" });
      meta.appendChild(mkEl("a", { className: "link", text: "View case study →", attrs: { href: safeProjectHref(p.href) } }));
      article.appendChild(meta);

      mount.appendChild(article);
      return;
    }

    // "home" variant
    const a = mkEl("a", {
      className: "editorial-project reveal" + (i === 0 ? " editorial-project--large" : ""),
      attrs: {
        href: safeProjectHref(p.href),
        "data-edit-entity": "projects-featured",
        "data-edit-index": i,
        "data-edit-photo-field": "image",
      },
    });

    let visual;
    if (p.image && p.image.src) {
      visual = mkEl("img", {
        className: "editorial-placeholder--project",
        attrs: { src: p.image.src, alt: p.image.alt || p.title, loading: "lazy" },
      });
      visual.style.width = "100%";
      visual.style.height = "auto";
      visual.style.display = "block";
      // contain, not cover: these thumbnails are often app screenshots with
      // real text baked in right up to the edges, and cover crops whatever
      // doesn't fit the box's aspect ratio — cutting words off the side
      // instead of just trimming empty background like a photo.
      visual.style.objectFit = "contain";
    } else {
      visual = mkEl("div", { className: "editorial-placeholder editorial-placeholder--project" });
      const wrap = document.createElement("div");
      wrap.appendChild(mkEl("strong", { text: "Project image" }));
      wrap.appendChild(mkEl("p", { text: p.placeholderNote || "Add a project photo or screenshot." }));
      visual.appendChild(wrap);
    }
    a.appendChild(visual);

    const info = mkEl("div", { className: "editorial-project__info" });
    info.appendChild(mkEl("span", { text: p.meta || "" }));
    info.appendChild(mkEl("h3", { text: p.title }));
    info.appendChild(mkEl("p", { text: p.blurbShort || p.blurbLong || "" }));
    a.appendChild(info);

    mount.appendChild(a);
  });
}

function renderQuickviewProjects(list, mount) {
  if (!mount) return;
  mount.innerHTML = "";

  list.forEach((p, i) => {
    if (p.status === "draft" && new URLSearchParams(location.search).get("edit") !== "1") return;
    const categoryLabels = {
      analytics: "Analytics",
      humanfactors: "Human factors",
      cad: "CAD / Design",
      prototype: "Prototyping",
    };
    const article = mkEl("article", {
      className: "project project--open reveal",
      attrs: {
        "data-edit-entity": "projects-quickview",
        "data-edit-index": i,
        "data-title": p.title,
        "data-tags": (p.tags || []).join(", "),
        "data-filter": p.filter || "",
        "data-project-type": p.projectType || "solo",
        "data-summary": p.summary || "",
        "data-tools": (p.tools || []).join(", "),
        "data-results": (p.results || []).join("; "),
        "data-links": JSON.stringify(p.links || []),
        "data-image": JSON.stringify(p.image || null),
        "data-project-number": String(i + 1).padStart(2, "0"),
        "data-edit-photo-field": "image",
        tabindex: "0",
        role: "button",
        "aria-label": `Open quick view for ${p.title}`,
        "aria-haspopup": "dialog",
      },
    });

    article.appendChild(mkEl("span", { className: "project__filter-badge", text: categoryLabels[p.filter] || "Uncategorized" }));
    article.appendChild(mkEl("h3", { text: p.title }));
    article.appendChild(mkEl("p", { text: p.cardText || p.summary || "" }));

    const tagsUl = mkEl("ul", { className: "tags" });
    (p.tags || []).forEach((t) => tagsUl.appendChild(mkEl("li", { text: t })));
    article.appendChild(tagsUl);

    mount.appendChild(article);
  });
}

function updateProjectHubMeta(data) {
  const featured = (data.featured || []).filter((p) => p.status !== "draft");
  const archive = (data.quickview || []).filter((p) => p.status !== "draft");
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = String(value).padStart(2, "0"); };
  set("featuredProjectCount", featured.length);
  set("archiveProjectCount", archive.length);

  const row = document.querySelector(".chip-row");
  if (!row) return;
  const known = new Set(Array.from(row.querySelectorAll("[data-filter]")).map((b) => b.dataset.filter));
  const labels = { analytics: "Analytics", humanfactors: "Human Factors", cad: "CAD / Design", prototype: "Prototyping" };
  archive.forEach((project) => {
    const filter = (project.filter || "other").trim().toLowerCase();
    if (known.has(filter)) return;
    row.appendChild(mkEl("button", { className: "chip", text: labels[filter] || project.filter || "Other", attrs: { "data-filter": filter, type: "button", role: "tab", "aria-selected": "false" } }));
    known.add(filter);
  });
}

// ===============================
// Case-study pages (/projects/<slug>/) — flexible content blocks
// Each project's hero + an ordered list of typed blocks live in
// data/case-studies.json, keyed by the slug the page's own URL already
// carries (see the bootstrap fetch below). Blocks render into the same
// CSS classes the case-study template always used (case-study-body,
// result-callout, evidence-grid, tags) so the page looks identical to the
// old hand-written HTML it replaced; dev/editor.js (edit mode) decorates
// these same [data-block-id] sections with add/reorder/delete controls.
// ===============================

function caseStudySectionShell(block, index, extraClass) {
  return mkEl("section", {
    className: "section case-study-section reveal" + (index % 2 === 1 ? " section--alt" : "") + (extraClass ? " " + extraClass : ""),
    attrs: { "data-block-id": block.id, "data-block-index": index, "data-block-type": block.type },
  });
}

function renderTextBlock(block, index) {
  const section = caseStudySectionShell(block, index);
  const body = mkEl("div", { className: "container case-study-body" });
  if (block.heading) body.appendChild(mkEl("h2", { text: block.heading, attrs: { "data-block-field": "heading" } }));
  const paragraphs = (block.body || "").split(/\n\s*\n/).filter((p) => p.trim());
  (paragraphs.length ? paragraphs : [""]).forEach((p) => {
    body.appendChild(mkEl("p", { text: p.trim(), attrs: { "data-block-field": "body" } }));
  });
  section.appendChild(body);
  return section;
}

function renderListBlock(block, index) {
  const section = caseStudySectionShell(block, index);
  const body = mkEl("div", { className: "container case-study-body" });
  if (block.heading) body.appendChild(mkEl("h2", { text: block.heading, attrs: { "data-block-field": "heading" } }));
  const ul = mkEl("ul", { attrs: { "data-block-field": "items" } });
  (block.items || []).forEach((item) => ul.appendChild(mkEl("li", { text: item })));
  body.appendChild(ul);
  section.appendChild(body);
  return section;
}

function renderStatsBlock(block, index) {
  const section = caseStudySectionShell(block, index);
  const body = mkEl("div", { className: "container case-study-body" });
  if (block.heading) body.appendChild(mkEl("h2", { text: block.heading, attrs: { "data-block-field": "heading" } }));
  const callout = mkEl("div", { className: "result-callout", attrs: { "data-block-field": "stats" } });
  (block.stats || []).forEach((s) => {
    const stat = mkEl("div", { className: "result-callout__stat" });
    stat.appendChild(mkEl("div", { className: "result-callout__value", text: s.value }));
    stat.appendChild(mkEl("div", { className: "result-callout__label", text: s.label }));
    callout.appendChild(stat);
  });
  if (block.note) callout.appendChild(mkEl("p", { className: "result-callout__note", text: block.note, attrs: { "data-block-field": "note" } }));
  body.appendChild(callout);
  section.appendChild(body);
  return section;
}

function renderTagsBlock(block, index) {
  const section = caseStudySectionShell(block, index);
  const container = mkEl("div", { className: "container" });
  if (block.heading) container.appendChild(mkEl("h2", { text: block.heading, attrs: { "data-block-field": "heading" } }));
  const ul = mkEl("ul", { className: "tags", attrs: { "data-block-field": "items" } });
  (block.items || []).forEach((item) => ul.appendChild(mkEl("li", { text: item })));
  container.appendChild(ul);
  if (block.note) {
    container.appendChild(mkEl("p", {
      className: "muted small",
      text: block.note,
      attrs: { style: "margin-top:12px;", "data-block-field": "note" },
    }));
  }
  section.appendChild(container);
  return section;
}

// Empty slots ({src:""}) render the same dashed-box look the old hardcoded
// placeholders used, so a project with no photos yet still reads the same
// as it always has; a caption of "Label — note" splits into a bold label
// line and a smaller note line, matching that same original layout.
function renderGalleryImage(img) {
  if (img.src) {
    const figure = mkEl("figure", { className: "evidence-photo" });
    figure.appendChild(mkEl("img", { attrs: { src: img.src, alt: img.alt || "", loading: "lazy" } }));
    if (img.caption) figure.appendChild(mkEl("figcaption", { text: img.caption }));
    return figure;
  }
  const [label, note] = (img.caption || "Add a photo").split(/\s+(?:—|:)\s+/);
  const ph = mkEl("div", { className: "evidence-placeholder" });
  const iconWrap = mkEl("div", { className: "evidence-placeholder__icon", attrs: { "aria-hidden": "true" } });
  iconWrap.appendChild(iconSVG("photo"));
  ph.appendChild(iconWrap);
  ph.appendChild(mkEl("div", { className: "evidence-placeholder__label", text: label }));
  if (note) ph.appendChild(mkEl("div", { className: "evidence-placeholder__note", text: note }));
  return ph;
}

function renderGalleryBlock(block, index) {
  const section = caseStudySectionShell(block, index);
  const container = mkEl("div", { className: "container" });
  if (block.heading) container.appendChild(mkEl("h2", { text: block.heading, attrs: { "data-block-field": "heading" } }));
  if (block.caption) {
    container.appendChild(mkEl("p", {
      className: "muted",
      text: block.caption,
      attrs: { style: "margin:0 0 16px;max-width:72ch;", "data-block-field": "caption" },
    }));
  }
  const grid = mkEl("div", {
    className: "evidence-grid",
    attrs: { "data-block-field": "images", "data-layout": block.layout || "grid" },
  });
  (block.images || []).forEach((img) => grid.appendChild(renderGalleryImage(img)));
  container.appendChild(grid);
  section.appendChild(container);
  return section;
}

const CASE_STUDY_BLOCK_RENDERERS = {
  text: renderTextBlock,
  list: renderListBlock,
  stats: renderStatsBlock,
  tags: renderTagsBlock,
  gallery: renderGalleryBlock,
};

function renderCaseStudyHero(hero) {
  if (!hero) return;
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value || ""; };
  set("csEyebrow", hero.eyebrow);
  set("csTitle", hero.title);
  set("csSubtitle", hero.subtitle);
  set("csFactline", hero.factline);
  const primary = document.getElementById("csCtaPrimary");
  if (primary && hero.ctaPrimary) {
    primary.textContent = hero.ctaPrimary.label || "";
    primary.setAttribute("href", hero.ctaPrimary.href || "#");
  }
  const secondary = document.getElementById("csCtaSecondary");
  if (secondary && hero.ctaSecondary) {
    secondary.textContent = hero.ctaSecondary.label || "";
    secondary.setAttribute("href", hero.ctaSecondary.href || "#");
  }
  if (hero.title) document.title = `${hero.title} | Paul Poleon Jr`;
}

function renderCaseStudy(caseStudy, slug, mount) {
  if (!mount) return;
  mount.innerHTML = "";
  if (!caseStudy) {
    mount.appendChild(mkEl("div", { className: "container case-study-body", text: "This project isn't available yet." }));
    return;
  }
  renderCaseStudyHero(caseStudy.hero);
  (caseStudy.blocks || []).forEach((block, i) => {
    const renderer = CASE_STUDY_BLOCK_RENDERERS[block.type];
    if (renderer) mount.appendChild(renderer(block, i));
  });
}

const COURSE_DETAILS = {
  "IE 322": { credits:"3", offered:"Fall", description:"Builds the skills needed to manage, manipulate, analyze, and draw insight from large data sets using industrial-engineering computational tools. Problems reflect work across manufacturing, service, healthcare, and transportation systems.", requisites:"EAS 230, EAS 240, or CSE 115; EAS 999TRCP. EAS 305, MTH 411, CIE 308, or EE 305 may be required concurrently. Restricted to Engineering and Applied Sciences majors." },
  "EAS 305": { credits:"4", offered:"Fall, Spring, Summer", description:"Introduces probability and statistics for engineering applications, including discrete, continuous, and multivariate distributions plus descriptive and inferential statistical methods.", requisites:"MTH 142 or MTH 154. Restricted to Engineering or Computer Science majors; credit restrictions apply with CE 305, CIE 308, and EE 305." },
  "IE 306": { credits:"4", offered:"Spring", description:"Covers statistical inference and data analysis, including point and interval estimation, hypothesis testing, correlation, regression, and analysis of variance.", requisites:"EAS 305, EE 305, CE 305, CIE 308, STA 301, or MTH 411. Restricted to Industrial Engineering or Engineering Science majors." },
  "IE 373": { credits:"4", offered:"Fall", description:"Introduces operations-research methodology, objective functions, theories of value, optimization, and mathematical models used for reliability, decision analysis, games, queues, and Markov decisions.", requisites:"Restricted to Industrial Engineering or Engineering Science majors." },
  "IE 374": { credits:"4", offered:"Spring", description:"Extends deterministic optimization into uncertainty and risk through decision models, stochastic processes, Markov chains and decisions, queueing theory, and applied waiting-line models.", requisites:"Restricted to Industrial Engineering or Engineering Science majors." },
  "MTH 306": { credits:"4", offered:"Fall, Spring, Summer", description:"Studies analytic solutions and qualitative behavior of first- and higher-order differential equations, including nonlinear equations, numerical and geometric methods, matrix theory, and models drawn from several disciplines.", requisites:"MTH 142 or MTH 154, or both MTH 138 and MTH 139." },
  "IE 477": { credits:"4", offered:"Fall", description:"Develops digital simulation models of complex systems using current simulation software, modeling practices, and analysis methods.", requisites:"IE 306 and computer-programming skills. Restricted to Industrial Engineering majors." },
  "IE 326": { credits:"3", offered:"Fall", description:"Examines the principles used to plan production processes, including production planning, scheduling, and control.", requisites:"Restricted to Engineering majors. Students must meet with their IE faculty advisor before registering." },
  "IE 327": { credits:"3", offered:"Spring", description:"Covers the design, analysis, and selection of manufacturing facilities and material-handling equipment, including material flow, storage, computer applications, and economic justification.", requisites:"IE 326. Restricted to Industrial Engineering or Engineering Science majors; faculty-advisor review is required." },
  "IE 320": { credits:"3", offered:"Spring", description:"Applies economic decision-making methods such as present-worth analysis, cash-flow equivalence, replacement analysis, and equipment selection.", requisites:"MTH 141 or MTH 137. Restricted to Engineering majors." },
  "IE 420": { credits:"3", offered:"Fall", description:"Integrates production planning, facility design, operations research, and human factors to analyze and solve real-world industrial-engineering problems.", requisites:"IE major plus EAS 305, IE 306, IE 320, IE 326, and IE 327. IE 477 and IE 322 are co-requisites; IE 323 and EAS 360 may be pre- or co-requisites." },
  "IE 421": { credits:"3", offered:"Varies", description:"Examines manufacturing through a sustainability lens, connecting production decisions with resource use, environmental impact, product life cycles, and more responsible industrial systems.", requisites:"Upper-level engineering standing or department permission may apply." },
  "IE 323": { credits:"4", offered:"Fall", description:"Studies how people interact with tasks, equipment, and workplace environments. Topics include human capabilities and limitations, ergonomics in system design, human-system analysis, and experimental methods.", requisites:"Restricted to Engineering majors and Human Factors minors." },
  "IE 408": { credits:"3", offered:"Spring", description:"Applies statistical quality methods to process variation, including sampling, hypothesis testing, ANOVA, correlation, regression, measurement systems, experimental design, response surfaces, and statistical process control.", requisites:"IE 306 as a co-requisite. Restricted to Industrial Engineering majors. Dual-listed with IE 508." },
  "EAS 360": { credits:"3", offered:"Fall, Spring, Summer, Winter", description:"Develops professional STEM communication across genres and media for technical, professional, and public audiences, with individual, team, and ethical communication practice.", requisites:"Completion of Communication Literacy 1. Restricted to SEAS majors in the UB Curriculum; first-year students may not enroll." },
  "ENG 105": { credits:"4", offered:"Fall, Spring, Summer", description:"Introduces research, writing, and rhetorical practices used in academic and professional settings through genre and audience analysis, research essays, digital compositions, and oral presentations.", requisites:"ENG 105 non-Z requisite; applicable placement and repeat rules apply." },
  "IE 409": { credits:"3", offered:"Fall", description:"Introduces customer-focused process and design Six Sigma methods, including project selection, leadership skills, Six Sigma metrics, risk assessment, quality tools, DMAIC, and DMADV.", requisites:"Upper-level Industrial Engineering standing or department permission. Restricted to Engineering majors." },
  "IE 435": { credits:"3", offered:"Fall", description:"Applies human-centered design to interactive systems through user-needs research, prototyping, evaluation, and iterative design of products that support effective human interaction.", requisites:"Upper-level standing and appropriate human-factors preparation; department restrictions may apply." }
};

const COURSE_SOURCE_IDS = { "EAS 305":108120, "IE 306":109091, "IE 320":109092, "IE 322":109112, "IE 323":109093, "IE 326":109116, "IE 327":109094, "IE 373":109095, "IE 374":109096, "IE 408":109103, "IE 409":109104, "IE 420":109109, "IE 421":109113, "IE 435":109105, "IE 477":109098 };

function openCourseDialog(chip, code, name) {
  const dialog = document.getElementById("courseDialog");
  const details = COURSE_DETAILS[code];
  if (!dialog || !details) return;
  setText("courseDialogCode", code); setText("courseDialogTitle", name);
  setText("courseDialogStatus", chip.inProgress ? "Currently enrolled · grade forthcoming" : `Grade · ${chip.grade || "Completed"}`);
  setText("courseDialogCredits", details.credits); setText("courseDialogOffered", details.offered);
  setText("courseDialogDescription", details.description);
  const source = document.getElementById("courseDialogSource");
  if (source) source.href = COURSE_SOURCE_IDS[code] ? `https://catalogs.buffalo.edu/preview_course_nopop.php?catoid=17&coid=${COURSE_SOURCE_IDS[code]}` : chip.url;
  dialog.showModal(); document.body.classList.add("course-dialog-open");
}

function initCourseDialog() {
  const dialog = document.getElementById("courseDialog");
  if (!dialog || dialog.dataset.ready) return;
  dialog.dataset.ready = "true";
  const close = () => { dialog.close(); document.body.classList.remove("course-dialog-open"); };
  dialog.querySelector(".course-dialog__close")?.addEventListener("click", close);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener("close", () => document.body.classList.remove("course-dialog-open"));
}

function renderSkillCard(card, mount, isCourse, index) {
  const article = mkEl("article", {
    className: "skills-card reveal skills-card--" + String(card.id || "note").replace(/[^a-z0-9-]/gi, "-").toLowerCase() + (isCourse ? " skills-card--course" : ""),
    attrs: { id: card.id || undefined, "data-edit-entity": isCourse ? "skills-coursework" : "skills-core", "data-edit-index": index },
  });

  const head = mkEl("div", { className: "skills-card__head" });
  const iconWrap = mkEl("div", { className: "skills-card__icon", attrs: { "aria-hidden": "true" } });
  iconWrap.appendChild(iconSVG(card.icon));
  head.appendChild(iconWrap);

  const textWrap = document.createElement("div");
  textWrap.appendChild(mkEl("h3", { className: "skills-card__title", text: card.title }));
  textWrap.appendChild(mkEl("p", { className: "muted skills-card__sub", text: card.description }));
  head.appendChild(textWrap);
  article.appendChild(head);

  const chipsWrap = mkEl("div", { className: "skills-chips", attrs: { "aria-label": `${card.title} list` } });
  (card.chips || []).forEach((chip) => {
    if (typeof chip === "string") {
      chipsWrap.appendChild(mkEl("span", { className: "skill-chip", text: chip }));
      return;
    }
    if (isCourse && chip.url) {
      const match = String(chip.label || "").match(/^([A-Z]+\s+\d+[A-Z]?):\s*(.+)$/);
      const link = mkEl("button", {
        className: "skill-chip course-link" + (chip.inProgress ? " skill-chip--ip" : ""),
        attrs: { type: "button", "aria-label": `${chip.label} — view course details` },
      });
      if (match) {
        link.appendChild(mkEl("span", { className: "course-link__code", text: match[1] }));
        link.appendChild(mkEl("span", { className: "course-link__name", text: match[2] }));
      } else {
        link.appendChild(mkEl("span", { className: "course-link__name", text: chip.label }));
      }
      if (chip.inProgress) link.appendChild(mkEl("span", { className: "course-link__current", attrs: { "aria-label": "Currently enrolled", role: "img" } }));
      link.appendChild(mkEl("span", { className: "course-link__arrow", text: "+", attrs: { "aria-hidden": "true" } }));
      link.addEventListener("click", () => openCourseDialog(chip, match ? match[1] : chip.label, match ? match[2] : chip.label));
      chipsWrap.appendChild(link);
      return;
    }
    const span = mkEl("span", { className: "skill-chip" + (chip.inProgress ? " skill-chip--ip" : ""), text: chip.label });
    if (chip.inProgress) span.appendChild(mkEl("span", { className: "ip", text: "In progress" }));
    chipsWrap.appendChild(span);
  });
  article.appendChild(chipsWrap);

  mount.appendChild(article);
}

function renderSkills(data, coreMount, courseworkMount) {
  initCourseDialog();
  if (coreMount) {
    coreMount.innerHTML = "";
    (data.core || []).forEach((c, i) => renderSkillCard(c, coreMount, false, i));
  }
  if (courseworkMount) {
    courseworkMount.innerHTML = "";
    (data.coursework || []).forEach((c, i) => renderSkillCard(c, courseworkMount, true, i));
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "";
}

// Homepage hero / summary / "In brief" / origin / contact / footer copy —
// a singleton object (not a list) rendered into the static elements already
// in index.html, so edit mode can wire them as click-and-type just like the
// list-backed sections, via dev/editor.js's ENTITIES.home-*.
// Renders a standalone (non-list) photo slot — the hero portrait and the
// "beyond engineering" photo aren't attached to any project/experience/skill
// entity, so they get their own placeholder <-> photo swap here instead of
// going through renderExperience/renderFeaturedProjects.
function renderPhotoSlot(mount, photo, opts) {
  if (!mount) return;
  mount.innerHTML = "";
  mount.classList.toggle("editorial-placeholder", !(photo && photo.src));

  if (photo && photo.src) {
    mount.removeAttribute("role");
    mount.removeAttribute("aria-label");
    const img = mkEl("img", { attrs: { src: photo.src, alt: photo.alt || opts.imgAlt || "", loading: "lazy" } });
    // Absolute-filled against the mount (already position:relative for the
    // photo-button overlay) rather than width/height:100%, since these
    // mounts are grid items whose own height isn't always a definite value
    // percentage heights can resolve against.
    img.style.position = "absolute";
    img.style.inset = "0";
    img.style.width = "100%";
    img.style.height = "100%";
    // contain, not cover: these are transparent-background cutout photos,
    // and cover crops to fill the mount's box shape, which was cutting
    // the top of the subject's hair off. contain always shows the full
    // uploaded image; the mount drops its background once a real photo
    // is set (see the classList.toggle above), so the letterboxed edges
    // show the page background through the photo's own transparency
    // instead of a visible box.
    img.style.objectFit = "contain";
    img.style.display = "block";
    mount.appendChild(img);
  } else {
    mount.setAttribute("role", "img");
    mount.setAttribute("aria-label", "Photo placeholder");
    if (opts.number) mount.appendChild(mkEl("span", { className: "editorial-placeholder__number", text: opts.number }));
    const wrap = document.createElement("div");
    wrap.appendChild(mkEl("strong", { text: opts.title }));
    wrap.appendChild(mkEl("p", { attrs: { id: opts.noteId } }));
    mount.appendChild(wrap);
  }
}

function renderHome(data) {
  if (!data) return;
  const hero = data.hero || {};
  setText("heroKicker", hero.kicker);
  setText("heroNameMain", hero.nameMain);
  setText("heroNameAccent", hero.nameAccent);
  setText("heroLede", hero.lede);
  setText("heroCtaPrimary", hero.ctaPrimaryLabel);
  setText("heroCtaSecondary", hero.ctaSecondaryLabel);
  renderPhotoSlot(document.getElementById("heroVisual"), hero.photo, { number: "01", title: "Portrait needed", noteId: "heroPlaceholderNote", imgAlt: "Paul Poleon Jr" });
  setText("heroPlaceholderNote", hero.placeholderNote);

  const statusMount = document.getElementById("heroStatus");
  if (statusMount) {
    statusMount.innerHTML = "";
    (hero.status || []).forEach((s) => statusMount.appendChild(mkEl("span", { text: s })));
  }

  const summary = data.summary || {};
  setText("summaryLabel", summary.label);
  setText("summaryHeadingLead", summary.headingLead);
  setText("summaryHeadingAccent", summary.headingAccent);
  setText("summaryLinkText", summary.linkText);
  const summaryParas = document.getElementById("summaryParagraphs");
  if (summaryParas) {
    summaryParas.innerHTML = "";
    (summary.paragraphs || []).forEach((p) => summaryParas.appendChild(mkEl("p", { text: p })));
  }

  const brief = data.brief || {};
  setText("briefLabel", brief.label);
  const strengths = brief.strengths || {};
  const curious = brief.curious || {};
  setText("briefStrengthsTitle", strengths.title);
  setText("briefCuriousTitle", curious.title);
  const buildBriefList = (mountId, items) => {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    mount.innerHTML = "";
    (items || []).forEach((text, i) => {
      const li = document.createElement("li");
      li.appendChild(mkEl("span", { className: "editorial-list-block__num", text: String(i + 1).padStart(2, "0") }));
      li.appendChild(mkEl("span", { className: "editorial-list-block__text", text }));
      mount.appendChild(li);
    });
  };
  buildBriefList("briefStrengthsList", strengths.items);
  buildBriefList("briefCuriousList", curious.items);

  const origin = data.origin || {};
  setText("originLabel", origin.label);
  renderPhotoSlot(document.getElementById("originVisual"), origin.photo, { number: "06", title: "Personal story photo", noteId: "originPlaceholderNote", imgAlt: "Paul Poleon Jr" });
  setText("originPlaceholderNote", origin.placeholderNote);
  setText("originKicker", origin.kicker);
  setText("originHeading", origin.heading);
  const originParas = document.getElementById("originParagraphs");
  if (originParas) {
    originParas.innerHTML = "";
    (origin.paragraphs || []).forEach((p) => originParas.appendChild(mkEl("p", { text: p })));
  }

  const contact = data.contact || {};
  setText("contactKicker", contact.kicker);
  setText("contactHeadingLine1", contact.headingLine1);
  setText("contactHeadingLine2", contact.headingLine2);

  setText("footerTagline", (data.footer || {}).tagline);
}

// About page: one flashcard per Q&A pair, all rendered into the DOM at
// once (so edit mode's per-card data-edit-index wiring works exactly like
// every other entity list) — only the "is-active" card is shown at a time,
// stepped through via initFlashcards()/showFlashcard() below.
function renderAbout(list, mount) {
  if (!mount) return;
  mount.innerHTML = "";

  list.forEach((item, i) => {
    const card = mkEl("article", {
      className: "flashcard" + (i === 0 ? " is-active" : ""),
      attrs: { "data-edit-entity": "about", "data-edit-index": i },
    });
    card.appendChild(mkEl("p", { className: "flashcard__kicker", text: item.kicker }));
    card.appendChild(mkEl("h3", { className: "flashcard__question", text: item.question }));

    const answer = mkEl("div", { className: "flashcard__answer" });
    (item.answer || []).forEach((para) => answer.appendChild(mkEl("p", { text: para })));
    card.appendChild(answer);

    card.appendChild(mkEl("button", { className: "flashcard__reveal", text: "Reveal answer", attrs: { type: "button" } }));

    mount.appendChild(card);
  });
}

let flashcardIndex = 0;

function showFlashcard(index) {
  const mount = document.getElementById("aboutMount");
  if (!mount) return;
  const cards = Array.from(mount.querySelectorAll(".flashcard"));
  if (!cards.length) return;

  flashcardIndex = Math.max(0, Math.min(cards.length - 1, index));

  // Cards aren't a fixed height (a revealed card is taller than a fresh
  // one), and swapping which one is .is-active is an instant
  // display:none<->block flip with no transition, so the page's height
  // can jump right at this line. Anchor scroll position to the nav
  // controls across that flip so the viewport doesn't shift and you
  // don't have to re-scroll to reach Next/Prev.
  const nav = document.querySelector(".flashcards-nav");
  const navTopBefore = nav ? nav.getBoundingClientRect().top : null;

  cards.forEach((c, i) => c.classList.toggle("is-active", i === flashcardIndex));

  if (nav && navTopBefore !== null) {
    const delta = nav.getBoundingClientRect().top - navTopBefore;
    if (delta !== 0) window.scrollBy(0, delta);
  }

  const progress = document.getElementById("flashcardProgress");
  if (progress) progress.textContent = `${flashcardIndex + 1} / ${cards.length}`;
  const prevBtn = document.getElementById("flashcardPrev");
  const nextBtn = document.getElementById("flashcardNext");
  if (prevBtn) prevBtn.disabled = flashcardIndex === 0;
  if (nextBtn) nextBtn.disabled = flashcardIndex === cards.length - 1;

  // Field Notes theme only: swaps the margin doodle(s) to match the
  // current question. No-op everywhere else — .flashcards-doodle only
  // exists on the About page. A doodle that's actually being swapped
  // away from (was active, isn't anymore) gets a one-shot .is-erasing
  // class so the eraser-sweep keyframe animation (styles.css) plays —
  // gated this way, rather than off :not(.is-active) directly, so it
  // never fires on first paint, only on a real question change.
  document.querySelectorAll(".flashcards-doodle").forEach((d) => {
    const shouldBeActive = Number(d.dataset.doodleIndex) === flashcardIndex;
    if (!shouldBeActive && d.classList.contains("is-active")) {
      d.classList.add("is-erasing");
      d.addEventListener("animationend", () => d.classList.remove("is-erasing"), { once: true });
    }
    d.classList.toggle("is-active", shouldBeActive);
  });
}

// Wires the reveal button (event-delegated on the mount, so it still works
// after renderAbout() rebuilds the cards) and the prev/next controls. Safe
// to call more than once — the click listeners are only attached the first
// time; later calls (after an edit-mode add/delete) just reset to card 0.
function initFlashcards() {
  const mount = document.getElementById("aboutMount");
  if (!mount) return;

  if (mount.dataset.flashcardsInit !== "1") {
    mount.dataset.flashcardsInit = "1";

    // One-way reveal: clicking shows the answer and removes the button —
    // no "Show question" toggle back. Cards themselves are rendered once
    // by renderAbout() and never torn down between prev/next (only
    // .is-active toggles for display), so .is-flipped staying on the
    // card element is what makes a revealed card stay revealed if you
    // navigate away and back to it.
    mount.addEventListener("click", (e) => {
      const btn = e.target.closest(".flashcard__reveal");
      if (!btn) return;
      const card = btn.closest(".flashcard");
      const answer = card.querySelector(".flashcard__answer");

      // scrollHeight reports the answer's full, un-clipped content height
      // even while it's still visually collapsed (max-height: 0), so the
      // growth this reveal is about to cause can be measured *before* the
      // class goes on. 22 is the margin-top .is-flipped adds. Using that
      // to scroll to the card's post-reveal centered position right away
      // means the page scroll and the card's grow transition run together,
      // instead of scrolling as a second jump after the card has already
      // finished opening and the reader has started reading it.
      const growth = answer ? answer.scrollHeight + 22 : 0;

      card.classList.add("is-flipped");
      btn.remove();

      const block = card.closest(".container") || card;
      const rect = block.getBoundingClientRect();
      const targetY = window.scrollY + rect.top + (rect.height + growth) / 2 - window.innerHeight / 2;

      if (prefersReducedMotion) {
        window.scrollTo(0, targetY);
      } else {
        window.scrollTo({ top: targetY, behavior: "smooth" });
      }
    });

    const prevBtn = document.getElementById("flashcardPrev");
    const nextBtn = document.getElementById("flashcardNext");
    if (prevBtn) prevBtn.addEventListener("click", () => showFlashcard(flashcardIndex - 1));
    if (nextBtn) nextBtn.addEventListener("click", () => showFlashcard(flashcardIndex + 1));

    document.addEventListener("keydown", (e) => {
      if (!document.getElementById("aboutMount")) return;
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || (e.target && e.target.isContentEditable)) return;
      if (e.key === "ArrowRight") showFlashcard(flashcardIndex + 1);
      else if (e.key === "ArrowLeft") showFlashcard(flashcardIndex - 1);
    });
  }

  showFlashcard(0);
}

// Re-queries the DOM each call, so it's safe to call again after dynamic
// content is injected (re-observing an already-visible element is a no-op).
function initReveal() {
  const revealEls = document.querySelectorAll(".reveal");
  if (!revealEls.length) return;
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    },
    { threshold: 0.15 }
  );
  revealEls.forEach((el) => obs.observe(el));
}

// ===== Projects page: Explore filter/search + modal (only if projectGrid exists) =====
// Wrapped in a function so it can be (re)run once the grid has been
// populated from data/projects.json (see the fetch block below).
function initProjectGrid() {
  const projectGrid = document.getElementById("projectGrid");
  if (!projectGrid) return;
  if (projectGrid.__projectGridAbort) projectGrid.__projectGridAbort.abort();
  const gridAbort = new AbortController();
  projectGrid.__projectGridAbort = gridAbort;
  const listenerOptions = { signal: gridAbort.signal };

  const chips = document.querySelectorAll(".chip");
  const search = document.getElementById("projectSearch");
  const cards = Array.from(projectGrid.querySelectorAll(".project--open"));
  const count = document.getElementById("projectCount");
  const empty = document.getElementById("projectsEmpty");

  let activeFilter = "all";

  function matches(card) {
    const filter = card.getAttribute("data-filter") || "";
    const title = (card.getAttribute("data-title") || "").toLowerCase();
    const tags = (card.getAttribute("data-tags") || "").toLowerCase();
    const q = (search?.value || "").trim().toLowerCase();

    const filterOk = activeFilter === "all" || filter === activeFilter;
    const searchOk = !q || title.includes(q) || tags.includes(q);
    return filterOk && searchOk;
  }

  function apply() {
    let visible = 0;
    cards.forEach((card) => {
      const show = matches(card);
      card.style.display = show ? "" : "none";
      if (show) visible += 1;
    });
    if (count) count.textContent = String(visible).padStart(2, "0");
    if (empty) empty.hidden = visible !== 0;
  }

  if (chips.length) {
    chips.forEach((btn) => {
      btn.addEventListener("click", () => {
        chips.forEach((b) => b.classList.remove("is-active"));
        chips.forEach((b) => b.setAttribute("aria-selected", "false"));
        btn.classList.add("is-active");
        btn.setAttribute("aria-selected", "true");
        activeFilter = btn.dataset.filter || "all";
        apply();
      }, listenerOptions);
    });
  }

  if (search) search.addEventListener("input", apply, listenerOptions);

  // Modal wiring
  const modal = document.getElementById("projectModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalSummary = document.getElementById("modalSummary");
  const modalTools = document.getElementById("modalTools");
  const modalResults = document.getElementById("modalResults");
  const modalLinks = document.getElementById("modalLinks");
  const modalPanel = modal?.querySelector(".modal__panel");
  let activeCard = null;
  let closeTimer = null;

  function openModal(card) {
    if (!modal) return;

    if (closeTimer) window.clearTimeout(closeTimer);
    activeCard = card;
    modal.dataset.projectType = card.dataset.projectType || "solo";
    const cardRect = card.getBoundingClientRect();
    modal.classList.remove("is-closing");
    modal.classList.add("is-preparing");
    modal.setAttribute("aria-hidden", "false");

    if (modalTitle) modalTitle.textContent = card.dataset.title || "";
    if (modalSummary) modalSummary.textContent = card.dataset.summary || "";

    if (modalTools) {
      modalTools.innerHTML = "";
      (card.dataset.tools || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((t) => {
          const li = document.createElement("li");
          li.textContent = t;
          modalTools.appendChild(li);
        });
    }

    if (modalResults) {
      modalResults.innerHTML = "";
      (card.dataset.results || "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((r) => {
          const li = document.createElement("li");
          li.textContent = r;
          modalResults.appendChild(li);
        });
    }

    if (modalLinks) {
      modalLinks.innerHTML = "";
      try {
        const links = JSON.parse(card.dataset.links || "[]");
        const image = JSON.parse(card.dataset.image || "null");
        if (image && image.src) {
          const figure = document.createElement("figure");
          figure.className = "modal__support-image";
          const img = document.createElement("img");
          img.src = image.src;
          img.alt = image.alt || "";
          figure.appendChild(img);
          modalLinks.appendChild(figure);
        }
        links.forEach((l) => {
          const a = document.createElement("a");
          const href = l.href || "#";
          const cleanHref = href.split("?")[0].toLowerCase();
          const isImage = /\.(png|jpe?g|webp|gif|avif)$/.test(cleanHref);
          const isPdf = cleanHref.endsWith(".pdf");
          a.className = "modal__attachment" + (isImage ? " modal__attachment--image" : "");
          a.href = safeProjectHref(l.href);
          a.target = "_blank";
          a.rel = "noopener";
          if (isImage) {
            const img = document.createElement("img");
            img.src = href;
            img.alt = l.label || "Project image";
            img.loading = "lazy";
            a.appendChild(img);
          } else {
            const icon = document.createElement("span");
            icon.className = "modal__attachment-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = isPdf ? "PDF" : "↗";
            a.appendChild(icon);
          }
          const label = document.createElement("span");
          label.textContent = l.label;
          a.appendChild(label);
          modalLinks.appendChild(a);
        });
        if (!links.length) modalLinks.appendChild(mkEl("p", { className: "muted small", text: "No supporting files attached yet." }));
      } catch (_) {}
    }

    // In edit mode, dev/editor.js wires this popup's content as
    // click-and-type too (it's the only place tools/results/links appear).
    if (typeof window.__wireQuickViewEdit === "function") {
      window.__wireQuickViewEdit(card, { modalSummary, modalTools, modalResults, modalLinks });
    }

    const panelRect = modalPanel?.getBoundingClientRect();
    if (panelRect && modalPanel) {
      const dx = cardRect.left + cardRect.width / 2 - (panelRect.left + panelRect.width / 2);
      const dy = cardRect.top + cardRect.height / 2 - (panelRect.top + panelRect.height / 2);
      const scale = Math.max(.28, Math.min(.72, cardRect.width / panelRect.width));
      modalPanel.style.setProperty("--card-x", `${dx}px`);
      modalPanel.style.setProperty("--card-y", `${dy}px`);
      modalPanel.style.setProperty("--card-scale", String(scale));
    }
    card.classList.add("is-unpinning");
    card.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      modal.classList.remove("is-preparing");
      modal.classList.add("is-open");
      window.setTimeout(() => modal.querySelector(".modal__close")?.focus(), 520);
    });
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add("is-closing");
    modal.classList.remove("is-open");
    closeTimer = window.setTimeout(() => {
      modal.classList.remove("is-closing", "is-preparing");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      activeCard?.classList.remove("is-unpinning");
      activeCard?.setAttribute("aria-expanded", "false");
      activeCard?.focus();
      activeCard = null;
    }, 380);
  }

  // The entire pinned card behaves like the quick-view trigger.
  projectGrid.addEventListener("click", (e) => {
    const card = e.target.closest(".project--open");
    if (!card || document.body.classList.contains("is-edit-mode")) return;
    openModal(card);
  }, listenerOptions);
  projectGrid.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".project--open");
    if (!card || document.body.classList.contains("is-edit-mode")) return;
    e.preventDefault();
    openModal(card);
  }, listenerOptions);

  // Close modal on backdrop/close button
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target.dataset.close === "true") closeModal();
    }, listenerOptions);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
      if (e.key === "Tab" && modal.classList.contains("is-open")) {
        const focusable = Array.from(modal.querySelectorAll('button:not([disabled]),a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }, listenerOptions);
  }

  apply();
}

document.addEventListener("DOMContentLoaded", () => {
  // ===== Mobile context notice =====
  // Keep this in shared JS so every public page receives the same notice.
  // It is inserted below the sticky navigation and only rendered on phones.
  if (!document.querySelector(".mobile-desktop-notice")) {
    const notice = document.createElement("aside");
    notice.className = "mobile-desktop-notice";
    notice.setAttribute("aria-label", "Desktop viewing recommendation");

    const noticeCopy = document.createElement("p");
    noticeCopy.innerHTML = "<strong>Quick heads-up:</strong> This portfolio was built with desktop use in mind. For the best experience, I highly recommend viewing it on a laptop or desktop.";

    const noticeClose = document.createElement("button");
    noticeClose.type = "button";
    noticeClose.className = "mobile-desktop-notice__close";
    noticeClose.setAttribute("aria-label", "Dismiss desktop viewing recommendation");
    noticeClose.textContent = "Got it";
    noticeClose.addEventListener("click", () => notice.remove());

    notice.append(noticeCopy, noticeClose);
    const siteNav = document.querySelector(".portfolio-nav, .nav");
    if (siteNav) siteNav.insertAdjacentElement("afterend", notice);
    else document.body.prepend(notice);
  }

  // ===== Mobile nav toggle (works with CSS: .nav.is-open .nav__links { display:flex; } ) =====
  const nav = document.querySelector(".nav");
  const navToggle = document.querySelector(".nav__toggle");
  const navLinks = document.getElementById("navLinks"); // your HTML uses id="navLinks"

  if (nav && navToggle && navLinks) {
    navToggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const open = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(open));
    });

    // Close menu when clicking a link
    navLinks.addEventListener("click", (e) => {
      if (e.target.tagName === "A") {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });

    // Close when clicking outside
    document.addEventListener("click", (e) => {
      if (!nav.contains(e.target)) {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });

    // Close on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // ===== Portfolio-nav mobile toggle (editorial header, all main pages) =====
  const portfolioNav = document.querySelector(".portfolio-nav");
  if (portfolioNav) {
    const pToggle = portfolioNav.querySelector(".nav__toggle");
    const pLinks = portfolioNav.querySelector(".portfolio-nav__links");

    if (pToggle && pLinks) {
      pToggle.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = pLinks.classList.toggle("open");
        pToggle.setAttribute("aria-expanded", String(open));
      });

      pLinks.addEventListener("click", (e) => {
        if (e.target.tagName === "A") pLinks.classList.remove("open");
      });

      document.addEventListener("click", (e) => {
        if (!portfolioNav.contains(e.target)) pLinks.classList.remove("open");
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") pLinks.classList.remove("open");
      });
    }
  }

  // ===== Footer year =====
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // ===== Secret entry point into edit mode =====
  // No visible link to /dev/ anywhere in the UI (it's also excluded from
  // search indexing) — this adds one more "a visitor wouldn't stumble into
  // it" layer: 5 quick clicks on the footer's copyright mark opens the
  // (locked, username+password gated) sign-in screen.
  const copyrightMark = document.querySelector(".editorial-footer > span:first-child");
  if (copyrightMark) {
    let secretClicks = 0;
    let secretResetTimer = null;
    copyrightMark.addEventListener("click", () => {
      secretClicks += 1;
      clearTimeout(secretResetTimer);
      secretResetTimer = setTimeout(() => { secretClicks = 0; }, 3000);
      if (secretClicks >= 5) {
        secretClicks = 0;
        location.href = `/dev/?return=${encodeURIComponent(location.pathname)}`;
      }
    });
  }

  // ===== Optional: Collapsible Projects section (only if those IDs exist) =====
  const projectsToggle = document.getElementById("projectsToggle");
  const projectsSection = document.getElementById("projects");

  if (projectsToggle && projectsSection) {
    projectsToggle.addEventListener("click", () => {
      const isCollapsed = projectsSection.classList.toggle("is-collapsed");

      projectsToggle.textContent = isCollapsed ? "View Projects" : "Hide Projects";

      if (!isCollapsed) {
        projectsSection.scrollIntoView({ behavior: smoothOrAuto, block: "start" });
      }
    });
  }

  // ===== Stat strip: count-up on scroll into view (only if present) =====
  const statEls = document.querySelectorAll(".stat-strip .js-count");
  if (statEls.length) {
    const formatCount = (value, decimals) =>
      decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString();

    const animateCount = (el) => {
      const raw = el.getAttribute("data-count-to") || "0";
      const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
      const target = parseFloat(raw);

      if (prefersReducedMotion) {
        el.textContent = formatCount(target, decimals);
        return;
      }

      const duration = 1200;
      const start = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = formatCount(target * eased, decimals);
        if (progress < 1) requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    };

    const statObs = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );

    statEls.forEach((el) => statObs.observe(el));
  }

  // ===== Reveal on scroll (any .reveal elements already in the DOM) =====
  initReveal();

  // ===== Data-driven content bootstrap =====
  // Each page only has the mount(s) relevant to it; everything else here
  // is a no-op guard, same pattern as the optional blocks above.
  const experienceMount = document.getElementById("experienceTimelineMount");
  if (experienceMount) {
    fetch("/data/experience.json")
      .then((r) => r.json())
      .then((list) => {
        renderExperience(list, experienceMount);
        initReveal();
      })
      .catch((err) => console.error("Failed to load experience data", err));
  }

  const featuredMount = document.getElementById("projectsFeaturedMount");
  const quickviewMount = document.getElementById("projectGrid");
  if (featuredMount || quickviewMount) {
    fetch("/data/projects.json")
      .then((r) => r.json())
      .then((data) => {
        updateProjectHubMeta(data);
        if (featuredMount) {
          renderFeaturedProjects(data.featured || [], featuredMount, featuredMount.dataset.variant || "home");
        }
        if (quickviewMount) {
          renderQuickviewProjects(data.quickview || [], quickviewMount);
          initProjectGrid();
        }
        initReveal();
      })
      .catch((err) => console.error("Failed to load projects data", err));
  }

  const caseStudyMount = document.getElementById("caseStudyBlocks");
  if (caseStudyMount) {
    // The page's own URL is the slug (/projects/<slug>/) — same file every
    // project's page loads, so which project it renders is never baked
    // into the HTML itself.
    const slug = location.pathname.split("/").filter(Boolean).pop();
    fetch("/data/case-studies.json")
      .then((r) => r.json())
      .then((all) => {
        renderCaseStudy(all[slug], slug, caseStudyMount);
        initReveal();
      })
      .catch((err) => console.error("Failed to load case study data", err));
  }

  const skillsCoreMount = document.getElementById("skillsCoreMount");
  const skillsCourseworkMount = document.getElementById("skillsCourseworkMount");
  if (skillsCoreMount || skillsCourseworkMount) {
    fetch("/data/skills.json")
      .then((r) => r.json())
      .then((data) => {
        renderSkills(data, skillsCoreMount, skillsCourseworkMount);
        initReveal();
      })
      .catch((err) => console.error("Failed to load skills data", err));
  }

  const heroKicker = document.getElementById("heroKicker");
  if (heroKicker) {
    fetch("/data/home.json")
      .then((r) => r.json())
      .then((data) => {
        renderHome(data);
        initReveal();
      })
      .catch((err) => console.error("Failed to load home data", err));
  }

  const aboutMount = document.getElementById("aboutMount");
  if (aboutMount) {
    fetch("/data/about.json")
      .then((r) => r.json())
      .then((list) => {
        renderAbout(list, aboutMount);
        initFlashcards();
        initReveal();
      })
      .catch((err) => console.error("Failed to load about data", err));
  }
});
