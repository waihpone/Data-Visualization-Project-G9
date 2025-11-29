/**
 * Rates (per 10k) chart module
 * Extracted from state-page.js. Exposes renderRateCard globally.
 * Depends on globals: STATE_NAME_MAP, viewState, activeState, rateContext, cachedSummary, nationalStats,
 * rateScatterData, createResponsiveSvg, formatDecimal, formatPercent, showTooltip, hideTooltip.
 */
(function () {
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

    svg
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
          `<strong> ${datum.name}</strong> <br />Rate: ${formatDecimal(datum.rate)} per 10k <br />Remote share: ${formatPercent(datum.remoteShare)}`,
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

  window.renderRateCard = renderRateCard;
})();
