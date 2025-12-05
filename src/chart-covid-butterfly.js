/**
 * COVID Diverging Area (Butterfly) Chart - annual camera vs police fines
 * Extracted from chart-covid-diverging.js
 * Exposes: buildButterflyChartData, drawCovidAnnualFallback
 * Depends on globals: d3, STATE_NAME_MAP, covidChartContext, renderChartLegend, showTooltip, hideTooltip, createResponsiveSvg
 */
(function () {
  function buildButterflyChartData(stateCode, annualData) {
    const stateRows = annualData.filter((row) => row.JURISDICTION === stateCode);
    if (!stateRows.length) {
      return {
        pivotedData: [],
        maxVal: 0,
        error: `No data available for ${STATE_NAME_MAP[stateCode] || stateCode}`,
      };
    }

    const pivotedData = Array.from(
      d3.rollup(
        stateRows,
        (values) => {
          const entry = { year: values[0].YEAR };
          values.forEach((row) => {
            const method = row.DETECTION_METHOD;
            if (method === "Camera") {
              entry.camera = row["FINES (Sum)"] || 0;
            } else if (method === "Police") {
              entry.police = row["FINES (Sum)"] || 0;
            }
          });
          entry.camera = entry.camera || 0;
          entry.police = entry.police || 0;
          return entry;
        },
        (row) => row.YEAR
      ),
      ([, value]) => value
    ).sort((a, b) => d3.ascending(a.year, b.year));

    const maxVal = d3.max(pivotedData, (d) => Math.max(d.camera, d.police)) || 0;
    if (maxVal === 0) {
      return {
        pivotedData,
        maxVal: 0,
        error: `No fine data available for ${STATE_NAME_MAP[stateCode] || stateCode}`,
      };
    }

    return {
      pivotedData,
      maxVal,
      error: null,
    };
  }

  function drawCovidAnnualFallback(container, storyNode, rows, stateCode) {
    const { pivotedData, maxVal, error } = buildButterflyChartData(stateCode, rows);
    if (error || !pivotedData.length || maxVal === 0) {
      container.selectAll("*").remove();
      covidChartContext = null;
      container
        .append("p")
        .attr("class", "chart-empty")
        .text(error || `${STATE_NAME_MAP[stateCode] || stateCode} needs annual camera versus police data.`);
      storyNode.textContent = error || `Upload camera versus police annual files for ${STATE_NAME_MAP[stateCode] || stateCode} to visualize enforcement trends.`;
      renderChartLegend("covid-legend", []);
      return;
    }

    const height = 400;
    const margin = { top: 40, right: 40, bottom: 50, left: 60 };
    const measuredWidth = container.node()?.clientWidth || container.node()?.parentNode?.clientWidth || 600;
    const cameraColor = "#377eb8";
    const policeColor = "#ff7f00";
    const BASE_RADIUS = 5.5;
    const DIM_RADIUS = 3.5;
    const HIGHLIGHT_RADIUS = 7.5;
    const HOVER_RADIUS = 8.5;

    if (!covidChartContext || Math.abs(measuredWidth - covidChartContext.width) > 4) {
      container.selectAll("*").remove();
      const { svg, width } = createResponsiveSvg(container, { height });

      covidChartContext = {
        svg,
        width,
        height,
        margin,
        cameraColor,
        policeColor,
      };

      const ctx = covidChartContext;
      ctx.root = svg;
      ctx.covidBand = svg.append("g").attr("class", "covid-context-band");
      ctx.covidBandRect = ctx.covidBand.append("rect")
        .attr("y", margin.top)
        .attr("height", height - margin.top - margin.bottom)
        .attr("fill", "#e5e7eb")
        .attr("opacity", 0.5);
      ctx.covidBandLabel = ctx.covidBand.append("text")
        .attr("y", margin.top + 15)
        .attr("text-anchor", "middle")
        .attr("fill", "#6b7280")
        .attr("font-size", "0.75rem")
        .attr("font-weight", 600)
        .text("COVID Era");

      ctx.gridGroup = svg.append("g").attr("class", "butterfly-grid");
      ctx.baseline = svg.append("line")
        .attr("class", "butterfly-baseline")
        .attr("stroke", "#374151")
        .attr("stroke-width", 2.5)
        .attr("stroke-dasharray", "6 4");
      ctx.wingsGroup = svg.append("g").attr("class", "butterfly-wings");
      ctx.cameraWing = ctx.wingsGroup.append("path").attr("class", "butterfly-wing--camera");
      ctx.policeWing = ctx.wingsGroup.append("path").attr("class", "butterfly-wing--police");
      ctx.pointsGroup = svg.append("g").attr("class", "butterfly-points");
      ctx.xAxisGroup = svg.append("g").attr("class", "axis axis--x");
      ctx.yAxisGroup = svg.append("g").attr("class", "axis axis--y");
      ctx.xLabel = svg.append("text")
        .attr("text-anchor", "middle")
        .attr("fill", "#102135")
        .attr("font-size", "0.85rem")
        .text("Year");
      ctx.yLabel = svg.append("text")
        .attr("text-anchor", "middle")
        .attr("fill", "#102135")
        .attr("font-size", "0.85rem")
        .text("Annual Fines");
    }

    const ctx = covidChartContext;
    ctx.width = measuredWidth;
    ctx.svg.attr("viewBox", `0 0 ${ctx.width} ${height}`);

    const xScale = d3.scaleLinear()
      .domain([2018, 2024])
      .range([margin.left, ctx.width - margin.right]);

    const yScale = d3.scaleLinear()
      .domain([-maxVal, maxVal])
      .range([height - margin.bottom, margin.top])
      .nice();

    const centerY = yScale(0);
    const cameraAreaGenerator = d3.area()
      .x((d) => xScale(d.year))
      .y0(yScale(0))
      .y1((d) => yScale(d.camera))
      .curve(d3.curveMonotoneX);
    const policeAreaGenerator = d3.area()
      .x((d) => xScale(d.year))
      .y0(yScale(0))
      .y1((d) => yScale(-d.police))
      .curve(d3.curveMonotoneX);
    const transition = ctx.svg.transition().duration(520).ease(d3.easeCubicInOut);

    ctx.covidBandRect
      .attr("x", xScale(2020))
      .attr("width", xScale(2021) - xScale(2020));
    ctx.covidBandLabel.attr("x", (xScale(2020) + xScale(2021)) / 2);

    ctx.gridGroup.selectAll("line").remove();
    yScale.ticks(6).forEach((tick) => {
      if (tick !== 0) {
        ctx.gridGroup.append("line")
          .attr("x1", margin.left)
          .attr("x2", ctx.width - margin.right)
          .attr("y1", yScale(tick))
          .attr("y2", yScale(tick))
          .attr("stroke", "rgba(15,35,51,0.1)")
          .attr("stroke-width", 1);
      }
    });

    ctx.baseline
      .attr("x1", margin.left)
      .attr("x2", ctx.width - margin.right)
      .attr("y1", centerY)
      .attr("y2", centerY);

    ctx.cameraWing
      .datum(pivotedData)
      .attr("fill", cameraColor)
      .attr("stroke", d3.color(cameraColor).darker(0.5))
      .attr("stroke-width", 1.5)
      .style("opacity", 0.8)
      .transition(transition)
      .attr("d", cameraAreaGenerator);

    ctx.policeWing
      .datum(pivotedData)
      .attr("fill", policeColor)
      .attr("stroke", d3.color(policeColor).darker(0.5))
      .attr("stroke-width", 1.5)
      .style("opacity", 0.8)
      .transition(transition)
      .attr("d", policeAreaGenerator);

    ctx.baseline.raise();

    const cameraPoints = ctx.pointsGroup.selectAll(".point--camera").data(pivotedData, (d) => d.year);
    const policePoints = ctx.pointsGroup.selectAll(".point--police").data(pivotedData, (d) => d.year);

    const buildPointTooltip = (type, datum) => {
      const label = type === "camera" ? "Camera" : "Police";
      const value = type === "camera" ? datum.camera : datum.police;
      return `<strong>${datum.year} - ${label}</strong><br/>${formatNumber(value)} fines`;
    };

    const getHighlightKey = (type, datum) => `${type}-${datum.year}`;
    const getPinned = () => viewState?.covidAnnualHighlight;
    const getPinnedKey = () => {
      const pinned = getPinned();
      return pinned ? `${pinned.type}-${pinned.year}` : null;
    };
    const getCameraNodes = () => ctx.pointsGroup.selectAll(".point--camera");
    const getPoliceNodes = () => ctx.pointsGroup.selectAll(".point--police");

    const showPinnedTooltip = () => {
      const pinned = getPinned();
      const pinnedKey = getPinnedKey();
      if (!pinned || !pinnedKey) {
        return;
      }
      const targetSelection = pinned.type === "camera" ? getCameraNodes() : getPoliceNodes();
      const node = targetSelection.filter((d) => d.year === pinned.year).node();
      const datum = pivotedData.find((entry) => entry.year === pinned.year);
      if (!node || !datum) {
        viewState.covidAnnualHighlight = null;
        hideTooltip();
        return;
      }
      const rect = node.getBoundingClientRect();
      showTooltip(buildPointTooltip(pinned.type, datum), {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      });
    };

    const refreshPointStyles = () => {
      const pinnedKey = getPinnedKey();
      const cameraNodes = getCameraNodes();
      const policeNodes = getPoliceNodes();
      cameraNodes
        .attr("r", (d) => {
          if (!pinnedKey) return BASE_RADIUS;
          return getHighlightKey("camera", d) === pinnedKey ? HIGHLIGHT_RADIUS : DIM_RADIUS;
        })
        .style("opacity", (d) => (!pinnedKey || getHighlightKey("camera", d) === pinnedKey ? 1 : 0.4))
        .attr("stroke-width", (d) => (pinnedKey && getHighlightKey("camera", d) === pinnedKey ? 3 : 2));
      policeNodes
        .attr("r", (d) => {
          if (!pinnedKey) return BASE_RADIUS;
          return getHighlightKey("police", d) === pinnedKey ? HIGHLIGHT_RADIUS : DIM_RADIUS;
        })
        .style("opacity", (d) => (!pinnedKey || getHighlightKey("police", d) === pinnedKey ? 1 : 0.4))
        .attr("stroke-width", (d) => (pinnedKey && getHighlightKey("police", d) === pinnedKey ? 3 : 2));
    };

    const togglePinnedPoint = (type, datum, event) => {
      const pinnedKey = getPinnedKey();
      const key = getHighlightKey(type, datum);
      if (pinnedKey === key) {
        viewState.covidAnnualHighlight = null;
        hideTooltip();
      } else {
        viewState.covidAnnualHighlight = { type, year: datum.year };
        showTooltip(buildPointTooltip(type, datum), event);
      }
      refreshPointStyles();
      if (viewState.covidAnnualHighlight) {
        showPinnedTooltip();
      }
    };

    cameraPoints
      .join((enter) =>
        enter
          .append("circle")
          .attr("class", "point--camera")
          .attr("cx", (d) => xScale(d.year))
          .attr("cy", (d) => yScale(d.camera))
          .attr("r", 0)
          .attr("fill", cameraColor)
          .attr("stroke", "#fff")
          .attr("stroke-width", 2)
          .style("cursor", "pointer")
          .style("opacity", 0)
          .on("mouseover", function (event, d) {
            d3.select(this).attr("r", HOVER_RADIUS);
            showTooltip(buildPointTooltip("camera", d), event);
          })
          .on("mouseout", function () {
            if (viewState?.covidAnnualHighlight) {
              showPinnedTooltip();
            } else {
              hideTooltip();
            }
            refreshPointStyles();
          })
          .on("click", function (event, d) {
            event.stopPropagation();
            togglePinnedPoint("camera", d, event);
          })
          .call((enter) => enter.transition(transition).attr("r", BASE_RADIUS).style("opacity", 1))
      )
      .transition(transition)
      .attr("cx", (d) => xScale(d.year))
      .attr("cy", (d) => yScale(d.camera));

    policePoints
      .join((enter) =>
        enter
          .append("circle")
          .attr("class", "point--police")
          .attr("cx", (d) => xScale(d.year))
          .attr("cy", (d) => yScale(-d.police))
          .attr("r", 0)
          .attr("fill", policeColor)
          .attr("stroke", "#fff")
          .attr("stroke-width", 2)
          .style("cursor", "pointer")
          .style("opacity", 0)
          .on("mouseover", function (event, d) {
            d3.select(this).attr("r", HOVER_RADIUS);
            showTooltip(buildPointTooltip("police", d), event);
          })
          .on("mouseout", function () {
            if (viewState?.covidAnnualHighlight) {
              showPinnedTooltip();
            } else {
              hideTooltip();
            }
            refreshPointStyles();
          })
          .on("click", function (event, d) {
            event.stopPropagation();
            togglePinnedPoint("police", d, event);
          })
          .call((enter) => enter.transition(transition).attr("r", BASE_RADIUS).style("opacity", 1))
      )
      .transition(transition)
      .attr("cx", (d) => xScale(d.year))
      .attr("cy", (d) => yScale(-d.police));

    refreshPointStyles();
    if (viewState?.covidAnnualHighlight) {
      showPinnedTooltip();
    } else {
      hideTooltip();
    }

    ctx.root.on("click", (event) => {
      const node = event.target;
      if (node && typeof node.closest === "function" && node.closest(".point--camera, .point--police")) {
        return;
      }
      if (viewState?.covidAnnualHighlight) {
        viewState.covidAnnualHighlight = null;
        hideTooltip();
        refreshPointStyles();
      }
    });

    const xAxis = d3.axisBottom(xScale).ticks(7).tickFormat(d3.format("d"));
    const yAxis = d3.axisLeft(yScale).ticks(6).tickFormat((d) => d3.format(".2s")(Math.abs(d)));

    ctx.xAxisGroup
      .attr("transform", `translate(0, ${height - margin.bottom})`)
      .transition(transition)
      .call(xAxis)
      .call((axis) => axis.selectAll("text").attr("fill", "#102135"))
      .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.25)"));

    ctx.yAxisGroup
      .attr("transform", `translate(${margin.left},0)`)
      .transition(transition)
      .call(yAxis)
      .call((axis) => axis.selectAll("text").attr("fill", "#102135"))
      .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.25)"));

    ctx.xLabel.transition(transition)
      .attr("x", (margin.left + ctx.width - margin.right) / 2)
      .attr("y", height - 10);
    ctx.yLabel.transition(transition)
      .attr("transform", `translate(15, ${height / 2}) rotate(-90)`);

    const legendData = [
      { label: "Camera", color: cameraColor },
      { label: "Police", color: policeColor },
    ];
    renderChartLegend("covid-legend", legendData);

    const stateName = STATE_NAME_MAP[stateCode] || stateCode;
    const firstYear = pivotedData[0];
    const lastYear = pivotedData[pivotedData.length - 1];
    const peakCamera = d3.max(pivotedData, (d) => d.camera);
    const peakPolice = d3.max(pivotedData, (d) => d.police);

    const cameraDelta = (lastYear.camera || 0) - (firstYear.camera || 0);
    const policeDelta = (lastYear.police || 0) - (firstYear.police || 0);
    const describeDelta = (delta) => {
      if (!delta) return "held steady";
      return `${delta > 0 ? "rose" : "fell"} by ${formatNumber(Math.abs(delta))}`;
    };
    storyNode.textContent = `${stateName} moved from ${formatNumber(firstYear.camera)} camera fines in ${firstYear.year} to ${formatNumber(lastYear.camera)} in ${lastYear.year} (${describeDelta(cameraDelta)} overall), ` +
      `while police detections shifted from ${formatNumber(firstYear.police)} to ${formatNumber(lastYear.police)} (${describeDelta(policeDelta)}). Cameras peaked at ${formatNumber(peakCamera)} fines and police at ${formatNumber(peakPolice)}, making the mirrored COVID corridor easy to compare.`;
  }

  window.buildButterflyChartData = buildButterflyChartData;
  window.drawCovidAnnualFallback = drawCovidAnnualFallback;
})();
