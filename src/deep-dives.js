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

  const LOCATION_ORDER = [
    "Major Cities of Australia",
    "Inner Regional Australia",
    "Outer Regional Australia",
    "Remote Australia",
    "Very Remote Australia",
  ];

  const LOCATION_COLORS = {
    "Major Cities of Australia": "#0072B2",
    "Inner Regional Australia": "#56B4E9",
    "Outer Regional Australia": "#009E73",
    "Remote Australia": "#E69F00",
    "Very Remote Australia": "#D55E00",
  };

  const LOCATION_LABELS = {
    "Major Cities of Australia": "Major",
    "Inner Regional Australia": "Inner",
    "Outer Regional Australia": "Outer",
    "Remote Australia": "Remote",
    "Very Remote Australia": "Very remote",
  };

  const STATE_RING_COLORS = {
    ACT: "#9CCAE0",
    NSW: "#7BA3CD",
    NT: "#F2B07B",
    QLD: "#F6C667",
    SA: "#C9A0D9",
    TAS: "#80D1C5",
    VIC: "#5FB892",
    WA: "#F3A09F",
  };

  const STATE_COLORS = {
    ACT: "#6C8EBF",
    NSW: "#0F4C81",
    NT: "#B45F04",
    QLD: "#C38400",
    SA: "#7B3F8C",
    TAS: "#1B998B",
    VIC: "#008060",
    WA: "#C0392B",
  };

  const REMOTE_FAMILY = new Set(["Outer Regional Australia", "Remote Australia", "Very Remote Australia"]);

  const tooltip = d3.select("#tooltip");
  const ui = window.uiUtils || {};
  const formatNumber = ui.formatNumber || ((value) => (value || 0).toLocaleString("en-AU"));
  const formatDecimal = ui.formatDecimal || ((value, digits = 1) => Number(value || 0).toFixed(digits));
  const formatPercent = ui.formatPercent || ((value) => `${((value || 0) * 100).toFixed(1)}%`);
  const createResponsiveSvg = ui.createResponsiveSvg || ((selection, { height }) => {
    const width = selection.node().clientWidth || 600;
    const svg = selection.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");
    return { svg, width, height };
  });

  const rateFocusContainer = document.getElementById("rate-focus");
  const remoteKpiValue = document.getElementById("remote-kpi-value");
  const remoteKpiMeta = document.getElementById("remote-kpi-meta");
  const metroKpiValue = document.getElementById("metro-kpi-value");
  const metroKpiMeta = document.getElementById("metro-kpi-meta");
  const rateKpiValue = document.getElementById("rate-kpi-value");
  const rateKpiMeta = document.getElementById("rate-kpi-meta");
  const playbookRemoteHeadline = document.getElementById("playbook-remote-headline");
  const playbookRemoteCopy = document.getElementById("playbook-remote-copy");
  const playbookMetroHeadline = document.getElementById("playbook-metro-headline");
  const playbookMetroCopy = document.getElementById("playbook-metro-copy");
  const playbookRateHeadline = document.getElementById("playbook-rate-headline");
  const playbookRateCopy = document.getElementById("playbook-rate-copy");
  let hiddenRateStates = new Set();
  let cachedRateRows = [];

  Promise.all([
    d3.csv("data/q2_regional_difference.csv", d3.autoType),
    d3.csv("data/q5_rates_by_jurisdiction_year.csv", d3.autoType),
  ])
    .then(([regionalRows, rateRows]) => {
      drawRegionalSunburst(regionalRows || []);
      cachedRateRows = rateRows || [];
      buildRateFocusControls(cachedRateRows);
      drawRateChart();
      updateHeroPanel(regionalRows || [], cachedRateRows);
    })
    .catch((error) => {
      console.error("Deep dive page failed to load datasets", error);
      showEmptyState(d3.select("#regional-chart"), "Regional dataset unavailable.");
      showEmptyState(d3.select("#rate-chart"), "Rate dataset unavailable.");
    });

  function buildRegionalSummaries(rows) {
    if (!rows?.length) {
      return [];
    }
    const grouped = d3.group(rows, (row) => row.JURISDICTION);
    return Array.from(grouped, ([code, entries]) => {
      const total = d3.sum(entries, (row) => row["Sum(FINES)"] || 0);
      if (!total) {
        return null;
      }
      const remoteAbsolute = d3.sum(entries.filter((row) => REMOTE_FAMILY.has(row.LOCATION)), (row) => row["Sum(FINES)"] || 0);
      const metroAbsolute = entries.find((row) => row.LOCATION === "Major Cities of Australia")?.["Sum(FINES)"] || 0;
      return {
        code,
        name: STATE_NAME_MAP[code] || code,
        total,
        remoteAbsolute,
        metroAbsolute,
        remoteShare: remoteAbsolute / total,
        metroShare: metroAbsolute / total,
      };
    }).filter(Boolean);
  }

  function summarizeRateRows(rows) {
    if (!rows?.length) {
      return [];
    }
    const grouped = d3.group(rows, (row) => row.JURISDICTION);
    return Array.from(grouped, ([code, entries]) => {
      const sorted = entries
        .filter((row) => Number.isFinite(row.RATE_PER_10K))
        .sort((a, b) => a.YEAR - b.YEAR);
      if (!sorted.length) {
        return null;
      }
      const earliest = sorted[0];
      const latest = sorted[sorted.length - 1];
      const change = earliest && earliest.RATE_PER_10K ? (latest.RATE_PER_10K - earliest.RATE_PER_10K) / earliest.RATE_PER_10K : null;
      return {
        code,
        name: STATE_NAME_MAP[code] || code,
        earliest,
        latest,
        change,
      };
    }).filter(Boolean);
  }

  function updateHeroPanel(regionalRows, rateRows) {
    const regionalSummaries = buildRegionalSummaries(regionalRows);
    if (remoteKpiValue && remoteKpiMeta) {
      if (!regionalSummaries.length) {
        remoteKpiValue.textContent = "--";
        remoteKpiMeta.textContent = "Add remoteness data to unlock this KPI.";
        if (playbookRemoteHeadline) playbookRemoteHeadline.textContent = "Need remote data";
        if (playbookRemoteCopy) playbookRemoteCopy.textContent = "Upload the regional dataset to see who carries the bush burden.";
      } else {
        const totalFines = d3.sum(regionalSummaries, (entry) => entry.total);
        const remoteTotal = d3.sum(regionalSummaries, (entry) => entry.remoteAbsolute);
        const remoteShareNational = totalFines ? remoteTotal / totalFines : 0;
        const remoteLeader = d3.greatest(regionalSummaries, (entry) => entry.remoteShare) || regionalSummaries[0];
        remoteKpiValue.textContent = formatPercent(remoteShareNational);
        remoteKpiMeta.textContent = `${formatNumber(remoteTotal)} fines across remote and outer regions (${remoteLeader.name} leads)`;
        if (playbookRemoteHeadline) {
          playbookRemoteHeadline.textContent = `${remoteLeader.name} pushes ${formatPercent(remoteLeader.remoteShare)} remote`;
        }
        if (playbookRemoteCopy) {
          const runner = regionalSummaries.filter((entry) => entry.code !== remoteLeader.code).sort((a, b) => b.remoteShare - a.remoteShare)[0];
          playbookRemoteCopy.textContent = runner
            ? `${runner.name} follows at ${formatPercent(runner.remoteShare)}. Toggle both rings to compare bush footprints.`
            : "Use the sunburst to see how that remote share compares with metros.";
        }
      }
    }

    if (metroKpiValue && metroKpiMeta) {
      if (!regionalSummaries.length) {
        metroKpiValue.textContent = "--";
        metroKpiMeta.textContent = "Awaiting metro totals.";
        if (playbookMetroHeadline) playbookMetroHeadline.textContent = "Need metro data";
        if (playbookMetroCopy) playbookMetroCopy.textContent = "Upload city splits to find the densest programs.";
      } else {
        const totalFines = d3.sum(regionalSummaries, (entry) => entry.total);
        const metroTotal = d3.sum(regionalSummaries, (entry) => entry.metroAbsolute);
        const metroShareNational = totalFines ? metroTotal / totalFines : 0;
        const metroLeader = d3.greatest(regionalSummaries, (entry) => entry.metroShare) || regionalSummaries[0];
        metroKpiValue.textContent = formatPercent(metroShareNational);
        metroKpiMeta.textContent = `${formatNumber(metroTotal)} fines fall inside major cities (${metroLeader.name} is the metro anchor)`;
        if (playbookMetroHeadline) {
          playbookMetroHeadline.textContent = `${metroLeader.name} holds ${formatPercent(metroLeader.metroShare)} in capitals`;
        }
        if (playbookMetroCopy) {
          const metroLaggard = regionalSummaries.filter((entry) => entry.code !== metroLeader.code).sort((a, b) => a.metroShare - b.metroShare)[0];
          playbookMetroCopy.textContent = metroLaggard
            ? `${metroLaggard.name} drops to ${formatPercent(metroLaggard.metroShare)} metro share. Hover both slices to compare.`
            : "Use the legend to benchmark city-heavy programs versus remote-first peers.";
        }
      }
    }

    const rateSummaries = summarizeRateRows(rateRows);
    if (rateKpiValue && rateKpiMeta) {
      if (!rateSummaries.length) {
        rateKpiValue.textContent = "--";
        rateKpiMeta.textContent = "Add rate history to compute the spread.";
        if (playbookRateHeadline) playbookRateHeadline.textContent = "Need rate history";
        if (playbookRateCopy) playbookRateCopy.textContent = "Upload the q5 rates file to measure momentum.";
      } else {
        const latestSorted = rateSummaries
          .filter((entry) => entry.latest)
          .sort((a, b) => b.latest.RATE_PER_10K - a.latest.RATE_PER_10K);
        const leader = latestSorted[0];
        const trailer = latestSorted[latestSorted.length - 1];
        const gap = leader && trailer ? leader.latest.RATE_PER_10K - trailer.latest.RATE_PER_10K : 0;
        rateKpiValue.textContent = gap ? `${formatDecimal(gap, 1)} per 10k` : `${formatDecimal(leader.latest.RATE_PER_10K, 1)} per 10k`;
        rateKpiMeta.textContent = trailer
          ? `${leader.name} (${formatDecimal(leader.latest.RATE_PER_10K, 1)}) vs ${trailer.name} (${formatDecimal(trailer.latest.RATE_PER_10K, 1)})`
          : `${leader.name} sets the current pace.`;

        const mover = rateSummaries
          .filter((entry) => Number.isFinite(entry.change))
          .sort((a, b) => b.change - a.change)[0];
        if (playbookRateHeadline) {
          if (mover) {
            playbookRateHeadline.textContent = `${mover.name} ${mover.change >= 0 ? "up" : "down"} ${formatPercent(Math.abs(mover.change))}`;
          } else {
            playbookRateHeadline.textContent = `${leader.name} holds the lead`;
          }
        }
        if (playbookRateCopy) {
          if (mover && mover.earliest && mover.latest) {
            playbookRateCopy.textContent = `${mover.name} moved from ${formatDecimal(mover.earliest.RATE_PER_10K, 1)} in ${mover.earliest.YEAR} to ${formatDecimal(
              mover.latest.RATE_PER_10K,
              1
            )} in ${mover.latest.YEAR}. Toggle other pills to see if anyone catches up.`;
          } else {
            playbookRateCopy.textContent = `${leader.name} leads at ${formatDecimal(leader.latest.RATE_PER_10K, 1)} per 10k. Compare peers via the focus pills.`;
          }
        }
      }
    }
  }

  function drawRegionalSunburst(rows) {
    const container = d3.select("#regional-chart");
    container.selectAll("*").remove();
    const legendNode = d3.select("#regional-legend");
    legendNode.selectAll("*").remove();

    if (!rows.length) {
      showEmptyState(container, "Regional dataset unavailable.");
      d3.select("#regional-story").text("Upload the regional remoteness dataset to unlock the radial partition.");
      return;
    }

    const stateGroups = d3.group(rows, (row) => row.JURISDICTION);
    const regionalSummaries = buildRegionalSummaries(rows);
    const rootData = {
      name: "Australia",
      children: Array.from(stateGroups, ([code, entries]) => ({
        name: STATE_NAME_MAP[code] || code,
        code,
        children: entries.map((row) => ({ name: row.LOCATION, value: row["Sum(FINES)"] || 0 })),
      })),
    };

    const hierarchy = d3
      .hierarchy(rootData)
      .sum((d) => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    const size = Math.min(container.node().clientWidth || 520, 620);
    const radius = size / 2 - 8;
    const partition = d3.partition().size([2 * Math.PI, radius]);
    const root = partition(hierarchy);
    const nodes = root.descendants().filter((node) => node.depth > 0);
    const arc = d3
      .arc()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .innerRadius((d) => d.y0)
      .outerRadius((d) => Math.max(0, d.y1 - 5))
      .padAngle(0.003)
      .padRadius(radius / 2);

    const svg = container
      .append("svg")
      .attr("viewBox", `${-size / 2} ${-size / 2} ${size} ${size}`)
      .attr("role", "presentation");

    const arcGroup = svg.append("g");

    arcGroup
      .selectAll("path")
      .data(nodes)
      .join("path")
      .attr("d", arc)
      .attr("fill", (d) => (d.depth === 1 ? STATE_RING_COLORS[d.data.code] || "rgba(10,47,81,0.18)" : LOCATION_COLORS[d.data.name] || "#9ba7b9"))
      .attr("fill-opacity", (d) => (d.depth === 1 ? 0.9 : 1))
      .attr("stroke", "rgba(255,255,255,0.65)")
      .attr("stroke-width", 1)
      .on("mousemove", (event, node) => {
        const context = buildSunburstContext(node);
        showTooltip(
          `<strong>${context.title}</strong><br/>${formatNumber(context.value)} fines (${formatPercent(context.share)})<br/><em>${context.note}</em>`,
          event
        );
      })
      .on("mouseleave", hideTooltip);

    svg
      .append("g")
      .attr("pointer-events", "none")
      .selectAll("text")
      .data(nodes.filter((node) => node.depth > 1 && node.x1 - node.x0 > 0.03))
      .join("text")
      .attr("class", "sunburst-label location")
      .attr("transform", (d) => labelTransform(d, radius))
      .attr("dy", "0.35em")
      .text((d) => formatLocationLabel(d.data.name));

    svg
      .append("g")
      .attr("pointer-events", "none")
      .selectAll("text.sunburst-state-label")
      .data(nodes.filter((node) => node.depth === 1 && node.x1 - node.x0 > 0.08))
      .join("text")
      .attr("class", "sunburst-label sunburst-state-label")
      .attr("text-anchor", "middle")
      .attr("transform", (d) => stateLabelTransform(d, radius))
      .text((d) => d.data.code || formatStateLabel(d.data.name));

    LOCATION_ORDER.forEach((location) => {
      const swatch = legendNode.append("span");
      swatch.append("span").attr("class", "legend-swatch").style("background", LOCATION_COLORS[location] || "#9ba7b9");
      swatch.append("span").text(location.replace("Australia", ""));
    });

    updateRegionalStory(regionalSummaries);
  }

  function buildSunburstContext(node) {
    if (node.depth === 1) {
      return {
        title: node.data.name,
        value: node.value || 0,
        share: node.value / node.parent.value,
        note: "State total within the regional dataset",
      };
    }
    const stateNode = node.parent;
    return {
      title: `${stateNode.data.name} · ${node.data.name}`,
      value: node.value || 0,
      share: (node.value || 0) / (stateNode.value || 1),
      note: `Share of ${stateNode.data.name}'s fines`,
    };
  }

  function labelTransform(node, radius) {
    const angle = (node.x0 + node.x1) / 2;
    const rotate = (angle * 180) / Math.PI - 90;
    const translate = (node.y0 + node.y1) / 2;
    const flip = angle > Math.PI ? 180 : 0;
    return `rotate(${rotate}) translate(${translate},0) rotate(${flip})`;
  }

  function stateLabelTransform(node, radius) {
    const angle = (node.x0 + node.x1) / 2;
    const rotate = (angle * 180) / Math.PI - 90;
    const translate = (node.y0 + node.y1) / 2 || radius * 0.35;
    const flip = angle > Math.PI ? 180 : 0;
    return `rotate(${rotate}) translate(${translate},0) rotate(${flip})`;
  }

  function formatLocationLabel(name) {
    return LOCATION_LABELS[name] || name.split(" ")[0];
  }

  function formatStateLabel(name) {
    if (!name) return "";
    const parts = name.split(" ");
    if (parts.length === 1) {
      return parts[0];
    }
    return parts
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  }

  function updateRegionalStory(summaries) {
    const storyNode = d3.select("#regional-story");
    if (!summaries?.length) {
      storyNode.text("Add remoteness rows for each state to build the narrative.");
      return;
    }

    const remoteLeaders = summaries.slice().sort((a, b) => b.remoteShare - a.remoteShare);
    const metroLeader = summaries.reduce((best, entry) => (entry.metroShare > best.metroShare ? entry : best), summaries[0]);
    const balance = summaries
      .map((entry) => ({
        ...entry,
        spread: Math.abs(entry.remoteShare - entry.metroShare),
      }))
      .sort((a, b) => b.spread - a.spread)[0];
    const remoteAverage = d3.mean(summaries, (entry) => entry.remoteShare) || 0;
    const topRemote = remoteLeaders[0];
    const secondRemote = remoteLeaders[1] || remoteLeaders[0];
    const spreadText = balance
      ? ` ${balance.name} swings ${formatPercent(Math.abs(balance.remoteShare - balance.metroShare))} between bush and metro demand, showing how uneven the footprint can be.`
      : "";
    storyNode.text(
      `${topRemote.name} now directs ${formatPercent(topRemote.remoteShare)} of fines into remote corridors, with ${secondRemote.name} close behind at ${formatPercent(
        secondRemote.remoteShare
      )} - both well above the national remote mix of about ${formatPercent(remoteAverage)}. ${metroLeader.name} remains the most city-heavy system, keeping ${formatPercent(
        metroLeader.metroShare
      )} inside major centres.${spreadText}`
    );
  }

  function buildRateFocusControls(rows) {
    if (!rateFocusContainer) {
      return;
    }
    rateFocusContainer.innerHTML = "";
    const stateCodes = Array.from(new Set(rows.map((row) => row.JURISDICTION).filter(Boolean))).sort((a, b) => (STATE_NAME_MAP[a] || a).localeCompare(STATE_NAME_MAP[b] || b));
    stateCodes.forEach((code) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.state = code;
      button.className = "pill active";
      button.textContent = STATE_NAME_MAP[code] || code;
      const color = STATE_COLORS[code] || "var(--accent)";
      button.style.setProperty("--pill-active-bg", color);
      button.style.setProperty("--pill-border", color);
      button.style.setProperty("--pill-active-color", getReadableTextColor(color));
      button.addEventListener("click", () => {
        if (hiddenRateStates.has(code)) {
          hiddenRateStates.delete(code);
        } else {
          hiddenRateStates.add(code);
        }
        button.classList.toggle("active", !hiddenRateStates.has(code));
        drawRateChart();
      });
      rateFocusContainer.appendChild(button);
    });
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

  function drawRateChart() {
    const container = d3.select("#rate-chart");
    container.selectAll("*").remove();
    const storyNode = d3.select("#rate-story");

    if (!cachedRateRows.length) {
      showEmptyState(container, "Rate dataset unavailable.");
      storyNode.text("Provide the rate history dataset to unlock the multi-line chart.");
      return;
    }

    const grouped = d3.group(cachedRateRows, (row) => row.JURISDICTION);
    const visibleStates = Array.from(grouped.keys()).filter((code) => !hiddenRateStates.has(code));
    if (!visibleStates.length) {
      showEmptyState(container, "Toggle at least one jurisdiction to draw the chart.");
      storyNode.text("Select a state pill to resume rendering.");
      return;
    }

    const series = visibleStates.map((code) => ({
      code,
      name: STATE_NAME_MAP[code] || code,
      values: grouped
        .get(code)
        .map((row) => ({ year: row.YEAR, rate: row.RATE_PER_10K }))
        .sort((a, b) => a.year - b.year),
    }));

    const years = d3.extent(cachedRateRows, (row) => row.YEAR);
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

    const lines = svg
      .append("g")
      .selectAll("path")
      .data(series)
      .join("path")
      .attr("fill", "none")
      .attr("stroke-width", 2.5)
      .attr("stroke", (d) => STATE_COLORS[d.code] || "#5c7089")
      .attr("opacity", (d) => (series.length > 3 ? 0.8 : 1))
      .attr("d", (d) => line(d.values));

    const focusLine = svg
      .append("line")
      .attr("stroke", "rgba(15,35,51,0.35)")
      .attr("stroke-width", 1)
      .attr("y1", margin.top)
      .attr("y2", height - margin.bottom)
      .style("opacity", 0);

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

    const pointerArea = svg
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

    updateRateStory(series);
  }

  function updateRateStory(series) {
    const storyNode = d3.select("#rate-story");
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
})();
