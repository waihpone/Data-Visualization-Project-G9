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

  function getPageCoordinates(event = {}) {
    const clientX = event.clientX ?? 0;
    const clientY = event.clientY ?? 0;
    const scrollX = window.scrollX ?? window.pageXOffset ?? 0;
    const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
    return {
      pageX: event.pageX != null ? event.pageX : clientX + scrollX,
      pageY: event.pageY != null ? event.pageY : clientY + scrollY,
    };
  }

  function positionTooltip(selection, event = {}, offset = 16) {
    if (!selection?.node()) return;
    const tooltipNode = selection.node();
    const { pageX, pageY } = getPageCoordinates(event);
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const scrollX = window.scrollX ?? window.pageXOffset ?? 0;
    const scrollY = window.scrollY ?? window.pageYOffset ?? 0;

    let left = pageX + offset;
    let top = pageY + offset;

    selection.style("left", `${left}px`).style("top", `${top}px`);

    const tooltipWidth = tooltipNode.offsetWidth;
    const tooltipHeight = tooltipNode.offsetHeight;
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

  function showTooltip(html, event) {
    const tooltip = d3.select("#tooltip");
    if (!tooltip.node()) return;
    tooltip.html(html).classed("hidden", false);
    positionTooltip(tooltip, event);
  }

  function hideTooltip() {
    const tooltip = d3.select("#tooltip");
    if (!tooltip.node()) return;
    tooltip.classed("hidden", true);
  }

  function setupScrollSpy({ links, activeClass = "active", itemActiveClass = "active-section", rootMargin = "-45% 0px -45% 0px" } = {}) {
    if (typeof document === "undefined") {
      return () => {};
    }

    const navLinks = Array.isArray(links)
      ? links.filter(Boolean)
      : Array.from(document.querySelectorAll('.story-nav a[href^="#"]'));
    if (!navLinks.length) {
      return () => {};
    }

    const pairs = navLinks
      .map((link) => {
        const hash = link.getAttribute("href");
        if (!hash || !hash.startsWith("#")) {
          return null;
        }
        const section = document.querySelector(hash);
        return section ? { link, section } : null;
      })
      .filter(Boolean);

    if (!pairs.length) {
      return () => {};
    }

    let activeLink = null;
    const setActiveLink = (nextLink) => {
      if (!nextLink || activeLink === nextLink) {
        return;
      }
      activeLink = nextLink;
      navLinks.forEach((anchor) => {
        const isActive = anchor === nextLink;
        anchor.classList.toggle(activeClass, isActive);
        if (isActive) {
          anchor.setAttribute("aria-current", "location");
        } else {
          anchor.removeAttribute("aria-current");
        }
        const parentItem = anchor.parentElement;
        if (parentItem && parentItem.tagName === "LI") {
          parentItem.classList.toggle(itemActiveClass, isActive);
        }
      });
    };

    navLinks.forEach((link) => {
      link.addEventListener("click", () => setActiveLink(link));
    });

    const handleScroll = () => {
      const viewportCenter = window.innerHeight / 2;
      let bestMatch = null;
      let bestDistance = Infinity;
      pairs.forEach((pair) => {
        const rect = pair.section.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
          return;
        }
        const mid = rect.top + rect.height / 2;
        const distance = Math.abs(mid - viewportCenter);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = pair.link;
        }
      });
      if (bestMatch) {
        setActiveLink(bestMatch);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    let observerCleanup = () => {};
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (!visible.length) {
            return;
          }
          const match = pairs.find((pair) => pair.section === visible[0].target);
          if (match) {
            setActiveLink(match.link);
          }
        },
        { rootMargin, threshold: 0.1 }
      );

      pairs.forEach(({ section }) => observer.observe(section));
      setActiveLink(pairs[0].link);
      observerCleanup = () => observer.disconnect();
    } else {
      handleScroll();
    }

    handleScroll();

    return () => {
      observerCleanup();
      window.removeEventListener("scroll", handleScroll);
    };
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
    positionTooltip,
    showTooltip,
    hideTooltip,
    setupScrollSpy,
  };
})();
