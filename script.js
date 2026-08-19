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

function renderExperience(list, mount) {
  if (!mount) return;
  mount.innerHTML = "";

  list.forEach((role, i) => {
    const isLast = i === list.length - 1;
    const article = mkEl("article", {
      className: "timeline-node reveal" + (role.featured ? " timeline-node--featured" : ""),
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
    if (variant === "hub") {
      const article = mkEl("article", {
        className: "project reveal",
        attrs: { "data-edit-entity": "projects-featured", "data-edit-index": i, "data-edit-photo-field": "image" },
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
      h3.appendChild(mkEl("a", { className: "project__title-link", text: p.title, attrs: { href: p.href } }));
      article.appendChild(h3);
      article.appendChild(mkEl("p", { text: p.blurbLong || p.blurbShort || "" }));

      const tagsUl = mkEl("ul", { className: "tags" });
      (p.tags || []).forEach((t) => tagsUl.appendChild(mkEl("li", { text: t })));
      article.appendChild(tagsUl);

      const meta = mkEl("div", { className: "project__meta" });
      meta.appendChild(mkEl("a", { className: "link", text: "View case study →", attrs: { href: p.href } }));
      article.appendChild(meta);

      mount.appendChild(article);
      return;
    }

    // "home" variant
    const a = mkEl("a", {
      className: "editorial-project reveal" + (i === 0 ? " editorial-project--large" : ""),
      attrs: {
        href: p.href,
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
      visual.style.height = "100%";
      visual.style.objectFit = "cover";
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
    const article = mkEl("article", {
      className: "project project--open reveal",
      attrs: {
        "data-edit-entity": "projects-quickview",
        "data-edit-index": i,
        "data-title": p.title,
        "data-tags": (p.tags || []).join(", "),
        "data-filter": p.filter || "",
        "data-summary": p.summary || "",
        "data-tools": (p.tools || []).join(", "),
        "data-results": (p.results || []).join("; "),
        "data-links": JSON.stringify(p.links || []),
      },
    });

    article.appendChild(mkEl("span", { className: "project__filter-badge", text: p.filter || "uncategorized" }));
    article.appendChild(mkEl("h3", { text: p.title }));
    article.appendChild(mkEl("p", { text: p.cardText || p.summary || "" }));

    const tagsUl = mkEl("ul", { className: "tags" });
    (p.tags || []).forEach((t) => tagsUl.appendChild(mkEl("li", { text: t })));
    article.appendChild(tagsUl);

    const meta = mkEl("div", { className: "project__meta" });
    meta.appendChild(mkEl("button", { className: "link link-btn", text: "Quick view →", attrs: { type: "button" } }));
    article.appendChild(meta);

    mount.appendChild(article);
  });
}

function renderSkillCard(card, mount, isCourse, index) {
  const article = mkEl("article", {
    className: "skills-card reveal" + (isCourse ? " skills-card--course" : ""),
    attrs: { "data-edit-entity": isCourse ? "skills-coursework" : "skills-core", "data-edit-index": index },
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
    const span = mkEl("span", { className: "skill-chip" + (chip.inProgress ? " skill-chip--ip" : ""), text: chip.label });
    if (chip.inProgress) span.appendChild(mkEl("span", { className: "ip", text: "In progress" }));
    chipsWrap.appendChild(span);
  });
  article.appendChild(chipsWrap);

  mount.appendChild(article);
}

function renderSkills(data, coreMount, courseworkMount) {
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
    img.style.objectFit = "cover";
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
  cards.forEach((c, i) => c.classList.toggle("is-active", i === flashcardIndex));

  const progress = document.getElementById("flashcardProgress");
  if (progress) progress.textContent = `${flashcardIndex + 1} / ${cards.length}`;
  const prevBtn = document.getElementById("flashcardPrev");
  const nextBtn = document.getElementById("flashcardNext");
  if (prevBtn) prevBtn.disabled = flashcardIndex === 0;
  if (nextBtn) nextBtn.disabled = flashcardIndex === cards.length - 1;
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

    mount.addEventListener("click", (e) => {
      const btn = e.target.closest(".flashcard__reveal");
      if (!btn) return;
      const card = btn.closest(".flashcard");
      const revealed = card.classList.toggle("is-flipped");
      btn.textContent = revealed ? "Show question" : "Reveal answer";
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

  const chips = document.querySelectorAll(".chip");
  const search = document.getElementById("projectSearch");
  const cards = Array.from(projectGrid.querySelectorAll(".project--open"));

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
    cards.forEach((card) => {
      card.style.display = matches(card) ? "" : "none";
    });
  }

  if (chips.length) {
    chips.forEach((btn) => {
      btn.addEventListener("click", () => {
        chips.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        activeFilter = btn.dataset.filter || "all";
        apply();
      });
    });
  }

  if (search) search.addEventListener("input", apply);

  // Modal wiring
  const modal = document.getElementById("projectModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalSummary = document.getElementById("modalSummary");
  const modalTools = document.getElementById("modalTools");
  const modalResults = document.getElementById("modalResults");
  const modalLinks = document.getElementById("modalLinks");

  function openModal(card) {
    if (!modal) return;

    modal.classList.add("is-open");
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
        links.forEach((l) => {
          const a = document.createElement("a");
          a.className = "link";
          a.href = l.href;
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = l.label;
          modalLinks.appendChild(a);
          modalLinks.appendChild(document.createElement("br"));
        });
      } catch (_) {}
    }

    // In edit mode, dev/editor.js wires this popup's content as
    // click-and-type too (it's the only place tools/results/links appear).
    if (typeof window.__wireQuickViewEdit === "function") {
      window.__wireQuickViewEdit(card, { modalSummary, modalTools, modalResults, modalLinks });
    }

    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  // Open modal only when clicking "Quick view" button
  projectGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".link-btn");
    const card = e.target.closest(".project--open");
    if (!card || !btn) return;
    openModal(card);
  });

  // Close modal on backdrop/close button
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target.dataset.close === "true") closeModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
    });
  }

  apply();
}

document.addEventListener("DOMContentLoaded", () => {
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
