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

  Promise.all([
    d3.csv("data/q2_regional_difference.csv", d3.autoType),
    d3.csv("data/q5_rates_by_jurisdiction_year.csv", d3.autoType),
  ])
    .then(([regionalRows = [], rateRows = []]) => {
      const regionalSummaries = buildRegionalSummaries(regionalRows);
      const rateSummaries = summarizeRateRows(rateRows);
      if (regionalChart) {
        regionalChart.render({ rows: regionalRows, summaries: regionalSummaries });
      }
      if (rateChart) {
        rateChart.setData(rateRows);
      }
      updateHeroPanel({ regionalSummaries, rateSummaries });
    })
    .catch((error) => {
      console.error("Deep dive page failed to load datasets", error);
      if (regionalChart) {
        regionalChart.render({ rows: [], summaries: [] });
      }
      if (rateChart) {
        rateChart.setData([]);
      }
      updateHeroPanel({ regionalSummaries: [], rateSummaries: [] });
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

  function updateHeroPanel({ regionalSummaries = [], rateSummaries = [] }) {
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
})();