(function () {
  const DATA_FILES = {
    q1Age: "data/q1_age_group_speeding_fines.csv",
    q2Regional: "data/q2_regional_difference.csv",
    q3Monthly: "data/q3_vic_2023_monthly_camera_police.csv",
    q3Annual: "data/q3_vic_annual_camera_police.csv",
    q4Ratio: "data/q4_police_camera_ratio.csv",
    q5Location: "data/q5_fines_by_jurisdiction_location_year.csv",
    q5Rates: "data/q5_rates_by_jurisdiction_year.csv",
  };

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
  const STATE_CODE_BY_NAME = Object.fromEntries(Object.entries(STATE_NAME_MAP).map(([code, name]) => [name, code]));

  const REMOTENESS_ORDER = [
    "Major Cities of Australia",
    "Inner Regional Australia",
    "Outer Regional Australia",
    "Remote Australia",
    "Very Remote Australia",
  ];

  const AGE_ORDER = ["0-16", "17-25", "26-39", "40-64", "65 and over"];
  const DETECTION_METHODS = ["Camera", "Police"];
  const ALL_STATE_CODES = Object.keys(STATE_NAME_MAP);
  let ageStateKeys = [...ALL_STATE_CODES];
  const RATIO_STATES = ["NSW", "QLD", "VIC"];
  const LOCKDOWN_ANNOTATIONS = [
    { label: "VIC Lockdown 1", start: "2020-03-01", end: "2020-10-30" },
    { label: "VIC Lockdown 2", start: "2021-07-01", end: "2021-10-15" },
  ];

  const detectionPalette = {
    Camera: "#0b6bff",
    Police: "#ff7f50",
  };

  const statePalette = {
    NSW: "#004b9b",
    VIC: "#008060",
    QLD: "#d95f02",
    WA: "#c0392b",
    SA: "#8e44ad",
    ACT: "#2c3e50",
    NT: "#e67e22",
    TAS: "#17a2b8",
  };

  const tooltip = d3.select("#tooltip");
  const { formatNumber, formatDecimal, formatPercent, formatMonth, prepareChart, createResponsiveSvg, renderLegend } = window.uiUtils;

  let remotenessGeo = null;

  const dataStore = {
    q1Age: [],
    q2Regional: [],
    q3MonthlyPivot: [],
    q3MonthlyExtent: null,
    q3AnnualByYear: new Map(),
    q4Ratio: [],
    q5Location: [],
    q5Rates: [],
    ageByGroup: new Map(),
    rateByYear: new Map(),
    availableRateYears: [],
    nationalLocationTotals: new Map(),
    locationByJurisdictionYear: new Map(),
  };

  const domains = {
    jurisdictions: [],
    remoteness: REMOTENESS_ORDER,
    ageGroups: [],
    detectionMethods: DETECTION_METHODS,
  };

  const filters = {
    jurisdiction: "all",
    remoteness: "all",
    ageGroup: "all",
    startDate: new Date("2018-01-01"),
    endDate: new Date("2024-12-31"),
  };

  const state = {
    selectedYear: null,
    focusRange: null,
    hiddenSeries: {
      time: new Set(),
      ratio: new Set(),
      age: new Set(),
    },
  };

  document.addEventListener("DOMContentLoaded", loadData);

  async function loadData() {
    try {
      const remotenessPromise = d3
        .json("data/remoteness.geojson")
        .catch((error) => {
          console.warn("Remoteness boundaries unavailable; continuing without map overlays.", error);
          return null;
        });

      const [q1Age, q2Regional, q3Monthly, q3Annual, q4Ratio, q5Location, q5Rates, remotenessBoundaries] = await Promise.all([
        d3.csv(DATA_FILES.q1Age),
        d3.csv(DATA_FILES.q2Regional),
        d3.csv(DATA_FILES.q3Monthly),
        d3.csv(DATA_FILES.q3Annual),
        d3.csv(DATA_FILES.q4Ratio),
        d3.csv(DATA_FILES.q5Location),
        d3.csv(DATA_FILES.q5Rates),
        remotenessPromise,
      ]);

      dataStore.q1Age = q1Age.map(parseAgeRow);
      dataStore.q2Regional = q2Regional.map(parseRegionalRow);
      dataStore.q3MonthlyPivot = pivotMonthly(q3Monthly.map(parseMonthlyRow));
      dataStore.q3MonthlyExtent = d3.extent(dataStore.q3MonthlyPivot, (row) => row.date);
      dataStore.q3AnnualByYear = buildAnnualMap(q3Annual.map(parseAnnualRow));
      dataStore.q4Ratio = q4Ratio.map(parseRatioRow);
      dataStore.q5Location = q5Location.map(parseLocationRow);
      dataStore.q5Rates = q5Rates.map(parseRateRow);

      remotenessGeo = remotenessBoundaries ? normalizeRemotenessGeo(remotenessBoundaries) : null;
      prepareDerivedData();
      init();
    } catch (error) {
      console.error("Failed to load CSV data", error);
      d3
        .select("#charts")
        .append("p")
        .attr("class", "chart-empty")
        .text("Unable to load official datasets. Please refresh the page.");
    }
  }

  function prepareDerivedData() {
    domains.jurisdictions = Array.from(new Set(dataStore.q5Rates.map((row) => row.jurisdiction))).sort();
    domains.ageGroups = AGE_ORDER.filter((age) => dataStore.q1Age.some((row) => row.ageGroup === age));

    const ageStates = new Set();
    dataStore.ageByGroup = d3.rollup(
      dataStore.q1Age,
      (values) => {
        const entry = {};
        values.forEach((row) => {
          entry[row.jurisdiction] = row.fines;
        });
        return entry;
      },
      (row) => row.ageGroup
    );
    dataStore.q1Age.forEach((row) => {
      if (STATE_NAME_MAP[row.jurisdiction]) {
        ageStates.add(row.jurisdiction);
      }
    });
    ageStateKeys = Array.from(ageStates);
    ageStateKeys.sort((a, b) => (STATE_NAME_MAP[a] || a).localeCompare(STATE_NAME_MAP[b] || b));

    dataStore.rateByYear = d3.group(dataStore.q5Rates, (row) => row.year);
    dataStore.availableRateYears = Array.from(dataStore.rateByYear.keys()).sort((a, b) => a - b);

    dataStore.nationalLocationTotals = d3.rollup(
      dataStore.q2Regional,
      (values) => d3.sum(values, (row) => row.fines),
      (row) => row.location
    );

    dataStore.locationByJurisdictionYear = d3.rollup(
      dataStore.q5Location,
      (values) => d3.rollup(values, (group) => d3.sum(group, (row) => row.fines), (row) => row.location),
      (row) => row.jurisdiction,
      (row) => row.year
    );

    const minYear = dataStore.availableRateYears[0] || 2018;
    const maxYear = dataStore.availableRateYears[dataStore.availableRateYears.length - 1] || 2024;
    filters.startDate = new Date(`${minYear}-01-01`);
    filters.endDate = new Date(`${maxYear}-12-31`);
    state.selectedYear = maxYear;
    state.focusRange = dataStore.q3MonthlyExtent ? [...dataStore.q3MonthlyExtent] : null;
  }

  function init() {
    hydrateFilters();
    buildLegends();
    attachListeners();
    update();
  }

  function hydrateFilters() {
    const jurisdictionSelect = document.getElementById("jurisdiction-filter");
    jurisdictionSelect.innerHTML = "";
    jurisdictionSelect.append(new Option("All jurisdictions", "all"));
    domains.jurisdictions.forEach((code) => {
      jurisdictionSelect.append(new Option(STATE_NAME_MAP[code] || code, code));
    });
    jurisdictionSelect.value = filters.jurisdiction;

    const remotenessSelect = document.getElementById("remoteness-filter");
    remotenessSelect.innerHTML = "";
    remotenessSelect.append(new Option("All locations", "all"));
    domains.remoteness.forEach((location) => remotenessSelect.append(new Option(location, location)));
    remotenessSelect.value = filters.remoteness;

    const ageSelect = document.getElementById("age-filter");
    ageSelect.innerHTML = "";
    ageSelect.append(new Option("All age groups", "all"));
    domains.ageGroups.forEach((age) => ageSelect.append(new Option(age, age)));
    ageSelect.value = filters.ageGroup;

    document.getElementById("start-date").value = formatInputDate(filters.startDate);
    document.getElementById("end-date").value = formatInputDate(filters.endDate);
  }

  function buildLegends() {
    renderLegend({ targetId: "time-legend", keys: DETECTION_METHODS, palette: detectionPalette, hiddenSet: state.hiddenSeries.time, onToggle: () => update() });
    renderLegend({ targetId: "ratio-legend", keys: RATIO_STATES, palette: statePalette, hiddenSet: state.hiddenSeries.ratio, onToggle: () => update() });
    if (ageStateKeys.length) {
      renderLegend({ targetId: "age-legend", keys: ageStateKeys, palette: statePalette, hiddenSet: state.hiddenSeries.age, onToggle: () => update() });
    } else {
      const legendNode = document.getElementById("age-legend");
      if (legendNode) {
        legendNode.textContent = "Age-by-state legend will appear once the q1 dataset loads.";
      }
    }
  }

  function attachListeners() {
    document.getElementById("jurisdiction-filter").addEventListener("change", (event) => {
      filters.jurisdiction = event.target.value;
      update();
    });

    document.getElementById("remoteness-filter").addEventListener("change", (event) => {
      filters.remoteness = event.target.value;
      update();
    });

    document.getElementById("age-filter").addEventListener("change", (event) => {
      filters.ageGroup = event.target.value;
      update();
    });

    document.getElementById("start-date").addEventListener("change", (event) => {
      if (!event.target.value) return;
      const next = new Date(event.target.value);
      if (next > filters.endDate) {
        filters.endDate = new Date(next);
        document.getElementById("end-date").value = formatInputDate(filters.endDate);
      }
      filters.startDate = next;
      update();
    });

    document.getElementById("end-date").addEventListener("change", (event) => {
      if (!event.target.value) return;
      const next = new Date(event.target.value);
      if (next < filters.startDate) {
        filters.startDate = new Date(next);
        document.getElementById("start-date").value = formatInputDate(filters.startDate);
      }
      filters.endDate = next;
      update();
    });

    document.getElementById("reset-filters").addEventListener("click", resetFilters);
  }

  function resetFilters() {
    filters.jurisdiction = "all";
    filters.remoteness = "all";
    filters.ageGroup = "all";
    const minYear = dataStore.availableRateYears[0] || 2018;
    const maxYear = dataStore.availableRateYears[dataStore.availableRateYears.length - 1] || 2024;
    filters.startDate = new Date(`${minYear}-01-01`);
    filters.endDate = new Date(`${maxYear}-12-31`);
    state.selectedYear = maxYear;
    state.focusRange = dataStore.q3MonthlyExtent ? [...dataStore.q3MonthlyExtent] : null;
    state.hiddenSeries.time.clear();
    state.hiddenSeries.ratio.clear();
    state.hiddenSeries.age.clear();
    hydrateFilters();
    buildLegends();
    update();
  }

  function update() {
    if (!dataStore.q5Rates.length) return;
    const selectedYear = getSelectedYear();
    state.selectedYear = selectedYear;
    updateKpis(selectedYear);
    renderJurisdictionChart(selectedYear);
    renderRemotenessMap(selectedYear);
    renderTimeSeries();
    renderRatioChart();
    renderAgeChart();
  }

  function updateKpis(selectedYear) {
    const ratesForYear = dataStore.rateByYear.get(selectedYear) || [];
    const topJurisdiction = d3.greatest(ratesForYear, (row) => row.ratePer10k);
    const majorCities = dataStore.nationalLocationTotals.get("Major Cities of Australia") || 0;
    const nationalTotal = d3.sum(dataStore.q2Regional, (row) => row.fines);
    const vicAnnual = dataStore.q3AnnualByYear.get(2023) || {};
    const vicCameraShare = (() => {
      const camera = vicAnnual.Camera || 0;
      const police = vicAnnual.Police || 0;
      const total = camera + police;
      return total ? camera / total : 0;
    })();

    const kpiMap = new Map([
      [
        "total",
        {
          label: `Top Rate (${selectedYear})`,
          value: topJurisdiction ? `${formatDecimal(topJurisdiction.ratePer10k)} per 10k` : "N/A",
          meta: topJurisdiction ? `${STATE_NAME_MAP[topJurisdiction.jurisdiction] || topJurisdiction.jurisdiction}` : "No jurisdiction data",
        },
      ],
      [
        "rate",
        {
          label: "VIC Camera Share (2023)",
          value: formatPercent(vicCameraShare),
          meta: "Camera fines ÷ total fines",
        },
      ],
      [
        "camera-ratio",
        {
          label: "Major Cities Share",
          value: nationalTotal ? formatPercent(majorCities / nationalTotal) : "N/A",
          meta: "National fines in metro areas",
        },
      ],
    ]);

    document.querySelectorAll(".kpi").forEach((element) => {
      const key = element.dataset.kpi;
      const data = kpiMap.get(key);
      if (data) {
        element.innerHTML = `
          <p class="kpi-label">${data.label}</p>
          <p class="kpi-value">${data.value}</p>
          <p class="kpi-meta">${data.meta}</p>
        `;
      }
    });
  }

  function renderJurisdictionChart(selectedYear) {
    const chart = prepareChart("#jurisdiction-bar");
    const container = chart.selection;
    const ratesForYear = dataStore.rateByYear.get(selectedYear);

    if (!ratesForYear || !ratesForYear.length) {
      chart.empty("No rate data for the selected year.");
      return;
    }

    const sorted = [...ratesForYear]
      .map((row) => ({
        jurisdiction: row.jurisdiction,
        label: STATE_NAME_MAP[row.jurisdiction] || row.jurisdiction,
        rate: row.ratePer10k,
        fines: row.totalFines,
      }))
      .sort((a, b) => d3.descending(a.rate, b.rate));

    const height = sorted.length * 32 + 60;
    const margin = { top: 20, right: 40, bottom: 30, left: 170 };
    const { svg, width } = createResponsiveSvg(container, { height });

    const x = d3.scaleLinear().domain([0, d3.max(sorted, (d) => d.rate) * 1.1]).range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(sorted.map((d) => d.label)).range([margin.top, height - margin.bottom]).padding(0.2);

    const bars = svg
      .append("g")
      .selectAll("rect")
      .data(sorted)
      .join("rect")
      .attr("x", margin.left)
      .attr("y", (d) => y(d.label))
      .attr("height", y.bandwidth())
      .attr("width", (d) => x(d.rate) - margin.left)
      .attr("fill", (d) => (filters.jurisdiction === d.jurisdiction ? "#00a3a3" : "#0073ff"))
      .style("cursor", "pointer")
      .on("click", (event, datum) => {
        if (filters.jurisdiction === datum.jurisdiction) {
          filters.jurisdiction = "all";
          document.getElementById("jurisdiction-filter").value = "all";
        } else {
          filters.jurisdiction = datum.jurisdiction;
          document.getElementById("jurisdiction-filter").value = datum.jurisdiction;
        }
        update();
      })
      .on("mousemove", (event, datum) => {
        showTooltip(
          `<strong>${datum.label}</strong><br/>Rate: ${formatDecimal(datum.rate)} per 10k<br/>Fines: ${formatNumber(datum.fines)}`,
          event
        );
      })
      .on("mouseleave", hideTooltip);

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5));

    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y));

    bars
      .transition()
      .duration(600)
      .attr("width", (d) => x(d.rate) - margin.left);
  }

  function renderRemotenessMap(selectedYear) {
    const chart = prepareChart("#remoteness-map");
    const container = chart.selection;
    const dataset = getRemotenessData(selectedYear);

    if (!remotenessGeo || !remotenessGeo.features || !remotenessGeo.features.length) {
      chart.empty("Remoteness boundaries unavailable.");
      return;
    }

    if (!dataset.length) {
      chart.empty("No remoteness records for this selection.");
      return;
    }

    const dataMap = new Map(dataset.map((row) => [row.location, row.fines]));
    const values = dataset.map((row) => row.fines);
    const height = container.node().clientHeight || 320;
    const { svg, width } = createResponsiveSvg(container, { height });
    const color = d3.scaleSequential(d3.interpolateBlues).domain([0, Math.max(1, d3.max(values))]);
    const projection = d3.geoMercator().fitSize([width, height], remotenessGeo);
    const path = d3.geoPath(projection);
    const activeLocation = filters.remoteness;
    const activeJurisdiction = filters.jurisdiction;
    const scopeLabel = activeJurisdiction === "all" ? "Australia" : STATE_NAME_MAP[activeJurisdiction] || activeJurisdiction;

    svg
      .selectAll("path")
      .data(remotenessGeo.features)
      .join("path")
      .attr("d", path)
      .attr("fill", (feature) => {
        const { remoteness, jurisdiction } = feature.properties;
        const value = dataMap.get(remoteness) || 0;
        const stateMatches = activeJurisdiction === "all" || jurisdiction === activeJurisdiction;
        const locationMatches = activeLocation === "all" || remoteness === activeLocation;
        if (!stateMatches) {
          return "#f0f2f8";
        }
        const baseColor = color(value);
        if (locationMatches) {
          return baseColor;
        }
        const tinted = d3.color(baseColor);
        return tinted ? tinted.brighter(0.8).formatHex() : baseColor;
      })
      .attr("fill-opacity", (feature) => {
        const { remoteness, jurisdiction } = feature.properties;
        const stateMatches = activeJurisdiction === "all" || jurisdiction === activeJurisdiction;
        const locationMatches = activeLocation === "all" || remoteness === activeLocation;
        if (!stateMatches) return 0.25;
        return locationMatches ? 1 : 0.55;
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.65)
      .style("cursor", "pointer")
      .on("mousemove", (event, feature) => {
        const location = feature.properties.remoteness;
        const stateName = feature.properties.stateName || STATE_NAME_MAP[feature.properties.jurisdiction] || "";
        const value = dataMap.get(location) || 0;
        showTooltip(
          `<strong>${location}</strong><br/>${stateName || "Multiple jurisdictions"}<br/>${formatNumber(value)} fines<br/><em>${scopeLabel} · ${selectedYear}</em>`,
          event
        );
      })
      .on("mouseleave", hideTooltip)
      .on("click", (event, feature) => {
        const next = filters.remoteness === feature.properties.remoteness ? "all" : feature.properties.remoteness;
        filters.remoteness = next;
        const remotenessSelect = document.getElementById("remoteness-filter");
        if (remotenessSelect) {
          remotenessSelect.value = next;
        }
        update();
      });
  }

  function renderTimeSeries() {
    const focusChart = prepareChart("#focus-chart");
    const contextChart = prepareChart("#context-chart");
    const monthly = dataStore.q3MonthlyPivot;

    if (!monthly.length) {
      focusChart.empty("Monthly time series unavailable.");
      contextChart.empty("No context data available.");
      return;
    }

    if (!state.focusRange) {
      state.focusRange = d3.extent(monthly, (row) => row.date);
    }

    const activeSeries = DETECTION_METHODS.filter((key) => !state.hiddenSeries.time.has(key));
    if (!activeSeries.length) {
      focusChart.empty("Toggle a detection method to view the trend.");
      contextChart.empty("Legend is hiding every series.");
      return;
    }

    const focusHeight = 240;
    const contextHeight = 110;
    const margin = { top: 20, right: 24, bottom: 28, left: 56 };

    const { svg: svgFocus, width } = createResponsiveSvg(focusChart.selection, { height: focusHeight });
    const xFocus = d3.scaleTime().domain(state.focusRange).range([margin.left, width - margin.right]);
    const yFocus = d3
      .scaleLinear()
      .domain([0, d3.max(monthly, (row) => d3.max(activeSeries, (key) => row[key])) * 1.15])
      .nice()
      .range([focusHeight - margin.bottom, margin.top]);

    const line = d3
      .line()
      .x((d) => xFocus(d.date))
      .y((d) => yFocus(d.value));

    activeSeries.forEach((key) => {
      const series = monthly.map((row) => ({ date: row.date, value: row[key] }));
      svgFocus
        .append("path")
        .datum(series)
        .attr("fill", "none")
        .attr("stroke", detectionPalette[key])
        .attr("stroke-width", 2.4)
        .attr("d", line);
    });

    LOCKDOWN_ANNOTATIONS.forEach((annotation) => {
      const start = new Date(annotation.start);
      const end = new Date(annotation.end);
      if (end < state.focusRange[0] || start > state.focusRange[1]) return;
      svgFocus
        .append("rect")
        .attr("x", xFocus(start))
        .attr("y", margin.top)
        .attr("width", Math.max(1, xFocus(end) - xFocus(start)))
        .attr("height", focusHeight - margin.top - margin.bottom)
        .attr("fill", "rgba(255,95,118,0.12)");
      svgFocus
        .append("text")
        .attr("x", xFocus(start) + 4)
        .attr("y", margin.top + 14)
        .attr("fill", "#c03")
        .attr("font-size", "0.7rem")
        .text(annotation.label);
    });

    svgFocus
      .append("g")
      .attr("transform", `translate(0,${focusHeight - margin.bottom})`)
      .call(d3.axisBottom(xFocus).ticks(6));

    svgFocus.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(yFocus));

    svgFocus
      .append("rect")
      .attr("x", margin.left)
      .attr("y", margin.top)
      .attr("width", width - margin.left - margin.right)
      .attr("height", focusHeight - margin.top - margin.bottom)
      .attr("fill", "transparent")
      .on("mousemove", (event) => {
        const [xPos] = d3.pointer(event);
        const date = xFocus.invert(xPos);
        const closest = d3.least(monthly, (row) => Math.abs(row.date - date));
        if (!closest) return;
        const rows = activeSeries.map((key) => `${key}: ${formatNumber(closest[key])}`).join("<br/>");
        showTooltip(`<strong>${formatMonth(closest.date)}</strong><br/>${rows}`, event);
      })
      .on("mouseleave", hideTooltip);

    const { svg: svgContext, width: widthContext } = createResponsiveSvg(contextChart.selection, { height: contextHeight });
    const xContext = d3.scaleTime().domain(d3.extent(monthly, (row) => row.date)).range([margin.left, widthContext - margin.right]);
    const yContext = d3
      .scaleLinear()
      .domain([0, d3.max(monthly, (row) => d3.max(activeSeries, (key) => row[key]))])
      .nice()
      .range([contextHeight - margin.bottom, margin.top]);

    const area = d3
      .area()
      .x((d) => xContext(d.date))
      .y0(contextHeight - margin.bottom)
      .y1((d) => yContext(d.value));

    activeSeries.forEach((key) => {
      const series = monthly.map((row) => ({ date: row.date, value: row[key] }));
      svgContext
        .append("path")
        .datum(series)
        .attr("fill", detectionPalette[key])
        .attr("fill-opacity", 0.18)
        .attr("stroke", detectionPalette[key])
        .attr("d", area);
    });

    svgContext
      .append("g")
      .attr("transform", `translate(0,${contextHeight - margin.bottom})`)
      .call(d3.axisBottom(xContext).ticks(6));

    const brush = d3
      .brushX()
      .extent([
        [margin.left, margin.top],
        [widthContext - margin.right, contextHeight - margin.bottom],
      ])
      .on("brush end", (event) => {
        if (!event.selection || !event.sourceEvent) return;
        const [x0, x1] = event.selection.map(xContext.invert);
        state.focusRange = [x0, x1];
        renderTimeSeries();
      });

    const brushGroup = svgContext.append("g").attr("class", "brush").call(brush);
    if (state.focusRange) {
      brushGroup.call(brush.move, state.focusRange.map(xContext));
    }
  }

  function renderRatioChart() {
    const chart = prepareChart("#ratio-area");
    const container = chart.selection;

    if (!dataStore.q4Ratio.length) {
      chart.empty("Ratio data unavailable.");
      return;
    }

    const [startYear, endYear] = getYearRange();
    const filtered = dataStore.q4Ratio.filter((row) => row.year >= startYear && row.year <= endYear);
    const activeStates = RATIO_STATES.filter((code) => !state.hiddenSeries.ratio.has(code));

    if (!filtered.length) {
      chart.empty("No ratio values for this time window.");
      return;
    }

    if (!activeStates.length) {
      chart.empty("Toggle a state in the legend to resume.");
      return;
    }

    const height = 260;
    const margin = { top: 20, right: 20, bottom: 35, left: 56 };
    const { svg, width } = createResponsiveSvg(container, { height });

    const x = d3.scaleLinear().domain([filtered[0].year, filtered[filtered.length - 1].year]).range([margin.left, width - margin.right]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(filtered, (row) => d3.max(activeStates, (stateKey) => row[stateKey])) * 1.1])
      .nice()
      .range([height - margin.bottom, margin.top]);

    const line = d3
      .line()
      .defined((d) => Number.isFinite(d.value))
      .x((d) => x(d.year))
      .y((d) => y(d.value));

    activeStates.forEach((stateKey) => {
      const series = filtered.map((row) => ({ year: row.year, value: row[stateKey] }));
      svg
        .append("path")
        .datum(series)
        .attr("fill", "none")
        .attr("stroke", statePalette[stateKey])
        .attr("stroke-width", 2)
        .attr("d", line)
        .on("mousemove", (event) => {
          const [xPos] = d3.pointer(event);
          const year = Math.round(x.invert(xPos));
          const match = series.find((row) => row.year === year);
          if (!match) return;
          showTooltip(`${STATE_NAME_MAP[stateKey]} (${year})<br/>Ratio: ${formatDecimal(match.value, 2)}`, event);
        })
        .on("mouseleave", hideTooltip);
    });

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(filtered.length).tickFormat(d3.format("d")));

    svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y));
  }

  function renderAgeChart() {
    const chart = prepareChart("#age-chart");
    const container = chart.selection;

    const ages = filters.ageGroup === "all" ? domains.ageGroups : domains.ageGroups.filter((age) => age === filters.ageGroup);
    const rows = ages.map((ageGroup) => {
      const totals = dataStore.ageByGroup.get(ageGroup) || {};
      const row = { ageGroup };
      ageStateKeys.forEach((code) => {
        row[code] = totals[code] || 0;
      });
      return row;
    });

    const activeStates = ageStateKeys.filter((code) => !state.hiddenSeries.age.has(code));

    if (!rows.length) {
      chart.empty("No age data available.");
      return;
    }

    if (!activeStates.length) {
      const message = ageStateKeys.length
        ? "Toggle at least one state to view the chart."
        : "Supply jurisdiction-level rows in the q1 dataset to render this chart.";
      chart.empty(message);
      return;
    }

    const height = rows.length * 55 + 80;
    const margin = { top: 20, right: 20, bottom: 35, left: 140 };
    const { svg, width } = createResponsiveSvg(container, { height });

    const y = d3.scaleBand().domain(rows.map((row) => row.ageGroup)).range([margin.top, height - margin.bottom]).padding(0.3);
    const x = d3
      .scaleLinear()
      .domain([0, d3.max(rows, (row) => d3.max(activeStates, (code) => row[code])) * 1.1])
      .range([margin.left, width - margin.right]);
    const x1 = d3.scaleBand().domain(activeStates).range([0, y.bandwidth()]).padding(0.2);

    const yGroups = svg
      .append("g")
      .selectAll("g")
      .data(rows)
      .join("g")
      .attr("transform", (row) => `translate(0,${y(row.ageGroup)})`);

    yGroups
      .selectAll("rect")
      .data((row) => activeStates.map((code) => ({ state: code, value: row[code], ageGroup: row.ageGroup })))
      .join("rect")
      .attr("x", x(0))
      .attr("y", (d) => x1(d.state))
      .attr("height", x1.bandwidth())
      .attr("width", (d) => x(d.value) - x(0))
      .attr("fill", (d) => statePalette[d.state])
      .on("mousemove", (event, datum) => {
        showTooltip(
          `<strong>${datum.ageGroup}</strong><br/>${STATE_NAME_MAP[datum.state]}: ${formatNumber(datum.value)} fines`,
          event
        );
      })
      .on("mouseleave", hideTooltip)
      .transition()
      .duration(600)
      .attr("width", (d) => x(d.value) - x(0));

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5));

    svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y));
  }

  function getRemotenessData(selectedYear) {
    if (filters.jurisdiction !== "all") {
      const byJurisdiction = dataStore.locationByJurisdictionYear.get(filters.jurisdiction);
      const byYear = byJurisdiction ? byJurisdiction.get(selectedYear) : null;
      if (!byYear) return [];
      return REMOTENESS_ORDER.map((location) => ({ location, fines: byYear.get(location) || 0 }));
    }
    return REMOTENESS_ORDER.map((location) => ({ location, fines: dataStore.nationalLocationTotals.get(location) || 0 }));
  }

  function getYearRange() {
    const startYear = filters.startDate.getFullYear();
    const endYear = filters.endDate.getFullYear();
    return startYear <= endYear ? [startYear, endYear] : [endYear, startYear];
  }

  function getSelectedYear() {
    const [, endYear] = getYearRange();
    const years = dataStore.availableRateYears;
    if (!years.length) return endYear;
    const candidate = years.filter((year) => year <= endYear).pop();
    return candidate || years[0];
  }

  function parseAgeRow(row) {
    return {
      jurisdiction: row.JURISDICTION,
      ageGroup: row.AGE_GROUP,
      fines: Number(row["Sum(FINES)"]) || 0,
    };
  }

  function parseRegionalRow(row) {
    return {
      jurisdiction: row.JURISDICTION,
      location: row.LOCATION,
      fines: Number(row["Sum(FINES)"]) || 0,
    };
  }

  function parseMonthlyRow(row) {
    return {
      detectionMethod: row.DETECTION_METHOD,
      ym: row.YM,
      date: new Date(`${row.YM}-01`),
      fines: Number(row["FINES (Sum)"]) || 0,
    };
  }

  function parseAnnualRow(row) {
    return {
      year: Number(row.YEAR),
      detectionMethod: row.DETECTION_METHOD,
      fines: Number(row["FINES (Sum)"]) || 0,
    };
  }

  function parseRatioRow(row) {
    return {
      year: Number(row.YEAR),
      NSW: Number(row.NSW) || 0,
      QLD: Number(row.QLD) || 0,
      VIC: Number(row.VIC) || 0,
    };
  }

  function parseLocationRow(row) {
    return {
      year: Number(row.YEAR),
      jurisdiction: row.JURISDICTION,
      location: row.LOCATION,
      fines: Number(row["FINES (Sum)"]) || 0,
    };
  }

  function parseRateRow(row) {
    return {
      year: Number(row.YEAR),
      jurisdiction: row.JURISDICTION,
      state: row.STATE,
      totalFines: Number(row["Sum(FINES)"]) || 0,
      licences: Number(row.LICENCES) || 0,
      ratePer10k: Number(row.RATE_PER_10K) || 0,
    };
  }

  function pivotMonthly(rows) {
    const grouped = d3.group(rows, (row) => row.ym);
    return Array.from(grouped, ([ym, items]) => {
      const date = new Date(`${ym}-01`);
      const entry = { date };
      DETECTION_METHODS.forEach((method) => {
        const match = items.find((row) => row.detectionMethod === method);
        entry[method] = match ? match.fines : 0;
      });
      return entry;
    }).sort((a, b) => d3.ascending(a.date, b.date));
  }

  function buildAnnualMap(rows) {
    return d3.rollup(
      rows,
      (values) => {
        const entry = {};
        values.forEach((row) => {
          entry[row.detectionMethod] = row.fines;
        });
        return entry;
      },
      (row) => row.year
    );
  }

  function normalizeRemotenessGeo(collection) {
    if (!collection || !Array.isArray(collection.features)) {
      return null;
    }
    const features = collection.features
      .filter((feature) => feature && feature.geometry)
      .map((feature) => {
        const properties = { ...(feature.properties || {}) };
        const remoteness = properties.remoteness || properties.raName || properties.RA_NAME_2021 || null;
        const stateName = properties.stateName || properties.STATE_NAME_2021 || "";
        if (!properties.stateName && stateName) {
          properties.stateName = stateName;
        }
        if (!properties.jurisdiction && stateName) {
          properties.jurisdiction = STATE_CODE_BY_NAME[stateName] || null;
        }
        properties.remoteness = remoteness;
        return {
          type: "Feature",
          geometry: feature.geometry,
          properties,
        };
      })
      .filter((feature) => feature.properties.remoteness);
    return features.length ? { type: "FeatureCollection", features } : null;
  }

  function showTooltip(html, event) {
    tooltip.html(html).classed("hidden", false);
    const { clientX, clientY } = event;
    tooltip.style("left", `${clientX + 16}px`).style("top", `${clientY + 16}px`);
  }

  function hideTooltip() {
    tooltip.classed("hidden", true);
  }

  function formatInputDate(date) {
    return date.toISOString().split("T")[0];
  }
})();
