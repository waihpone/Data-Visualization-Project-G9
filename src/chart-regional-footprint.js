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
    const placeTooltip = window.uiUtils?.positionTooltip
      ? (event) => window.uiUtils.positionTooltip(tooltip, event)
      : (event) => defaultPositionTooltip(tooltip, event);
    const stateCodes = Object.keys(stateNameMap);
    const stateColors = Object.fromEntries(stateCodes.map((code, index) => [code, OKABE_ITO_SEQUENCE[index % OKABE_ITO_SEQUENCE.length]]));
    const stateRingColors = Object.fromEntries(stateCodes.map((code) => [code, tintColor(stateColors[code], 0.6)]));

    function render({ rows = [], summaries = [] } = {}) {
      if (!container.node()) {
        return;
      }

      const globalViewState = window.viewState || {};

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

      const getNodeKey = (node) => {
        if (!node) return null;
        if (node.depth === 1) {
          return node.data.code || node.data.name;
        }
        const parentKey = node.parent?.data?.code || node.parent?.data?.name || "root";
        return `${parentKey}:${node.data.name}`;
      };

      const nodeByKey = new Map();
      nodes.forEach((node) => {
        nodeByKey.set(getNodeKey(node), node);
      });
      if (globalViewState.regionalHighlight && !nodeByKey.has(globalViewState.regionalHighlight)) {
        globalViewState.regionalHighlight = null;
      }

      const buildTooltipHtml = (node) => {
        const context = buildSunburstContext(node);
        return `<strong>${context.title}</strong><br/>${formatNumber(context.value)} fines (${formatPercent(context.share)})<br/><em>${context.note}</em>`;
      };

      const computeClientPoint = (node) => {
        const [cx, cy] = arc.centroid(node);
        const bbox = svg.node().getBoundingClientRect();
        const clientX = bbox.left + ((cx + size / 2) / size) * bbox.width;
        const clientY = bbox.top + ((cy + size / 2) / size) * bbox.height;
        const scrollX = window.scrollX ?? window.pageXOffset ?? 0;
        const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
        return {
          clientX,
          clientY,
          pageX: clientX + scrollX,
          pageY: clientY + scrollY,
        };
      };

      let arcPaths = null;

      const baseOpacity = (node) => (node.depth === 1 ? 0.9 : 1);
      const isPinned = (node) => Boolean(globalViewState.regionalHighlight && getNodeKey(node) === globalViewState.regionalHighlight);

      const updateHighlightStyles = () => {
        if (!arcPaths) return;
        const hasHighlight = Boolean(globalViewState.regionalHighlight);
        arcPaths
          .attr("stroke-width", (d) => (isPinned(d) ? 2.5 : 1))
          .attr("stroke", (d) => (isPinned(d) ? "#ffffff" : "rgba(255,255,255,0.65)"))
          .attr("fill-opacity", (d) => {
            if (!hasHighlight) {
              return baseOpacity(d);
            }
            return isPinned(d) ? baseOpacity(d) : baseOpacity(d) * 0.35;
          });
      };

      const showPinnedTooltip = () => {
        const key = globalViewState.regionalHighlight;
        if (!key) {
          return;
        }
        const pinnedNode = nodeByKey.get(key);
        if (!pinnedNode) {
          globalViewState.regionalHighlight = null;
          hideTooltip();
          updateHighlightStyles();
          return;
        }
        const coords = computeClientPoint(pinnedNode);
        showTooltip(buildTooltipHtml(pinnedNode), coords);
      };

      const togglePinnedNode = (node, event) => {
        const key = getNodeKey(node);
        if (!key) return;
        if (globalViewState.regionalHighlight === key) {
          globalViewState.regionalHighlight = null;
          updateHighlightStyles();
          hideTooltip();
          return;
        }
        globalViewState.regionalHighlight = key;
        updateHighlightStyles();
        if (event?.clientX != null) {
          showTooltip(buildTooltipHtml(node), event);
        } else {
          showPinnedTooltip();
        }
      };

      const svg = container
        .append("svg")
        .attr("viewBox", `${-size / 2} ${-size / 2} ${size} ${size}`)
        .attr("role", "presentation");

      arcPaths = svg
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
          showTooltip(buildTooltipHtml(node), event);
        })
        .on("mouseleave", () => {
          if (globalViewState.regionalHighlight) {
            showPinnedTooltip();
          } else {
            hideTooltip();
          }
        })
        .on("click", (event, node) => {
          togglePinnedNode(node, event);
        });

      updateHighlightStyles();
      showPinnedTooltip();

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
        ? ` ${balance.name} swings ${formatPercent(Math.abs(balance.remoteShare - balance.metroShare))} between remote and metro demand, underscoring how uneven the footprint can be.`
        : "";
      const remoteSentence = `${topRemote.name} channels ${formatPercent(topRemote.remoteShare)} of fines into remote corridors, with ${secondRemote.name} tracking at ${formatPercent(
        secondRemote.remoteShare
      )}; both outpace the national remote average of roughly ${formatPercent(remoteAverage)}.`;
      const metroSentence = ` ${metroLeader.name} remains the densest city program, keeping ${formatPercent(metroLeader.metroShare)} of infringements inside major centres.`;
      storyNode.text(`${remoteSentence}${metroSentence}${spreadText}`.trim());
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
      placeTooltip(event);
    }

    function hideTooltip() {
      tooltip.classed("hidden", true);
    }

    function defaultPositionTooltip(selection, event = {}, offset = 16) {
      if (!selection?.node()) {
        return;
      }
      const node = selection.node();
      const clientX = event.clientX ?? 0;
      const clientY = event.clientY ?? 0;
      const scrollX = window.scrollX ?? window.pageXOffset ?? 0;
      const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
      const pageX = event.pageX != null ? event.pageX : clientX + scrollX;
      const pageY = event.pageY != null ? event.pageY : clientY + scrollY;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      let left = pageX + offset;
      let top = pageY + offset;
      const tooltipWidth = node.offsetWidth;
      const tooltipHeight = node.offsetHeight;
      const maxLeft = scrollX + viewportWidth - tooltipWidth - offset;
      const maxTop = scrollY + viewportHeight - tooltipHeight - offset;
      if (left > maxLeft) {
        left = Math.max(scrollX + offset, maxLeft);
      }
      if (top > maxTop) {
        top = pageY - tooltipHeight - offset;
        if (top < scrollY + offset) {
          top = Math.max(scrollY + offset, maxTop);
        }
      }
      selection.style("left", `${left}px`).style("top", `${top}px`);
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
