(function () {
  const STATE_NAME_MAP = {
    ACT: "Australian Capital Territory",
    NSW: "New South Wales",
    NT: "Northern Territory",
    QLD: "Queensland",
    SA: "South Australia",
    TAS: "Tasmania",
    VIC: "Victoria",
    WA: "Western Australia",
  };
  const STATE_CODE_BY_NAME = Object.fromEntries(Object.entries(STATE_NAME_MAP).map(([code, name]) => [name.toLowerCase(), code]));
  const LOCATION_BUCKETS = ["Major Cities of Australia", "Inner Regional Australia", "Outer Regional Australia", "Remote Australia", "Very Remote Australia"];
  const REMOTE_FAMILY = new Set(["Outer Regional Australia", "Remote Australia", "Very Remote Australia"]);
  // Share constants with chart modules
  window.STATE_NAME_MAP = STATE_NAME_MAP;
  window.STATE_CODE_BY_NAME = STATE_CODE_BY_NAME;
  window.LOCATION_BUCKETS = LOCATION_BUCKETS;
  window.REMOTE_FAMILY = REMOTE_FAMILY;
  const tooltip = d3.select("#tooltip");
  const ui = window.uiUtils || {};
  const formatNumber = ui.formatNumber || ((value) => (value || 0).toLocaleString("en-AU"));
  const formatDecimal = ui.formatDecimal || ((value, digits = 1) => Number(value || 0).toFixed(digits));
  const formatPercent = ui.formatPercent || ((value) => `${(value * 100 || 0).toFixed(1)}%`);
  const formatMonth = ui.formatMonth || ((date) => date.toLocaleDateString("en-AU", { month: "short", year: "numeric" }));
  const createResponsiveSvg = ui.createResponsiveSvg || ((selection, { height }) => {
    const width = selection.node().clientWidth || 600;
    const svg = selection.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");
    return { svg, width, height };
  });
  const renderChartLegend = ui.renderChartLegend;
  const showTooltip = ui.showTooltip || ((html, event) => {
    tooltip.html(html).classed("hidden", false);
    tooltip.style("left", `${event.clientX + 16}px`).style("top", `${event.clientY + 16}px`);
  });
  const hideTooltip = ui.hideTooltip || (() => {
    tooltip.classed("hidden", true);
  });
  // Share formatter helpers for chart modules
  window.formatNumber = formatNumber;
  window.formatDecimal = formatDecimal;
  window.formatPercent = formatPercent;
  window.formatMonth = formatMonth;
  window.createResponsiveSvg = createResponsiveSvg;
  window.showTooltip = showTooltip;
  window.hideTooltip = hideTooltip;
  window.renderChartLegend = renderChartLegend;

  const params = new URLSearchParams(window.location.search);
  const requestedState = params.get("state");
  const activeState = resolveState(requestedState);
  const viewState = {
    ageMode: "absolute",
    ageFocus: activeState,
    ageHighlight: null,
    covidFocus: activeState,
    covidAnnualHighlight: null,
    regionalHighlight: null,
    detectionFocus: activeState,
    detectionHighlight: null,
  };
  // Share core state with chart modules
  window.activeState = activeState;
  window.viewState = viewState;

  const navLinks = document.querySelectorAll(".story-nav a");
  const scrollTopButton = document.getElementById("scroll-top");
  const stateSwitcher = document.getElementById("state-switcher");
  const heroCallouts = document.getElementById("hero-callouts");
  const heroNarrativeList = document.getElementById("hero-narrative-list");
  const ageModeButtons = Array.from(document.querySelectorAll("#age-tools .pill"));
  const ageFocusContainer = document.getElementById("age-focus");
  const covidFocusContainer = document.getElementById("covid-focus");
  const detectionFocusContainer = document.getElementById("detection-focus");
  const explorationTiles = Array.from(document.querySelectorAll(".exploration-grid a"));

  // Expose DOM nodes needed by external story modules
  window.heroCallouts = heroCallouts;
  window.heroNarrativeList = heroNarrativeList;
  window.detectionFocusContainer = detectionFocusContainer;

  let ageProfiles = new Map();
  let nationalAgeProfile = null;
  let cachedSummary = null;
  let nationalStats = null;
  let cachedRatioRows = [];
  let monthlyByState = new Map();
  let annualByState = new Map();
  let ageChartContext = null;
  let detectionChartContext = null;
  let covidChartContext = null;
  // expose mutable globals needed by chart modules
  window.nationalStats = nationalStats;
  window.ageProfiles = ageProfiles;
  window.nationalAgeProfile = nationalAgeProfile;
  window.ageChartContext = ageChartContext;
  window.covidChartContext = covidChartContext;
  window.detectionChartContext = detectionChartContext;
  window.cachedRatioRows = cachedRatioRows;

  hydrateHeading(activeState);
  wireBaseControls();

  Promise.all([
    d3.csv("data/q1_age_group_speeding_fines.csv", d3.autoType),
    d3.csv("data/q5_fines_by_jurisdiction_location_year.csv", d3.autoType),
    d3.csv("data/q5_rates_by_jurisdiction_year.csv", d3.autoType),
    d3.csv("data/q2_regional_difference.csv", d3.autoType),
    d3.csv("data/q4_police_camera_ratio.csv", d3.autoType),
    d3.csv("data/q3_vic_2023_monthly_camera_police.csv", d3.autoType),
    d3.csv("data/q3_vic_annual_camera_police.csv", d3.autoType),
    d3.csv("data/q3_annual_all_jurisdiction.csv", d3.autoType),
  ])
    .then(([ageGroups, locationByYear, rates, regionalDiff, ratioRows, vicMonthly, vicAnnual, annualAllJurisdiction]) => {
      vicMonthly.forEach((row) => {
        row.date = new Date(`${row.YM}-01`);
        row.state = row.JURISDICTION || row.STATE || "VIC";
      });
      vicAnnual.forEach((row) => {
        row.state = row.JURISDICTION || row.STATE || "VIC";
      });

      monthlyByState = d3.group(vicMonthly, (row) => row.state);
      annualByState = d3.group(annualAllJurisdiction, (row) => row.JURISDICTION);
      ageProfiles = buildAgeProfiles(ageGroups);
      nationalAgeProfile = buildNationalAgeProfile(ageGroups);
      cachedSummary = buildStateSummary(activeState, { rates, ageGroups, locationByYear, regionalDiff });
      nationalStats = buildNationalStats({ rates, locationByYear, regionalDiff });
      window.nationalStats = nationalStats;
      window.ageProfiles = ageProfiles;
      window.nationalAgeProfile = nationalAgeProfile;
      window.ageChartContext = ageChartContext;
      window.covidChartContext = covidChartContext;
      window.detectionChartContext = detectionChartContext;
      cachedRatioRows = ratioRows;
      window.cachedRatioRows = cachedRatioRows;

      populateStateSwitcher();
      renderHeroCard(cachedSummary);
      renderAgeProfiles();
      buildCovidFocusControls();
      renderCovidChart(viewState.covidFocus);
      buildDetectionFocusControls(ratioRows);
      renderDetectionChart(viewState.detectionFocus, ratioRows);
      initSectionObserver();
    })
    .catch((error) => {
      console.error("Failed to load datasets", error);
      showGlobalError();
    });

  function resolveState(input) {
    if (!input) return "NSW";
    const trimmed = String(input).trim();
    const upper = trimmed.toUpperCase();
    if (STATE_NAME_MAP[upper]) return upper;
    const byName = STATE_CODE_BY_NAME[trimmed.toLowerCase()];
    return byName || "NSW";
  }

  function wireBaseControls() {
    if (scrollTopButton) {
      scrollTopButton.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    Array.from(navLinks).forEach((link) => {
      link.addEventListener("click", (event) => {
        const hash = link.getAttribute("href");
        if (!hash || !hash.startsWith("#")) {
          return;
        }
        const target = document.querySelector(hash);
        if (!target) {
          return;
        }
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        if (window.history?.pushState) {
          window.history.pushState(null, "", hash);
        } else {
          window.location.hash = hash;
        }
      });
    });

    ageModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode;
        if (!mode || viewState.ageMode === mode) return;
        viewState.ageMode = mode;
        setActivePill(ageModeButtons, button);
        drawAgeProfile();
      });
    });

    explorationTiles.forEach((tile) => {
      tile.addEventListener("click", (event) => {
        const targetId = tile.getAttribute("href");
        if (!targetId || !targetId.startsWith("#")) {
          return;
        }
        const target = document.querySelector(targetId);
        if (!target) {
          return;
        }
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        if (window.history?.pushState) {
          window.history.pushState(null, "", targetId);
        } else {
          window.location.hash = targetId;
        }
      });
    });
  }

  function setActivePill(buttons, activeButton) {
    buttons.forEach((btn) => btn.classList.toggle("active", btn === activeButton));
  }

  function hydrateHeading(stateCode) {
    const name = STATE_NAME_MAP[stateCode] || stateCode;
    document.getElementById("state-tag").textContent = stateCode;
    document.getElementById("state-heading").textContent = `${name} speeding enforcement insights`;
    document.getElementById("state-subheading").textContent = `Data stories curated for ${name}.`;
  }

  function populateStateSwitcher() {
    if (!stateSwitcher) return;
    stateSwitcher.innerHTML = "";
    Object.entries(STATE_NAME_MAP)
      .sort((a, b) => a[1].localeCompare(b[1]))
      .forEach(([code, name]) => {
        const option = document.createElement("option");
        option.value = code;
        option.textContent = name;
        if (code === activeState) {
          option.selected = true;
        }
        stateSwitcher.appendChild(option);
      });

    stateSwitcher.addEventListener("change", (event) => {
      if (event.target.value) {
        window.location.href = `state.html?state=${encodeURIComponent(event.target.value)}`;
      }
    });
  }

  function showGlobalError() {
    document.querySelectorAll(".chart").forEach((node) => {
      node.innerHTML = "<p class=\"chart-empty\">Datasets are unavailable right now. Please refresh.</p>";
    });
  }

  function renderAgeProfiles() {
    buildAgeFocusControls();
    drawAgeProfile();
    renderAgeLegend();
  }

  function renderAgeLegend() {
    const entries = AGE_ORDER.map((age, index) => ({ label: age, color: AGE_COLOR_RANGE[index % AGE_COLOR_RANGE.length] }));
    renderChartLegend("age-legend", entries);
  }

  function buildAgeFocusControls() {
    if (!ageFocusContainer) return;
    const availableStates = Array.from(ageProfiles.keys()).filter((code) => STATE_NAME_MAP[code]);
    if (!availableStates.length) {
      ageFocusContainer.innerHTML = '<span class="chart-note">Load age data to compare jurisdictions.</span>';
      return;
    }
    availableStates.sort((a, b) => (STATE_NAME_MAP[a] || a).localeCompare(STATE_NAME_MAP[b] || b));
    if (!availableStates.includes(viewState.ageFocus)) {
      viewState.ageFocus = availableStates.includes(activeState) ? activeState : availableStates[0];
    }
    ageFocusContainer.innerHTML = "";
    availableStates.forEach((code) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.state = code;
      button.className = `pill${viewState.ageFocus === code ? " active" : ""}`;
      button.textContent = STATE_NAME_MAP[code] || code;
      button.addEventListener("click", () => {
        if (viewState.ageFocus === code) return;
        viewState.ageFocus = code;
        updateAgeFocusButtons();
        drawAgeProfile();
      });
      ageFocusContainer.appendChild(button);
    });
  }

  function updateAgeFocusButtons() {
    if (!ageFocusContainer) return;
    ageFocusContainer.querySelectorAll("button").forEach((node) => {
      node.classList.toggle("active", node.dataset.state === viewState.ageFocus);
    });
  }

  function buildCovidFocusControls() {
    if (!covidFocusContainer) return;
    covidFocusContainer.innerHTML = "";
    const availableStates = new Set();
    if (monthlyByState && typeof monthlyByState.forEach === "function") {
      monthlyByState.forEach((_, key) => availableStates.add(key));
    }
    if (annualByState && typeof annualByState.forEach === "function") {
      annualByState.forEach((_, key) => availableStates.add(key));
    }
    const stateCodes = Array.from(availableStates).filter((code) => STATE_NAME_MAP[code]);
    if (!stateCodes.length) {
      covidFocusContainer.innerHTML = '<span class="chart-note">Upload the q3 timeline for at least one state to compare jurisdictions.</span>';
      viewState.covidFocus = activeState;
      return;
    }
    stateCodes.sort((a, b) => (STATE_NAME_MAP[a] || a).localeCompare(STATE_NAME_MAP[b] || b));
    if (!stateCodes.includes(viewState.covidFocus)) {
      viewState.covidFocus = stateCodes.includes(activeState) ? activeState : stateCodes[0];
    }
    stateCodes.forEach((code) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.state = code;
      button.className = `pill${viewState.covidFocus === code ? " active" : ""}`;
      button.textContent = STATE_NAME_MAP[code] || code;
      button.addEventListener("click", () => {
        if (viewState.covidFocus === code) return;
        viewState.covidFocus = code;
        buildCovidFocusControls();
        renderCovidChart(viewState.covidFocus);
      });
      covidFocusContainer.appendChild(button);
    });
  }

  function renderCovidChart(stateCode = viewState.covidFocus) {
    const container = d3.select("#covid-chart");
    const story = document.getElementById("covid-story");
    if (!container.node() || !story) {
      covidChartContext = null;
      return;
    }
    const focusState = stateCode || viewState.covidFocus || activeState;

    // Priority 1: Try to use annual data for butterfly chart
    const annual = annualByState.get(focusState);
    if (annual?.length) {
      drawCovidAnnualFallback(container, story, annual, focusState);
      return;
    }

    // Priority 2: Fall back to monthly stacked area if no annual data
    const monthly = monthlyByState.get(focusState);
    if (monthly?.length) {
      drawCovidStackedArea(container, story, monthly, focusState);
      return;
    }

    // Priority 3: Show empty state if no data at all
    covidChartContext = null;
    container.selectAll("*").remove();
    renderChartLegend("covid-legend", []);
    container.append("p").attr("class", "chart-empty").text("COVID-era enforcement data is unavailable for this state.");
    story.textContent = `Upload camera versus police monthly or annual files for ${STATE_NAME_MAP[focusState] || focusState} to visualise pandemic enforcement.`;
  }


  function initSectionObserver() {
    if (!navLinks.length || typeof IntersectionObserver === "undefined") {
      return;
    }

    const pairs = Array.from(navLinks)
      .map((link) => {
        const hash = link.getAttribute("href");
        if (!hash || !hash.startsWith("#")) {
          return null;
        }
        const section = document.querySelector(hash);
        return section ? { link, section } : null;
      })
      .filter(Boolean);

    if (!pairs.length) {
      return;
    }

    const setActiveLink = (activeLink) => {
      navLinks.forEach((link) => link.classList.toggle("active", link === activeLink));
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length === 0) {
          return;
        }
        const match = pairs.find((pair) => pair.section === visible[0].target);
        if (match) {
          setActiveLink(match.link);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0.1 }
    );

    pairs.forEach(({ section }) => observer.observe(section));
    setActiveLink(pairs[0].link);
  }
})();
