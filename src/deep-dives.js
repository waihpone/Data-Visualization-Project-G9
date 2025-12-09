(function () {
  const STATE_NAME_MAP = window.STATE_NAME_MAP || {
    ACT: "Australian Capital Territory",
    NSW: "New South Wales",
    NT: "Northern Territory",
    QLD: "Queensland",
    SA: "South Australia",
    TAS: "Tasmania",
    VIC: "Victoria",
    WA: "Western Australia",
  };

  const REMOTE_FAMILY = new Set(["Outer Regional Australia", "Remote Australia", "Very Remote Australia"]);

  const ui = window.uiUtils || {};
  const formatNumber = ui.formatNumber || ((value) => (value || 0).toLocaleString("en-AU"));
  const formatDecimal = ui.formatDecimal || ((value, digits = 1) => Number(value || 0).toFixed(digits));
  const formatPercent = ui.formatPercent || ((value) => `${((value || 0) * 100).toFixed(1)}%`);
  const setupScrollSpy = ui.setupScrollSpy || (() => () => {});
  const createResponsiveSvg =
    ui.createResponsiveSvg ||
    ((selection, { height }) => {
      const width = selection.node().clientWidth || 600;
      const svg = selection
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");
      return { svg, width, height };
    });

  const navLinks = Array.from(document.querySelectorAll('.story-nav a[href^="#"]'));
  const scrollTopButton = document.getElementById("scroll-top");

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

  const regionalChart = window.createRegionalFootprintChart
    ? window.createRegionalFootprintChart({
        containerSelector: "#regional-chart",
        legendSelector: "#regional-legend",
        storySelector: "#regional-story",
        tooltipSelector: "#tooltip",
        formatNumber,
        formatPercent,
        stateNameMap: STATE_NAME_MAP,
      })
    : null;

  const rateChart = window.createRateTrajectoriesChart
    ? window.createRateTrajectoriesChart({
        containerSelector: "#rate-chart",
        storySelector: "#rate-story",
        focusContainerSelector: "#rate-focus",
        tooltipSelector: "#tooltip",
        formatDecimal,
        formatPercent,
        createResponsiveSvg,
        stateNameMap: STATE_NAME_MAP,
      })
    : null;

  initNavigation();
  wireScrollTopButton(scrollTopButton);

  Promise.all([
    d3.csv("data/q2_regional_difference.csv", d3.autoType),
    d3.csv("data/q5_rates_by_jurisdiction_year.csv", d3.autoType),
  ])
    .then(([regionalRows = [], rateRows = []]) => {
      const regionalData = buildRegionalSummaries(regionalRows);
      const rateSummaries = summarizeRateRows(rateRows);
      if (regionalChart) {
        regionalChart.render({ rows: regionalData.rows, summaries: regionalData.summaries, year: regionalData.year });
      }
      if (rateChart) {
        rateChart.setData(rateRows);
      }
      updateHeroPanel({ regionalSummaries: regionalData.summaries, regionalYear: regionalData.year, rateSummaries });
    })
    .catch((error) => {
      console.error("Deep dive page failed to load datasets", error);
      if (regionalChart) {
        regionalChart.render({ rows: [], summaries: [], year: null });
      }
      if (rateChart) {
        rateChart.setData([]);
      }
      updateHeroPanel({ regionalSummaries: [], regionalYear: null, rateSummaries: [] });
    });

  function buildRegionalSummaries(rows) {
    if (!rows?.length) {
      return { summaries: [], rows: [], year: null };
    }
    const latestYear = d3.max(rows, (row) => row.YEAR) || null;
    const filteredRows = latestYear ? rows.filter((row) => row.YEAR === latestYear) : rows;
    if (!filteredRows.length) {
      return { summaries: [], rows: [], year: latestYear };
    }
    const grouped = d3.group(filteredRows, (row) => row.JURISDICTION);
    const summaries = Array.from(grouped, ([code, entries]) => {
      const total = d3.sum(entries, (row) => row["Sum(FINES)"] || 0);
      if (!total) {
        return null;
      }
      const remoteAbsolute = d3.sum(entries.filter((row) => REMOTE_FAMILY.has(row.LOCATION)), (row) => row["Sum(FINES)"] || 0);
      const metroAbsolute = entries.find((row) => row.LOCATION === "Major Cities of Australia")?.["Sum(FINES)"] || 0;
      const unknownAbsolute = entries.find((row) => row.LOCATION === "Unknown")?.["Sum(FINES)"] || 0;
      return {
        code,
        name: STATE_NAME_MAP[code] || code,
        year: latestYear,
        total,
        remoteAbsolute,
        metroAbsolute,
        unknownAbsolute,
        remoteShare: remoteAbsolute / total,
        metroShare: metroAbsolute / total,
        unknownShare: unknownAbsolute / total,
      };
    }).filter(Boolean);
    return { summaries, rows: filteredRows, year: latestYear };
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

  function updateHeroPanel({ regionalSummaries = [], regionalYear = null, rateSummaries = [] }) {
    if (remoteKpiValue && remoteKpiMeta) {
      if (!regionalSummaries.length) {
        remoteKpiValue.textContent = "--";
        remoteKpiMeta.textContent = "Add remoteness data to unlock this KPI.";
        if (playbookRemoteHeadline) playbookRemoteHeadline.textContent = "Need remote data";
        if (playbookRemoteCopy) playbookRemoteCopy.textContent = "Upload the regional dataset to see who carries the bush burden.";
      } else {
        const jurisdictionCount = regionalSummaries.length;
        const totalFines = d3.sum(regionalSummaries, (entry) => entry.total);
        const remoteTotal = d3.sum(regionalSummaries, (entry) => entry.remoteAbsolute);
        const remoteShareNational = totalFines ? remoteTotal / totalFines : 0;
        const remoteLeader = d3.greatest(regionalSummaries, (entry) => entry.remoteShare) || regionalSummaries[0];
        const yearSuffix = regionalYear ? ` in ${regionalYear}` : "";
        remoteKpiValue.textContent = formatPercent(remoteShareNational);
        remoteKpiMeta.textContent = `${formatNumber(remoteTotal)} fines landed in remote and outer regions${yearSuffix} across ${jurisdictionCount} jurisdictions.`;
        if (playbookRemoteHeadline) {
          playbookRemoteHeadline.textContent = `${remoteLeader.name} pushes ${formatPercent(remoteLeader.remoteShare)} remote`;
        }
        if (playbookRemoteCopy) {
          const runner = regionalSummaries.filter((entry) => entry.code !== remoteLeader.code).sort((a, b) => b.remoteShare - a.remoteShare)[0];
          const unknownHeavy = regionalSummaries
            .filter((entry) => Number.isFinite(entry.unknownShare) && entry.unknownShare >= 0.1)
            .sort((a, b) => b.unknownShare - a.unknownShare)[0];
          if (unknownHeavy) {
            playbookRemoteCopy.textContent = `${unknownHeavy.name} still leaves ${formatPercent(unknownHeavy.unknownShare)} of ${regionalYear || "latest"} fines as \"Unknown\" corridors; flag that wedge while comparing bush workloads.`;
          } else {
            playbookRemoteCopy.textContent = runner
              ? `${runner.name} follows at ${formatPercent(runner.remoteShare)}. Toggle both rings to compare bush footprints.`
              : "Use the sunburst to see how that remote share compares with metros.";
          }
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
        const jurisdictionCount = regionalSummaries.length;
        const totalFines = d3.sum(regionalSummaries, (entry) => entry.total);
        const metroTotal = d3.sum(regionalSummaries, (entry) => entry.metroAbsolute);
        const metroShareNational = totalFines ? metroTotal / totalFines : 0;
        const metroLeader = d3.greatest(regionalSummaries, (entry) => entry.metroShare) || regionalSummaries[0];
        const yearSuffix = regionalYear ? ` in ${regionalYear}` : "";
        metroKpiValue.textContent = formatPercent(metroShareNational);
        metroKpiMeta.textContent = `${formatNumber(metroTotal)} fines fall inside major cities${yearSuffix} nationwide (${jurisdictionCount} jurisdictions).`;
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

    if (rateKpiValue && rateKpiMeta) {
      if (!rateSummaries.length) {
        rateKpiValue.textContent = "--";
        rateKpiMeta.textContent = "Add rate history to compute the spread.";
        if (playbookRateHeadline) playbookRateHeadline.textContent = "Need rate history";
        if (playbookRateCopy) playbookRateCopy.textContent = "Upload the q5 rates file to measure momentum.";
      } else {
        const latestEntries = rateSummaries.filter((entry) => entry.latest && Number.isFinite(entry.latest.RATE_PER_10K));
        if (!latestEntries.length) {
          rateKpiValue.textContent = "--";
          rateKpiMeta.textContent = "Need latest rate data from at least one jurisdiction.";
        } else {
          const avgRate = d3.mean(latestEntries, (entry) => entry.latest.RATE_PER_10K) || 0;
          const latestYear = d3.max(latestEntries, (entry) => entry.latest.YEAR) || null;
          const yearSuffix = latestYear ? ` · ${latestYear}` : "";
          rateKpiValue.textContent = `${formatDecimal(avgRate, 1)} per 10k`;
          rateKpiMeta.textContent = `${latestEntries.length} jurisdictions reporting${yearSuffix}`;
        }

        const latestSorted = latestEntries.slice().sort((a, b) => (b.latest?.RATE_PER_10K || 0) - (a.latest?.RATE_PER_10K || 0));
        const leader = latestSorted[0];
        const trailer = latestSorted[latestSorted.length - 1];
        const mover = rateSummaries
          .filter((entry) => Number.isFinite(entry.change))
          .sort((a, b) => b.change - a.change)[0];
        if (playbookRateHeadline) {
          if (mover) {
            playbookRateHeadline.textContent = `${mover.name} ${mover.change >= 0 ? "up" : "down"} ${formatPercent(Math.abs(mover.change))}`;
          } else if (leader && leader.latest) {
            playbookRateHeadline.textContent = `${leader.name} holds the lead`;
          } else {
            playbookRateHeadline.textContent = "Need rate history";
          }
        }
        if (playbookRateCopy) {
          if (mover && mover.earliest && mover.latest) {
            playbookRateCopy.textContent = `${mover.name} moved from ${formatDecimal(mover.earliest.RATE_PER_10K, 1)} in ${mover.earliest.YEAR} to ${formatDecimal(mover.latest.RATE_PER_10K, 1)} in ${
              mover.latest.YEAR
            }. Toggle other pills to see if anyone catches up.`;
          } else if (leader && leader.latest && trailer && trailer.latest) {
            playbookRateCopy.textContent = `${leader.name} leads at ${formatDecimal(leader.latest.RATE_PER_10K, 1)} per 10k versus ${trailer.name} on ${formatDecimal(trailer.latest.RATE_PER_10K, 1)}.`;
          } else {
            playbookRateCopy.textContent = "Upload the q5 rates file to measure momentum.";
          }
        }
      }
    }
  }

  function initNavigation() {
    navLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        const hash = link.getAttribute("href");
        if (!hash || !hash.startsWith("#")) {
          return;
        }
        const target = document.querySelector(hash);
        if (!target) {
          return;
        }
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    if (scrollTopButton) {
      scrollTopButton.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    setupScrollSpy({ links: navLinks, rootMargin: "-45% 0px -45% 0px" });
  }

  function wireScrollTopButton(button) {
    if (!button) {
      return;
    }
    const toggleVisibility = () => {
      const nearTop = window.scrollY <= 80;
      button.classList.toggle("scroll-top-hidden", nearTop);
      button.setAttribute("aria-hidden", nearTop ? "true" : "false");
    };
    button.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    window.addEventListener("scroll", toggleVisibility, { passive: true });
    toggleVisibility();
  }
})();