/**
 * Detection Ratio Chart (Camera vs Police)
 * Extracted from state-page.js to keep one file per chart.
 * Exposes globals: buildDetectionFocusControls, renderDetectionChart, buildDetectionStory.
 * Depends on: D3, ui-utils (createResponsiveSvg, formatters), STATE_NAME_MAP, renderChartLegend,
 * showTooltip, hideTooltip, and shared globals (viewState, activeState, detectionFocusContainer, cachedRatioRows, detectionChartContext).
 */
(function () {
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

  // Expose globals
  window.buildDetectionFocusControls = buildDetectionFocusControls;
  window.renderDetectionChart = renderDetectionChart;
  window.buildDetectionStory = buildDetectionStory;
})();
