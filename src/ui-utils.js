(function () {
  const numberFormatter = new Intl.NumberFormat("en-AU");
  const percentFormatter = new Intl.NumberFormat("en-AU", {
    style: "percent",
    minimumFractionDigits: 1,
  });

  function formatNumber(value) {
    return numberFormatter.format(Math.round(value || 0));
  }

  function formatDecimal(value, digits = 1) {
    return Number(value || 0).toFixed(digits);
  }

  function formatPercent(value) {
    return percentFormatter.format(value || 0);
  }

  function formatMonth(date) {
    return date.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
  }

  function prepareChart(container) {
    const selection = typeof container === "string" ? d3.select(container) : container;
    selection.selectAll("*").remove();
    return {
      selection,
      empty(message) {
        return selection.append("p").attr("class", "chart-empty").text(message);
      },
    };
  }

  function createResponsiveSvg(selection, { height }) {
    const width = selection.node().clientWidth || selection.node().parentNode.clientWidth || 600;
    const svg = selection
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");
    return { svg, width, height };
  }

  function renderLegend({ targetId, keys, palette, hiddenSet, onToggle }) {
    const container = document.getElementById(targetId);
    if (!container) return;
    container.innerHTML = "";
    keys.forEach((key) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.series = key;
      button.innerHTML = `<span class="legend-dot" style="background:${palette[key]}"></span>${key}`;
      if (hiddenSet.has(key)) {
        button.classList.add("muted");
      }
      button.addEventListener("click", () => {
        if (hiddenSet.has(key)) {
          hiddenSet.delete(key);
          button.classList.remove("muted");
        } else {
          hiddenSet.add(key);
          button.classList.add("muted");
        }
        if (typeof onToggle === "function") {
          onToggle(hiddenSet);
        }
      });
      container.appendChild(button);
    });
  }

  function renderChartLegend(targetId, entries) {
    const container = document.getElementById(targetId);
    if (!container) return;
    container.innerHTML = "";
    if (!entries || !entries.length) {
      return;
    }
    entries.forEach((entry) => {
      const item = document.createElement("span");
      item.className = "legend-entry";
      if (entry.type === "line") {
        const line = document.createElement("span");
        line.className = "legend-line";
        const color = entry.color || "#102135";
        line.style.setProperty("--legend-line-color", color);
        if (entry.dashed) {
          line.dataset.pattern = "dashed";
        }
        item.appendChild(line);
      } else {
        const swatch = document.createElement("span");
        swatch.className = "legend-swatch";
        swatch.style.background = entry.color;
        if (entry.borderColor) {
          swatch.style.borderColor = entry.borderColor;
        }
        item.appendChild(swatch);
      }
      const label = document.createElement("span");
      label.textContent = entry.label;
      item.appendChild(label);
      container.appendChild(item);
    });
  }

  function showTooltip(html, event) {
    const tooltip = d3.select("#tooltip");
    if (!tooltip.node()) return;
    tooltip.html(html).classed("hidden", false);
    tooltip.style("left", `${event.clientX + 16}px`).style("top", `${event.clientY + 16}px`);
  }

  function hideTooltip() {
    const tooltip = d3.select("#tooltip");
    if (!tooltip.node()) return;
    tooltip.classed("hidden", true);
  }

  window.uiUtils = {
    formatNumber,
    formatDecimal,
    formatPercent,
    formatMonth,
    prepareChart,
    createResponsiveSvg,
    renderLegend,
    renderChartLegend,
    showTooltip,
    hideTooltip,
  };
})();
