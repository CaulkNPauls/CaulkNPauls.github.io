// Mobile nav toggle + footer year
const toggle = document.querySelector(".nav__toggle");
const links = document.querySelector(".nav__links");

if (toggle && links) {
  toggle.addEventListener("click", () => {
    const isOpen = links.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  // Close menu when a link is clicked (mobile)
  links.addEventListener("click", (e) => {
    if (e.target.tagName === "A") {
      links.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();

// added for collapsiable projects tab
const projectsToggle = document.getElementById("projectsToggle");
const projectsSection = document.getElementById("projects");

if (projectsToggle && projectsSection) {
  projectsToggle.addEventListener("click", () => {
    const isCollapsed = projectsSection.classList.toggle("is-collapsed");

    // Change button text
    projectsToggle.textContent = isCollapsed
      ? "View Projects"
      : "Hide Projects";

    // Scroll smoothly when opening
    if (!isCollapsed) {
      projectsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}


// ===== Reveal on scroll (About page + any .reveal elements) =====
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

// ===== PROGRESSION DOTS FOR ABOUT PAGE =====
document.addEventListener("DOMContentLoaded", () => {
  const dots = document.querySelectorAll(".page-dots .dot");
  const sections = document.querySelectorAll(".snap__section");

  if (!dots.length || !sections.length) return;

  // Click a dot → scroll to that section
  dots.forEach(dot => {
    dot.addEventListener("click", () => {
      const target = document.getElementById(dot.dataset.target);
      if (target) target.scrollIntoView({ behavior: "smooth" });
    });
  });

  // Highlight active dot while scrolling
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        dots.forEach(d => d.classList.remove("is-active"));
        const active = document.querySelector(
          `.page-dots .dot[data-target="${entry.target.id}"]`
        );
        if (active) active.classList.add("is-active");
      }
    });
  }, { threshold: 0.6 });

  sections.forEach(section => observer.observe(section));
});
<script>
  (function () {
    const chips = document.querySelectorAll(".chip");
    const search = document.getElementById("projectSearch");
    const grid = document.getElementById("projectGrid");
    const cards = Array.from(grid.querySelectorAll(".project--open"));

    let activeFilter = "all";

    function matches(card) {
      const filter = card.getAttribute("data-filter") || "";
      const title = (card.getAttribute("data-title") || "").toLowerCase();
      const tags  = (card.getAttribute("data-tags") || "").toLowerCase();
      const q = (search.value || "").trim().toLowerCase();

      const filterOk = activeFilter === "all" || filter === activeFilter;
      const searchOk = !q || title.includes(q) || tags.includes(q);
      return filterOk && searchOk;
    }

    function apply() {
      cards.forEach(card => {
        card.style.display = matches(card) ? "" : "none";
      });
    }

    chips.forEach(btn => {
      btn.addEventListener("click", () => {
        chips.forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        activeFilter = btn.dataset.filter;
        apply();
      });
    });

    search.addEventListener("input", apply);

    // Modal
    const modal = document.getElementById("projectModal");
    const modalTitle = document.getElementById("modalTitle");
    const modalSummary = document.getElementById("modalSummary");
    const modalTools = document.getElementById("modalTools");
    const modalResults = document.getElementById("modalResults");
    const modalLinks = document.getElementById("modalLinks");

    function openModal(card) {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");

      modalTitle.textContent = card.dataset.title || "";
      modalSummary.textContent = card.dataset.summary || "";

      modalTools.innerHTML = "";
      (card.dataset.tools || "").split(",").map(s => s.trim()).filter(Boolean).forEach(t => {
        const li = document.createElement("li");
        li.textContent = t;
        modalTools.appendChild(li);
      });

      modalResults.innerHTML = "";
      (card.dataset.results || "").split(";").map(s => s.trim()).filter(Boolean).forEach(r => {
        const li = document.createElement("li");
        li.textContent = r;
        modalResults.appendChild(li);
      });

      modalLinks.innerHTML = "";
      try {
        const links = JSON.parse(card.dataset.links || "[]");
        links.forEach(l => {
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

      document.body.style.overflow = "hidden";
    }

    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    grid.addEventListener("click", (e) => {
      const btn = e.target.closest(".link-btn");
      const card = e.target.closest(".project--open");
      if (!card || !btn) return;
      openModal(card);
    });

    modal.addEventListener("click", (e) => {
      if (e.target.dataset.close === "true") closeModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
    });

    apply();
  })();
</script>
