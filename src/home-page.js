(function () {
  const storyPrelude = createStoryPrelude();
  storyPrelude.start();

  const STATE_NAME_MAP = window.STATE_NAME_MAP || {};
  const STATE_ABBR_BY_NAME = Object.fromEntries(Object.entries(STATE_NAME_MAP).map(([abbr, name]) => [name, abbr]));
  const MODE_CONFIG = {
    rate: {
      label: "Fines per 10k licences",
      interpolator: d3.interpolateViridis,
      format: (value) => `${value?.toFixed?.(0) ?? "0"}`,
    },
    remote: {
      label: "Remote enforcement share",
      interpolator: d3.interpolateCividis,
      format: (value) => `${((value ?? 0) * 100).toFixed(0)}%`,
    },
  };

  const heroPanel = document.querySelector(".hero-panel");
  const mapElement = document.getElementById("map");
  const mobileLayoutQuery = window.matchMedia("(max-width: 1100px)");
  const tourStatus = document.getElementById("tour-status");
  const tourButton = document.getElementById("tour-button");
  const stateShortcutList = document.getElementById("state-shortcut-list");
  const colorModeButtons = document.querySelectorAll("#color-mode button");

  const formatNumber = new Intl.NumberFormat("en-AU");
  const formatCompact = new Intl.NumberFormat("en-AU", { notation: "compact", maximumFractionDigits: 1 });
  const formatPercent = new Intl.NumberFormat("en-AU", { style: "percent", maximumFractionDigits: 1 });

  let stateSummaries = new Map();
  let featureByName = new Map();
  let colorScales = { rate: null, remote: null };
  let colorMode = "rate";
  let tourStops = [];
  let tourTimer = null;
  let tourIndex = 0;
  let spotlightState = null;

  const choropleth = createChoropleth({
    containerSelector: "#map",
    getTooltipContent: buildTooltipContent,
    onStateNavigate: (summary) => navigateToState(summary.name, summary.abbr),
  });

  init();

  function init() {
    setupControls();
    setupResponsiveSync();
    loadData();
  }

  function loadData() {
    loadAtlasData()
      .then(({ features, featureByName: lookup, summaries }) => {
        stateSummaries = summaries;
        featureByName = lookup;
        colorScales = buildColorScales(stateSummaries);
        choropleth.setData({ features, summaries: stateSummaries });
        applyColorMode(colorMode);
        populateTourStops();
        tourButton.disabled = false;
        tourButton.removeAttribute("aria-disabled");
        window.addEventListener("resize", handleResize, { passive: true });
        storyPrelude.complete();
      })
      .catch((error) => {
        console.error("Failed to prepare Australia map", error);
        storyPrelude.complete();
      });
  }

  function buildColorScales(summaries) {
    const result = { rate: null, remote: null };
    Object.entries(MODE_CONFIG).forEach(([mode, config]) => {
      const values = Array.from(summaries.values())
        .map((summary) => (mode === "rate" ? summary.ratePer10k : summary.remoteShare))
        .filter((value) => Number.isFinite(value) && value >= 0);
      if (!values.length) {
        result[mode] = null;
        return;
      }
      const extent = mode === "remote" ? [0, Math.max(0.25, d3.max(values))] : d3.extent(values);
      result[mode] = d3.scaleSequential().domain(extent).interpolator(config.interpolator);
    });
    return result;
  }

  function setupControls() {
    Object.entries(STATE_NAME_MAP).forEach(([abbr, name]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = abbr;
      button.title = name;
      button.addEventListener("click", () => navigateToState(name, abbr));
      stateShortcutList.appendChild(button);
    });

    tourButton.disabled = true;
    tourButton.setAttribute("aria-disabled", "true");

    colorModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode;
        if (!MODE_CONFIG[mode] || colorMode === mode) {
          return;
        }
        applyColorMode(mode);
      });
    });

    tourButton.addEventListener("click", () => {
      if (tourButton.disabled) {
        return;
      }
      if (tourTimer) {
        stopTour();
      } else {
        startTour();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopTour();
      }
    });
  }

  function setupResponsiveSync() {
    if (mobileLayoutQuery.addEventListener) {
      mobileLayoutQuery.addEventListener("change", syncMapHeight);
    } else if (mobileLayoutQuery.addListener) {
      mobileLayoutQuery.addListener(syncMapHeight);
    }
    syncMapHeight();
  }

  function applyColorMode(mode) {
    const scale = colorScales[mode];
    if (!scale) {
      return;
    }
    colorMode = mode;
    colorModeButtons.forEach((btn) => {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive);
    });

    const config = buildModeConfig(mode);
    choropleth.setColorScale(mode, scale, config || {});
    announceColorScale(mode);
  }

  function buildModeConfig(mode) {
    const base = MODE_CONFIG[mode];
    if (!base) {
      return null;
    }
    if (mode !== "remote") {
      return { ...base };
    }
    const missingRemote = Array.from(stateSummaries.values()).some(
      (entry) => entry.remoteShare == null || !Number.isFinite(entry.remoteShare)
    );
    return { ...base, note: missingRemote ? "Hatched states = no remote data" : null };
  }

  function buildTooltipContent(summary) {
    if (!summary || !summary.baseYear) {
      const name = summary?.name || "Unknown state";
      return `<h3>${name}</h3><p>No speeding fine data available.</p>`;
    }

    const metrics = [];
    metrics.push(
      `<div class="metric"><span>Latest fines (${summary.baseYear})</span><strong>${formatCompact.format(
        summary.totalFines
      )}</strong></div>`
    );
    metrics.push(
      `<div class="metric"><span>Licences</span><strong>${formatNumber.format(summary.licences)}</strong></div>`
    );
    metrics.push(
      `<div class="metric"><span>Rate / 10k drivers</span><strong>${summary.ratePer10k?.toFixed(1) ?? "—"}</strong></div>`
    );

    if (summary.region) {
      const regionLabel = summary.region.year ? `${summary.region.location} (${summary.region.year})` : summary.region.location;
      metrics.push(
        `<div class="metric"><span>Top region</span><strong>${regionLabel} · ${formatCompact.format(
          summary.region.fines
        )}</strong></div>`
      );
    }

    if (summary.topAgeGroup) {
      metrics.push(
        `<div class="metric"><span>Peak age group</span><strong>${summary.topAgeGroup.label} · ${formatCompact.format(
          summary.topAgeGroup.fines
        )}</strong></div>`
      );
    }

    if (summary.remoteShare != null) {
      metrics.push(
        `<div class="metric"><span>Remote share</span><strong>${formatPercent.format(summary.remoteShare)}</strong></div>`
      );
    }

    if (summary.policeCameraRatio) {
      metrics.push(
        `<div class="metric"><span>Police / camera ratio (${summary.policeCameraRatio.year})</span><strong>${summary.policeCameraRatio.value.toFixed(
          2
        )} : 1</strong></div>`
      );
    }

    if (summary.detectionSplit) {
      const cameraPct = (summary.detectionSplit.cameraShare * 100).toFixed(1);
      metrics.push(
        `<div class="metric"><span>Camera share (${summary.detectionSplit.year})</span><strong>${cameraPct}%</strong></div>`
      );
    }

    if (summary.peakMonth) {
      metrics.push(
        `<div class="metric"><span>Peak month (VIC 2023)</span><strong>${summary.peakMonth.month} · ${formatCompact.format(
          summary.peakMonth.fines
        )}</strong></div>`
      );
    }

    return `<h3>${summary.name}</h3>${metrics.join("")}`;
  }

  function populateTourStops() {
    tourStops = Array.from(stateSummaries.values())
      .filter((summary) => Number.isFinite(summary.ratePer10k))
      .sort((a, b) => d3.descending(a.ratePer10k, b.ratePer10k))
      .slice(0, 5);
  }

  function startTour() {
    if (!tourStops.length) {
      return;
    }
    stopTour();
    tourIndex = 0;
    highlightTourStop();
    tourTimer = setInterval(highlightTourStop, 4500);
    tourButton.textContent = "Stop guided tour";
    tourButton.setAttribute("aria-pressed", "true");
  }

  function stopTour() {
    if (tourTimer) {
      clearInterval(tourTimer);
      tourTimer = null;
    }
    tourButton.textContent = "Start guided tour";
    tourButton.setAttribute("aria-pressed", "false");
    tourStatus.textContent = "";
    spotlightState = null;
    choropleth.clearHighlight();
    choropleth.resetView();
    announceColorScale(colorMode);
  }

  function highlightTourStop() {
    if (!tourStops.length) {
      stopTour();
      return;
    }
    const summary = tourStops[tourIndex % tourStops.length];
    const feature = featureByName.get(summary.name);
    if (feature) {
      choropleth.flyToFeature(feature);
      highlightSpotlight(summary.name);
      tourStatus.textContent = `${summary.name}: ${summary.ratePer10k.toFixed(0)} fines per 10k (${summary.baseYear}).`;
    }
    tourIndex += 1;
  }

  function highlightSpotlight(stateName) {
    spotlightState = stateName;
    choropleth.highlightState(stateName);
  }

  function announceColorScale(mode = colorMode) {
    if (tourTimer) {
      return;
    }
    const label = MODE_CONFIG[mode]?.label;
    if (label) {
      tourStatus.textContent = `Color scale: ${label}`;
    }
  }

  function navigateToState(stateName, stateAbbr) {
    const code = stateAbbr || STATE_ABBR_BY_NAME[stateName];
    const target = code ? code : stateName;
    window.location.href = `state.html?state=${encodeURIComponent(target)}`;
  }

  function syncMapHeight() {
    if (!heroPanel || !mapElement) {
      return;
    }
    if (mobileLayoutQuery.matches) {
      mapElement.style.height = "";
      return;
    }
    const heroHeight = heroPanel.offsetHeight;
    if (heroHeight > 0) {
      mapElement.style.height = `${heroHeight}px`;
    }
  }

  function handleResize() {
    syncMapHeight();
    choropleth.resize();
  }
})();
