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
