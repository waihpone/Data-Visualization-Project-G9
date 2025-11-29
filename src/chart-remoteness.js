/**
 * Remoteness (Metro vs Regional) Dumbbell chart
 * Extracted from state-page.js. Exposes renderRemotenessChart globally.
 * Depends on globals: STATE_NAME_MAP, LOCATION_BUCKETS, REMOTE_FAMILY, viewState, rateContext,
 * remotenessCache, formatNumber, formatPercent, showTooltip, hideTooltip, createResponsiveSvg.
 */
(function () {
  function renderRemotenessChart(stateCode) {
    const ctx = window.rateContext;
    if (!ctx) {
      return;
    }
    const cache = window.remotenessCache || new Map();
    window.remotenessCache = cache;
    if (!cache.has(stateCode)) {
      cache.set(stateCode, buildRemotenessViews(stateCode, ctx.locationByYear, ctx.regionalDiff));
    }
    drawRemotenessChart(cache.get(stateCode));
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

    addRemotenessLegend(svg, width, margin);
    updateRemotenessStory(summary, dataset);
  }

  function addRemotenessLegend(svg, width, margin) {
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
      const remoteTotals = dataset
        .filter((row) => REMOTE_FAMILY.has(row.label))
        .reduce(
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
      storyNode.textContent = `${stateName} logged ${formatNumber(metro.stateValue)} metro fines versus ${formatNumber(remoteTotals.state)} across remote classes in ${summary.year}, compared with ${formatNumber(
        metro.nationalValue
      )} and ${formatNumber(remoteTotals.national)} nationally.`;
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

  window.renderRemotenessChart = renderRemotenessChart;
  window.buildRemotenessViews = buildRemotenessViews;
})();
