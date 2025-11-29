/**
 * COVID Monthly Stacked Area chart
 * Extracted from chart-covid-diverging.js
 * Exposes: drawCovidStackedArea, buildCovidPivot, padCovidPivot
 * Depends on globals: d3, STATE_NAME_MAP, covidChartContext, renderChartLegend, showTooltip, hideTooltip, createResponsiveSvg, formatNumber, formatMonth
 */
(function () {
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

  window.drawCovidStackedArea = drawCovidStackedArea;
  window.buildCovidPivot = buildCovidPivot;
  window.padCovidPivot = padCovidPivot;
})();
