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
    covidFocus: activeState,
    remotenessView: "share",
    detectionFocus: activeState,
    rateView: "state",
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
  const remotenessButtons = Array.from(document.querySelectorAll("#remoteness-tools .pill"));
  const detectionFocusContainer = document.getElementById("detection-focus");
  const rateButtons = Array.from(document.querySelectorAll("#rate-tools button[data-rate-view]"));
  const explorationTiles = Array.from(document.querySelectorAll(".exploration-grid a"));

  // Expose DOM nodes needed by external story modules
  window.heroCallouts = heroCallouts;
  window.heroNarrativeList = heroNarrativeList;
  window.detectionFocusContainer = detectionFocusContainer;

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
  window.getRemoteShareForState = getRemoteShareForState;

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
