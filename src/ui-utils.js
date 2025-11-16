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

  window.uiUtils = {
    formatNumber,
    formatDecimal,
    formatPercent,
    formatMonth,
    prepareChart,
    createResponsiveSvg,
    renderLegend,
  };
})();
