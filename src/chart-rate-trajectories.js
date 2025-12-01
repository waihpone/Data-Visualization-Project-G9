(function () {
  const OKABE_ITO_SEQUENCE = ["#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7", "#56B4E9", "#F0E442", "#000000"];

  function createRateTrajectoriesChart({
    containerSelector = "#rate-chart",
    storySelector = "#rate-story",
    focusContainerSelector = "#rate-focus",
    tooltipSelector = "#tooltip",
    formatDecimal = (value, digits = 1) => Number(value || 0).toFixed(digits),
    formatPercent = (value) => `${((value || 0) * 100).toFixed(1)}%`,
    createResponsiveSvg = defaultCreateResponsiveSvg,
    stateNameMap = {},
  } = {}) {
    const container = d3.select(containerSelector);
    const storyNode = d3.select(storySelector);
    const focusContainer = document.querySelector(focusContainerSelector);
    const tooltip = d3.select(tooltipSelector);
    const stateCodes = Object.keys(stateNameMap);
    const stateColors = Object.fromEntries(stateCodes.map((code, index) => [code, OKABE_ITO_SEQUENCE[index % OKABE_ITO_SEQUENCE.length]]));

    let hiddenStates = new Set();
    let cachedRows = [];

    function setData(rows = []) {
      cachedRows = Array.isArray(rows) ? rows : [];
      hiddenStates.clear();
      buildFocusControls();
      render();
    }

    function buildFocusControls() {
      if (!focusContainer) {
        return;
      }
      focusContainer.innerHTML = "";
      const codes = Array.from(new Set(cachedRows.map((row) => row.JURISDICTION).filter(Boolean))).sort((a, b) =>
        (stateNameMap[a] || a).localeCompare(stateNameMap[b] || b)
      );
      codes.forEach((code, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.state = code;
        button.className = "pill active";
        const label = stateNameMap[code] || code;
        button.textContent = label;
        const color = stateColors[code] || OKABE_ITO_SEQUENCE[index % OKABE_ITO_SEQUENCE.length];
        button.style.setProperty("--pill-active-bg", color);
        button.style.setProperty("--pill-border", color);
        button.style.setProperty("--pill-active-color", getReadableTextColor(color));
        button.addEventListener("click", () => {
          if (hiddenStates.has(code)) {
            hiddenStates.delete(code);
          } else {
            hiddenStates.add(code);
          }
          button.classList.toggle("active", !hiddenStates.has(code));
          render();
        });
        focusContainer.appendChild(button);
      });
    }

    function render() {
      if (!container.node()) {
        return;
      }
      container.selectAll("*").remove();

      if (!cachedRows.length) {
        showEmptyState(container, "Rate dataset unavailable.");
        storyNode.text("Provide the rate history dataset to unlock the multi-line chart.");
        return;
      }

      const grouped = d3.group(cachedRows, (row) => row.JURISDICTION);
      const visibleStates = Array.from(grouped.keys()).filter((code) => !hiddenStates.has(code));
      if (!visibleStates.length) {
        showEmptyState(container, "Toggle at least one jurisdiction to draw the chart.");
        storyNode.text("Select a state pill to resume rendering.");
        return;
      }

      const series = visibleStates.map((code) => ({
        code,
        name: stateNameMap[code] || code,
        values: grouped
          .get(code)
          .map((row) => ({ year: row.YEAR, rate: row.RATE_PER_10K }))
          .sort((a, b) => a.year - b.year),
      }));

      const years = d3.extent(cachedRows, (row) => row.YEAR);
      const maxRate = d3.max(series, (entry) => d3.max(entry.values, (value) => value.rate)) || 1;
      const height = 360;
      const margin = { top: 24, right: 18, bottom: 45, left: 70 };
      const { svg, width } = createResponsiveSvg(container, { height });

      const x = d3.scaleLinear().domain(years).range([margin.left, width - margin.right]);
      const y = d3.scaleLinear().domain([0, maxRate * 1.1]).nice().range([height - margin.bottom, margin.top]);

      const line = d3
        .line()
        .defined((d) => Number.isFinite(d.rate))
        .curve(d3.curveCatmullRom.alpha(0.65))
        .x((d) => x(d.year))
        .y((d) => y(d.rate));

      const focusLine = svg
        .append("line")
        .attr("stroke", "rgba(15,35,51,0.35)")
        .attr("stroke-width", 1)
        .attr("y1", margin.top)
        .attr("y2", height - margin.bottom)
        .style("opacity", 0);

      svg
        .append("g")
        .selectAll("path")
        .data(series)
        .join("path")
        .attr("fill", "none")
        .attr("stroke-width", 2.5)
        .attr("stroke", (d) => stateColors[d.code] || "#5c7089")
        .attr("opacity", (d) => (series.length > 3 ? 0.8 : 1))
        .attr("d", (d) => line(d.values));

      svg
        .append("g")
        .attr("transform", `translate(0, ${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(years[1] - years[0]).tickFormat(d3.format("d")))
        .call((axis) => axis.selectAll("text").attr("fill", "#102135"))
        .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.25)"));

      svg
        .append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(6))
        .call((axis) => axis.selectAll("text").attr("fill", "#102135"))
        .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.25)"));

      svg
        .append("text")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", height - 6)
        .attr("text-anchor", "middle")
        .attr("fill", "#102135")
        .attr("font-size", "0.85rem")
        .text("Year");

      svg
        .append("text")
        .attr("transform", `translate(${margin.left - 45}, ${(margin.top + height - margin.bottom) / 2}) rotate(-90)`)
        .attr("text-anchor", "middle")
        .attr("fill", "#102135")
        .attr("font-size", "0.85rem")
        .text("Fines per 10k licences");

      svg
        .append("rect")
        .attr("fill", "transparent")
        .attr("pointer-events", "all")
        .attr("x", margin.left)
        .attr("y", margin.top)
        .attr("width", width - margin.left - margin.right)
        .attr("height", height - margin.top - margin.bottom)
        .on("mousemove", (event) => {
          const [xPos] = d3.pointer(event);
          const year = Math.round(x.invert(xPos));
          const withinRange = year >= years[0] && year <= years[1];
          if (!withinRange) {
            hideTooltip();
            focusLine.style("opacity", 0);
            return;
          }
          focusLine.style("opacity", 1).attr("x1", x(year)).attr("x2", x(year));
          const yearValues = series
            .map((entry) => ({
              name: entry.name,
              code: entry.code,
              rate: entry.values.find((value) => value.year === year)?.rate,
            }))
            .filter((entry) => Number.isFinite(entry.rate))
            .sort((a, b) => b.rate - a.rate);
          if (!yearValues.length) {
            hideTooltip();
            return;
          }
          const rows = yearValues.map((entry) => `${entry.name}: ${formatDecimal(entry.rate, 1)} / 10k`).join("<br/>");
          showTooltip(`<strong>${year}</strong><br/>${rows}`, event);
        })
        .on("mouseleave", () => {
          hideTooltip();
          focusLine.style("opacity", 0);
        });

      updateStory(series);
    }

    function updateStory(series = []) {
      if (!storyNode.node()) {
        return;
      }
      const latestPoints = series
        .map((entry) => ({
          name: entry.name,
          code: entry.code,
          latest: entry.values[entry.values.length - 1],
          earliest: entry.values[0],
        }))
        .filter((entry) => entry.latest);
      if (!latestPoints.length) {
        storyNode.text("Select a jurisdiction with complete history to narrate the trend.");
        return;
      }
      const leader = latestPoints.reduce((best, entry) => (entry.latest.rate > best.latest.rate ? entry : best), latestPoints[0]);
      const trailer = latestPoints.reduce((best, entry) => (entry.latest.rate < best.latest.rate ? entry : best), latestPoints[0]);
      const movers = latestPoints
        .map((entry) => ({
          name: entry.name,
          earliest: entry.earliest,
          latest: entry.latest,
          change: entry.earliest && entry.latest ? (entry.latest.rate - entry.earliest.rate) / entry.earliest.rate : null,
        }))
        .filter((entry) => Number.isFinite(entry.change));
      const riser = movers.filter((entry) => entry.change > 0).sort((a, b) => b.change - a.change)[0];
      const cooler = movers.filter((entry) => entry.change < 0).sort((a, b) => a.change - b.change)[0];
      const gap = leader !== trailer ? leader.latest.rate - trailer.latest.rate : 0;
      const sortedRates = latestPoints.map((entry) => entry.latest.rate).sort((a, b) => a - b);
      const medianRate = d3.median(sortedRates) || sortedRates[0];

      const gapSentence = gap
        ? ` That leaves a ${formatDecimal(gap, 1)} per-10k gap back to ${trailer.name} at ${formatDecimal(trailer.latest.rate, 1)}.`
        : "";
      const riserSentence = riser
        ? ` ${riser.name} has accelerated ${formatPercent(riser.change)} since ${riser.earliest.year}, the steepest climb in the cohort.`
        : "";
      const coolerSentence = cooler
        ? ` ${cooler.name} cooled the most, easing ${formatPercent(Math.abs(cooler.change))} versus ${cooler.earliest.year}.`
        : "";
      const clusterSentence = latestPoints.length > 2 ? ` Most peers still orbit the ${formatDecimal(medianRate, 1)} per-10k line, so any breakout is easy to spot.` : "";
      storyNode.text(
        `${leader.name} currently sets the pace at ${formatDecimal(leader.latest.rate, 1)} fines per 10k in ${leader.latest.year}.${gapSentence}${riserSentence}${coolerSentence}${clusterSentence}`.trim()
      );
    }

    function showTooltip(html, event) {
      if (!tooltip.node()) {
        return;
      }
      tooltip.html(html).classed("hidden", false);
      const { clientX, clientY } = event;
      tooltip.style("left", `${clientX + 16}px`).style("top", `${clientY + 16}px`);
    }

    function hideTooltip() {
      tooltip.classed("hidden", true);
    }

    function showEmptyState(selection, message) {
      selection.append("p").attr("class", "chart-empty").text(message);
    }

    function getReadableTextColor(hex) {
      if (typeof hex !== "string") {
        return "#fff";
      }
      const value = hex.replace("#", "");
      if (value.length !== 3 && value.length !== 6) {
        return "#fff";
      }
      const normalized = value.length === 3 ? value.split("").map((char) => char + char).join("") : value;
      const r = parseInt(normalized.slice(0, 2), 16) / 255;
      const g = parseInt(normalized.slice(2, 4), 16) / 255;
      const b = parseInt(normalized.slice(4, 6), 16) / 255;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return luminance > 0.6 ? "#102135" : "#fff";
    }

    function defaultCreateResponsiveSvg(selection, { height }) {
      const width = selection.node().clientWidth || 600;
      const svg = selection.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");
      return { svg, width, height };
    }

    return {
      setData,
    };
  }

  window.createRateTrajectoriesChart = createRateTrajectoriesChart;
})();
