/**
 * KPI + Story helpers extracted from state-page.js
 * Exposes globals used by the controller: renderHeroCard, renderHeroNarrative,
 * buildStateSummary, buildRateScatterDataset, buildAgeProfiles, buildNationalAgeProfile,
 * buildNationalStats, computeNationalRemoteShare, buildCovidMonthlyStory.
 * Depends on: STATE_NAME_MAP, REMOTE_FAMILY, nationalStats, hero DOM nodes, and formatters from ui-utils.
 */
(function () {
  function renderHeroCard(summary) {
    const heroTitle = document.getElementById("hero-title");
    const heroSummary = document.getElementById("hero-summary");
    const heroBadges = document.getElementById("hero-badges");
    const heroStats = document.getElementById("hero-stats");

    if (!summary) {
      heroTitle.textContent = "We need more data for this state";
      heroSummary.textContent = "Historical rate, age, or regional files for this jurisdiction were not supplied.";
      heroBadges.innerHTML = "";
      heroStats.innerHTML = "";
      renderHeroNarrative(null);
      return;
    }

    heroTitle.textContent = `${summary.name} · ${summary.year}`;
    heroSummary.textContent = `Drivers incurred ${formatNumber(summary.totalFines)} fines (${formatDecimal(summary.ratePer10k)} per 10k licence holders).`;

    renderHeroBadges(heroBadges, summary);

    heroStats.innerHTML = "";
    const stats = [
      { label: "Latest fines", value: formatNumber(summary.totalFines), meta: `${summary.year}` },
      { label: "Licences", value: formatNumber(summary.licences), meta: "Drivers on record" },
      { label: "Rate / 10k", value: formatDecimal(summary.ratePer10k), meta: "Fines per 10k licences" },
    ];
    stats.forEach((item) => heroStats.appendChild(createHeroStat(item)));
    renderHeroNarrative(summary);
  }

  function renderHeroBadges(container, summary) {
    container.innerHTML = "";
    if (!summary) {
      container.innerHTML = '<span class="badge badge--neutral">Data loading</span>';
      return;
    }

    const badges = [];
    badges.push(`Year ${summary.year}`);

    if (summary.detectionSplit) {
      const share = summary.detectionSplit.cameraShare ?? 0;
      const descriptor = share >= 0.55 ? "Camera led" : share <= 0.45 ? "Police led" : "Balanced mix";
      badges.push(`${descriptor} (${summary.detectionSplit.year})`);
    } else if (summary.policeCameraRatio) {
      badges.push(`Detection mix recorded (${summary.policeCameraRatio.year})`);
    }

    if (summary.remoteShare != null) {
      badges.push("Regional depth ready");
    }

    if (summary.topAgeGroup && badges.length < 3) {
      badges.push("Age cohorts loaded");
    }

    const trimmed = badges.slice(0, 3);
    trimmed.forEach((text) => container.appendChild(createBadge(text)));
  }

  function createBadge(text) {
    const badge = document.createElement("span");
    badge.className = "badge badge--info";
    badge.textContent = text;
    return badge;
  }

  function createHeroStat({ label, value, meta }) {
    const wrapper = document.createElement("div");
    wrapper.className = "hero-stat";
    wrapper.innerHTML = `
      <p class="hero-stat-label">${label}</p>
      <p class="hero-stat-value">${value}</p>
      <p class="hero-stat-meta">${meta}</p>
    `;
    return wrapper;
  }

  function renderHeroNarrative(summary) {
    if (!heroNarrativeList) return;
    heroNarrativeList.innerHTML = "";
    if (!summary) {
      heroNarrativeList.innerHTML = createSpotlightHtml([
        { label: "Datasets pending", copy: "Upload statewide datasets to unlock narrative beats." },
      ]);
      return;
    }

    const beats = [];
    beats.push({
      label: "Caseload baseline",
      strong: `${summary.name} issued ${formatNumber(summary.totalFines)} fines in ${summary.year}.`,
      detail: `That equates to ${formatDecimal(summary.ratePer10k)} penalties per 10k licence holders.`,
    });
    if (summary.topAgeGroup) {
      beats.push({
        label: "Age leader",
        strong: `${summary.topAgeGroup.label} drivers dominate with ${formatNumber(summary.topAgeGroup.value)} fines.`,
        detail: "Keep that cohort on the watchlist when benchmarking against national peers.",
      });
    }
    if (summary.topRegion) {
      beats.push({
        label: "Regional hotspot",
        strong: `${summary.topRegion.label} carries the heaviest local load at ${formatNumber(summary.topRegion.value)} fines.`,
        detail: "Layer the map to see how neighbouring corridors compare.",
      });
    }
    if (summary.remoteShare != null && nationalStats?.remoteShare != null) {
      const delta = summary.remoteShare - nationalStats.remoteShare;
      const directionWord = delta > 0 ? "above" : delta < 0 ? "below" : "on par with";
      const nationalShareText = formatPercent(nationalStats.remoteShare);
      const stateShareText = formatPercent(summary.remoteShare);
      beats.push({
        label: "Remote footprint",
        strong: `${summary.name} routes ${stateShareText} of fines into remote corridors.`,
        detail: `The national mix sits at ${nationalShareText}, so this state is ${directionWord} the countrywide average.`,
      });
    }
    if (summary.detectionSplit) {
      const dominant = summary.detectionSplit.cameraShare >= 0.5 ? "cameras" : "police";
      beats.push({
        label: "Detection story",
        strong: `${dominant.charAt(0).toUpperCase()}${dominant.slice(1)} now drive most detections.`,
        detail: "Set expectations for how enforcement resources are allocated.",
      });
    } else if (summary.policeCameraRatio) {
      beats.push({
        label: "Detection story",
        strong: "Police-to-camera ratios are on file.",
        detail: "Benchmark enforcement levers even without camera share detail.",
      });
    }

    if (!beats.length) {
      heroNarrativeList.innerHTML = createSpotlightHtml([
        { label: "Awaiting coverage", copy: "Supply age, regional, or detection files to craft story beats." },
      ]);
      return;
    }

    heroNarrativeList.innerHTML = createSpotlightHtml(beats);
  }

  function createSpotlightHtml(beats) {
    return beats
      .map(({ label, copy, strong, detail }) => {
        let insightCopy;
        if (strong || detail) {
          const highlight = strong ? `<strong>${strong}</strong>` : "";
          const secondary = detail || copy ? `<span>${detail || copy}</span>` : "";
          insightCopy = `<p class="insight-copy">${highlight}${secondary}</p>`;
        } else {
          insightCopy = `<p class="insight-copy">${copy || ""}</p>`;
        }
        return `
        <li>
          <p class="insight-label">${label}</p>
          ${insightCopy}
        </li>`;
      })
      .join("");
  }

  function buildStateSummary(stateCode, { rates, ageGroups, locationByYear, regionalDiff }) {
    const rateRows = rates.filter((row) => row.JURISDICTION === stateCode);
    if (!rateRows.length) return null;
    const latestRate = rateRows.reduce((latest, row) => (row.YEAR > latest.YEAR ? row : latest), rateRows[0]);
    const ageRows = ageGroups.filter((row) => row.JURISDICTION === stateCode);
    const topAgeGroup = ageRows.length ? d3.greatest(ageRows, (row) => row["Sum(FINES)"]) : null;

    const stateLocationYears = locationByYear.filter((row) => row.JURISDICTION === stateCode);
    const latestLocationYear = stateLocationYears.length ? d3.max(stateLocationYears, (row) => row.YEAR) : null;
    let topRegion = null;
    if (latestLocationYear != null) {
      const rows = stateLocationYears.filter((row) => row.YEAR === latestLocationYear);
      if (rows.length) {
        const leader = d3.greatest(rows, (row) => row["FINES (Sum)"] || 0);
        if (leader) {
          topRegion = { label: leader.LOCATION, value: leader["FINES (Sum)"] };
        }
      }
    }
    if (!topRegion) {
      const fallbackRows = regionalDiff.filter((row) => row.JURISDICTION === stateCode);
      if (fallbackRows.length) {
        const fallback = d3.greatest(fallbackRows, (row) => row["Sum(FINES)"] || 0);
        if (fallback) {
          topRegion = { label: fallback.LOCATION, value: fallback["Sum(FINES)"] };
        }
      }
    }

    let remoteShare = null;
    if (latestLocationYear != null) {
      const rows = stateLocationYears.filter((row) => row.YEAR === latestLocationYear);
      const total = d3.sum(rows, (row) => row["FINES (Sum)"] || 0);
      if (total > 0) {
        const remote = d3.sum(rows.filter((row) => REMOTE_FAMILY.has(row.LOCATION)), (row) => row["FINES (Sum)"] || 0);
        remoteShare = remote / total;
      }
    }

    return {
      code: stateCode,
      name: STATE_NAME_MAP[stateCode] || stateCode,
      year: latestRate.YEAR,
      ratePer10k: latestRate.RATE_PER_10K,
      totalFines: latestRate["Sum(FINES)"] || 0,
      licences: latestRate.LICENCES || 0,
      topAgeGroup: topAgeGroup ? { label: topAgeGroup.AGE_GROUP, value: topAgeGroup["Sum(FINES)"] } : null,
      topRegion,
      region: topRegion,
      remoteShare,
    };
  }

  function buildRateScatterDataset(rates, locationByYear, regionalDiff) {
    if (!rates?.length) {
      return [];
    }
    const latestByState = d3.rollup(
      rates,
      (values) => values.reduce((latest, row) => (row.YEAR > latest.YEAR ? row : latest), values[0]),
      (row) => row.JURISDICTION
    );
    return Array.from(latestByState, ([code, row]) => {
      const { share } = getRemoteShareForState(code, locationByYear, regionalDiff);
      return {
        code,
        name: STATE_NAME_MAP[code] || code,
        rate: row.RATE_PER_10K,
        remoteShare: share,
      };
    }).filter((entry) => Number.isFinite(entry.rate) && entry.remoteShare != null);
  }

  function buildAgeProfiles(rows) {
    if (!rows?.length) {
      return new Map();
    }
    return d3.rollup(
      rows,
      (values) => {
        const total = d3.sum(values, (row) => row["Sum(FINES)"] || 0);
        const series = AGE_ORDER.map((age) => {
          const match = values.find((row) => row.AGE_GROUP === age);
          const value = match ? match["Sum(FINES)"] || 0 : 0;
          return { ageGroup: age, value, share: total ? value / total : 0 };
        });
        return { code: values[0]?.JURISDICTION, total, series };
      },
      (row) => row.JURISDICTION
    );
  }

  function buildNationalAgeProfile(rows) {
    if (!rows?.length) {
      return null;
    }
    const grouped = d3.rollup(rows, (values) => d3.sum(values, (row) => row["Sum(FINES)"] || 0), (row) => row.AGE_GROUP);
    const total = Array.from(grouped.values()).reduce((acc, value) => acc + value, 0);
    const series = AGE_ORDER.map((age) => {
      const value = grouped.get(age) || 0;
      return { ageGroup: age, value, share: total ? value / total : 0 };
    });
    return { code: "AUS", total, series };
  }

  function buildNationalStats({ rates, locationByYear, regionalDiff }) {
    if (!rates.length) {
      return null;
    }
    const latestYear = d3.max(rates, (row) => row.YEAR);
    const latestRows = rates.filter((row) => row.YEAR === latestYear);
    const avgRate = latestRows.length ? d3.mean(latestRows, (row) => row.RATE_PER_10K) : null;
    const leader = latestRows.length ? d3.greatest(latestRows, (row) => row.RATE_PER_10K) : null;
    const remoteShare = computeNationalRemoteShare(locationByYear, regionalDiff);
    return {
      latestYear,
      avgRate,
      leaderCode: leader?.JURISDICTION || null,
      leaderRate: leader?.RATE_PER_10K || null,
      leaderName: leader ? STATE_NAME_MAP[leader.JURISDICTION] || leader.JURISDICTION : null,
      remoteShare,
    };
  }

  function computeNationalRemoteShare(locationByYear, regionalDiff) {
    if (locationByYear.length) {
      const latestYear = d3.max(locationByYear, (row) => row.YEAR);
      const rows = locationByYear.filter((row) => row.YEAR === latestYear);
      const total = d3.sum(rows, (row) => row["FINES (Sum)"] || 0);
      if (total > 0) {
        const remote = d3.sum(rows.filter((row) => REMOTE_FAMILY.has(row.LOCATION)), (row) => row["FINES (Sum)"] || 0);
        return remote / total;
      }
    }
    if (regionalDiff.length) {
      const total = d3.sum(regionalDiff, (row) => row["Sum(FINES)"] || 0);
      if (total > 0) {
        const remote = d3.sum(regionalDiff.filter((row) => REMOTE_FAMILY.has(row.LOCATION)), (row) => row["Sum(FINES)"] || 0);
        return remote / total;
      }
    }
    return null;
  }

  function buildCovidMonthlyStory(stateCode, pivot, detectionMethods, meta = {}) {
    if (!pivot?.length) {
      return `${STATE_NAME_MAP[stateCode] || stateCode} needs monthly COVID-era data to describe this timeline.`;
    }
    const stateName = STATE_NAME_MAP[stateCode] || stateCode;
    const storyRows = meta.rawPivot?.length ? meta.rawPivot : pivot;
    const peakRow = d3.greatest(storyRows, (row) => row.total) || storyRows[storyRows.length - 1];
    const latest = storyRows[storyRows.length - 1];
    const earliest = storyRows[0];
    const change = earliest.total ? (latest.total - earliest.total) / earliest.total : null;
    const changeText = Number.isFinite(change)
      ? ` ${change >= 0 ? "Up" : "Down"} ${formatPercent(Math.abs(change))} since ${formatMonth(earliest.displayDate || earliest.date)}.`
      : "";
    const base = `${stateName} peaked at ${formatNumber(peakRow.total)} fines in ${formatMonth(peakRow.displayDate || peakRow.date)} and now sits at ${formatNumber(latest.total)} (${formatMonth(
      latest.displayDate || latest.date
    )}).`;
    const leaders = detectionMethods
      .map((method) => ({
        method,
        latestValue: latest[method] || 0,
        earliestValue: earliest[method] || 0,
      }))
      .sort((a, b) => (b.latestValue || 0) - (a.latestValue || 0));
    const leader = leaders[0];
    const runner = leaders[1];
    const leaderShare = leader && latest.total ? leader.latestValue / latest.total : null;
    const leaderText = leader
      ? ` ${leader.method} now contributes ${leaderShare ? formatPercent(leaderShare) : formatNumber(leader.latestValue)} of the mix${leader.earliestValue
        ? ` after moving ${leader.latestValue >= leader.earliestValue ? "up" : "down"} ${formatPercent(
          Math.abs(leader.earliestValue ? (leader.latestValue - leader.earliestValue) / leader.earliestValue : 0
          ))} since ${formatMonth(earliest.date)}.`
        : "."
      }`
      : "";
    const runnerText = runner
      ? ` ${runner.method} trails with ${formatNumber(runner.latestValue)}, keeping the spread between the top two methods at ${formatNumber(
        Math.abs((leader?.latestValue || 0) - runner.latestValue)
      )} fines.`
      : "";
    return `${base}${changeText}${leaderText}${runnerText}`.trim();
  }

  function getRemoteShareForState(stateCode, locationByYear, regionalDiff) {
    const stateLocations = locationByYear.filter((row) => row.JURISDICTION === stateCode);
    const latestYear = stateLocations.length ? d3.max(stateLocations, (row) => row.YEAR) : null;
    if (latestYear != null) {
      const rows = stateLocations.filter((row) => row.YEAR === latestYear);
      const total = d3.sum(rows, (row) => row["FINES (Sum)"] || 0);
      if (total > 0) {
        const remote = d3.sum(rows.filter((row) => REMOTE_FAMILY.has(row.LOCATION)), (row) => row["FINES (Sum)"] || 0);
        return { share: remote / total, year: latestYear };
      }
    }
    const fallback = regionalDiff.filter((row) => row.JURISDICTION === stateCode);
    const total = d3.sum(fallback, (row) => row["Sum(FINES)"] || 0);
    if (total > 0) {
      const remote = d3.sum(fallback.filter((row) => REMOTE_FAMILY.has(row.LOCATION)), (row) => row["Sum(FINES)"] || 0);
      return { share: remote / total, year: null };
    }
    return { share: null, year: null };
  }

  // Expose globals
  window.renderHeroCard = renderHeroCard;
  window.renderHeroNarrative = renderHeroNarrative;
  window.buildStateSummary = buildStateSummary;
  window.buildRateScatterDataset = buildRateScatterDataset;
  window.buildAgeProfiles = buildAgeProfiles;
  window.buildNationalAgeProfile = buildNationalAgeProfile;
  window.buildNationalStats = buildNationalStats;
  window.computeNationalRemoteShare = computeNationalRemoteShare;
  window.buildCovidMonthlyStory = buildCovidMonthlyStory;
  window.getRemoteShareForState = getRemoteShareForState;
})();
