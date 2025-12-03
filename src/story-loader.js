(function () {
  function ensureRoot() {
    if (document.getElementById("story-loader")) {
      return document.getElementById("story-loader");
    }
    const root = document.createElement("div");
    root.id = "story-loader";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-label", "Loading story prelude");
    root.classList.add("story-loader--hidden");
    root.innerHTML = `
      <div class="story-loader__content">
        <p class="story-loader__eyebrow">Prelude</p>
        <h2 class="story-loader__headline" data-story-headline></h2>
        <p class="story-loader__body" data-story-copy></p>
        <div class="story-loader__progress" aria-live="off">
          <span class="story-loader__progress-track">
            <span class="story-loader__progress-fill" data-story-progress></span>
          </span>
          <span class="story-loader__progress-label" data-story-progress-label>1 / 2</span>
        </div>
        <div class="story-loader__meta">
          <span data-story-meta>Preparing datasets…</span>
          <button type="button" data-story-skip>Skip intro</button>
        </div>
      </div>
    `;
    document.body.prepend(root);
    return root;
  }

  function createStoryPrelude() {
    if (typeof document === "undefined") {
      return { start: () => {}, complete: () => {} };
    }
    const root = ensureRoot();
    const headlineNode = root.querySelector("[data-story-headline]");
    const copyNode = root.querySelector("[data-story-copy]");
    const progressFill = root.querySelector("[data-story-progress]");
    const progressLabel = root.querySelector("[data-story-progress-label]");
    const metaNode = root.querySelector("[data-story-meta]");
    const skipButton = root.querySelector("[data-story-skip]");

    const beats = [
      {
        title: "Every minute, 14 speeding fines are logged somewhere across Australia.",
        copy: "We stitched eight enforcement datasets together so you can see where that pressure lands first.",
      },
      {
        title: "Dive into each state’s dossier once the choropleth stabilises.",
        copy: "Click a hotspot or use the keyboard shortcuts to jump into detailed storytelling decks.",
      },
    ];

    const beatDuration = 3000;
    let timer = null;
    let nextBeatAt = 0;
    let index = 0;
    let dismissed = false;
    let pendingCompletion = false;

    const animateTextSwap = (node, text) => {
      if (!node) return;
      node.classList.remove("story-loader__text--enter");
      void node.offsetWidth;
      node.textContent = text;
      node.classList.add("story-loader__text--enter");
    };

    const renderBeat = (nextIndex) => {
      index = nextIndex % beats.length;
      const beat = beats[index];
      animateTextSwap(headlineNode, beat.title);
      animateTextSwap(copyNode, beat.copy);
      const progress = ((index + 1) / beats.length) * 100;
      if (progressFill) {
        progressFill.style.width = `${progress}%`;
      }
      if (progressLabel) {
        progressLabel.textContent = `${index + 1} / ${beats.length}`;
      }
      if (metaNode) {
        metaNode.textContent = index === beats.length - 1 ? "Finalising map layers…" : "Syncing datasets…";
      }
    };

    function hideOverlay() {
      if (dismissed) return;
      dismissed = true;
      document.body.classList.remove("loading");
      root.classList.remove("story-loader--visible");
      root.classList.add("story-loader--hidden");
      clearTimeout(timer);
      setTimeout(() => {
        root.remove();
      }, 800);
    }

    function scheduleHide(delay = beatDuration) {
      clearTimeout(timer);
      nextBeatAt = Date.now() + delay;
      timer = setTimeout(() => hideOverlay(), delay);
    }

    function advanceBeat() {
      if (pendingCompletion && index === beats.length - 1) {
        scheduleHide();
        return;
      }
      const nextIndex = pendingCompletion ? Math.min(index + 1, beats.length - 1) : (index + 1) % beats.length;
      if (nextIndex === index && pendingCompletion) {
        scheduleHide();
        return;
      }
      renderBeat(nextIndex);
      if (pendingCompletion && nextIndex === beats.length - 1) {
        scheduleHide();
      } else {
        queueNextBeat();
      }
    }

    function queueNextBeat(delay = beatDuration) {
      clearTimeout(timer);
      nextBeatAt = Date.now() + delay;
      timer = setTimeout(() => advanceBeat(), delay);
    }

    skipButton?.addEventListener("click", hideOverlay);

    return {
      start() {
        if (dismissed) return;
        document.body.classList.add("loading");
        root.classList.remove("story-loader--hidden");
        root.classList.add("story-loader--visible");
        pendingCompletion = false;
        renderBeat(0);
        queueNextBeat();
      },
      complete() {
        if (dismissed || pendingCompletion) return;
        pendingCompletion = true;
        const now = Date.now();
        const wait = Math.max(0, (nextBeatAt || now + beatDuration) - now);
        if (index === beats.length - 1) {
          scheduleHide(wait || beatDuration);
          return;
        }
        queueNextBeat(wait || 0);
      },
    };
  }

  window.createStoryPrelude = createStoryPrelude;
})();
