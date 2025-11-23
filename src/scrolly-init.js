const stepCallbacks = [];

function initScrollyObserver() {
  const steps = document.querySelectorAll(".step");
  if (!steps.length) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const index = entry.target.dataset.index || "";
        console.log(`Entering Scene ${index}`);
        stepCallbacks.forEach((cb) => cb(index, entry));
      });
    },
    { threshold: 0.5 }
  );

  steps.forEach((step) => observer.observe(step));
}

export function onStepEnter(callback) {
  if (typeof callback === "function") {
    stepCallbacks.push(callback);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initScrollyObserver);
} else {
  initScrollyObserver();
}
