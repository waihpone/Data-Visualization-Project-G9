(function () {
  const { records, domains, driverLicences, lockdownAnnotations, remotenessGeo } = window.mockData;
  const totalLicences = Object.values(driverLicences).reduce((sum, value) => sum + value, 0);

  const filters = {
    jurisdiction: "all",
    remoteness: "all",
    ageGroup: "all",
    startDate: new Date("2018-01-01"),
    endDate: new Date("2024-12-01"),
  };

  const state = {
    crossFilterJurisdiction: null,
    hiddenSeries: {
      time: new Set(),
      ratio: new Set(),
      age: new Set(),
    },
    focusRange: null,
    brush: null,
  };

  const palette = {
    Camera: "#0073ff",
    Police: "#ff7f50",
  };

  const tooltip = d3.select("#tooltip");
  const { formatNumber, formatDecimal, formatPercent, formatMonth, prepareChart, createResponsiveSvg, renderLegend } = window.uiUtils;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    hydrateFilters();
    buildLegends();
    attachListeners();
    update();
  }

  function hydrateFilters() {
    const jurisdictionSelect = document.getElementById("jurisdiction-filter");
    jurisdictionSelect.innerHTML = "";
    jurisdictionSelect.append(new Option("All (National)", "all"));
    domains.jurisdictions.forEach((j) => {
      jurisdictionSelect.append(new Option(j, j));
    });

    const remotenessSelect = document.getElementById("remoteness-filter");
    remotenessSelect.innerHTML = "";
    remotenessSelect.append(new Option("All (Default)", "all"));
    domains.remotenessAreas.forEach((r) => remotenessSelect.append(new Option(r, r)));

    const ageSelect = document.getElementById("age-filter");
    ageSelect.innerHTML = "";
    ageSelect.append(new Option("All (Default)", "all"));
    domains.ageGroups.forEach((age) => ageSelect.append(new Option(age, age)));

    document.getElementById("start-date").value = formatInputDate(filters.startDate);
    document.getElementById("end-date").value = formatInputDate(filters.endDate);
  }

  function buildLegends() {
    const shared = { keys: domains.detectionMethods, palette };
    renderLegend({ ...shared, targetId: "time-legend", hiddenSet: state.hiddenSeries.time, onToggle: () => update() });
    renderLegend({ ...shared, targetId: "ratio-legend", hiddenSet: state.hiddenSeries.ratio, onToggle: () => update() });
    renderLegend({ ...shared, targetId: "age-legend", hiddenSet: state.hiddenSeries.age, onToggle: () => update() });
  }

  function attachListeners() {
    document.getElementById("jurisdiction-filter").addEventListener("change", (event) => {
      filters.jurisdiction = event.target.value;
      state.crossFilterJurisdiction = event.target.value === "all" ? null : event.target.value;
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
      filters.startDate = event.target.value ? new Date(event.target.value) : filters.startDate;
      state.focusRange = null;
      update();
    });

    document.getElementById("end-date").addEventListener("change", (event) => {
      filters.endDate = event.target.value ? new Date(event.target.value) : filters.endDate;
      state.focusRange = null;
      update();
    });

    document.getElementById("reset-filters").addEventListener("click", resetFilters);
  }

  function resetFilters() {
    filters.jurisdiction = "all";
    filters.remoteness = "all";
    filters.ageGroup = "all";
    filters.startDate = new Date("2018-01-01");
    filters.endDate = new Date("2024-12-01");
    state.crossFilterJurisdiction = null;
    state.focusRange = null;
    state.hiddenSeries.time.clear();
    state.hiddenSeries.ratio.clear();
    state.hiddenSeries.age.clear();
    hydrateFilters();
    buildLegends();
    update();
  }

  function update() {
    const filtered = getFilteredRecords();
    updateKpis(filtered);
    renderJurisdictionChart(filtered);
    renderRemotenessMap(filtered);
    renderTimeSeries(filtered);
    renderRatioChart(filtered);
    renderAgeChart(filtered);
  }

  function getFilteredRecords() {
    return records.filter((record) => {
      const date = new Date(record.date);
      const jurisdictionMatch =
        filters.jurisdiction === "all" ? true : record.jurisdiction === filters.jurisdiction;
      const remotenessMatch = filters.remoteness === "all" ? true : record.remoteness === filters.remoteness;
      const ageMatch = filters.ageGroup === "all" ? true : record.ageGroup === filters.ageGroup;
      return (
        jurisdictionMatch &&
        remotenessMatch &&
        ageMatch &&
        date >= filters.startDate &&
        date <= filters.endDate
      );
    });
  }

  function updateKpis(recordsSubset) {
    const totalFines = d3.sum(recordsSubset, (d) => d.fines);
    const licenceBase =
      filters.jurisdiction === "all"
        ? totalLicences
        : driverLicences[filters.jurisdiction] || totalLicences;
    const ratePer10k = licenceBase ? (totalFines / licenceBase) * 10000 : 0;

    const cameraFines = d3.sum(recordsSubset.filter((d) => d.detectionMethod === "Camera"), (d) => d.fines);
    const ratio = totalFines ? cameraFines / totalFines : 0;

    const kpiMap = new Map([
      [
        "total",
        {
          label: "Total Fines (Selected Period)",
          value: formatNumber(totalFines),
          meta: "Camera + police combined",
        },
      ],
      [
        "rate",
        {
          label: "Fines per 10,000 Licences",
          value: formatDecimal(ratePer10k),
          meta: filters.jurisdiction === "all" ? "National licence base" : `${filters.jurisdiction} licence base`,
        },
      ],
      [
        "camera-ratio",
        {
          label: "Camera-Detected Fines (Ratio)",
          value: formatPercent(ratio),
          meta: "Share of total fines",
        },
      ],
    ]);

    document.querySelectorAll(".kpi").forEach((el) => {
      const key = el.dataset.kpi;
      const data = kpiMap.get(key);
      if (data) {
        el.innerHTML = `
          <p class="kpi-label">${data.label}</p>
          <p class="kpi-value">${data.value}</p>
          <p class="kpi-meta">${data.meta}</p>
        `;
      }
    });
  }

  function renderJurisdictionChart(recordsSubset) {
    const chart = prepareChart("#jurisdiction-bar");
    const container = chart.selection;

    const aggregated = Array.from(
      d3.rollup(
        recordsSubset,
        (values) => d3.sum(values, (d) => d.fines),
        (d) => d.jurisdiction
      ),
      ([jurisdiction, total]) => ({
        jurisdiction,
        total,
        rate: ((total / (driverLicences[jurisdiction] || totalLicences)) * 10000) || 0,
      })
    )
      .sort((a, b) => d3.descending(a.rate, b.rate))
      .slice(0, 8);

    if (!aggregated.length) {
      chart.empty("No data for current filters.");
      return;
    }

    const height = aggregated.length * 34 + 40;
    const margin = { top: 20, right: 40, bottom: 20, left: 160 };
    const { svg, width } = createResponsiveSvg(container, { height });

    const x = d3.scaleLinear().domain([0, d3.max(aggregated, (d) => d.rate) * 1.1]).range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(aggregated.map((d) => d.jurisdiction)).range([margin.top, height - margin.bottom]).padding(0.2);

    const bars = svg
      .append("g")
      .selectAll("rect")
      .data(aggregated)
      .join("rect")
      .attr("x", margin.left)
      .attr("y", (d) => y(d.jurisdiction))
      .attr("height", y.bandwidth())
      .attr("width", (d) => x(d.rate) - margin.left)
      .attr("fill", (d) => (state.crossFilterJurisdiction === d.jurisdiction ? "#00a3a3" : "#0073ff"))
      .style("cursor", "pointer")
      .on("click", (event, datum) => {
        if (state.crossFilterJurisdiction === datum.jurisdiction) {
          state.crossFilterJurisdiction = null;
          filters.jurisdiction = "all";
          document.getElementById("jurisdiction-filter").value = "all";
        } else {
          state.crossFilterJurisdiction = datum.jurisdiction;
          filters.jurisdiction = datum.jurisdiction;
          document.getElementById("jurisdiction-filter").value = datum.jurisdiction;
        }
        update();
      })
      .on("mousemove", (event, datum) => {
        showTooltip(
          `<strong>${datum.jurisdiction}</strong><br/>Rate per 10k: ${datum.rate.toFixed(1)}<br/>Total fines: ${datum.total.toLocaleString()}`,
          event
        );
      })
      .on("mouseleave", hideTooltip);

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5))
      .selectAll("text")
      .style("font-size", "0.8rem");

    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y))
      .selectAll("text")
      .style("font-size", "0.85rem");

    bars
      .transition()
      .duration(600)
      .attr("width", (d) => x(d.rate) - margin.left);
  }

  function renderRemotenessMap(recordsSubset) {
    const chart = prepareChart("#remoteness-map");
    const container = chart.selection;

    const aggregated = new Map(
      d3.rollup(recordsSubset, (values) => d3.sum(values, (d) => d.fines), (d) => d.remoteness)
    );

    const height = container.node().clientHeight || 280;
    const { svg, width } = createResponsiveSvg(container, { height });

    const projection = d3.geoMercator().fitSize([width, height], remotenessGeo);
    const path = d3.geoPath(projection);
    const values = Array.from(aggregated.values());
    const extent = values.length ? d3.extent(values) : [0, 1];
    const domain = extent[0] === extent[1] ? [0, extent[1] || 1] : extent;
    const color = d3.scaleSequential().domain(domain).interpolator(d3.interpolateBlues);

    svg
      .selectAll("path")
      .data(remotenessGeo.features)
      .join("path")
      .attr("d", path)
      .attr("fill", (d) => color(aggregated.get(d.properties.remoteness) || 0))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .on("mousemove", (event, feature) => {
        const value = aggregated.get(feature.properties.remoteness) || 0;
        showTooltip(
          `<strong>${feature.properties.remoteness}</strong><br/>Fines: ${value.toLocaleString()}`,
          event
        );
      })
      .on("mouseleave", hideTooltip);
  }

  function renderTimeSeries(recordsSubset) {
    const focusChart = prepareChart("#focus-chart");
    const contextChart = prepareChart("#context-chart");
    const containerFocus = focusChart.selection;
    const containerContext = contextChart.selection;

    const monthly = aggregateMonthly(recordsSubset);
    if (!monthly.length) {
      focusChart.empty("No data for current filters.");
      contextChart.empty("Context view unavailable for this selection.");
      return;
    }

    if (!state.focusRange) {
      state.focusRange = d3.extent(monthly, (d) => d.date);
    }

    const activeSeries = domains.detectionMethods.filter((method) => !state.hiddenSeries.time.has(method));
    if (!activeSeries.length) {
      focusChart.empty("Toggle a detection method to see the trend.");
      contextChart.empty("Legend controls are hiding all series.");
      return;
    }

    const focusHeight = 220;
    const contextHeight = 100;
    const margin = { top: 20, right: 20, bottom: 25, left: 48 };

    const { svg: svgFocus, width } = createResponsiveSvg(containerFocus, { height: focusHeight });

    const xFocus = d3.scaleTime().domain(state.focusRange).range([margin.left, width - margin.right]);
    const yFocus = d3
      .scaleLinear()
      .domain([0, d3.max(monthly, (d) => d3.max(activeSeries, (key) => d[key])) * 1.15])
      .nice()
      .range([focusHeight - margin.bottom, margin.top]);

    // Lockdown annotations
    lockdownAnnotations.forEach((annotation) => {
      const start = new Date(annotation.start);
      const end = new Date(annotation.end);
      if (end < state.focusRange[0] || start > state.focusRange[1]) return;
      svgFocus
        .append("rect")
        .attr("x", xFocus(start))
        .attr("y", margin.top)
        .attr("width", xFocus(end) - xFocus(start))
        .attr("height", focusHeight - margin.top - margin.bottom)
        .attr("fill", "rgba(255, 95, 118, 0.15)");
      svgFocus
        .append("text")
        .attr("x", xFocus(start) + 4)
        .attr("y", margin.top + 16)
        .text(annotation.label)
        .attr("fill", "#c03")
        .attr("font-size", "0.75rem");
    });

    const focusLine = d3
      .line()
      .x((d) => xFocus(d.date))
      .y((d) => yFocus(d.value));

    activeSeries.forEach((key) => {
      const data = monthly.map((d) => ({ date: d.date, value: d[key] }));
      svgFocus
        .append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", palette[key])
        .attr("stroke-width", 2.5)
        .attr("d", focusLine)
        .attr("data-series", key);
    });

    svgFocus
      .append("g")
      .attr("transform", `translate(0,${focusHeight - margin.bottom})`)
      .call(d3.axisBottom(xFocus).ticks(5));

    svgFocus.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(yFocus));

    // Tooltip interaction
    svgFocus
      .append("rect")
      .attr("fill", "transparent")
      .attr("pointer-events", "all")
      .attr("x", margin.left)
      .attr("y", margin.top)
      .attr("width", width - margin.left - margin.right)
      .attr("height", focusHeight - margin.top - margin.bottom)
      .on("mousemove", (event) => {
        const [xPos] = d3.pointer(event);
        const date = xFocus.invert(xPos);
        const closest = d3.least(monthly, (d) => Math.abs(d.date - date));
        if (!closest) return;
        const rows = activeSeries.map((key) => `${key}: ${closest[key].toLocaleString()}`).join("<br/>");
        showTooltip(`<strong>${formatMonth(closest.date)}</strong><br/>${rows}`, event);
      })
      .on("mouseleave", hideTooltip);

    // Context area
    const { svg: svgContext, width: widthContext } = createResponsiveSvg(containerContext, { height: contextHeight });

    const xContext = d3.scaleTime().domain(d3.extent(monthly, (d) => d.date)).range([margin.left, widthContext - margin.right]);
    const yContext = d3
      .scaleLinear()
      .domain([0, d3.max(monthly, (d) => d3.max(activeSeries, (key) => d[key]))])
      .nice()
      .range([contextHeight - margin.bottom, margin.top]);

    const area = d3
      .area()
      .x((d) => xContext(d.date))
      .y0(contextHeight - margin.bottom)
      .y1((d) => yContext(d.value));

    activeSeries.forEach((key) => {
      const data = monthly.map((d) => ({ date: d.date, value: d[key] }));
      svgContext
        .append("path")
        .datum(data)
        .attr("fill", palette[key])
        .attr("fill-opacity", 0.2)
        .attr("stroke", palette[key])
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
      .on("brush end", ({ selection }) => {
        if (!selection) return;
        const [x0, x1] = selection.map(xContext.invert);
        state.focusRange = [x0, x1];
        renderTimeSeries(recordsSubset);
      });

    svgContext.append("g").attr("class", "brush").call(brush).call(brush.move, state.focusRange.map(xContext));
  }

  function renderRatioChart(recordsSubset) {
    const chart = prepareChart("#ratio-area");
    const container = chart.selection;

    const yearly = aggregateYearly(recordsSubset);
    if (!yearly.length) {
      chart.empty("No data for current filters.");
      return;
    }

    const activeSeries = domains.detectionMethods.filter((method) => !state.hiddenSeries.ratio.has(method));
    if (!activeSeries.length) {
      chart.empty("Toggle a detection method to view the ratio.");
      return;
    }

    const height = 260;
    const margin = { top: 20, right: 20, bottom: 30, left: 48 };
    const { svg, width } = createResponsiveSvg(container, { height });

    const x = d3
      .scaleBand()
      .domain(yearly.map((d) => d.year))
      .range([margin.left, width - margin.right])
      .padding(0.2);

    const y = d3.scaleLinear().domain([0, 1]).range([height - margin.bottom, margin.top]);

    const stack = d3.stack().keys(activeSeries).value((d, key) => d[key]);
    const stacked = stack(yearly);

    const area = d3
      .area()
      .x((d) => x(d.data.year) + x.bandwidth() / 2)
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]));

    svg
      .selectAll("path")
      .data(stacked)
      .join("path")
      .attr("fill", ({ key }) => palette[key])
      .attr("fill-opacity", 0.7)
      .attr("stroke", "#fff")
      .attr("d", area)
      .on("mousemove", (event, layer) => {
        const [xPos] = d3.pointer(event);
        const index = Math.max(0, Math.min(yearly.length - 1, Math.floor((xPos - margin.left) / x.step())));
        const row = yearly[index];
        if (!row) return;
        showTooltip(
          `<strong>${row.year}</strong><br/>${layer.key}: ${(row[layer.key] * 100).toFixed(1)}%`,
          event
        );
      })
      .on("mouseleave", hideTooltip);

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x));

    svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).tickFormat(d3.format(".0%")));
  }

  function renderAgeChart(recordsSubset) {
    const chart = prepareChart("#age-chart");
    const container = chart.selection;

    const aggregated = aggregateAge(recordsSubset);
    if (!aggregated.length) {
      chart.empty("No data for current filters.");
      return;
    }

    const activeSeries = domains.detectionMethods.filter((method) => !state.hiddenSeries.age.has(method));
    if (!activeSeries.length) {
      chart.empty("Toggle a detection method to view age trends.");
      return;
    }

    const height = 280;
    const margin = { top: 20, right: 20, bottom: 30, left: 120 };
    const { svg, width } = createResponsiveSvg(container, { height });

    const y = d3
      .scaleBand()
      .domain(domains.ageGroups)
      .range([margin.top, height - margin.bottom])
      .padding(0.3);

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(aggregated, (d) => d3.max(activeSeries, (key) => d[key])) * 1.1])
      .range([margin.left, width - margin.right]);

    const x1 = d3.scaleBand().domain(activeSeries).range([0, y.bandwidth()]).padding(0.15);

    const groups = svg
      .append("g")
      .selectAll("g")
      .data(aggregated)
      .join("g")
      .attr("transform", (d) => `translate(0,${y(d.ageGroup)})`);

    groups
      .selectAll("rect")
      .data((d) => activeSeries.map((key) => ({ key, value: d[key], ageGroup: d.ageGroup })))
      .join("rect")
      .attr("x", (d) => x(0))
      .attr("y", (d) => x1(d.key))
      .attr("height", x1.bandwidth())
      .attr("width", (d) => x(d.value) - x(0))
      .attr("fill", (d) => palette[d.key])
      .on("mousemove", (event, datum) => {
        showTooltip(
          `<strong>${datum.ageGroup}</strong><br/>${datum.key}: ${datum.value.toLocaleString()} fines`,
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

  function aggregateMonthly(recordsSubset) {
    return Array.from(
      d3.rollup(
        recordsSubset,
        (values) =>
          d3.rollup(
            values,
            (group) => d3.sum(group, (d) => d.fines),
            (d) => d.detectionMethod
          ),
        (d) => d.date.slice(0, 7)
      ),
      ([month, totals]) => {
        const date = new Date(`${month}-01`);
        const row = { date };
        domains.detectionMethods.forEach((method) => {
          row[method] = totals.get(method) || 0;
        });
        return row;
      }
    ).sort((a, b) => d3.ascending(a.date, b.date));
  }

  function aggregateYearly(recordsSubset) {
    return Array.from(
      d3.rollup(
        recordsSubset,
        (values) =>
          d3.rollup(
            values,
            (group) => d3.sum(group, (d) => d.fines),
            (d) => d.detectionMethod
          ),
        (d) => new Date(d.date).getFullYear()
      ),
      ([year, totals]) => {
        const sum = d3.sum(domains.detectionMethods, (method) => totals.get(method) || 0);
        const row = { year };
        domains.detectionMethods.forEach((method) => {
          row[method] = sum ? (totals.get(method) || 0) / sum : 0;
        });
        return row;
      }
    ).sort((a, b) => d3.ascending(a.year, b.year));
  }

  function aggregateAge(recordsSubset) {
    return Array.from(
      d3.rollup(
        recordsSubset,
        (values) =>
          d3.rollup(
            values,
            (group) => d3.sum(group, (d) => d.fines),
            (d) => d.detectionMethod
          ),
        (d) => d.ageGroup
      ),
      ([ageGroup, totals]) => {
        const row = { ageGroup };
        domains.detectionMethods.forEach((method) => {
          row[method] = totals.get(method) || 0;
        });
        return row;
      }
    ).sort((a, b) => d3.ascending(domains.ageGroups.indexOf(a.ageGroup), domains.ageGroups.indexOf(b.ageGroup)));
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
