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
