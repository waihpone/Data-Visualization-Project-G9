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
  const AGE_ORDER = ["0-16", "17-25", "26-39", "40-64", "65 and over"];
  const AGE_COLOR_RANGE = ["#0072B2", "#56B4E9", "#009E73", "#E69F00", "#CC79A7"];
  const LOCATION_BUCKETS = ["Major Cities of Australia", "Inner Regional Australia", "Outer Regional Australia", "Remote Australia", "Very Remote Australia"];
  const REMOTE_FAMILY = new Set(["Outer Regional Australia", "Remote Australia", "Very Remote Australia"]);
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

  const params = new URLSearchParams(window.location.search);
  const requestedState = params.get("state");
  const activeState = resolveState(requestedState);
  const viewState = {
    ageMode: "absolute",
    ageFocus: activeState,
    covidFocus: activeState,
    remotenessView: "share",
    detectionFocus: activeState,
    rateView: "state",
  };

  const navLinks = document.querySelectorAll(".story-nav a");
  const scrollTopButton = document.getElementById("scroll-top");
  const stateSwitcher = document.getElementById("state-switcher");
  const heroCallouts = document.getElementById("hero-callouts");
  const heroNarrativeList = document.getElementById("hero-narrative-list");
  const ageModeButtons = Array.from(document.querySelectorAll("#age-tools .pill"));
  const ageFocusContainer = document.getElementById("age-focus");
  const covidFocusContainer = document.getElementById("covid-focus");
  const remotenessButtons = Array.from(document.querySelectorAll("#remoteness-tools .pill"));
  const detectionFocusContainer = document.getElementById("detection-focus");
  const rateButtons = Array.from(document.querySelectorAll("#rate-tools button[data-rate-view]"));
  const explorationTiles = Array.from(document.querySelectorAll(".exploration-grid a"));

  let ageProfiles = new Map();
  let nationalAgeProfile = null;
  const remotenessCache = new Map();
  let cachedSummary = null;
  let nationalStats = null;
  let cachedRatioRows = [];
  let rateContext = null;
  let monthlyByState = new Map();
  let annualByState = new Map();
  let rateScatterData = [];
  let ageChartContext = null;
  let detectionChartContext = null;
  let covidChartContext = null;

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
      cachedRatioRows = ratioRows;
      rateContext = { rates, locationByYear, regionalDiff };
      rateScatterData = buildRateScatterDataset(rates, locationByYear, regionalDiff);

      populateStateSwitcher();
      renderHeroCard(cachedSummary);
      renderAgeProfiles();
      renderRemotenessChart(activeState);
      buildCovidFocusControls();
      renderCovidChart(viewState.covidFocus);
      buildDetectionFocusControls(ratioRows);
      renderDetectionChart(viewState.detectionFocus, ratioRows);
      renderRateCard();
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

    ageModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode;
        if (!mode || viewState.ageMode === mode) return;
        viewState.ageMode = mode;
        setActivePill(ageModeButtons, button);
        drawAgeProfile();
      });
    });

    remotenessButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const next = button.dataset.view;
        if (!next || viewState.remotenessView === next) return;
        viewState.remotenessView = next;
        setActivePill(remotenessButtons, button);
        drawRemotenessChart(remotenessCache.get(activeState));
      });
    });

    rateButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.rateView;
        if (!mode || viewState.rateView === mode) return;
        viewState.rateView = mode;
        setActivePill(rateButtons, button);
        renderRateCard();
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

  function renderHeroCard(summary) {
    const heroTitle = document.getElementById("hero-title");
    const heroSummary = document.getElementById("hero-summary");
    const heroBadges = document.getElementById("hero-badges");
    const heroStats = document.getElementById("hero-stats");

    if (!summary) {
      heroTitle.textContent = "We need more data for this state";
      heroSummary.textContent = "Historical rate, age, or regional files for this jurisdiction were not supplied.";
      heroBadges.innerHTML = "";
      heroStats.innerHTML = "";
      renderHeroNarrative(null);
      return;
    }

    heroTitle.textContent = `${summary.name} · ${summary.year}`;
    const remoteCompare =
      summary.remoteShare != null && nationalStats?.remoteShare != null
        ? ` Remote share: ${formatPercent(summary.remoteShare)} (AUS ${formatPercent(nationalStats.remoteShare)}).`
        : "";
    heroSummary.textContent = `Drivers incurred ${formatNumber(summary.totalFines)} fines (${formatDecimal(summary.ratePer10k)} per 10k licence holders).${remoteCompare}`;

    heroBadges.innerHTML = "";
    if (summary.topAgeGroup) {
      heroBadges.appendChild(createBadge(`Peak age: ${summary.topAgeGroup.label}`));
    }
    if (summary.topRegion) {
      heroBadges.appendChild(createBadge(`Top locale: ${summary.topRegion.label}`));
    }
    if (summary.remoteShare != null) {
      heroBadges.appendChild(createBadge(`Remote share: ${formatPercent(summary.remoteShare)}`));
    }

    heroStats.innerHTML = "";
    const stats = [
      { label: "Latest fines", value: formatNumber(summary.totalFines), meta: `${summary.year}` },
      { label: "Licences", value: formatNumber(summary.licences), meta: "Drivers on record" },
      { label: "Rate / 10k", value: formatDecimal(summary.ratePer10k), meta: "Fines per 10k licences" },
    ];
    stats.forEach((item) => heroStats.appendChild(createHeroStat(item)));
    renderHeroCallouts(summary);
    renderHeroNarrative(summary);
  }

  function createBadge(text) {
    const badge = document.createElement("span");
    badge.className = "badge badge--info";
    badge.textContent = text;
    return badge;
  }

  function createHeroStat({ label, value, meta }) {
    const wrapper = document.createElement("div");
    wrapper.className = "hero-stat";
    wrapper.innerHTML = `
      <p class="hero-stat-label">${label}</p>
      <p class="hero-stat-value">${value}</p>
      <p class="hero-stat-meta">${meta}</p>
    `;
    return wrapper;
  }

  function renderHeroCallouts(summary) {
    if (!heroCallouts) return;
    heroCallouts.innerHTML = "";
    const callouts = [];
    if (summary.region) {
      callouts.push({ label: "Top region", value: summary.region.label, meta: formatNumber(summary.region.value || summary.region.fines || 0) });
    }
    if (summary.detectionSplit) {
      callouts.push({ label: `Camera share (${summary.detectionSplit.year})`, value: formatPercent(summary.detectionSplit.cameraShare), meta: `${formatNumber(summary.detectionSplit.camera)} camera fines` });
    }
    if (summary.policeCameraRatio) {
      callouts.push({ label: `Police/camera ratio`, value: summary.policeCameraRatio.value.toFixed(2), meta: `${summary.policeCameraRatio.year}` });
    }
    if (summary.remoteShare != null && !callouts.some((c) => c.label.includes("Remote"))) {
      callouts.push({ label: "Remote share", value: formatPercent(summary.remoteShare), meta: summary.region?.year ? `${summary.region.year}` : "Latest year" });
    }
    if (summary.topAgeGroup && callouts.length < 3) {
      callouts.push({ label: "Peak age", value: summary.topAgeGroup.label, meta: formatNumber(summary.topAgeGroup.value || summary.topAgeGroup.fines || 0) });
    }

    if (!callouts.length) {
      heroCallouts.innerHTML = "<p class=\"chart-note\">Callouts will appear once more dataset coverage is available.</p>";
      return;
    }

    callouts.slice(0, 3).forEach((callout) => {
      heroCallouts.appendChild(createCallout(callout));
    });
  }

  function renderHeroNarrative(summary) {
    if (!heroNarrativeList) return;
    heroNarrativeList.innerHTML = "";
    if (!summary) {
      heroNarrativeList.innerHTML = '<li>Upload statewide datasets to unlock narrative beats.</li>';
      return;
    }

    const beats = [];
    beats.push(
      `${summary.name} issued ${formatNumber(summary.totalFines)} fines in ${summary.year}, translating to ${formatDecimal(summary.ratePer10k)} penalties per 10k licence holders.`
    );
    if (summary.topAgeGroup) {
      beats.push(`${summary.topAgeGroup.label} drivers dominate the ledger with ${formatNumber(summary.topAgeGroup.value)} offences, comfortably ahead of other cohorts.`);
    }
    if (summary.topRegion) {
      beats.push(`${summary.topRegion.label} shouldered the heaviest regional load at ${formatNumber(summary.topRegion.value)} fines, signalling where enforcement pressure lands first.`);
    }
    if (summary.remoteShare != null && nationalStats?.remoteShare != null) {
      const delta = summary.remoteShare - nationalStats.remoteShare;
      beats.push(
        `Remote and outer regional corridors account for ${formatPercent(summary.remoteShare)} of this state's fines${delta ? `, ${delta > 0 ? "above" : "below"} the Australian average of ${formatPercent(nationalStats.remoteShare)}` : ""
        }.`
      );
    }
    if (summary.detectionSplit) {
      beats.push(
        `Cameras captured ${formatPercent(summary.detectionSplit.cameraShare)} of recent detections (${summary.detectionSplit.year}), equal to ${formatNumber(
          summary.detectionSplit.camera
        )} fines across automated networks.`
      );
    }

    if (!beats.length) {
      heroNarrativeList.innerHTML = '<li>Supply age, regional, or detection files to craft story beats.</li>';
      return;
    }

    heroNarrativeList.innerHTML = beats.map((text) => `<li>${text}</li>`).join("");
  }

  function createCallout({ label, value, meta }) {
    const node = document.createElement("div");
    node.className = "callout";
    node.innerHTML = `
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${meta || ""}</small>
    `;
    return node;
  }

  function buildStateSummary(stateCode, { rates, ageGroups, locationByYear, regionalDiff }) {
    const rateRows = rates.filter((row) => row.JURISDICTION === stateCode);
    if (!rateRows.length) return null;
    const latestRate = rateRows.reduce((latest, row) => (row.YEAR > latest.YEAR ? row : latest), rateRows[0]);
    const ageRows = ageGroups.filter((row) => row.JURISDICTION === stateCode);
    const topAgeGroup = ageRows.length ? d3.greatest(ageRows, (row) => row["Sum(FINES)"]) : null;

    const stateLocationYears = locationByYear.filter((row) => row.JURISDICTION === stateCode);
    const latestLocationYear = stateLocationYears.length ? d3.max(stateLocationYears, (row) => row.YEAR) : null;
    let topRegion = null;
    if (latestLocationYear != null) {
      const rows = stateLocationYears.filter((row) => row.YEAR === latestLocationYear);
      if (rows.length) {
        const leader = d3.greatest(rows, (row) => row["FINES (Sum)"] || 0);
        if (leader) {
          topRegion = { label: leader.LOCATION, value: leader["FINES (Sum)"] };
        }
      }
    }
    if (!topRegion) {
      const fallbackRows = regionalDiff.filter((row) => row.JURISDICTION === stateCode);
      if (fallbackRows.length) {
        const fallback = d3.greatest(fallbackRows, (row) => row["Sum(FINES)"] || 0);
        if (fallback) {
          topRegion = { label: fallback.LOCATION, value: fallback["Sum(FINES)"] };
        }
      }
    }

    let remoteShare = null;
    if (latestLocationYear != null) {
      const rows = stateLocationYears.filter((row) => row.YEAR === latestLocationYear);
      const total = d3.sum(rows, (row) => row["FINES (Sum)"] || 0);
      if (total > 0) {
        const remote = d3.sum(rows.filter((row) => REMOTE_FAMILY.has(row.LOCATION)), (row) => row["FINES (Sum)"] || 0);
        remoteShare = remote / total;
      }
    }

    return {
      code: stateCode,
      name: STATE_NAME_MAP[stateCode] || stateCode,
      year: latestRate.YEAR,
      ratePer10k: latestRate.RATE_PER_10K,
      totalFines: latestRate["Sum(FINES)"] || 0,
      licences: latestRate.LICENCES || 0,
      topAgeGroup: topAgeGroup ? { label: topAgeGroup.AGE_GROUP, value: topAgeGroup["Sum(FINES)"] } : null,
      topRegion,
      region: topRegion,
      remoteShare,
    };
  }

  function buildRateScatterDataset(rates, locationByYear, regionalDiff) {
    if (!rates?.length) {
      return [];
    }
    const latestByState = d3.rollup(
      rates,
      (values) => values.reduce((latest, row) => (row.YEAR > latest.YEAR ? row : latest), values[0]),
      (row) => row.JURISDICTION
    );
    return Array.from(latestByState, ([code, row]) => {
      const { share } = getRemoteShareForState(code, locationByYear, regionalDiff);
      return {
        code,
        name: STATE_NAME_MAP[code] || code,
        rate: row.RATE_PER_10K,
        remoteShare: share,
      };
    }).filter((entry) => Number.isFinite(entry.rate) && entry.remoteShare != null);
  }

  function buildAgeProfiles(rows) {
    if (!rows?.length) {
      return new Map();
    }
    return d3.rollup(
      rows,
      (values) => {
        const total = d3.sum(values, (row) => row["Sum(FINES)"] || 0);
        const series = AGE_ORDER.map((age) => {
          const match = values.find((row) => row.AGE_GROUP === age);
          const value = match ? match["Sum(FINES)"] || 0 : 0;
          return { ageGroup: age, value, share: total ? value / total : 0 };
        });
        return { code: values[0]?.JURISDICTION, total, series };
      },
      (row) => row.JURISDICTION
    );
  }

  function buildNationalAgeProfile(rows) {
    if (!rows?.length) {
      return null;
    }
    const grouped = d3.rollup(rows, (values) => d3.sum(values, (row) => row["Sum(FINES)"] || 0), (row) => row.AGE_GROUP);
    const total = Array.from(grouped.values()).reduce((acc, value) => acc + value, 0);
    const series = AGE_ORDER.map((age) => {
      const value = grouped.get(age) || 0;
      return { ageGroup: age, value, share: total ? value / total : 0 };
    });
    return { code: "AUS", total, series };
  }

  function buildNationalStats({ rates, locationByYear, regionalDiff }) {
    if (!rates.length) {
      return null;
    }
    const latestYear = d3.max(rates, (row) => row.YEAR);
    const latestRows = rates.filter((row) => row.YEAR === latestYear);
    const avgRate = latestRows.length ? d3.mean(latestRows, (row) => row.RATE_PER_10K) : null;
    const leader = latestRows.length ? d3.greatest(latestRows, (row) => row.RATE_PER_10K) : null;
    const remoteShare = computeNationalRemoteShare(locationByYear, regionalDiff);
    return {
      latestYear,
      avgRate,
      leaderCode: leader?.JURISDICTION || null,
      leaderRate: leader?.RATE_PER_10K || null,
      leaderName: leader ? STATE_NAME_MAP[leader.JURISDICTION] || leader.JURISDICTION : null,
      remoteShare,
    };
  }

  function computeNationalRemoteShare(locationByYear, regionalDiff) {
    if (locationByYear.length) {
      const latestYear = d3.max(locationByYear, (row) => row.YEAR);
      const rows = locationByYear.filter((row) => row.YEAR === latestYear);
      const total = d3.sum(rows, (row) => row["FINES (Sum)"] || 0);
      if (total > 0) {
        const remote = d3.sum(rows.filter((row) => REMOTE_FAMILY.has(row.LOCATION)), (row) => row["FINES (Sum)"] || 0);
        return remote / total;
      }
    }
    if (regionalDiff.length) {
      const total = d3.sum(regionalDiff, (row) => row["Sum(FINES)"] || 0);
      if (total > 0) {
        const remote = d3.sum(regionalDiff.filter((row) => REMOTE_FAMILY.has(row.LOCATION)), (row) => row["Sum(FINES)"] || 0);
        return remote / total;
      }
    }
    return null;
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

  function drawAgeProfile() {
    const container = d3.select("#age-profile");
    const storyNode = document.getElementById("age-story");
    if (!container.node() || !storyNode) {
      ageChartContext = null;
      return;
    }

    let focusState = viewState.ageFocus;
    const availableStates = ageProfiles && typeof ageProfiles.keys === "function" ? Array.from(ageProfiles.keys()) : [];
    if (!focusState || !ageProfiles.has(focusState)) {
      const fallback = availableStates.includes(activeState) ? activeState : availableStates[0];
      focusState = fallback;
      viewState.ageFocus = fallback;
      updateAgeFocusButtons();
    }

    if (!focusState) {
      container.selectAll("*").remove();
      ageChartContext = null;
      container.append("p").attr("class", "chart-empty").text("The age dataset is unavailable.");
      storyNode.textContent = "Upload q1 age data to unlock this view.";
      return;
    }

    const profile = ageProfiles.get(focusState);
    if (!profile || !profile.total) {
      container.selectAll("*").remove();
      ageChartContext = null;
      container
        .append("p")
        .attr("class", "chart-empty")
        .text(`Age breakdowns for ${STATE_NAME_MAP[focusState] || focusState} are still loading.`);
      storyNode.textContent = `Provide age-segment fines for ${STATE_NAME_MAP[focusState] || focusState} to unlock the polar distribution.`;
      return;
    }

    const valueKey = viewState.ageMode === "share" ? "share" : "value";
    const referenceProfiles = Array.from(ageProfiles.values()).filter((entry) => entry.total > 0);
    const maxValue =
      valueKey === "share"
        ? 1
        : d3.max(referenceProfiles, (entry) => d3.max(entry.series, (node) => node.value)) || profile.total;

    const chartSize = Math.min(container.node()?.clientWidth || 420, 520);
    const totalHeight = chartSize;
    const radius = chartSize / 2 - 16;
    const context = ensureAgeChartContext(container, chartSize, totalHeight);
    context.radius = radius;

    const angle = d3.scaleBand().domain(AGE_ORDER).range([0, 2 * Math.PI]).align(0);
    const radialScale = d3.scaleLinear().domain([0, maxValue]).range([radius * 0.2, radius]).nice();
    const nationalSegments = buildAgeSegments(nationalAgeProfile, valueKey, angle);
    const stateSegments = buildAgeSegments(profile, valueKey, angle);
    const nationalLookup = new Map(nationalSegments.map((segment) => [segment.ageGroup, segment]));
    const nationalArc = d3
      .arc()
      .innerRadius((d) => Math.max(radialScale(d.value) - 6, radialScale(0)))
      .outerRadius((d) => radialScale(d.value))
      .startAngle((d) => d.startAngle)
      .endAngle((d) => d.endAngle)
      .padAngle(0.015)
      .padRadius(radialScale(0));
    const stateArc = d3
      .arc()
      .innerRadius(radialScale(0))
      .outerRadius((d) => radialScale(d.value))
      .startAngle((d) => d.startAngle)
      .endAngle((d) => d.endAngle)
      .padAngle(0.02)
      .padRadius(radialScale(0));
    const transition = context.root.transition().duration(520).ease(d3.easeCubicInOut);

    const rings = radialScale.ticks(3);
    context.gridGroup
      .selectAll("circle")
      .data(rings, (d) => d)
      .join((enter) =>
        enter
          .append("circle")
          .attr("fill", "none")
          .attr("stroke", "rgba(15,35,51,0.15)")
          .attr("stroke-dasharray", "4 6")
      )
      .transition(transition)
      .attr("r", (d) => radialScale(d));

    context.nationalGroup
      .selectAll("path")
      .data(nationalSegments, (d) => d.ageGroup)
      .join((enter) => enter.append("path").attr("fill", "rgba(15,35,51,0.08)"))
      .transition(transition)
      .attr("d", nationalArc);

    const handlePointer = (event, datum) => {
      const national = nationalLookup.get(datum.ageGroup);
      const stateText = valueKey === "share" ? formatPercent(datum.value) : formatNumber(datum.value);
      const nationalText = national ? (valueKey === "share" ? formatPercent(national.value) : formatNumber(national.value)) : "n/a";
      showTooltip(
        `<strong>${STATE_NAME_MAP[focusState] || focusState} · ${datum.ageGroup}</strong><br/>${stateText} vs ${nationalText} nationally`,
        event
      );
    };

    context.stateGroup
      .selectAll("path")
      .data(stateSegments, (d) => d.ageGroup)
      .join((enter) =>
        enter
          .append("path")
          .attr("fill-opacity", 0.85)
          .attr("stroke", "rgba(15,35,51,0.35)")
          .attr("stroke-width", 1.4)
      )
      .attr("fill", (d) => context.color(d.ageGroup))
      .on("mousemove", handlePointer)
      .on("mouseleave", hideTooltip)
      .transition(transition)
      .attr("d", stateArc);

    context.labelGroup
      .selectAll("text")
      .data(stateSegments, (d) => d.ageGroup)
      .join((enter) =>
        enter
          .append("text")
          .attr("text-anchor", "middle")
          .attr("fill", "#102135")
          .attr("font-size", "0.75rem")
      )
      .transition(transition)
      .attr("x", (d) => Math.cos(((d.startAngle + d.endAngle) / 2) - Math.PI / 2) * (radius + 12))
      .attr("y", (d) => Math.sin(((d.startAngle + d.endAngle) / 2) - Math.PI / 2) * (radius + 12))
      .text((d) => d.ageGroup);

    const peak = profile.series.length ? d3.greatest(profile.series, (d) => d[valueKey === "share" ? "share" : "value"]) : null;
    context.peakLabel.transition(transition).text(peak ? `${peak.ageGroup}` : "");

    storyNode.textContent = buildAgeStory(profile, valueKey, focusState);
  }

  function ensureAgeChartContext(container, chartSize, totalHeight) {
    if (!ageChartContext || Math.abs(chartSize - ageChartContext.chartSize) > 4) {
      ageChartContext = createAgeChartContext(container, chartSize, totalHeight);
    } else {
      ageChartContext.chartSize = chartSize;
      ageChartContext.root.attr("viewBox", `0 0 ${chartSize} ${totalHeight}`);
      ageChartContext.center.attr("transform", `translate(${chartSize / 2}, ${chartSize / 2})`);
    }
    return ageChartContext;
  }

  function createAgeChartContext(container, chartSize, totalHeight) {
    container.selectAll("*").remove();
    const root = container.append("svg").attr("viewBox", `0 0 ${chartSize} ${totalHeight}`).attr("preserveAspectRatio", "xMidYMid meet");
    const center = root.append("g").attr("transform", `translate(${chartSize / 2}, ${chartSize / 2})`);
    const gridGroup = center.append("g").attr("class", "age-radial__grid");
    const nationalGroup = center.append("g").attr("class", "age-radial__national");
    const stateGroup = center.append("g").attr("class", "age-radial__state");
    const labelGroup = center.append("g").attr("class", "age-radial__labels");
    const peakLabel = center
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#102135")
      .attr("font-size", "1rem")
      .attr("font-weight", 600);
    const color = d3.scaleOrdinal().domain(AGE_ORDER).range(AGE_COLOR_RANGE);
    return { root, center, gridGroup, nationalGroup, stateGroup, labelGroup, peakLabel, chartSize, color };
  }

  function buildAgeSegments(profile, valueKey, angleScale) {
    if (!profile) {
      return AGE_ORDER.map((age) => ({
        ageGroup: age,
        value: 0,
        startAngle: angleScale(age),
        endAngle: angleScale(age) + angleScale.bandwidth(),
      }));
    }
    return AGE_ORDER.map((age) => {
      const point = profile.series.find((d) => d.ageGroup === age) || { share: 0, value: 0 };
      const value = valueKey === "share" ? point.share : point.value;
      return {
        ageGroup: age,
        value,
        startAngle: angleScale(age),
        endAngle: angleScale(age) + angleScale.bandwidth(),
      };
    });
  }

  function buildAgeStory(profile, valueKey, focusState) {
    if (!profile || !profile.series?.length) {
      return `${STATE_NAME_MAP[focusState] || focusState || "This state"} still needs age-level fines to narrate this chart.`;
    }
    const valueField = valueKey === "share" ? "share" : "value";
    const formatValue = valueKey === "share" ? formatPercent : formatNumber;
    const stateName = STATE_NAME_MAP[focusState] || focusState;
    const sorted = [...profile.series].sort((a, b) => (b[valueField] || 0) - (a[valueField] || 0));
    const lead = sorted[0];
    const runner = sorted[1];
    const laggard = sorted[sorted.length - 1];
    const parts = [];
    if (lead) {
      parts.push(`${stateName} sees ${lead.ageGroup} leading with ${formatValue(lead[valueField] || 0)} ${valueKey === "share" ? "of fines" : "fines"}.`);
    }
    if (lead && runner && lead !== runner) {
      const gap = (lead[valueField] || 0) - (runner[valueField] || 0);
      if (gap !== 0) {
        parts.push(`${lead.ageGroup} sits ${formatAgeDifference(gap, valueKey)} ${gap > 0 ? "ahead of" : "behind"} ${runner.ageGroup}.`);
      }
    }
    if (laggard && laggard !== lead) {
      parts.push(`${laggard.ageGroup} remains the smallest slice at ${formatValue(laggard[valueField] || 0)}.`);
    }
    if (nationalAgeProfile && lead) {
      const nationalPeer = nationalAgeProfile.series.find((entry) => entry.ageGroup === lead.ageGroup);
      if (nationalPeer) {
        const diff = (lead[valueField] || 0) - (nationalPeer[valueField] || 0);
        if (diff) {
          const direction = diff > 0 ? "above" : "below";
          parts.push(`${lead.ageGroup} is ${formatAgeDifference(diff, valueKey)} ${direction} the national ${valueKey === "share" ? "share" : "count"}.`);
        }
      }
      const widestGap = profile.series
        .map((point) => {
          const nationalPoint = nationalAgeProfile.series.find((entry) => entry.ageGroup === point.ageGroup);
          if (!nationalPoint) return null;
          return { ageGroup: point.ageGroup, delta: (point[valueField] || 0) - (nationalPoint[valueField] || 0) };
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
      if (widestGap && Math.abs(widestGap.delta) > 0 && (!lead || widestGap.ageGroup !== lead.ageGroup)) {
        const leaning = widestGap.delta > 0 ? "over-indexes" : "lags";
        parts.push(`${widestGap.ageGroup} ${leaning} Australia by ${formatAgeDifference(widestGap.delta, valueKey)}.`);
      }
    }
    return parts.join(" ") || `${stateName} has no dominant cohort yet.`;
  }

  function formatAgeDifference(diff, valueKey) {
    if (valueKey === "share") {
      return `${formatDecimal(Math.abs(diff) * 100, 1)} pts`;
    }
    return formatNumber(Math.abs(diff));
  }

  function renderRemotenessChart(stateCode) {
    if (!rateContext) {
      return;
    }
    if (!remotenessCache.has(stateCode)) {
      remotenessCache.set(stateCode, buildRemotenessViews(stateCode, rateContext.locationByYear, rateContext.regionalDiff));
    }
    drawRemotenessChart(remotenessCache.get(stateCode));
  }

  function buildRemotenessViews(stateCode, locationByYear, regionalDiff) {
    const rows = locationByYear.filter((row) => row.JURISDICTION === stateCode);
    if (!rows.length) {
      return { errorMessage: buildRegionalFallbackStory(stateCode, regionalDiff), stateCode };
    }
    const latestYear = d3.max(rows, (row) => row.YEAR);
    const stateRows = rows.filter((row) => row.YEAR === latestYear);
    const stateTotals = d3.rollup(stateRows, (values) => d3.sum(values, (row) => row["FINES (Sum)"] || 0), (row) => row.LOCATION);
    const nationalCandidates = locationByYear.filter((row) => row.YEAR === latestYear);
    const nationalRows = nationalCandidates.length ? nationalCandidates : locationByYear;
    const nationalTotals = d3.rollup(nationalRows, (values) => d3.sum(values, (row) => row["FINES (Sum)"] || 0), (row) => row.LOCATION);
    const stateTotal = Array.from(stateTotals.values()).reduce((acc, value) => acc + value, 0);
    const nationalTotal = Array.from(nationalTotals.values()).reduce((acc, value) => acc + value, 0);
    const shareRows = LOCATION_BUCKETS.map((bucket) => {
      const stateValue = stateTotals.get(bucket) || 0;
      const nationalValue = nationalTotals.get(bucket) || 0;
      return {
        label: bucket,
        stateValue: stateTotal ? stateValue / stateTotal : 0,
        nationalValue: nationalTotal ? nationalValue / nationalTotal : 0,
        stateAbsolute: stateValue,
        nationalAbsolute: nationalValue,
      };
    });
    const absoluteRows = shareRows.map((row) => ({
      label: row.label,
      stateValue: row.stateAbsolute,
      nationalValue: row.nationalAbsolute,
    }));
    const metroValue = stateTotals.get("Major Cities of Australia") || 0;
    const remoteValue = LOCATION_BUCKETS.filter((bucket) => REMOTE_FAMILY.has(bucket)).reduce((acc, bucket) => acc + (stateTotals.get(bucket) || 0), 0);
    return {
      stateCode,
      year: latestYear,
      shareRows,
      absoluteRows,
      remoteShare: stateTotal ? remoteValue / stateTotal : null,
      metroValue,
    };
  }

  function drawRemotenessChart(summary) {
    const container = d3.select("#remoteness-chart");
    const storyNode = document.getElementById("remoteness-story");
    if (!container.node() || !storyNode) {
      return;
    }
    container.selectAll("*").remove();

    if (!summary) {
      container.append("p").attr("class", "chart-empty").text("Spatial data is still loading.");
      storyNode.textContent = "Hang tight while we fetch the regional dataset.";
      return;
    }

    if (summary.errorMessage) {
      container.append("p").attr("class", "chart-empty").text("We do not have metro/regional splits for this state.");
      storyNode.textContent = summary.errorMessage;
      return;
    }

    const dataset = viewState.remotenessView === "share" ? summary.shareRows : summary.absoluteRows;
    const valueFormatter = viewState.remotenessView === "share" ? formatPercent : formatNumber;
    const height = 320;
    const margin = { top: 30, right: 30, bottom: 40, left: 180 };
    const { svg, width } = createResponsiveSvg(container, { height });
    const xDomain = viewState.remotenessView === "share" ? [0, 1] : [0, d3.max(dataset, (row) => Math.max(row.stateValue, row.nationalValue)) * 1.1 || 1];
    const x = d3.scaleLinear().domain(xDomain).range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(dataset.map((row) => row.label)).range([margin.top, height - margin.bottom]).padding(0.5);

    svg
      .append("g")
      .attr("class", "remoteness-grid")
      .selectAll("line")
      .data(x.ticks(5))
      .join("line")
      .attr("x1", (d) => x(d))
      .attr("x2", (d) => x(d))
      .attr("y1", margin.top - 10)
      .attr("y2", height - margin.bottom)
      .attr("stroke", "rgba(15,35,51,0.12)");

    const rows = svg
      .append("g")
      .attr("class", "remoteness-dumbbells")
      .selectAll("g")
      .data(dataset)
      .join("g")
      .attr("transform", (d) => `translate(0, ${y(d.label)})`);

    rows
      .append("line")
      .attr("x1", (d) => x(d.nationalValue))
      .attr("x2", (d) => x(d.stateValue))
      .attr("y1", 0)
      .attr("y2", 0)
      .attr("stroke", "rgba(0,158,115,0.45)")
      .attr("stroke-width", 2);

    rows
      .append("circle")
      .attr("cx", (d) => x(d.nationalValue))
      .attr("r", 6)
      .attr("fill", "#ffffff")
      .attr("stroke", "#9ba7b9")
      .attr("stroke-width", 1.5);

    rows
      .append("circle")
      .attr("cx", (d) => x(d.stateValue))
      .attr("r", 8)
      .attr("fill", "#009E73")
      .attr("stroke", "#005640")
      .attr("stroke-width", 2)
      .on("mousemove", (event, datum) => {
        showTooltip(
          `<strong>${datum.label}</strong><br/>${STATE_NAME_MAP[summary.stateCode] || summary.stateCode}: ${valueFormatter(datum.stateValue)}<br/>Australia: ${valueFormatter(datum.nationalValue)}`,
          event
        );
      })
      .on("mouseleave", hideTooltip);

    svg
      .append("g")
      .attr("transform", `translate(0, ${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(valueFormatter))
      .call((axis) => axis.selectAll("text").attr("fill", "#102135"))
      .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.25)"));

    svg
      .append("g")
      .attr("transform", `translate(${margin.left - 15},0)`)
      .call(d3.axisLeft(y).tickSize(0))
      .call((axis) => axis.selectAll("text").attr("fill", "#102135").style("font-weight", 600))
      .call((axis) => axis.selectAll("path,line").remove());

    const xLabel = viewState.remotenessView === "share" ? "Share of fines (state vs national)" : "Fines issued (state vs national)";
    svg
      .append("text")
      .attr("x", (margin.left + width - margin.right) / 2)
      .attr("y", height - 5)
      .attr("text-anchor", "middle")
      .attr("fill", "#102135")
      .attr("font-size", "0.85rem")
      .text(xLabel);

    addRemotenessLegend(svg, width, margin, valueFormatter);
    updateRemotenessStory(summary, dataset);
  }

  function addRemotenessLegend(svg, width, margin, formatter) {
    const legend = svg.append("g").attr("transform", `translate(${width - margin.right - 180}, ${margin.top - 18})`);
    const entries = [
      { label: "State", color: "#005640", fill: "#009E73" },
      { label: "National", color: "#9ba7b9", fill: "#ffffff" },
    ];
    entries.forEach((entry, index) => {
      const group = legend.append("g").attr("transform", `translate(${index * 110}, 0)`);
      group
        .append("circle")
        .attr("r", 6)
        .attr("fill", entry.fill)
        .attr("stroke", entry.color)
        .attr("stroke-width", 1.5);
      group
        .append("text")
        .attr("x", 12)
        .attr("dy", "0.35em")
        .attr("fill", "#102135")
        .attr("font-size", "0.8rem")
        .text(entry.label);
    });
  }

  function updateRemotenessStory(summary, dataset) {
    const storyNode = document.getElementById("remoteness-story");
    if (!summary) {
      storyNode.textContent = "";
      return;
    }
    const stateName = STATE_NAME_MAP[summary.stateCode] || summary.stateCode;
    if (viewState.remotenessView === "share") {
      const remoteState = dataset.filter((row) => REMOTE_FAMILY.has(row.label)).reduce((acc, row) => acc + row.stateValue, 0);
      const remoteNational = dataset.filter((row) => REMOTE_FAMILY.has(row.label)).reduce((acc, row) => acc + row.nationalValue, 0);
      storyNode.textContent = `${stateName} assigns ${formatPercent(remoteState)} of fines to remote/outer regional areas versus ${formatPercent(remoteNational)} nationally (Year ${summary.year}).`;
    } else {
      const metro = dataset.find((row) => row.label === "Major Cities of Australia");
      const remoteTotals = dataset.filter((row) => REMOTE_FAMILY.has(row.label)).reduce(
        (acc, row) => {
          acc.state += row.stateValue;
          acc.national += row.nationalValue;
          return acc;
        },
        { state: 0, national: 0 }
      );
      if (!metro) {
        storyNode.textContent = `${stateName} requires more spatial detail to compare metro and remote counts.`;
        return;
      }
      storyNode.textContent = `${stateName} logged ${formatNumber(metro.stateValue)} metro fines versus ${formatNumber(remoteTotals.state)} across remote classes in ${summary.year}, compared with ${formatNumber(metro.nationalValue)} and ${formatNumber(remoteTotals.national)} nationally.`;
    }
  }

  function buildRegionalFallbackStory(stateCode, regionalDiff) {
    const rows = regionalDiff.filter((row) => row.JURISDICTION === stateCode);
    if (!rows.length) {
      return "No spatial dataset was provided for this jurisdiction.";
    }
    const leader = d3.greatest(rows, (row) => row["Sum(FINES)"] || 0);
    return `${STATE_NAME_MAP[stateCode]} data only lists ${leader.LOCATION}, so metro-versus-regional patterns cannot be charted yet.`;
  }
  function buildRegionalStory(stateCode, majorValue, config, year) {
    if (!majorValue) {
      return `${STATE_NAME_MAP[stateCode]} recorded no fines in major cities for ${year}, making comparisons inconclusive.`;
    }
    const inner = config[0];
    const outer = config[1];
    const difference = outer.value - inner.value;
    const leaning = difference > 0 ? "remote-heavy" : "metro-leaning";
    return `${STATE_NAME_MAP[stateCode]} issued ${formatNumber(inner.value)} fines in inner regional areas and ${formatNumber(outer.value)} across outer/remote regions in ${year}, indicating a ${leaning} pattern relative to ${formatNumber(majorValue)} metro fines.`;
  }

  /**
   * Build data and scales for the Diverging Area Chart (Butterfly Chart)
   * @param {string} stateCode - The jurisdiction code (e.g., "VIC", "NSW")
   * @param {Array} annualData - The annual data from q3_annual_all_jurisdiction.csv
   * @returns {Object} Object containing pivoted data, scales, and metadata
   */
  function buildButterflyChartData(stateCode, annualData) {
    // Filter data for the specific state
    const stateRows = annualData.filter(row => row.JURISDICTION === stateCode);

    if (!stateRows.length) {
      return {
        pivotedData: [],
        scales: null,
        maxVal: 0,
        error: `No data available for ${STATE_NAME_MAP[stateCode] || stateCode}`
      };
    }

    // Pivot the data: one object per year
    // Target format: [{ year: 2018, camera: 12345, police: 6789 }, ...]
    const pivotedData = Array.from(
      d3.rollup(
        stateRows,
        (values) => {
          const entry = { year: values[0].YEAR };

          // Map "Camera" to camera and "Police" to police
          values.forEach(row => {
            const method = row.DETECTION_METHOD;
            if (method === "Camera") {
              entry.camera = row["FINES (Sum)"] || 0;
            } else if (method === "Police") {
              entry.police = row["FINES (Sum)"] || 0;
            }
          });

          // Ensure both properties exist (default to 0 if missing)
          entry.camera = entry.camera || 0;
          entry.police = entry.police || 0;

          return entry;
        },
        (row) => row.YEAR
      ),
      ([, value]) => value
    ).sort((a, b) => d3.ascending(a.year, b.year));

    // Calculate the maximum fine value found in either category
    const maxVal = d3.max(pivotedData, d => Math.max(d.camera, d.police)) || 0;

    if (maxVal === 0) {
      return {
        pivotedData,
        scales: null,
        maxVal: 0,
        error: `No fine data available for ${STATE_NAME_MAP[stateCode] || stateCode}`
      };
    }

    return {
      pivotedData,
      maxVal,
      error: null
    };
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

  function drawCovidStackedArea(container, storyNode, rows, stateCode) {
    const { pivot, detectionMethods, meta } = buildCovidPivot(rows);
    if (!pivot.length || !detectionMethods.length) {
      covidChartContext = null;
      container.selectAll("*").remove();
      renderChartLegend("covid-legend", []);
      container.append("p").attr("class", "chart-empty").text("COVID-era timeline needs both camera and police rows.");
      storyNode.textContent = `${STATE_NAME_MAP[stateCode] || stateCode} still needs matching detection methods to render this chart.`;
      return;
    }

    const colors = d3.scaleOrdinal().domain(detectionMethods).range(d3.schemeTableau10);
    renderChartLegend(
      "covid-legend",
      detectionMethods.map((method) => ({ label: method, color: colors(method) }))
    );

    const height = 340;
    const margin = { top: 30, right: 30, bottom: 40, left: 60 };
    const measuredWidth = container.node()?.clientWidth || container.node()?.parentNode?.clientWidth || 600;
    if (!covidChartContext || Math.abs(measuredWidth - covidChartContext.width) > 4) {
      container.selectAll("*").remove();
      const { svg, width } = createResponsiveSvg(container, { height });
      covidChartContext = {
        svg,
        width,
        height,
        margin,
      };
      const ctx = covidChartContext;
      ctx.lockdownGroup = svg.append("g").attr("class", "covid-lockdowns");
      ctx.areaGroup = svg.append("g").attr("class", "covid-layers");
      ctx.focusLine = svg
        .append("line")
        .attr("class", "covid-focus-line")
        .attr("stroke", "rgba(15,35,51,0.35)")
        .attr("stroke-width", 1)
        .style("opacity", 0);
      ctx.xAxisGroup = svg.append("g").attr("class", "axis axis--x");
      ctx.yAxisGroup = svg.append("g").attr("class", "axis axis--y");
      ctx.xLabel = svg
        .append("text")
        .attr("class", "axis-label axis-label--x")
        .attr("text-anchor", "middle")
        .attr("fill", "#102135")
        .attr("font-size", "0.85rem")
        .text("Month");
      ctx.yLabel = svg
        .append("text")
        .attr("class", "axis-label axis-label--y")
        .attr("text-anchor", "middle")
        .attr("fill", "#102135")
        .attr("font-size", "0.85rem")
        .text("Monthly fines");
      ctx.pointerRect = svg.append("rect").attr("fill", "transparent").attr("pointer-events", "all");
    }

    const ctx = covidChartContext;
    ctx.width = measuredWidth;
    ctx.svg.attr("viewBox", `0 0 ${ctx.width} ${height}`);
    ctx.xAxisGroup.attr("transform", `translate(0, ${height - margin.bottom})`);
    ctx.yAxisGroup.attr("transform", `translate(${margin.left},0)`);
    ctx.focusLine.attr("y1", margin.top).attr("y2", height - margin.bottom).style("opacity", 0);
    ctx.xLabel.attr("x", (margin.left + ctx.width - margin.right) / 2).attr("y", height - 6);
    ctx.yLabel.attr("transform", `translate(${margin.left - 45}, ${(margin.top + height - margin.bottom) / 2}) rotate(-90)`);

    const xDomain = meta.syntheticDomain || d3.extent(pivot, (row) => row.date);
    if (!xDomain[0] || !xDomain[1]) {
      return;
    }
    if (!meta.syntheticDomain && xDomain[0].getTime() === xDomain[1].getTime()) {
      const padStart = d3.timeDay.offset(xDomain[0], -15);
      const padEnd = d3.timeDay.offset(xDomain[1], 15);
      xDomain[0] = padStart;
      xDomain[1] = padEnd;
    }
    const x = d3.scaleTime().domain(xDomain).range([margin.left, ctx.width - margin.right]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(pivot, (row) => row.total) * 1.1])
      .nice()
      .range([height - margin.bottom, margin.top]);

    const stack = d3.stack().keys(detectionMethods).order(d3.stackOrderNone).offset(d3.stackOffsetNone);
    const layers = stack(pivot);
    const area = d3
      .area()
      .curve(d3.curveCatmullRom.alpha(0.8))
      .x((d) => x(d.data.date))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]));
    const transitionDuration = meta.singleMonth ? 320 : 520;
    const transition = ctx.svg.transition().duration(transitionDuration).ease(d3.easeCubicInOut);

    const areaPaths = ctx.areaGroup.selectAll("path").data(layers, (d) => d.key);
    areaPaths
      .join((enter) =>
        enter
          .append("path")
          .attr("fill", (d) => colors(d.key))
          .attr("fill-opacity", 0.65)
          .attr("stroke", (d) => d3.color(colors(d.key)).darker(0.3))
          .attr("stroke-opacity", 0.9)
          .attr("stroke-width", 1.5)
          .attr("d", area)
          .style("opacity", 0)
          .call((path) => path.transition(transition).style("opacity", 1))
      )
      .transition(transition)
      .attr("fill", (d) => colors(d.key))
      .attr("stroke", (d) => d3.color(colors(d.key)).darker(0.3))
      .attr("d", area);

    const axisBottom = meta.singleMonth && meta.singleMonthDate
      ? d3.axisBottom(x).tickValues([meta.singleMonthDate]).tickFormat(() => formatMonth(meta.singleMonthDate))
      : d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat("%b %Y"));
    ctx.xAxisGroup
      .transition(transition)
      .call(axisBottom)
      .call((axis) => axis.selectAll("text").attr("fill", "#102135"))
      .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.25)"));

    ctx.yAxisGroup
      .transition(transition)
      .call(d3.axisLeft(y).ticks(5))
      .call((axis) => axis.selectAll("text").attr("fill", "#102135"))
      .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.25)"));

    ctx.lockdownGroup.selectAll("*").remove();
    if (stateCode === "VIC") {
      const lockdownBands = [
        { label: "Lockdown 2020", start: new Date("2020-03-01"), end: new Date("2020-10-31") },
        { label: "Lockdown 2021", start: new Date("2021-05-27"), end: new Date("2021-10-21") },
      ];
      lockdownBands.forEach((band) => {
        ctx.lockdownGroup
          .append("rect")
          .attr("x", x(band.start))
          .attr("width", Math.max(0, x(band.end) - x(band.start)))
          .attr("y", margin.top)
          .attr("height", height - margin.top - margin.bottom)
          .attr("fill", "rgba(213,94,0,0.08)");
        ctx.lockdownGroup
          .append("text")
          .attr("x", x(band.start) + 4)
          .attr("y", margin.top + 14)
          .attr("fill", "#d55e00")
          .attr("font-size", "0.75rem")
          .text(band.label);
      });
    }

    const bisect = d3.bisector((row) => row.date).center;
    ctx.pointerRect
      .attr("x", margin.left)
      .attr("y", margin.top)
      .attr("width", ctx.width - margin.left - margin.right)
      .attr("height", height - margin.top - margin.bottom)
      .on("mousemove", (event) => {
        const [xPos] = d3.pointer(event);
        const date = x.invert(xPos);
        const index = bisect(pivot, date);
        const clampedIndex = Math.min(Math.max(index, 0), pivot.length - 1);
        const row = pivot[clampedIndex];
        if (!row) return;
        ctx.focusLine.attr("x1", x(row.date)).attr("x2", x(row.date)).style("opacity", 1);
        const details = detectionMethods
          .map((method) => `${method}: ${formatNumber(row[method] || 0)}`)
          .join("<br/>");
        const labelDate = row.displayDate || row.date;
        showTooltip(`<strong>${formatMonth(labelDate)}</strong><br/>${details}<br/>Total: ${formatNumber(row.total)}`, event);
      })
      .on("mouseleave", () => {
        ctx.focusLine.style("opacity", 0);
        hideTooltip();
      });

    storyNode.textContent = buildCovidMonthlyStory(stateCode, pivot, detectionMethods, meta);
  }

  function buildCovidPivot(rows) {
    if (!rows?.length) {
      return { pivot: [], detectionMethods: [], meta: {} };
    }
    const detectionMethods = Array.from(new Set(rows.map((row) => row.DETECTION_METHOD))).filter(Boolean);
    if (!detectionMethods.length) {
      return { pivot: [], detectionMethods, meta: {} };
    }
    const rawPivot = Array.from(
      d3.rollup(
        rows,
        (values) => {
          const entry = { date: values[0].date };
          detectionMethods.forEach((method) => {
            entry[method] = values.find((row) => row.DETECTION_METHOD === method)?.["FINES (Sum)"] || 0;
          });
          entry.total = detectionMethods.reduce((acc, method) => acc + (entry[method] || 0), 0);
          entry.displayDate = entry.date;
          return entry;
        },
        (row) => row.YM
      ),
      ([, value]) => value
    ).sort((a, b) => d3.ascending(a.date, b.date));
    const meta = {
      rawPivot: rawPivot.map((entry) => ({ ...entry })),
      singleMonth: rawPivot.length === 1,
      singleMonthDate: rawPivot.length === 1 ? rawPivot[0].date : null,
    };
    const chartPivot = meta.singleMonth ? padCovidPivot(rawPivot, detectionMethods, meta) : rawPivot;
    return { pivot: chartPivot, detectionMethods, meta };
  }

  function padCovidPivot(pivot, detectionMethods, meta) {
    if (pivot.length >= 2 || !pivot.length) {
      return pivot;
    }
    const only = pivot[0];
    const baseDate = only.date instanceof Date ? new Date(only.date) : new Date();
    const padStart = d3.timeMonth.offset(baseDate, -1);
    const padEnd = d3.timeMonth.offset(baseDate, 1);
    meta.syntheticDomain = [padStart, padEnd];
    meta.axisTickValues = [baseDate];
    const cloneEntry = (date) => {
      const entry = { date: new Date(date), total: only.total, displayDate: only.displayDate || baseDate };
      detectionMethods.forEach((method) => {
        entry[method] = only[method] || 0;
      });
      return entry;
    };
    return [cloneEntry(padStart), cloneEntry(baseDate), cloneEntry(padEnd)];
  }

  function buildCovidMonthlyStory(stateCode, pivot, detectionMethods, meta = {}) {
    if (!pivot?.length) {
      return `${STATE_NAME_MAP[stateCode] || stateCode} needs monthly COVID-era data to describe this timeline.`;
    }
    const stateName = STATE_NAME_MAP[stateCode] || stateCode;
    const storyRows = meta.rawPivot?.length ? meta.rawPivot : pivot;
    const peakRow = d3.greatest(storyRows, (row) => row.total) || storyRows[storyRows.length - 1];
    const latest = storyRows[storyRows.length - 1];
    const earliest = storyRows[0];
    const change = earliest.total ? (latest.total - earliest.total) / earliest.total : null;
    const changeText = Number.isFinite(change)
      ? ` ${change >= 0 ? "Up" : "Down"} ${formatPercent(Math.abs(change))} since ${formatMonth(earliest.displayDate || earliest.date)}.`
      : "";
    const base = `${stateName} peaked at ${formatNumber(peakRow.total)} fines in ${formatMonth(peakRow.displayDate || peakRow.date)} and now sits at ${formatNumber(latest.total)} (${formatMonth(
      latest.displayDate || latest.date
    )}).`;
    const leaders = detectionMethods
      .map((method) => ({
        method,
        latestValue: latest[method] || 0,
        earliestValue: earliest[method] || 0,
      }))
      .sort((a, b) => (b.latestValue || 0) - (a.latestValue || 0));
    const leader = leaders[0];
    const runner = leaders[1];
    const leaderShare = leader && latest.total ? leader.latestValue / latest.total : null;
    const leaderText = leader
      ? ` ${leader.method} now contributes ${leaderShare ? formatPercent(leaderShare) : formatNumber(leader.latestValue)} of the mix${leader.earliestValue
        ? ` after moving ${leader.latestValue >= leader.earliestValue ? "up" : "down"} ${formatPercent(
          Math.abs(leader.earliestValue ? (leader.latestValue - leader.earliestValue) / leader.earliestValue : 0
          ))} since ${formatMonth(earliest.date)}.`
        : "."
      }`
      : "";
    const runnerText = runner
      ? ` ${runner.method} trails with ${formatNumber(runner.latestValue)}, keeping the spread between the top two methods at ${formatNumber(
        Math.abs((leader?.latestValue || 0) - runner.latestValue)
      )} fines.`
      : "";
    return `${base}${changeText}${leaderText}${runnerText}`.trim();
  }

  /**
   * Draw the Diverging Area Chart (Butterfly Chart) for annual camera vs police data
   * @param {D3Selection} container - The D3 selection for the chart container
   * @param {HTMLElement} storyNode - The DOM element for the chart narrative
   * @param {Array} rows - Annual data rows
   * @param {string} stateCode - Jurisdiction code (e.g., "VIC", "NSW")
   */
  function drawCovidAnnualFallback(container, storyNode, rows, stateCode) {
    // Step 1: Safety Clear - Wipe the container clean before drawing
    container.selectAll("*").remove();
    covidChartContext = null;

    // Step 2: Process data using our butterfly chart helper
    const { pivotedData, maxVal, error } = buildButterflyChartData(stateCode, rows);

    // Handle errors
    if (error || !pivotedData.length || maxVal === 0) {
      container.append("p")
        .attr("class", "chart-empty")
        .text(error || `${STATE_NAME_MAP[stateCode] || stateCode} needs annual camera versus police data.`);
      storyNode.textContent = error || `Upload camera versus police annual files for ${STATE_NAME_MAP[stateCode] || stateCode} to visualize enforcement trends.`;
      renderChartLegend("covid-legend", []);
      return;
    }

    // Step 3: Dynamic Sizing - Use container's actual dimensions
    const containerNode = container.node();
    const width = containerNode ? containerNode.clientWidth : 600;
    const height = containerNode ? (containerNode.clientHeight || 400) : 400;
    const margin = { top: 40, right: 40, bottom: 50, left: 60 };

    // Step 4: Create Scales

    // X-Scale: Linear scale for years 2018-2024
    const xScale = d3.scaleLinear()
      .domain([2018, 2024])
      .range([margin.left, width - margin.right]);

    // Y-Scale: Centered axis with domain [-maxVal, maxVal]
    // This is crucial for the butterfly effect - zero is in the middle
    const yScale = d3.scaleLinear()
      .domain([-maxVal, maxVal])
      .range([height - margin.bottom, margin.top])
      .nice();

    // Create SVG
    const svg = container.append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    // ===== COVID CONTEXT BAND (Background layer) =====
    // Add this first so it appears behind everything else
    const covidBand = svg.append("g").attr("class", "covid-context-band");

    covidBand.append("rect")
      .attr("x", xScale(2020))
      .attr("width", xScale(2021) - xScale(2020))
      .attr("y", margin.top)
      .attr("height", height - margin.top - margin.bottom)
      .attr("fill", "#e5e7eb")
      .attr("opacity", 0.5)
      .lower(); // Move to background

    covidBand.append("text")
      .attr("x", (xScale(2020) + xScale(2021)) / 2)
      .attr("y", margin.top + 15)
      .attr("text-anchor", "middle")
      .attr("fill", "#6b7280")
      .attr("font-size", "0.75rem")
      .attr("font-weight", 600)
      .text("COVID Era");

    // Add grid lines for reference
    const gridGroup = svg.append("g").attr("class", "butterfly-grid");
    yScale.ticks(6).forEach(tick => {
      if (tick !== 0) { // Don't duplicate the center line
        gridGroup.append("line")
          .attr("x1", margin.left)
          .attr("x2", width - margin.right)
          .attr("y1", yScale(tick))
          .attr("y2", yScale(tick))
          .attr("stroke", "rgba(15,35,51,0.1)")
          .attr("stroke-width", 1);
      }
    });

    // Add a central baseline at y = 0 (Enhanced visibility)
    const centerY = yScale(0);
    const baseline = svg.append("line")
      .attr("class", "butterfly-baseline")
      .attr("x1", margin.left)
      .attr("x2", width - margin.right)
      .attr("y1", centerY)
      .attr("y2", centerY)
      .attr("stroke", "#374151")  // Darker gray for better visibility
      .attr("stroke-width", 2.5)
      .attr("stroke-dasharray", "6 4");

    // Define Colors for Butterfly Wings
    const cameraColor = "#377eb8"; // Blue for Camera
    const policeColor = "#ff7f00"; // Orange for Police

    // Create Area Generators for Butterfly Wings
    // Top Wing (Camera): extends upward from center
    const cameraAreaGenerator = d3.area()
      .x(d => xScale(d.year))
      .y0(yScale(0))  // Base is the center line
      .y1(d => yScale(d.camera))  // Top extends upward
      .curve(d3.curveMonotoneX);  // Smooth curve

    // Bottom Wing (Police): extends downward from center
    const policeAreaGenerator = d3.area()
      .x(d => xScale(d.year))
      .y0(yScale(0))  // Base is the center line
      .y1(d => yScale(-d.police))  // Bottom extends downward (note the negative)
      .curve(d3.curveMonotoneX);  // Smooth curve

    // Create a group for the butterfly wings
    const wingsGroup = svg.append("g").attr("class", "butterfly-wings");

    // Append Camera Wing (Top)
    const cameraWing = wingsGroup.append("path")
      .datum(pivotedData)
      .attr("class", "butterfly-wing butterfly-wing--camera")
      .attr("d", cameraAreaGenerator)
      .attr("fill", cameraColor)
      .attr("opacity", 0.8)
      .attr("stroke", d3.color(cameraColor).darker(0.5))
      .attr("stroke-width", 1.5);

    // Append Police Wing (Bottom)
    const policeWing = wingsGroup.append("path")
      .datum(pivotedData)
      .attr("class", "butterfly-wing butterfly-wing--police")
      .attr("d", policeAreaGenerator)
      .attr("fill", policeColor)
      .attr("opacity", 0.8)
      .attr("stroke", d3.color(policeColor).darker(0.5))
      .attr("stroke-width", 1.5);

    // Add interactivity - tooltips on year points
    const pointsGroup = svg.append("g").attr("class", "butterfly-points");

    pivotedData.forEach(d => {
      const cameraY = yScale(d.camera);
      const policeY = yScale(-d.police);
      const xPos = xScale(d.year);

      // Camera point
      pointsGroup.append("circle")
        .attr("cx", xPos)
        .attr("cy", cameraY)
        .attr("r", 4)
        .attr("fill", cameraColor)
        .attr("stroke", "#fff")
        .attr("stroke-width", 2)
        .style("cursor", "pointer")
        .on("mouseover", function (event) {
          d3.select(this).attr("r", 6);
          showTooltip(
            `<strong>${d.year} - Camera</strong><br/>${formatNumber(d.camera)} fines`,
            event
          );
        })
        .on("mouseout", function () {
          d3.select(this).attr("r", 4);
          hideTooltip();
        });

      // Police point
      pointsGroup.append("circle")
        .attr("cx", xPos)
        .attr("cy", policeY)
        .attr("r", 4)
        .attr("fill", policeColor)
        .attr("stroke", "#fff")
        .attr("stroke-width", 2)
        .style("cursor", "pointer")
        .on("mouseover", function (event) {
          d3.select(this).attr("r", 6);
          showTooltip(
            `<strong>${d.year} - Police</strong><br/>${formatNumber(d.police)} fines`,
            event
          );
        })
        .on("mouseout", function () {
          d3.select(this).attr("r", 4);
          hideTooltip();
        });
    });

    // X-Axis (bottom, at the center line)
    const xAxis = d3.axisBottom(xScale)
      .ticks(7)
      .tickFormat(d3.format("d"));

    svg.append("g")
      .attr("class", "axis axis--x")
      .attr("transform", `translate(0, ${centerY})`)
      .call(xAxis)
      .call(axis => axis.selectAll("text").attr("fill", "#102135"))
      .call(axis => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.25)"));

    // Y-Axis (left) - showing absolute values (fixed to remove negatives)
    const yAxis = d3.axisLeft(yScale)
      .ticks(6)
      .tickFormat(d => d3.format(".2s")(Math.abs(d))); // Show absolute values (e.g., "50k")

    svg.append("g")
      .attr("class", "axis axis--y")
      .attr("transform", `translate(${margin.left},0)`)
      .call(yAxis)
      .call(axis => axis.selectAll("text").attr("fill", "#102135"))
      .call(axis => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.25)"));

    // Raise the baseline so it appears on top of wings
    baseline.raise();

    // ===== DIRECT LABELS ON WINGS =====
    // Add labels directly on the chart instead of using a separate legend
    const labelYear = 2023; // Use 2023 for label positioning
    const labelData = pivotedData.find(d => d.year === labelYear) || pivotedData[pivotedData.length - 1];

    if (labelData) {
      // Camera label (on upper wing)
      const cameraLabelY = yScale(labelData.camera / 2); // Midpoint of camera wing
      svg.append("text")
        .attr("x", xScale(labelYear))
        .attr("y", cameraLabelY)
        .attr("text-anchor", "middle")
        .attr("fill", "#ffffff")
        .attr("font-size", "1rem")
        .attr("font-weight", 700)
        .attr("stroke", cameraColor)
        .attr("stroke-width", 0.5)
        .attr("paint-order", "stroke")
        .text("Camera");

      // Police label (on lower wing)
      const policeLabelY = yScale(-labelData.police / 2); // Midpoint of police wing
      svg.append("text")
        .attr("x", xScale(labelYear))
        .attr("y", policeLabelY)
        .attr("text-anchor", "middle")
        .attr("fill", "#ffffff")
        .attr("font-size", "1rem")
        .attr("font-weight", 700)
        .attr("stroke", policeColor)
        .attr("stroke-width", 0.5)
        .attr("paint-order", "stroke")
        .text("Police");
    }

    // Axis labels
    svg.append("text")
      .attr("x", (margin.left + width - margin.right) / 2)
      .attr("y", height - 10)
      .attr("text-anchor", "middle")
      .attr("fill", "#102135")
      .attr("font-size", "0.85rem")
      .text("Year");

    svg.append("text")
      .attr("transform", `translate(15, ${height / 2}) rotate(-90)`)
      .attr("text-anchor", "middle")
      .attr("fill", "#102135")
      .attr("font-size", "0.85rem")
      .text("Annual Fines");

    // Render legend (keeping for color reference)
    const legendData = [
      { label: "Camera", color: cameraColor },
      { label: "Police", color: policeColor }
    ];
    renderChartLegend("covid-legend", legendData);

    // Build story text
    const stateName = STATE_NAME_MAP[stateCode] || stateCode;
    const firstYear = pivotedData[0];
    const lastYear = pivotedData[pivotedData.length - 1];
    const peakCamera = d3.max(pivotedData, d => d.camera);
    const peakPolice = d3.max(pivotedData, d => d.police);

    storyNode.textContent = `${stateName} butterfly chart shows enforcement trends from ${firstYear.year} to ${lastYear.year}. ` +
      `Camera detections peaked at ${formatNumber(peakCamera)} fines, while police detections reached ${formatNumber(peakPolice)} fines. ` +
      `The chart uses a centered Y-axis from -${formatNumber(maxVal)} to +${formatNumber(maxVal)} to create the butterfly visualization.`;
  }

  function buildDetectionFocusControls(ratioRows) {
    if (!detectionFocusContainer) return;
    detectionFocusContainer.innerHTML = "";
    const availableStates = Object.keys(ratioRows[0] || {}).filter((key) => key !== "YEAR");
    if (!availableStates.length) {
      detectionFocusContainer.innerHTML = '<p class="chart-note">Upload the camera/police ratio file to benchmark states.</p>';
      return;
    }
    if (!availableStates.includes(viewState.detectionFocus)) {
      viewState.detectionFocus = availableStates.includes(activeState) ? activeState : availableStates[0];
    }
    availableStates.forEach((code) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.state = code;
      button.className = `pill${viewState.detectionFocus === code ? " active" : ""} `;
      button.textContent = STATE_NAME_MAP[code] || code;
      button.addEventListener("click", () => {
        if (viewState.detectionFocus === code) return;
        viewState.detectionFocus = code;
        detectionFocusContainer.querySelectorAll("button").forEach((node) => {
          node.classList.toggle("active", node.dataset.state === code);
        });
        renderDetectionChart(code, cachedRatioRows);
      });
      detectionFocusContainer.appendChild(button);
    });
  }

  function renderDetectionChart(stateCode, ratioRows) {
    const container = d3.select("#detection-chart");
    const story = document.getElementById("detection-story");
    if (!container.node() || !story) {
      detectionChartContext = null;
      return;
    }

    const showEmptyState = (message, storyCopy) => {
      container.selectAll("*").remove();
      detectionChartContext = null;
      container.append("p").attr("class", "chart-empty").text(message);
      story.textContent = storyCopy;
      renderChartLegend("detection-legend", []);
    };

    if (!ratioRows || !ratioRows.length) {
      showEmptyState("Camera-police ratio dataset is empty.", "Upload the q4 ratio dataset to compare jurisdictions.");
      return;
    }

    const availableStates = Object.keys(ratioRows[0]).filter((key) => key !== "YEAR");
    if (!availableStates.includes(stateCode)) {
      showEmptyState(
        "Ratios were only provided for NSW, VIC, and QLD.",
        `${STATE_NAME_MAP[stateCode] || stateCode} cannot be benchmarked until a camera - police ratio series is provided.`
      );
      return;
    }

    const stateSeries = ratioRows
      .map((row) => {
        const ratio = row[stateCode];
        if (!Number.isFinite(ratio)) {
          return null;
        }
        const cameraShare = 1 / (1 + ratio);
        return {
          year: row.YEAR,
          ratio,
          cameraShare,
          policeShare: 1 - cameraShare,
        };
      })
      .filter(Boolean);

    if (!stateSeries.length) {
      showEmptyState(
        "This jurisdiction lacks ratio coverage across the selected years.",
        `${STATE_NAME_MAP[stateCode] || stateCode} requires at least one ratio year to draw the chart.`
      );
      return;
    }

    const height = 280;
    const margin = { top: 32, right: 120, bottom: 45, left: 70 };
    const textColor = "#102135";
    const ratioColor = "#0072B2";
    const measuredWidth = container.node()?.clientWidth || container.node()?.parentNode?.clientWidth || 600;

    if (!detectionChartContext || Math.abs(measuredWidth - detectionChartContext.width) > 4) {
      container.selectAll("*").remove();
      const { svg, width } = createResponsiveSvg(container, { height });
      detectionChartContext = {
        svg,
        width,
        height,
        margin,
        textColor,
        ratioColor,
      };
      const ctx = detectionChartContext;
      ctx.areaGroup = svg.append("g").attr("class", "detection-area");
      ctx.linePath = svg
        .append("path")
        .attr("class", "detection-ratio-line")
        .attr("fill", "none")
        .attr("stroke", ratioColor)
        .attr("stroke-width", 2.5)
        .attr("stroke-dasharray", "4 4");
      ctx.xAxisGroup = svg.append("g").attr("class", "axis axis--x").attr("transform", `translate(0, ${height - margin.bottom})`);
      ctx.yAxisGroup = svg.append("g").attr("class", "axis axis--y").attr("transform", `translate(${margin.left}, 0)`);
      ctx.ratioAxisGroup = svg.append("g").attr("class", "axis axis--ratio").attr("transform", `translate(${ctx.width - margin.right}, 0)`);
      ctx.xLabel = svg
        .append("text")
        .attr("class", "axis-label axis-label--x")
        .attr("y", height - 6)
        .attr("text-anchor", "middle")
        .attr("fill", textColor)
        .attr("font-size", "0.85rem")
        .text("Year");
      ctx.yLabel = svg
        .append("text")
        .attr("class", "axis-label axis-label--y")
        .attr("text-anchor", "middle")
        .attr("fill", textColor)
        .attr("font-size", "0.85rem");
      ctx.ratioLabel = svg
        .append("text")
        .attr("class", "axis-label axis-label--ratio")
        .attr("text-anchor", "middle")
        .attr("fill", ratioColor)
        .attr("font-size", "0.8rem")
        .text("Police-to-camera ratio");
      ctx.focusCircle = svg.append("circle").attr("r", 5).attr("fill", ratioColor).attr("stroke", "#6b5c00").style("opacity", 0);
      ctx.pointerRect = svg.append("rect").attr("fill", "transparent").attr("pointer-events", "all");
    }

    const ctx = detectionChartContext;
    ctx.width = measuredWidth;
    ctx.svg.attr("viewBox", `0 0 ${ctx.width} ${height} `);
    ctx.ratioAxisGroup.attr("transform", `translate(${ctx.width - margin.right}, 0)`);
    const x = d3
      .scaleLinear()
      .domain(d3.extent(stateSeries, (row) => row.year))
      .range([margin.left, ctx.width - margin.right]);
    const y = d3.scaleLinear().domain([0, 1]).range([height - margin.bottom, margin.top]);
    const ratioScale = d3
      .scaleLinear()
      .domain([0, d3.max(stateSeries, (row) => row.ratio) * 1.1 || 1])
      .nice()
      .range([height - margin.bottom, margin.top]);

    const stack = d3.stack().keys(["cameraShare", "policeShare"]);
    const layers = stack(stateSeries);
    const fill = d3.scaleOrdinal().domain(["cameraShare", "policeShare"]).range(["#56B4E9", "#D55E00"]);
    const area = d3
      .area()
      .curve(d3.curveCatmullRom.alpha(0.8))
      .x((d) => x(d.data.year))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]));
    const ratioLine = d3
      .line()
      .curve(d3.curveMonotoneX)
      .x((d) => x(d.year))
      .y((d) => ratioScale(d.ratio));
    const transition = ctx.svg.transition().duration(520).ease(d3.easeCubicInOut);

    const areaPaths = ctx.areaGroup.selectAll("path").data(layers, (d) => d.key);
    areaPaths
      .join((enter) =>
        enter
          .append("path")
          .attr("fill", (d) => fill(d.key))
          .attr("fill-opacity", 0.75)
          .attr("stroke", (d) => d3.color(fill(d.key)).darker(0.5))
          .attr("stroke-width", 1.5)
          .attr("d", area)
          .style("opacity", 0)
          .transition(transition)
          .style("opacity", 1)
      )
      .transition(transition)
      .attr("fill", (d) => fill(d.key))
      .attr("stroke", (d) => d3.color(fill(d.key)).darker(0.5))
      .attr("d", area);

    ctx.linePath.datum(stateSeries).transition(transition).attr("d", ratioLine);

    ctx.xAxisGroup
      .transition(transition)
      .call(d3.axisBottom(x).ticks(stateSeries.length).tickFormat(d3.format("d")))
      .call((axis) => axis.selectAll("text").attr("fill", textColor))
      .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.25)"));

    ctx.yAxisGroup
      .transition(transition)
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")))
      .call((axis) => axis.selectAll("text").attr("fill", textColor))
      .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.25)"));

    ctx.ratioAxisGroup
      .transition(transition)
      .call(d3.axisRight(ratioScale).ticks(5).tickFormat((d) => `${formatDecimal(d, 2)}×`))
      .call((axis) => axis.selectAll("text").attr("fill", ratioColor))
      .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.15)"));

    ctx.xLabel.transition(transition).attr("x", (margin.left + ctx.width - margin.right) / 2);
    ctx.yLabel
      .transition(transition)
      .attr("transform", `translate(${margin.left - 45}, ${(margin.top + height - margin.bottom) / 2}) rotate(-90)`)
      .text("Share of fines");
    ctx.ratioLabel
      .transition(transition)
      .attr("transform", `translate(${ctx.width - 5}, ${(margin.top + height - margin.bottom) / 2}) rotate(-90)`);

    const legendEntries = [
      { label: "Camera share", color: fill("cameraShare") },
      { label: "Police share", color: fill("policeShare") },
      { label: "Police/camera ratio", type: "line", color: ratioColor, dashed: true },
    ];
    renderChartLegend("detection-legend", legendEntries);

    ctx.pointerRect
      .attr("x", margin.left)
      .attr("y", margin.top)
      .attr("width", ctx.width - margin.left - margin.right)
      .attr("height", height - margin.top - margin.bottom)
      .on("mousemove", (event) => {
        const [pointerX] = d3.pointer(event);
        const year = Math.round(x.invert(pointerX));
        const datum = stateSeries.find((row) => row.year === year);
        if (!datum) return;
        ctx.focusCircle.attr("cx", x(datum.year)).attr("cy", ratioScale(datum.ratio)).style("opacity", 1);
        showTooltip(
          `<strong> ${STATE_NAME_MAP[stateCode] || stateCode} · ${datum.year}</strong> <br />Camera share ${formatPercent(
            datum.cameraShare
          )
          } <br />Police share ${formatPercent(datum.policeShare)} <br />Ratio ${formatDecimal(datum.ratio, 2)}×`,
          event
        );
      })
      .on("mouseleave", () => {
        ctx.focusCircle.style("opacity", 0);
        hideTooltip();
      });

    story.textContent = buildDetectionStory(stateCode, stateSeries);
  }

  function buildDetectionStory(stateCode, series) {
    if (!series?.length) {
      return `${STATE_NAME_MAP[stateCode] || stateCode} needs ratio coverage to narrate camera versus police trends.`;
    }
    const stateName = STATE_NAME_MAP[stateCode] || stateCode;
    const start = series[0];
    const end = series[series.length - 1];
    const ratioSwing = end.ratio - start.ratio;
    const cameraChange = end.cameraShare - start.cameraShare;
    const cameraPeak = d3.greatest(series, (row) => row.cameraShare);
    const policePeak = d3.greatest(series, (row) => row.policeShare);
    const maxRatio = d3.greatest(series, (row) => row.ratio);
    const minRatio = d3.least(series, (row) => row.ratio);
    let story = `${stateName} camera reliance shifted from ${formatPercent(start.cameraShare)} (${formatDecimal(start.ratio, 2)}× police) in ${start.year} to ${formatPercent(end.cameraShare)} (${formatDecimal(end.ratio, 2)}×) by ${end.year}.`;
    if (cameraChange) {
      story += ` Camera share ${cameraChange > 0 ? "grew" : "fell"} ${formatPercent(Math.abs(cameraChange))} across the series.`;
    }
    if (ratioSwing) {
      const ratioDirection = ratioSwing > 0 ? "rose" : "fell";
      story += ` The police - to - camera ratio ${ratioDirection} ${formatDecimal(Math.abs(ratioSwing), 2)}×, ranging from ${formatDecimal(minRatio.ratio, 2)}× in ${minRatio.year} to ${formatDecimal(maxRatio.ratio, 2)}× in ${maxRatio.year}.`;
    }
    if (cameraPeak) {
      story += ` Cameras peaked in ${cameraPeak.year} at ${formatPercent(cameraPeak.cameraShare)}.`;
    }
    if (policePeak) {
      story += ` Police detections topped out in ${policePeak.year} at ${formatPercent(policePeak.policeShare)}.`;
    }
    return story;
  }

  function renderRateCard() {
    const chartNode = document.getElementById("rate-chart");
    const story = document.getElementById("rate-story");
    if (!chartNode || !story) {
      return;
    }
    const container = d3.select(chartNode);
    container.selectAll("*").remove();
    if (!rateContext || !cachedSummary) {
      container.append("p").attr("class", "chart-empty").text("Rate dataset has not loaded yet.");
      story.textContent = "Refresh once the q5 dataset is available.";
      return;
    }
    if (viewState.rateView === "national") {
      renderNationalRateView(container, story);
    } else {
      renderStateRateView(container, story);
    }
  }

  function renderStateRateView(container, story) {
    if (!rateScatterData.length) {
      container.append("p").attr("class", "chart-empty").text("Provide rate and remoteness data to unlock this scatter plot.");
      story.textContent = "Upload q5 rates plus remoteness splits for every jurisdiction.";
      return;
    }
    const dataset = rateScatterData.filter((entry) => Number.isFinite(entry.rate) && entry.remoteShare != null);
    if (!dataset.length) {
      container.append("p").attr("class", "chart-empty").text("Remote share values were missing for every state.");
      story.textContent = "Ensure the q5 location dataset lists remote vs metro splits for each jurisdiction.";
      return;
    }
    const highlight = dataset.find((entry) => entry.code === activeState);
    if (!highlight) {
      container.append("p").attr("class", "chart-empty").text("This state lacks both rate and remote share coverage.");
      story.textContent = `${STATE_NAME_MAP[activeState] || activeState} needs a rate row and a remote - share calculation.`;
      return;
    }

    const height = 320;
    const margin = { top: 24, right: 30, bottom: 45, left: 70 };
    const highlightColor = "#009E73";
    const comparisonColor = "#999999";
    const remoteLineColor = "#E69F00";
    const rateLineColor = "#CC79A7";
    const textColor = "#102135";
    const { svg, width } = createResponsiveSvg(container, { height });
    const remoteMax = d3.max(dataset, (d) => d.remoteShare) || 0;
    const xMax = Math.min(0.6, Math.max(0.12, remoteMax * 1.25));
    const x = d3.scaleLinear().domain([0, xMax]).nice().range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, d3.max(dataset, (d) => d.rate) * 1.15]).nice().range([height - margin.bottom, margin.top]);

    svg
      .append("g")
      .attr("class", "rate-grid")
      .selectAll("line")
      .data(x.ticks(5))
      .join("line")
      .attr("x1", (d) => x(d))
      .attr("x2", (d) => x(d))
      .attr("y1", margin.top)
      .attr("y2", height - margin.bottom)
      .attr("stroke", "rgba(15,35,51,0.1)");

    svg
      .append("g")
      .attr("class", "rate-grid")
      .selectAll("line")
      .data(y.ticks(5))
      .join("line")
      .attr("x1", margin.left)
      .attr("x2", width - margin.right)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d))
      .attr("stroke", "rgba(15,35,51,0.1)");

    if (nationalStats?.remoteShare != null) {
      svg
        .append("line")
        .attr("x1", x(nationalStats.remoteShare))
        .attr("x2", x(nationalStats.remoteShare))
        .attr("y1", margin.top)
        .attr("y2", height - margin.bottom)
        .attr("stroke", remoteLineColor)
        .attr("stroke-dasharray", "4 4");
    }
    if (nationalStats?.avgRate != null) {
      svg
        .append("line")
        .attr("x1", margin.left)
        .attr("x2", width - margin.right)
        .attr("y1", y(nationalStats.avgRate))
        .attr("y2", y(nationalStats.avgRate))
        .attr("stroke", rateLineColor)
        .attr("stroke-dasharray", "4 4");
    }

    const pointGroup = svg
      .append("g")
      .attr("class", "rate-points")
      .selectAll("circle")
      .data(dataset)
      .join("circle")
      .attr("cx", (d) => x(d.remoteShare))
      .attr("cy", (d) => y(d.rate))
      .attr("r", (d) => (d.code === activeState ? 9 : 5))
      .attr("fill", (d) => (d.code === activeState ? highlightColor : comparisonColor))
      .attr("stroke", (d) => (d.code === activeState ? "#005640" : "#6f7682"))
      .attr("stroke-width", 1.5);

    const delaunay = d3.Delaunay.from(
      dataset,
      (d) => x(d.remoteShare),
      (d) => y(d.rate)
    );
    svg
      .append("rect")
      .attr("fill", "transparent")
      .attr("pointer-events", "all")
      .attr("x", margin.left)
      .attr("y", margin.top)
      .attr("width", width - margin.left - margin.right)
      .attr("height", height - margin.top - margin.bottom)
      .on("mousemove", (event) => {
        const [pointerX, pointerY] = d3.pointer(event);
        const index = delaunay.find(pointerX, pointerY);
        const datum = dataset[index];
        if (!datum) return;
        showTooltip(
          `<strong> ${datum.name}</strong> <br />Rate: ${formatDecimal(datum.rate)} per 10k < br /> Remote share: ${formatPercent(datum.remoteShare)} `,
          event
        );
      })
      .on("mouseleave", hideTooltip);

    svg
      .append("g")
      .attr("transform", `translate(0, ${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")))
      .call((axis) => axis.selectAll("text").attr("fill", textColor))
      .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.25)"));

    svg
      .append("g")
      .attr("transform", `translate(${margin.left}, 0)`)
      .call(d3.axisLeft(y).ticks(5))
      .call((axis) => axis.selectAll("text").attr("fill", textColor))
      .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.25)"));

    svg
      .append("text")
      .attr("x", (margin.left + width - margin.right) / 2)
      .attr("y", height - 5)
      .attr("text-anchor", "middle")
      .attr("fill", textColor)
      .attr("font-size", "0.85rem")
      .text("Remote share of fines");

    svg
      .append("text")
      .attr("transform", `translate(${margin.left - 55}, ${(margin.top + height - margin.bottom) / 2}) rotate(-90)`)
      .attr("text-anchor", "middle")
      .attr("fill", textColor)
      .attr("font-size", "0.85rem")
      .text("Fines per 10k residents");

    const rateLegend = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top - 16})`);
    const rateLegendEntries = [
      { label: `${STATE_NAME_MAP[activeState] || activeState} `, type: "circle", color: highlightColor, size: 9, stroke: "#005640" },
      { label: "Other states", type: "circle", color: comparisonColor, size: 5, stroke: "#6f7682" },
      { label: "National remote avg", type: "vline", color: remoteLineColor },
      { label: "National rate avg", type: "hline", color: rateLineColor },
    ];
    const legendCols = 2;
    const colWidth = 170;
    const rowHeight = 24;
    rateLegendEntries.forEach((entry, index) => {
      const col = index % legendCols;
      const row = Math.floor(index / legendCols);
      const group = rateLegend.append("g").attr("transform", `translate(${col * colWidth}, ${row * rowHeight})`);
      if (entry.type === "circle") {
        group
          .append("circle")
          .attr("cx", 6)
          .attr("cy", 6)
          .attr("r", entry.size / 2)
          .attr("fill", entry.color)
          .attr("stroke", entry.stroke || "#333333")
          .attr("stroke-width", 1.5);
      } else if (entry.type === "vline") {
        group
          .append("line")
          .attr("x1", 0)
          .attr("x2", 0)
          .attr("y1", 0)
          .attr("y2", 12)
          .attr("stroke", entry.color)
          .attr("stroke-dasharray", "4 4")
          .attr("stroke-width", 2);
      } else {
        group
          .append("line")
          .attr("x1", 0)
          .attr("x2", 24)
          .attr("y1", 6)
          .attr("y2", 6)
          .attr("stroke", entry.color)
          .attr("stroke-dasharray", "4 4")
          .attr("stroke-width", 2);
      }
      group
        .append("text")
        .attr("x", 26)
        .attr("y", 8)
        .attr("fill", textColor)
        .attr("font-size", "0.75rem")
        .text(entry.label);
    });

    story.textContent = `${STATE_NAME_MAP[activeState] || activeState} sits at ${formatDecimal(highlight.rate)} fines per 10k with ${formatPercent(
      highlight.remoteShare
    )
      } of fines in remote areas.National averages trail at ${formatDecimal(nationalStats?.avgRate ?? 0)} per 10k and ${formatPercent(
        nationalStats?.remoteShare ?? 0
      )
      } remote share.`;
  }

  function renderNationalRateView(container, story) {
    if (!nationalStats || nationalStats.avgRate == null) {
      container.append("p").attr("class", "chart-empty").text("National benchmarks are missing.");
      story.textContent = "Provide the q5 rate dataset for at least two states to unlock comparisons.";
      return;
    }

    const dataset = [
      {
        label: cachedSummary.name,
        rate: cachedSummary.ratePer10k,
        remoteShare: cachedSummary.remoteShare,
        color: "#009E73",
      },
      {
        label: "National average",
        rate: nationalStats.avgRate,
        remoteShare: nationalStats.remoteShare,
        color: "#0072B2",
      },
    ];

    const height = 220;
    const margin = { top: 30, right: 30, bottom: 30, left: 120 };
    const textColor = "#102135";
    const { svg, width } = createResponsiveSvg(container, { height });
    const x = d3.scaleLinear().domain([0, d3.max(dataset, (d) => d.rate) * 1.1]).range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(dataset.map((d) => d.label)).range([margin.top, height - margin.bottom]).padding(0.45);

    const bars = svg
      .selectAll("g.rate-row")
      .data(dataset)
      .join("g")
      .attr("class", "rate-row")
      .attr("transform", (d) => `translate(0, ${y(d.label)})`);

    bars
      .append("rect")
      .attr("x", x(0))
      .attr("height", y.bandwidth())
      .attr("width", (d) => x(d.rate) - x(0))
      .attr("rx", 12)
      .attr("fill", (d) => d.color)
      .attr("fill-opacity", 0.7);

    bars
      .append("text")
      .attr("x", (d) => Math.min(width - margin.right - 10, x(d.rate) + 10))
      .attr("y", y.bandwidth() / 2 - 4)
      .attr("fill", textColor)
      .attr("font-weight", 600)
      .attr("dominant-baseline", "middle")
      .text((d) => `${formatDecimal(d.rate)} per 10k`);

    bars
      .append("text")
      .attr("x", (d) => Math.min(width - margin.right - 10, x(d.rate) + 10))
      .attr("y", y.bandwidth() / 2 + 14)
      .attr("fill", "rgba(16,33,53,0.7)")
      .attr("font-size", "0.8rem")
      .text((d) => (d.remoteShare != null ? `${formatPercent(d.remoteShare)} remote share` : "Remote share n/a"));

    svg
      .append("g")
      .attr("transform", `translate(${margin.left - 10}, 0)`)
      .call(d3.axisLeft(y).tickSize(0))
      .call((axis) => axis.selectAll("text").attr("fill", textColor).style("font-weight", 600))
      .call((axis) => axis.selectAll("path,line").remove());

    svg
      .append("g")
      .attr("transform", `translate(0, ${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5))
      .call((axis) => axis.selectAll("text").attr("fill", textColor))
      .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.25)"));

    svg
      .append("text")
      .attr("x", (margin.left + width - margin.right) / 2)
      .attr("y", height - 4)
      .attr("text-anchor", "middle")
      .attr("fill", textColor)
      .attr("font-size", "0.85rem")
      .text("Fines per 10k residents");

    const leaderText = nationalStats.leaderName != null && nationalStats.leaderRate != null
      ? ` ${nationalStats.leaderName} currently leads at ${formatDecimal(nationalStats.leaderRate)} per 10k.`
      : "";
    story.textContent = `${cachedSummary.name} sits at ${formatDecimal(
      cachedSummary.ratePer10k
    )
      } fines per 10k versus the national ${formatDecimal(nationalStats.avgRate)} in ${nationalStats.latestYear}, with remote share ${formatPercent(
        cachedSummary.remoteShare ?? 0
      )
      } vs ${formatPercent(nationalStats.remoteShare ?? 0)}.${leaderText} `;
  }

  function getRemoteShareForState(stateCode, locationByYear, regionalDiff) {
    const stateLocations = locationByYear.filter((row) => row.JURISDICTION === stateCode);
    const latestYear = stateLocations.length ? d3.max(stateLocations, (row) => row.YEAR) : null;
    if (latestYear != null) {
      const rows = stateLocations.filter((row) => row.YEAR === latestYear);
      const total = d3.sum(rows, (row) => row["FINES (Sum)"] || 0);
      if (total > 0) {
        const remote = d3.sum(rows.filter((row) => REMOTE_FAMILY.has(row.LOCATION)), (row) => row["FINES (Sum)"] || 0);
        return { share: remote / total, year: latestYear };
      }
    }
    const fallback = regionalDiff.filter((row) => row.JURISDICTION === stateCode);
    const total = d3.sum(fallback, (row) => row["Sum(FINES)"] || 0);
    if (total > 0) {
      const remote = d3.sum(fallback.filter((row) => REMOTE_FAMILY.has(row.LOCATION)), (row) => row["Sum(FINES)"] || 0);
      return { share: remote / total, year: null };
    }
    return { share: null, year: null };
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

  function showTooltip(html, event) {
    tooltip.html(html).classed("hidden", false);
    tooltip.style("left", `${event.clientX + 16} px`).style("top", `${event.clientY + 16} px`);
  }

  function hideTooltip() {
    tooltip.classed("hidden", true);
  }

  function renderChartLegend(targetId, entries) {
    const container = document.getElementById(targetId);
    if (!container) return;
    container.innerHTML = "";
    if (!entries || !entries.length) {
      return;
    }
    entries.forEach((entry) => {
      const item = document.createElement("span");
      item.className = "legend-entry";
      if (entry.type === "line") {
        const line = document.createElement("span");
        line.className = "legend-line";
        const color = entry.color || "#102135";
        line.style.setProperty("--legend-line-color", color);
        if (entry.dashed) {
          line.dataset.pattern = "dashed";
        }
        item.appendChild(line);
      } else {
        const swatch = document.createElement("span");
        swatch.className = "legend-swatch";
        swatch.style.background = entry.color;
        if (entry.borderColor) {
          swatch.style.borderColor = entry.borderColor;
        }
        item.appendChild(swatch);
      }
      const label = document.createElement("span");
      label.textContent = entry.label;
      item.appendChild(label);
      container.appendChild(item);
    });
  }

  function showTooltip(html, event) {
    tooltip.html(html).classed("hidden", false);
    tooltip.style("left", `${event.clientX + 16}px`).style("top", `${event.clientY + 16}px`);
  }

  function hideTooltip() {
    tooltip.classed("hidden", true);
  }
})();
