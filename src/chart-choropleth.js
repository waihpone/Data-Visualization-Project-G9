 (function () {
  const DEFAULT_GET_TOOLTIP = (summary) =>
    summary ? `<h3>${summary.name}</h3><p>No tooltip template provided.</p>` : "";

  function createChoropleth({
    containerSelector = "#map",
    tooltipRoot = document.body,
    getTooltipContent = DEFAULT_GET_TOOLTIP,
    onStateNavigate = () => {},
  } = {}) {
    const container = d3.select(containerSelector);
    const tooltip = d3
      .select(tooltipRoot)
      .append("div")
      .attr("class", "map-tooltip hidden")
      .attr("role", "status");

    const legend = container.append("div").attr("class", "map-legend hidden");
    const legendTitle = legend.append("p").attr("class", "legend-title");
    const legendGradient = legend.append("div").attr("class", "map-legend__gradient");
    const legendLabels = legend.append("div").attr("class", "map-legend__labels");
    const legendNote = legend.append("p").attr("class", "legend-note").style("display", "none");

    const svg = container.append("svg").attr("role", "presentation");
    const defs = svg.append("defs");
    const HATCH_PATTERN_ID = "no-data-hatch";
    const hatchPattern = defs
      .append("pattern")
      .attr("id", HATCH_PATTERN_ID)
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 8)
      .attr("height", 8);
    hatchPattern.append("rect").attr("width", 8).attr("height", 8).attr("fill", "#d9ddea");
    hatchPattern
      .append("path")
      .attr("d", "M0,0 L8,8 M-2,2 L2,-2 M6,10 L10,6")
      .attr("stroke", "#a2a9bc")
      .attr("stroke-width", 1.2);

    const mapLayer = svg.append("g");

    const zoom = d3
      .zoom()
      .scaleExtent([1, 8])
      .on("zoom", (event) => {
        mapLayer.attr("transform", event.transform);
      });

    svg.call(zoom);
    disableInteractions();

    let features = [];
    let stateSummaries = new Map();
    let colorScale = null;
    let colorMode = "rate";
    let modeConfig = null;
    let currentPath = null;
    let highlightedState = null;

    function setData({ features: nextFeatures = [], summaries = new Map() }) {
      features = nextFeatures;
      stateSummaries = summaries;
      render();
    }

    function setColorScale(nextMode, nextScale, config = {}) {
      colorMode = nextMode;
      colorScale = nextScale;
      modeConfig = config;
      rebuildLegend();
      repaint();
    }

    function render() {
      if (!features.length) {
        return;
      }
      const node = container.node();
      const width = node.clientWidth;
      const height = node.clientHeight;
      svg.attr("viewBox", `0 0 ${width} ${height}`);

      const projection = d3.geoMercator().fitSize([width, height], { type: "FeatureCollection", features });
      currentPath = d3.geoPath(projection);

      const selection = mapLayer.selectAll("path.state").data(features, (d) => d.properties.stateName);

      selection
        .join(
          (enter) =>
            enter
              .append("path")
              .attr("class", "state")
              .attr("role", "button")
              .attr("tabindex", 0)
              .attr("aria-label", (feature) => `Open ${feature.properties.stateName} insights`)
              .attr("d", currentPath)
              .on("mouseenter", (event, feature) => showTooltipFromPointer(event, feature))
              .on("mousemove", (event, feature) => moveTooltip(event, feature))
              .on("mouseleave", hideTooltip)
              .on("focus", (event, feature) => showTooltipFromFocus(event, feature))
              .on("blur", hideTooltip)
              .on("keydown", (event, feature) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleStateNavigate(feature);
                }
              })
              .on("click", (_, feature) => handleStateNavigate(feature)),
          (update) => update.attr("d", currentPath)
        )
        .attr("fill", (feature) => getFillColor(feature))
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 1.1);

      if (highlightedState) {
        highlightState(highlightedState);
      }
    }

    function repaint() {
      if (!colorScale) {
        mapLayer.selectAll("path.state").attr("fill", "#d1d5db");
        legend.classed("hidden", true);
        return;
      }
      legend.classed("hidden", false);
      mapLayer.selectAll("path.state").attr("fill", (feature) => getFillColor(feature));
    }

    function getFillColor(feature) {
      const summary = stateSummaries.get(feature.properties.stateName);
      if (!summary || !colorScale) {
        return "#d1d5db";
      }
      const value = colorMode === "remote" ? summary.remoteShare : summary.ratePer10k;
      if (colorMode === "remote" && (summary.remoteShare == null || !Number.isFinite(summary.remoteShare))) {
        return `url(#${HATCH_PATTERN_ID})`;
      }
      return Number.isFinite(value) ? colorScale(value) : "#d1d5db";
    }

    function highlightState(stateName) {
      highlightedState = stateName;
      mapLayer
        .selectAll("path.state")
        .classed("state--spotlight", (feature) => feature.properties.stateName === stateName);
    }

    function clearHighlight() {
      highlightedState = null;
      mapLayer.selectAll("path.state").classed("state--spotlight", false);
    }

    function flyToFeature(feature) {
      if (!feature || !currentPath) {
        return;
      }
      const bounds = currentPath.bounds(feature);
      const dx = bounds[1][0] - bounds[0][0];
      const dy = bounds[1][1] - bounds[0][1];
      const node = container.node();
      const width = node.clientWidth;
      const height = node.clientHeight;
      const x = (bounds[0][0] + bounds[1][0]) / 2;
      const y = (bounds[0][1] + bounds[1][1]) / 2;
      const scale = Math.min(6, 0.85 / Math.max(dx / width, dy / height));
      const translate = [width / 2 - scale * x, height / 2 - scale * y];
      svg
        .transition()
        .duration(900)
        .call(
          zoom.transform,
          d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
        );
    }

    function resetView() {
      svg.transition().duration(900).call(zoom.transform, d3.zoomIdentity);
    }

    function showTooltipFromPointer(event, feature) {
      showTooltip({ x: event.clientX, y: event.clientY }, feature);
    }

    function showTooltipFromFocus(event, feature) {
      const rect = event.currentTarget.getBoundingClientRect();
      showTooltip({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, feature);
    }

    function moveTooltip(event) {
      tooltip.style("left", `${event.clientX + 18}px`).style("top", `${event.clientY + 18}px`);
    }

    function showTooltip(position, feature) {
      const summary = stateSummaries.get(feature.properties.stateName);
      tooltip.html(getTooltipContent(summary)).classed("hidden", false);
      if (position) {
        tooltip.style("left", `${position.x + 18}px`).style("top", `${position.y + 18}px`);
      }
    }

    function hideTooltip() {
      tooltip.classed("hidden", true);
    }

    function handleStateNavigate(feature) {
      const summary = stateSummaries.get(feature.properties.stateName);
      if (summary) {
        onStateNavigate(summary);
      }
    }

    function rebuildLegend() {
      if (!modeConfig || !colorScale) {
        legend.classed("hidden", true);
        return;
      }

      const domain = colorScale.domain();
      let min = domain[0];
      let max = domain[domain.length - 1];
      if (max < min) {
        [min, max] = [max, min];
      }
      const steps = d3.range(0, 1.01, 0.2).map((t) => {
        const value = min + t * (max - min);
        return colorScale(value);
      });

      legendTitle.text(modeConfig.label || "");
      legendGradient.style("background", `linear-gradient(to right, ${steps.join(", ")})`);
      const formatValue = modeConfig.format || ((value) => value);
      legendLabels.html(`<span>${formatValue(min)}</span><span>${formatValue(max)}</span>`);

      if (modeConfig.note) {
        legendNote.text(modeConfig.note).style("display", "block");
      } else {
        legendNote.text("").style("display", "none");
      }

      legend.attr("aria-label", `Color scale: ${modeConfig.label || colorMode}`);
      legend.classed("hidden", false);
    }

    function resize() {
      render();
    }

    function disableInteractions() {
      svg
        .on("wheel.zoom", null)
        .on("dblclick.zoom", null)
        .on("mousedown.zoom", null)
        .on("mousemove.zoom", null)
        .on("touchstart.zoom", null)
        .on("touchmove.zoom", null);
    }

    return {
      setData,
      setColorScale,
      highlightState,
      clearHighlight,
      flyToFeature,
      resetView,
      resize,
    };
  }

  window.createChoropleth = createChoropleth;
})();
