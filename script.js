// ===============================
// Global site JS (safe on all pages)
// - Mobile nav toggle
// - Footer year
// - Optional: collapsible projects section (if you have #projectsToggle + #projects)
// - Reveal-on-scroll (.reveal)
// - About page dots (.page-dots / .snap__section)
// - Projects page Explore + modal (only runs if #projectGrid exists)
// ===============================

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

  // ===== Footer year =====
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // ===== Optional: Collapsible Projects section (only if those IDs exist) =====
  const projectsToggle = document.getElementById("projectsToggle");
  const projectsSection = document.getElementById("projects");

  if (projectsToggle && projectsSection) {
    projectsToggle.addEventListener("click", () => {
      const isCollapsed = projectsSection.classList.toggle("is-collapsed");

      projectsToggle.textContent = isCollapsed ? "View Projects" : "Hide Projects";

      if (!isCollapsed) {
        projectsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  // ===== Reveal on scroll (any .reveal elements) =====
  const revealEls = document.querySelectorAll(".reveal");
  if (revealEls.length) {
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

  // ===== About page progression dots (only if present) =====
  const dots = document.querySelectorAll(".page-dots .dot");
  const sections = document.querySelectorAll(".snap__section");

  if (dots.length && sections.length) {
    dots.forEach((dot) => {
      dot.addEventListener("click", () => {
        const target = document.getElementById(dot.dataset.target);
        if (target) target.scrollIntoView({ behavior: "smooth" });
      });
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            dots.forEach((d) => d.classList.remove("is-active"));
            const active = document.querySelector(
              `.page-dots .dot[data-target="${entry.target.id}"]`
            );
            if (active) active.classList.add("is-active");
          }
        });
      },
      { threshold: 0.6 }
    );

    sections.forEach((section) => observer.observe(section));
  }

  // ===== Projects page: Explore filter/search + modal (only if projectGrid exists) =====
  const projectGrid = document.getElementById("projectGrid");
  if (projectGrid) {
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
});
