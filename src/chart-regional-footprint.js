(function () {
  const LOCATION_ORDER = [
    "Major Cities of Australia",
    "Inner Regional Australia",
    "Outer Regional Australia",
    "Remote Australia",
    "Very Remote Australia",
  ];

  const LOCATION_COLORS = {
    "Major Cities of Australia": "#0072B2",
    "Inner Regional Australia": "#009E73",
    "Outer Regional Australia": "#F0E442",
    "Remote Australia": "#D55E00",
    "Very Remote Australia": "#CC79A7",
  };

  const LOCATION_LABELS = {
    "Major Cities of Australia": "Major",
    "Inner Regional Australia": "Inner",
    "Outer Regional Australia": "Outer",
    "Remote Australia": "Remote",
    "Very Remote Australia": "Very remote",
  };

  const OKABE_ITO_SEQUENCE = ["#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7", "#56B4E9", "#F0E442", "#000000"];

  function createRegionalFootprintChart({
    containerSelector = "#regional-chart",
    legendSelector = "#regional-legend",
    storySelector = "#regional-story",
    tooltipSelector = "#tooltip",
    formatNumber = (value) => (value || 0).toLocaleString("en-AU"),
    formatPercent = (value) => `${((value || 0) * 100).toFixed(1)}%`,
    stateNameMap = {},
  } = {}) {
    const container = d3.select(containerSelector);
    const legendNode = d3.select(legendSelector);
    const storyNode = d3.select(storySelector);
    const tooltip = d3.select(tooltipSelector);
    const stateCodes = Object.keys(stateNameMap);
    const stateColors = Object.fromEntries(stateCodes.map((code, index) => [code, OKABE_ITO_SEQUENCE[index % OKABE_ITO_SEQUENCE.length]]));
    const stateRingColors = Object.fromEntries(stateCodes.map((code) => [code, tintColor(stateColors[code], 0.6)]));

    function render({ rows = [], summaries = [] } = {}) {
      if (!container.node()) {
        return;
      }

      container.selectAll("*").remove();
      legendNode.selectAll("*").remove();

      if (!rows.length) {
        showEmptyState(container, "Regional dataset unavailable.");
        storyNode.text("Upload the regional remoteness dataset to unlock the radial partition.");
        return;
      }

      const stateGroups = d3.group(rows, (row) => row.JURISDICTION);
      const rootData = {
        name: "Australia",
        children: Array.from(stateGroups, ([code, entries]) => ({
          name: stateNameMap[code] || code,
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

      svg
        .append("g")
        .selectAll("path")
        .data(nodes)
        .join("path")
        .attr("d", arc)
        .attr("fill", (d) => (d.depth === 1 ? stateRingColors[d.data.code] || "rgba(10,47,81,0.18)" : LOCATION_COLORS[d.data.name] || "#9ba7b9"))
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
        .selectAll("text.sunburst-label.location")
        .data(nodes.filter((node) => node.depth > 1 && node.x1 - node.x0 > 0.03))
        .join("text")
        .attr("class", "sunburst-label location")
        .attr("transform", (d) => labelTransform(d))
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
        const entry = legendNode.append("span").attr("class", "legend-entry");
        entry.append("span").attr("class", "legend-swatch").style("background", LOCATION_COLORS[location] || "#9ba7b9");
        entry.append("span").text(location.replace("Australia", ""));
      });

      updateStory(summaries);
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

    function updateStory(summaries = []) {
      if (!storyNode.node()) {
        return;
      }
      if (!summaries.length) {
        storyNode.text("Add remoteness rows for each state to build the narrative.");
        return;
      }
      const remoteLeaders = summaries.slice().sort((a, b) => b.remoteShare - a.remoteShare);
      const metroLeader = summaries.reduce((best, entry) => (entry.metroShare > best.metroShare ? entry : best), summaries[0]);
      const balance = summaries
        .map((entry) => ({ ...entry, spread: Math.abs(entry.remoteShare - entry.metroShare) }))
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

    function labelTransform(node) {
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
      if (!name) {
        return "";
      }
      const parts = name.split(" ");
      if (parts.length === 1) {
        return parts[0];
      }
      return parts
        .map((word) => word[0])
        .join("")
        .toUpperCase();
    }

    function tintColor(hex, amount = 0.5) {
      if (typeof hex !== "string" || !hex) {
        return hex;
      }
      const color = d3.color(hex);
      if (!color) {
        return hex;
      }
      const mix = (channel) => Math.round(channel + (255 - channel) * amount);
      return d3.rgb(mix(color.r), mix(color.g), mix(color.b)).formatHex();
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

    return {
      render,
    };
  }

  window.createRegionalFootprintChart = createRegionalFootprintChart;
})();
