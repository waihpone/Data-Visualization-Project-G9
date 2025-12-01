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
  window.STATE_NAME_MAP = STATE_NAME_MAP;

  const DATA_FILES = {
    geojson: "data/australian_states.geojson",
    rates: "data/q5_rates_by_jurisdiction_year.csv",
    ages: "data/q1_age_group_speeding_fines.csv",
    regionalDiff: "data/q2_regional_difference.csv",
    vicMonthly: "data/q3_vic_2023_monthly_camera_police.csv",
    vicAnnual: "data/q3_vic_annual_camera_police.csv",
    ratio: "data/q4_police_camera_ratio.csv",
    locationByYear: "data/q5_fines_by_jurisdiction_location_year.csv",
  };

  const REMOTE_LOCATIONS = new Set(["Outer Regional Australia", "Remote Australia", "Very Remote Australia"]);
  const STATE_ABBR_BY_NAME = Object.fromEntries(Object.entries(STATE_NAME_MAP).map(([abbr, name]) => [name, abbr]));

  function loadAtlasData() {
    return Promise.all([
      d3.json(DATA_FILES.geojson),
      d3.csv(DATA_FILES.rates, d3.autoType),
      d3.csv(DATA_FILES.ages, d3.autoType),
      d3.csv(DATA_FILES.regionalDiff, d3.autoType),
      d3.csv(DATA_FILES.vicMonthly, d3.autoType),
      d3.csv(DATA_FILES.vicAnnual, d3.autoType),
      d3.csv(DATA_FILES.ratio, d3.autoType),
      d3.csv(DATA_FILES.locationByYear, d3.autoType),
    ]).then(([geojson, rates, ageGroups, regionalDiff, vicMonthly, vicAnnual, ratioRows, locationByYear]) => {
      const features = prepareFeatures(geojson);
      const featureByName = new Map(features.map((feature) => [feature.properties.stateName, feature]));
      const summaries = buildStateSummaries({ rates, ageGroups, regionalDiff, vicMonthly, vicAnnual, ratioRows, locationByYear });
      return { features, featureByName, summaries };
    });
  }

  function prepareFeatures(geojson) {
    if (!geojson || !Array.isArray(geojson.features)) {
      return [];
    }
    return geojson.features
      .filter((feature) => feature && feature.geometry)
      .map((feature) => ({
        type: "Feature",
        geometry: feature.geometry,
        properties: {
          ...(feature.properties || {}),
          stateName: resolveStateName(feature.properties || {}) || feature.id || "Unknown state",
          stateAbbr: (() => {
            const name = resolveStateName(feature.properties || {}) || feature.id || "";
            return STATE_ABBR_BY_NAME[name] || feature.properties?.STATE_ABBR || null;
          })(),
        },
      }))
      .sort((a, b) => d3.geoArea(b) - d3.geoArea(a));
  }

  function resolveStateName(properties = {}) {
    const keys = [
      "STATE_NAME",
      "STATE_NAME_2021",
      "STATE_NAME_2016",
      "STATE",
      "STATE_ABBR",
      "STATE_CODE",
      "STE_NAME21",
      "STE_NAME16",
      "state_name",
      "state",
      "NAME",
      "name",
    ];
    for (const key of keys) {
      if (properties[key]) {
        return String(properties[key]);
      }
    }
    return "";
  }

  function buildStateSummaries({ rates, ageGroups, regionalDiff, vicMonthly, vicAnnual, ratioRows, locationByYear }) {
    const summaries = new Map();

    const ensureState = (stateName, abbr) => {
      if (!stateName) {
        return null;
      }
      if (!summaries.has(stateName)) {
        summaries.set(stateName, { name: stateName, abbr: abbr || "", baseYear: null });
      }
      const summary = summaries.get(stateName);
      if (abbr && !summary.abbr) {
        summary.abbr = abbr;
      }
      return summary;
    };

    const locationCollector = new Map();

    rates.forEach((row) => {
      const stateName = row.STATE ? String(row.STATE).trim() : null;
      const summary = ensureState(stateName, row.JURISDICTION);
      if (!summary) {
        return;
      }
      if (!summary.baseYear || row.YEAR > summary.baseYear) {
        summary.baseYear = row.YEAR;
        summary.totalFines = row["Sum(FINES)"];
        summary.licences = row.LICENCES;
        summary.ratePer10k = row.RATE_PER_10K;
      }
    });

    locationByYear.forEach((row) => {
      const stateName = STATE_NAME_MAP[row.JURISDICTION];
      const summary = ensureState(stateName, row.JURISDICTION);
      if (!summary) {
        return;
      }
      const fines = row["FINES (Sum)"];
      if (!summary.region || row.YEAR > summary.region.year || (row.YEAR === summary.region.year && fines > summary.region.fines)) {
        summary.region = { location: row.LOCATION, fines, year: row.YEAR, source: "yearly" };
      }

      if (!locationCollector.has(summary.name)) {
        locationCollector.set(summary.name, new Map());
      }
      const yearMap = locationCollector.get(summary.name);
      if (!yearMap.has(row.YEAR)) {
        yearMap.set(row.YEAR, new Map());
      }
      yearMap.get(row.YEAR).set(row.LOCATION, fines);
    });

    const regionalFallback = new Map();
    regionalDiff.forEach((row) => {
      const stateName = STATE_NAME_MAP[row.JURISDICTION];
      if (!stateName) {
        return;
      }
      const entry = regionalFallback.get(stateName);
      const fines = row["Sum(FINES)"];
      if (!entry || fines > entry.fines) {
        regionalFallback.set(stateName, { location: row.LOCATION, fines, source: "regional" });
      }
    });

    summaries.forEach((summary, name) => {
      if (!summary.region && regionalFallback.has(name)) {
        summary.region = regionalFallback.get(name);
      }
    });

    ageGroups.forEach((row) => {
      const stateName = STATE_NAME_MAP[row.JURISDICTION];
      const summary = ensureState(stateName, row.JURISDICTION);
      if (!summary) {
        return;
      }
      const fines = row["Sum(FINES)"];
      if (!summary.topAgeGroup || fines > summary.topAgeGroup.fines) {
        summary.topAgeGroup = { label: row.AGE_GROUP, fines };
      }
    });

    const vicAnnualByYear = d3.rollup(
      vicAnnual,
      (arr) =>
        arr.reduce(
          (acc, row) => {
            if (row.DETECTION_METHOD === "Camera") {
              acc.camera = row["FINES (Sum)"];
            } else {
              acc.police = row["FINES (Sum)"];
            }
            return acc;
          },
          { camera: 0, police: 0 }
        ),
      (row) => row.YEAR
    );
    if (vicAnnualByYear.size) {
      const latestYear = Math.max(...vicAnnualByYear.keys());
      const split = vicAnnualByYear.get(latestYear);
      const total = (split?.camera || 0) + (split?.police || 0);
      const summary = ensureState("Victoria", "VIC");
      if (summary && total > 0) {
        summary.detectionSplit = {
          year: latestYear,
          cameraShare: split.camera / total,
          camera: split.camera,
          police: split.police,
        };
      }
    }

    const monthlyTotals = d3.rollups(
      vicMonthly,
      (arr) => d3.sum(arr, (row) => row["FINES (Sum)"] || 0),
      (row) => row.YM
    );
    if (monthlyTotals.length) {
      monthlyTotals.sort((a, b) => b[1] - a[1]);
      const [peakMonth, peakValue] = monthlyTotals[0];
      const summary = ensureState("Victoria", "VIC");
      if (summary) {
        summary.peakMonth = { month: peakMonth, fines: peakValue };
      }
    }

    const latestRatioRow = ratioRows.reduce(
      (acc, row) => {
        if (row.YEAR > acc.year) {
          return { year: row.YEAR, row };
        }
        return acc;
      },
      { year: -Infinity, row: null }
    );
    if (latestRatioRow.row) {
      ["NSW", "QLD", "VIC"].forEach((abbr) => {
        const stateName = STATE_NAME_MAP[abbr];
        const summary = ensureState(stateName, abbr);
        if (summary) {
          summary.policeCameraRatio = { year: latestRatioRow.year, value: latestRatioRow.row[abbr] };
        }
      });
    }

    summaries.forEach((summary) => {
      const yearMap = locationCollector.get(summary.name);
      if (yearMap && yearMap.size) {
        const latestYear = Math.max(...yearMap.keys());
        const rows = yearMap.get(latestYear);
        const total = Array.from(rows.values()).reduce((acc, value) => acc + value, 0);
        if (total > 0) {
          const remoteTotal = Array.from(rows.entries()).reduce((acc, [location, value]) => (REMOTE_LOCATIONS.has(location) ? acc + value : acc), 0);
          summary.remoteShare = remoteTotal / total;
        }
      }

      if (summary.remoteShare == null && summary.region && summary.region.source === "regional") {
        const stateRows = regionalDiff.filter((row) => STATE_NAME_MAP[row.JURISDICTION] === summary.name);
        const total = d3.sum(stateRows, (row) => row["Sum(FINES)"] || 0);
        if (total > 0) {
          const remote = d3.sum(stateRows.filter((row) => REMOTE_LOCATIONS.has(row.LOCATION)), (row) => row["Sum(FINES)"] || 0);
          summary.remoteShare = remote / total;
        }
      }
    });

    return summaries;
  }

  window.loadAtlasData = loadAtlasData;
})();
