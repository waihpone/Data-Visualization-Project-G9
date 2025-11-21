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
  const MAJOR_STATES = ["NSW", "VIC", "QLD"];
  const AGE_ORDER = ["0-16", "17-25", "26-39", "40-64", "65 and over"];
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
    remotenessView: "inner-outer",
    detectionFocus: activeState,
    rateView: "state",
  };

  const navLinks = document.querySelectorAll(".story-nav a");
  const scrollTopButton = document.getElementById("scroll-top");
  const stateSwitcher = document.getElementById("state-switcher");
  const heroCallouts = document.getElementById("hero-callouts");
  const ageModeButtons = Array.from(document.querySelectorAll("#age-tools .pill"));
  const remotenessButtons = Array.from(document.querySelectorAll("#remoteness-tools .pill"));
  const detectionFocusContainer = document.getElementById("detection-focus");
  const rateButtons = Array.from(document.querySelectorAll("#rate-tools button[data-rate-view]"));

  let cachedAgeProfiles = [];
  let cachedRemoteness = null;
  let cachedSummary = null;
  let nationalStats = null;
  let cachedRatioRows = [];
  let rateContext = null;

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
  ])
    .then(([ageGroups, locationByYear, rates, regionalDiff, ratioRows, vicMonthly, vicAnnual]) => {
      vicMonthly.forEach((row) => {
        row.date = new Date(`${row.YM}-01`);
      });
      cachedSummary = buildStateSummary(activeState, { rates, ageGroups, locationByYear, regionalDiff });
      nationalStats = buildNationalStats({ rates, locationByYear, regionalDiff });
      cachedRatioRows = ratioRows;
      rateContext = { rates, locationByYear, regionalDiff };
      populateStateSwitcher();
      renderHeroCard(cachedSummary);
      renderAgeProfiles(activeState, ageGroups);
      renderRemotenessChart(activeState, locationByYear, regionalDiff);
      renderCovidChart(activeState, { vicMonthly, vicAnnual });
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
        drawRemotenessChart();
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
      return;
    }

    heroTitle.textContent = `${summary.name} · ${summary.year}`;
    heroSummary.textContent = `Drivers incurred ${formatNumber(summary.totalFines)} fines (${formatDecimal(summary.ratePer10k)} per 10k licence holders).`;

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
      remoteShare,
    };
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

  function renderAgeProfiles(activeState, ageGroups) {
    cachedAgeProfiles = MAJOR_STATES.map((code) => {
      const rows = ageGroups.filter((row) => row.JURISDICTION === code);
      const total = d3.sum(rows, (row) => row["Sum(FINES)"] || 0);
      const series = AGE_ORDER.map((age) => {
        const value = rows.find((row) => row.AGE_GROUP === age)?.["Sum(FINES)"] || 0;
        return { ageGroup: age, absolute: value, share: total ? value / total : 0 };
      });
      const peak = series.length ? d3.greatest(series, (d) => d.absolute) : null;
      return { code, name: STATE_NAME_MAP[code], series, total, peak };
    });
    drawAgeProfile();
  }

  function drawAgeProfile() {
    const container = d3.select("#age-profile");
    container.selectAll("*").remove();
    if (!cachedAgeProfiles.length || !cachedAgeProfiles.some((profile) => profile.total > 0)) {
      container.append("p").attr("class", "chart-empty").text("No age breakdown is available for NSW, VIC, or QLD.");
      document.getElementById("age-story").textContent = "Age-based fines could not be compared because the supplied dataset lacks those jurisdictions.";
      return;
    }

    const valueKey = viewState.ageMode === "share" ? "share" : "absolute";
    const ridgeHeight = 60;
    const ridgeSpacing = 90;
    const margin = { top: 20, right: 20, bottom: 40, left: 80 };
    const height = ridgeSpacing * cachedAgeProfiles.length + margin.top + margin.bottom;
    const { svg, width } = createResponsiveSvg(container, { height });
    const x = d3.scalePoint().domain(AGE_ORDER).range([margin.left, width - margin.right]);
    const maxValue = d3.max(cachedAgeProfiles, (profile) => d3.max(profile.series, (d) => d[valueKey])) || 1;
    const y = d3.scaleLinear().domain([0, maxValue]).range([ridgeHeight, 0]);

    const area = d3
      .area()
      .curve(d3.curveCatmullRom.alpha(0.8))
      .x((d) => x(d.ageGroup))
      .y0(() => ridgeHeight)
      .y1((d) => y(d[valueKey]));

    cachedAgeProfiles.forEach((profile, index) => {
      const group = svg.append("g").attr("transform", `translate(0, ${margin.top + index * ridgeSpacing})`);
      const highlight = profile.code === activeState;
      group
        .append("path")
        .datum(profile.series)
        .attr("d", area)
        .attr("fill", highlight ? "rgba(11,107,255,0.65)" : "rgba(11,107,255,0.35)")
        .attr("stroke", highlight ? "#0b6bff" : "#6aa4ff")
        .attr("stroke-width", highlight ? 2 : 1.2)
        .style("cursor", "pointer")
        .on("mousemove", (event) => {
          const entries = profile.series
            .map((d) => `${d.ageGroup}: ${formatNumber(d.absolute)} fines (${formatPercent(d.share)})`)
            .join("<br/>");
          showTooltip(`<strong>${profile.name}</strong><br/>${entries}`, event);
        })
        .on("mouseleave", hideTooltip);

      group
        .selectAll("circle")
        .data(profile.series)
        .join("circle")
        .attr("cx", (d) => x(d.ageGroup))
        .attr("cy", (d) => y(d[valueKey]))
        .attr("r", highlight ? 4 : 3)
        .attr("fill", highlight ? "#003d8f" : "#8ab4ff");

      group
        .append("text")
        .attr("x", margin.left - 20)
        .attr("y", ridgeHeight / 2)
        .attr("fill", highlight ? "#0b6bff" : "#5c6b89")
        .attr("text-anchor", "end")
        .attr("font-weight", highlight ? 700 : 600)
        .text(profile.name);
    });

    svg
      .append("g")
      .attr("transform", `translate(0, ${height - margin.bottom})`)
      .call(d3.axisBottom(x));

    document.getElementById("age-story").textContent = buildAgeStory(cachedAgeProfiles, activeState);
  }

  function buildAgeStory(profiles, stateCode) {
    const profile = profiles.find((p) => p.code === stateCode) || profiles[0];
    if (!profile || !profile.peak) {
      return "Age distribution is unavailable for this jurisdiction.";
    }
    const valueKey = viewState.ageMode === "share" ? "share" : "absolute";
    const share = profile.total ? profile.peak.share : 0;
    const comparator = d3.greatest(profiles, (p) => p.peak?.[valueKey] || 0);
    const comparatorText =
      comparator && comparator.code !== profile.code
        ? `, ${valueKey === "share" ? "behind" : "trailing"} ${comparator.name} where ${comparator.peak.ageGroup} leads`
        : "";
    const valueText = valueKey === "share" ? formatPercent(profile.peak.share) : formatNumber(profile.peak.absolute);
    const qualifier = valueKey === "share" ? "share of" : "fines for";
    return `${profile.name} ${qualifier} ${profile.peak.ageGroup} drivers sits at ${valueText}${comparatorText}.`;
  }

  function renderRemotenessChart(stateCode, locationByYear, regionalDiff) {
    cachedRemoteness = buildRemotenessViews(stateCode, locationByYear, regionalDiff);
    drawRemotenessChart();
  }

  function buildRemotenessViews(stateCode, locationByYear, regionalDiff) {
    const rows = locationByYear.filter((row) => row.JURISDICTION === stateCode);
    if (!rows.length) {
      return { errorMessage: buildRegionalFallbackStory(stateCode, regionalDiff) };
    }
    const latestYear = d3.max(rows, (row) => row.YEAR);
    const latestRows = rows.filter((row) => row.YEAR === latestYear);
    const totals = d3.rollup(latestRows, (values) => d3.sum(values, (row) => row["FINES (Sum)"] || 0), (row) => row.LOCATION);
    const majorValue = totals.get("Major Cities of Australia") || 0;
    const innerValue = totals.get("Inner Regional Australia") || 0;
    const outerValue = totals.get("Outer Regional Australia") || 0;
    const remoteExtra = LOCATION_BUCKETS.filter((bucket) => REMOTE_FAMILY.has(bucket) && bucket !== "Outer Regional Australia").reduce(
      (sum, bucket) => sum + (totals.get(bucket) || 0),
      0
    );
    const outerRemote = outerValue + remoteExtra;
    const total = majorValue + innerValue + outerRemote;
    const remoteShare = total > 0 ? outerRemote / total : null;
    return {
      stateCode,
      year: latestYear,
      majorValue,
      remoteShare,
      datasets: {
        "inner-outer": [
          { label: "Inner regional", value: innerValue },
          { label: "Outer & remote", value: outerRemote },
        ],
        "city-remote": [
          { label: "Remote & outer", value: outerRemote },
        ],
      },
    };
  }

  function drawRemotenessChart() {
    const container = d3.select("#remoteness-chart");
    container.selectAll("*").remove();
    const storyNode = document.getElementById("remoteness-story");

    if (!cachedRemoteness) {
      container.append("p").attr("class", "chart-empty").text("Spatial data is still loading.");
      storyNode.textContent = "Hang tight while we fetch the regional dataset.";
      return;
    }

    if (cachedRemoteness.errorMessage) {
      container.append("p").attr("class", "chart-empty").text("We do not have metro/regional splits for this state.");
      storyNode.textContent = cachedRemoteness.errorMessage;
      return;
    }

    const dataset = cachedRemoteness.datasets[viewState.remotenessView] || [];
    if (!dataset.length) {
      container.append("p").attr("class", "chart-empty").text("No data is available for the selected remoteness view.");
      storyNode.textContent = "Switch to the alternate view to see available trends.";
      return;
    }

    const baseline = cachedRemoteness.majorValue || 0;
    const height = viewState.remotenessView === "inner-outer" ? 220 : 160;
    const margin = { top: 24, right: 30, bottom: 30, left: 120 };
    const { svg, width } = createResponsiveSvg(container, { height });
    const maxValue = d3.max([baseline, ...dataset.map((d) => d.value)]) || 1;
    const x = d3.scaleLinear().domain([0, maxValue * 1.1]).range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(dataset.map((d) => d.label)).range([margin.top, height - margin.bottom]).padding(0.4);

    if (baseline > 0) {
      svg
        .append("line")
        .attr("x1", x(baseline))
        .attr("x2", x(baseline))
        .attr("y1", margin.top - 10)
        .attr("y2", height - margin.bottom)
        .attr("stroke", "#0b6bff")
        .attr("stroke-dasharray", "4 4")
        .attr("stroke-width", 1.4);

      svg
        .append("text")
        .attr("x", x(baseline))
        .attr("y", margin.top - 16)
        .attr("text-anchor", "middle")
        .attr("fill", "#0b6bff")
        .attr("font-size", "0.8rem")
        .text(`${formatNumber(baseline)} metro fines (${cachedRemoteness.year})`);
    }

    svg
      .selectAll("rect")
      .data(dataset)
      .join("rect")
      .attr("x", x(0))
      .attr("y", (d) => y(d.label))
      .attr("width", (d) => x(d.value) - x(0))
      .attr("height", y.bandwidth())
      .attr("fill", (d, index) => (index === 0 ? "#89b4ff" : "#1fc2c2"))
      .on("mousemove", (event, d) => {
        showTooltip(`${d.label}: ${formatNumber(d.value)} fines`, event);
      })
      .on("mouseleave", hideTooltip);

    svg
      .append("g")
      .attr("transform", `translate(0, ${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5));

    svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y));

    updateRemotenessStory(dataset);
  }

  function updateRemotenessStory(dataset) {
    const storyNode = document.getElementById("remoteness-story");
    if (!cachedRemoteness) {
      storyNode.textContent = "";
      return;
    }
    const stateName = STATE_NAME_MAP[cachedRemoteness.stateCode] || cachedRemoteness.stateCode;
    if (viewState.remotenessView === "inner-outer") {
      const [inner, outer] = dataset;
      if (!inner || !outer) {
        storyNode.textContent = `Inner versus outer/remote comparisons are incomplete for ${stateName}.`;
        return;
      }
      const leaning = outer.value > inner.value ? "remote-heavy" : "metro-leaning";
      storyNode.textContent = `${stateName} issued ${formatNumber(inner.value)} fines in inner regional areas and ${formatNumber(outer.value)} across outer/remote regions in ${cachedRemoteness.year}, signalling a ${leaning} skew against ${formatNumber(cachedRemoteness.majorValue)} metro fines.`;
    } else {
      const remote = dataset[0];
      if (!remote) {
        storyNode.textContent = `${stateName} has no remote lane data for ${cachedRemoteness.year}.`;
        return;
      }
      const remoteShare = cachedRemoteness.remoteShare != null ? formatPercent(cachedRemoteness.remoteShare) : "an unknown";
      storyNode.textContent = `${stateName} recorded ${formatNumber(remote.value)} fines outside metro areas in ${cachedRemoteness.year}, representing ${remoteShare} of all fines benchmarked against ${formatNumber(cachedRemoteness.majorValue)} metro fines.`;
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

  function renderCovidChart(stateCode, { vicMonthly, vicAnnual }) {
    const container = d3.select("#covid-chart");
    container.selectAll("*").remove();
    const story = document.getElementById("covid-story");

    if (stateCode !== "VIC") {
      container
        .append("p")
        .attr("class", "chart-empty")
        .text("Monthly COVID-era enforcement timelines were only supplied for Victoria.");
      story.textContent = `Select Victoria on the map to view how lockdown years compare with 2023 camera and police activity.`;
      return;
    }

    if (!vicMonthly.length) {
      container.append("p").attr("class", "chart-empty").text("Monthly enforcement records were not included in the data package.");
      story.textContent = "Upload the Victoria monthly dataset to unlock this timeline.";
      return;
    }

    const detectionMethods = ["Camera", "Police"];
    const colors = { Camera: "#0b6bff", Police: "#ff7f50" };
    const height = 320;
    const margin = { top: 30, right: 20, bottom: 40, left: 60 };
    const { svg, width } = createResponsiveSvg(container, { height });
    const x = d3
      .scaleTime()
      .domain(d3.extent(vicMonthly, (row) => row.date))
      .range([margin.left, width - margin.right]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(vicMonthly, (row) => row["FINES (Sum)"] || 0) * 1.1])
      .range([height - margin.bottom, margin.top]);

    const line = d3
      .line()
      .curve(d3.curveCatmullRom.alpha(0.8))
      .x((row) => x(row.date))
      .y((row) => y(row["FINES (Sum)"] || 0));

    detectionMethods.forEach((method) => {
      const series = vicMonthly.filter((row) => row.DETECTION_METHOD === method);
      svg
        .append("path")
        .datum(series)
        .attr("fill", "none")
        .attr("stroke", colors[method])
        .attr("stroke-width", 2.2)
        .attr("d", line)
        .on("mousemove", (event) => {
          const [xPos] = d3.pointer(event);
          const date = x.invert(xPos);
          const closest = d3.least(series, (row) => Math.abs(row.date - date));
          if (!closest) return;
          showTooltip(`${method} · ${formatMonth(closest.date)}<br/>${formatNumber(closest["FINES (Sum)"])} fines`, event);
        })
        .on("mouseleave", hideTooltip);
    });

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat("%b")));

    svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(6));

    const lockdownBands = [
      { label: "Lockdown 2020", start: new Date("2020-03-01"), end: new Date("2020-10-31") },
      { label: "Lockdown 2021", start: new Date("2021-05-27"), end: new Date("2021-10-21") },
    ];
    lockdownBands.forEach((band) => {
      svg
        .append("rect")
        .attr("x", x(band.start))
        .attr("width", Math.max(0, x(band.end) - x(band.start)))
        .attr("y", margin.top)
        .attr("height", height - margin.top - margin.bottom)
        .attr("fill", "rgba(255,95,118,0.08)");
      svg
        .append("text")
        .attr("x", x(band.start) + 4)
        .attr("y", margin.top + 14)
        .attr("fill", "#c0392b")
        .attr("font-size", "0.75rem")
        .text(band.label);
    });

    const lockdownAverages = getVicLockdownAverages(vicAnnual);
    const summaryText = `Camera enforcement averaged ${formatNumber(lockdownAverages.camera2020)} fines per month during 2020 lockdowns versus ${formatNumber(lockdownAverages.camera2021)} in 2021, before stabilising around ${formatNumber(lockdownAverages.camera2023)} per month in 2023.`;
    story.textContent = summaryText;
  }

  function getVicLockdownAverages(vicAnnual) {
    const raw = d3.rollup(
      vicAnnual,
      (values) => {
        const entry = {};
        values.forEach((row) => {
          entry[row.DETECTION_METHOD] = row["FINES (Sum)"] || 0;
        });
        return entry;
      },
      (row) => row.YEAR
    );
    const camera2020 = Math.round((raw.get(2020)?.Camera || 0) / 12);
    const camera2021 = Math.round((raw.get(2021)?.Camera || 0) / 12);
    const camera2023 = Math.round((raw.get(2023)?.Camera || 0) / 12);
    return { camera2020, camera2021, camera2023 };
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
      button.className = `pill${viewState.detectionFocus === code ? " active" : ""}`;
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
    container.selectAll("*").remove();
    const story = document.getElementById("detection-story");
    if (!ratioRows || !ratioRows.length) {
      container.append("p").attr("class", "chart-empty").text("Camera-police ratio dataset is empty.");
      story.textContent = "Upload the q4 ratio dataset to compare jurisdictions.";
      return;
    }

    const availableStates = Object.keys(ratioRows[0]).filter((key) => key !== "YEAR");
    const seriesList = availableStates.map((code) => ({
      code,
      values: ratioRows.map((row) => ({ year: row.YEAR, value: row[code] })).filter((entry) => Number.isFinite(entry.value)),
    }));

    if (!seriesList.length) {
      container.append("p").attr("class", "chart-empty").text("No valid ratio series found in the dataset.");
      story.textContent = "Ensure each column contains numeric ratios for at least one year.";
      return;
    }

    if (!seriesList.some((series) => series.code === stateCode)) {
      container
        .append("p")
        .attr("class", "chart-empty")
        .text("Ratios were only provided for NSW, VIC, and QLD.");
      story.textContent = `${STATE_NAME_MAP[stateCode] || stateCode} cannot be benchmarked until a camera-police ratio series is provided.`;
      return;
    }

    const height = 260;
    const margin = { top: 20, right: 20, bottom: 35, left: 50 };
    const { svg, width } = createResponsiveSvg(container, { height });
    const years = ratioRows.map((row) => row.YEAR);
    const x = d3.scaleLinear().domain(d3.extent(years)).range([margin.left, width - margin.right]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(seriesList, (series) => d3.max(series.values, (v) => v.value)) * 1.1])
      .nice()
      .range([height - margin.bottom, margin.top]);

    const line = d3
      .line()
      .curve(d3.curveMonotoneX)
      .x((d) => x(d.year))
      .y((d) => y(d.value));

    seriesList.forEach((series) => {
      const highlight = series.code === stateCode;
      svg
        .append("path")
        .datum(series.values)
        .attr("fill", "none")
        .attr("stroke", highlight ? "#0b6bff" : "#c5cfdf")
        .attr("stroke-width", highlight ? 3 : 1.5)
        .attr("opacity", highlight ? 1 : 0.6)
        .attr("d", line);
    });

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(years.length).tickFormat(d3.format("d")));

    svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y));

    const activeSeries = seriesList.find((series) => series.code === stateCode);
    if (activeSeries) {
      const start = activeSeries.values[0];
      const end = activeSeries.values[activeSeries.values.length - 1];
      const direction = end.value > start.value ? "up" : "down";
      story.textContent = `${STATE_NAME_MAP[stateCode] || stateCode} shifted from ${formatDecimal(start.value, 2)} police-per-camera fines in ${start.year} to ${formatDecimal(end.value, 2)} in ${end.year}, trending ${direction}.`;
    }
  }

  function renderRateCard() {
    const container = d3.select("#rate-chart");
    container.selectAll("*").remove();
    const story = document.getElementById("rate-story");
    if (!rateContext || !cachedSummary) {
      container.append("p").attr("class", "chart-empty").text("Rate dataset has not loaded yet.");
      story.textContent = "Refresh once the q5 dataset is available.";
      return;
    }
    if (viewState.rateView === "national") {
      renderNationalRateView(container, story);
    } else {
      renderStateRateView(container, story, rateContext);
    }
  }

  function renderStateRateView(container, story, { rates, locationByYear, regionalDiff }) {
    const rateRows = rates.filter((row) => row.JURISDICTION === activeState);
    if (!rateRows.length) {
      container.append("p").attr("class", "chart-empty").text("No per-licence rate records were delivered for this state.");
      story.textContent = `${STATE_NAME_MAP[activeState]} requires the q5 rate dataset to illustrate per-driver patterns.`;
      return;
    }

    const latest = rateRows.reduce((prev, row) => (row.YEAR > prev.YEAR ? row : prev), rateRows[0]);
    const nationalMax = d3.max(rates, (row) => row.RATE_PER_10K);
    const { share: remoteShare, year: remoteYear } = getRemoteShareForState(activeState, locationByYear, regionalDiff);

    const height = 200;
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const { svg, width } = createResponsiveSvg(container, { height });
    const rateScale = d3.scaleLinear().domain([0, nationalMax || latest.RATE_PER_10K]).range([margin.left, width - margin.right]);
    const remoteScale = d3.scaleLinear().domain([0, 1]).range([margin.left, width - margin.right]);

    svg
      .append("rect")
      .attr("x", margin.left)
      .attr("y", 50)
      .attr("width", rateScale(latest.RATE_PER_10K) - margin.left)
      .attr("height", 20)
      .attr("rx", 10)
      .attr("fill", "#0b6bff");

    svg
      .append("text")
      .attr("x", rateScale(latest.RATE_PER_10K) + 6)
      .attr("y", 65)
      .attr("dominant-baseline", "middle")
      .attr("font-weight", 600)
      .attr("fill", "#0b2768")
      .text(`${formatDecimal(latest.RATE_PER_10K)} per 10k in ${latest.YEAR}`);

    svg
      .append("rect")
      .attr("x", margin.left)
      .attr("y", 120)
      .attr("width", width - margin.left - margin.right)
      .attr("height", 18)
      .attr("rx", 9)
      .attr("fill", "#edf1fb");

    if (remoteShare != null) {
      svg
        .append("rect")
        .attr("x", remoteScale(0))
        .attr("y", 120)
        .attr("width", remoteScale(remoteShare) - remoteScale(0))
        .attr("height", 18)
        .attr("rx", 9)
        .attr("fill", "#00a3a3");

      svg
        .append("text")
        .attr("x", remoteScale(remoteShare) + 6)
        .attr("y", 129)
        .attr("fill", "#006060")
        .attr("font-size", "0.85rem")
        .text(`${formatPercent(remoteShare)} remote/outer share${remoteYear ? ` (${remoteYear})` : ""}`);
    }

    const label = STATE_NAME_MAP[activeState] || activeState;
    story.textContent = remoteShare != null
      ? `${label} recorded ${formatDecimal(latest.RATE_PER_10K)} fines per 10k licences in ${latest.YEAR}; ${formatPercent(remoteShare)} of fines were issued outside major cities.`
      : `${label} has a rate of ${formatDecimal(latest.RATE_PER_10K)} fines per 10k licences in ${latest.YEAR}, but remote shares were not supplied.`;
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
        color: "#0b6bff",
      },
      {
        label: "National average",
        rate: nationalStats.avgRate,
        remoteShare: nationalStats.remoteShare,
        color: "#1fc2c2",
      },
    ];

    const height = 200;
    const margin = { top: 30, right: 20, bottom: 30, left: 160 };
    const { svg, width } = createResponsiveSvg(container, { height });
    const x = d3.scaleLinear().domain([0, d3.max(dataset, (d) => d.rate) * 1.1]).range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(dataset.map((d) => d.label)).range([margin.top, height - margin.bottom]).padding(0.45);

    svg
      .selectAll("rect")
      .data(dataset)
      .join("rect")
      .attr("x", x(0))
      .attr("y", (d) => y(d.label))
      .attr("width", (d) => x(d.rate) - x(0))
      .attr("height", y.bandwidth())
      .attr("rx", 10)
      .attr("fill", (d) => d.color);

    svg
      .selectAll("text.rate-label")
      .data(dataset)
      .join("text")
      .attr("class", "rate-label")
      .attr("x", (d) => x(d.rate) + 8)
      .attr("y", (d) => y(d.label) + y.bandwidth() / 2)
      .attr("dominant-baseline", "middle")
      .attr("font-weight", 600)
      .attr("fill", "#0b2768")
      .text((d) => `${formatDecimal(d.rate)} per 10k`);

    svg
      .selectAll("text.remote-label")
      .data(dataset.filter((d) => d.remoteShare != null))
      .join("text")
      .attr("class", "remote-label")
      .attr("x", (d) => x(d.rate) + 8)
      .attr("y", (d) => y(d.label) + y.bandwidth() / 2 + 16)
      .attr("fill", "#006060")
      .attr("font-size", "0.8rem")
      .text((d) => `${formatPercent(d.remoteShare)} remote share`);

    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).tickSize(0))
      .call((g) => g.selectAll("text").style("font-weight", 600))
      .call((g) => g.selectAll("path,line").remove());

    svg
      .append("g")
      .attr("transform", `translate(0, ${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5));

    const leaderText = nationalStats.leaderName != null && nationalStats.leaderRate != null
      ? ` ${nationalStats.leaderName} currently leads at ${formatDecimal(nationalStats.leaderRate)} per 10k.`
      : "";
    story.textContent = `${cachedSummary.name} sits at ${formatDecimal(cachedSummary.ratePer10k)} fines per 10k versus the national average of ${formatDecimal(nationalStats.avgRate)} in ${nationalStats.latestYear}.${leaderText}`;
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
    tooltip.style("left", `${event.clientX + 16}px`).style("top", `${event.clientY + 16}px`);
  }

  function hideTooltip() {
    tooltip.classed("hidden", true);
  }
})();
