(function () {
        const storyPrelude = createStoryPrelude();
        storyPrelude.start();
        const STATE_NAME_MAP = {
          ACT: "Australian Capital Territory",
          NSW: "New South Wales",
          VIC: "Victoria",
          QLD: "Queensland",
          SA: "South Australia",
          WA: "Western Australia",
          TAS: "Tasmania",
          NT: "Northern Territory",
        };

        const REMOTE_LOCATIONS = new Set(["Outer Regional Australia", "Remote Australia", "Very Remote Australia"]);
        const MODE_CONFIG = {
          rate: {
            label: "Fines per 10k licences",
            interpolator: d3.interpolateViridis,
            format: (value) => `${value?.toFixed?.(0) ?? "0"}`,
          },
          remote: {
            label: "Remote enforcement share",
            interpolator: d3.interpolateCividis,
            format: (value) => `${(value * 100).toFixed(0)}%`,
          },
        };

        const mapContainer = d3.select("#map");
        const mapElement = document.getElementById("map");
        const heroPanel = document.querySelector(".hero-panel");
        const mobileLayoutQuery = window.matchMedia("(max-width: 1100px)");
        const svg = mapContainer.append("svg").attr("role", "presentation");
        const defs = svg.append("defs");
        const HATCH_PATTERN_ID = "no-data-hatch";
        defs
          .append("pattern")
          .attr("id", HATCH_PATTERN_ID)
          .attr("patternUnits", "userSpaceOnUse")
          .attr("width", 8)
          .attr("height", 8)
          .append("rect")
          .attr("width", 8)
          .attr("height", 8)
          .attr("fill", "#d9ddea");
        const hatchPath = defs
          .select(`#${HATCH_PATTERN_ID}`)
          .append("path")
          .attr("d", "M0,0 L8,8 M-2,2 L2,-2 M6,10 L10,6")
          .attr("stroke", "#a2a9bc")
          .attr("stroke-width", 1.2);
        const mapLayer = svg.append("g");
        const tooltip = d3.select("body").append("div").attr("class", "map-tooltip hidden");
        const legend = mapContainer.append("div").attr("class", "map-legend hidden");
        const legendGradient = legend.append("div").attr("class", "map-legend__gradient");
        const legendLabels = legend.append("div").attr("class", "map-legend__labels");
        const formatNumber = new Intl.NumberFormat("en-AU");
        const formatCompact = new Intl.NumberFormat("en-AU", { notation: "compact", maximumFractionDigits: 1 });
        const formatPercent = new Intl.NumberFormat("en-AU", { style: "percent", maximumFractionDigits: 1 });
        const tourStatus = document.getElementById("tour-status");
        const tourButton = document.getElementById("tour-button");
        const stateShortcutList = document.getElementById("state-shortcut-list");
        const colorModeButtons = document.querySelectorAll("#color-mode button");

        let cachedFeatures = [];
        let stateSummaries = new Map();
        let colorMode = "rate";
        let currentPath = null;
        let colorScales = { rate: null, remote: null };
        let featureByName = new Map();
        let tourTimer = null;
        let tourStops = [];
        let tourIndex = 0;
        let spotlightState = null;

        const zoom = d3
          .zoom()
          .scaleExtent([1, 8])
          .on("zoom", (event) => {
            mapLayer.attr("transform", event.transform);
          });

        svg.call(zoom);
        disableMapInteractions();
        setupControls();

        if (mobileLayoutQuery.addEventListener) {
          mobileLayoutQuery.addEventListener("change", syncMapHeight);
        } else if (mobileLayoutQuery.addListener) {
          mobileLayoutQuery.addListener(syncMapHeight);
        }

        syncMapHeight();

        Promise.all([
          d3.json("data/australian_states.geojson"),
          d3.csv("data/q5_rates_by_jurisdiction_year.csv", d3.autoType),
          d3.csv("data/q1_age_group_speeding_fines.csv", d3.autoType),
          d3.csv("data/q2_regional_difference.csv", d3.autoType),
          d3.csv("data/q3_vic_2023_monthly_camera_police.csv", d3.autoType),
          d3.csv("data/q3_vic_annual_camera_police.csv", d3.autoType),
          d3.csv("data/q4_police_camera_ratio.csv", d3.autoType),
          d3.csv("data/q5_fines_by_jurisdiction_location_year.csv", d3.autoType),
        ])
          .then(([geojson, rates, ageGroups, regionalDiff, vicMonthly, vicAnnual, ratioRows, locationByYear]) => {
            cachedFeatures = prepareFeatures(geojson);
            featureByName = new Map(cachedFeatures.map((feature) => [feature.properties.stateName, feature]));
            stateSummaries = buildStateSummaries({ rates, ageGroups, regionalDiff, vicMonthly, vicAnnual, ratioRows, locationByYear });
            colorScales = buildColorScales(stateSummaries);
            buildLegend(colorScales[colorMode], colorMode);
            announceColorScale(colorMode);
            syncMapHeight();
            render();
            populateTourStops();
            tourButton.disabled = false;
            tourButton.removeAttribute("aria-disabled");
            window.addEventListener("resize", handleResize, { passive: true });
            storyPrelude.complete();
          })
          .catch((error) => {
            console.error("Failed to prepare Australia map", error);
            storyPrelude.complete();
          });

        const STATE_ABBR_BY_NAME = Object.fromEntries(Object.entries(STATE_NAME_MAP).map(([abbr, name]) => [name, abbr]));

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

        function resolveStateName(properties) {
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

          const locationCollector = new Map(); // key: state name -> Map(year -> Map(location -> fines))

          // Baseline rates (covers every state/territory)
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

          // Latest region focus from q5 (year & location)
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

          // Regional fallback (q2)
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

          // Age group peaks (q1)
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

          // VIC detection mix (q3 annual)
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

          // VIC monthly peak (q3 monthly)
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

          // Police vs camera ratio (q4)
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

        function buildColorScales(summaries) {
          const result = { rate: null, remote: null };
          Object.entries(MODE_CONFIG).forEach(([mode, config]) => {
            const values = Array.from(summaries.values())
              .map((summary) => (mode === "rate" ? summary.ratePer10k : summary.remoteShare))
              .filter((value) => Number.isFinite(value) && value >= 0);
            if (!values.length) {
              result[mode] = null;
              return;
            }
            const extent = mode === "remote" ? [0, Math.max(0.25, d3.max(values))] : d3.extent(values);
            result[mode] = d3.scaleSequential().domain(extent).interpolator(config.interpolator);
          });
          return result;
        }

        function buildLegend(scale, mode = colorMode) {
          if (!scale) {
            legend.classed("hidden", true);
            return;
          }
          const [min, max] = scale.domain();
          const steps = d3.range(0, 1.01, 0.2).map((t) => scale(min + t * (max - min)));
          legendGradient.style("background", `linear-gradient(to right, ${steps.join(", ")})`);
          const config = MODE_CONFIG[mode] || MODE_CONFIG[colorMode];
          const formatter = config.format;
          legendLabels.html(`<span>${formatter(min)}</span><span>${formatter(max)}</span>`);
          legend.select("p.legend-title")?.remove();
          legend
            .insert("p", ":first-child")
            .attr("class", "legend-title")
            .style("margin", "0 0 0.35rem")
            .text(config.label);
          legend.select("p.legend-note")?.remove();
          if (mode === "remote") {
            const missingRemote = Array.from(stateSummaries.values()).some((entry) => entry.remoteShare == null || !Number.isFinite(entry.remoteShare));
            if (missingRemote) {
              legend
                .append("p")
                .attr("class", "legend-note")
                .style("margin", "0.35rem 0 0")
                .style("font-size", "0.75rem")
                .style("color", "var(--muted)")
                .text("Hatched states = no remote data");
            }
          }
          legend.attr("aria-label", `Color scale: ${config.label}`);
          legend.classed("hidden", false);
        }

        function render() {
          if (!cachedFeatures.length || !colorScales[colorMode]) {
            return;
          }

          const node = mapContainer.node();
          const width = node.clientWidth;
          const height = node.clientHeight;
          svg.attr("viewBox", `0 0 ${width} ${height}`);

          const projection = d3.geoMercator().fitSize([width, height], { type: "FeatureCollection", features: cachedFeatures });
          const path = d3.geoPath(projection);
          currentPath = path;

          const features = mapLayer
            .selectAll("path.state")
            .data(cachedFeatures, (d) => d.properties.stateName);

          features
            .join(
              (enter) =>
                enter
                  .append("path")
                  .attr("class", "state")
                  .attr("fill", getFill)
                  .attr("stroke", "#ffffff")
                  .attr("stroke-width", 1.1)
                  .attr("tabindex", 0)
                  .attr("role", "button")
                  .attr("aria-label", (feature) => `Open ${feature.properties.stateName} insights`)
                  .attr("d", path)
                  .on("mouseenter", (event, feature) => {
                    showTooltip(event, feature.properties.stateName);
                  })
                  .on("mousemove", (event) => moveTooltip(event))
                  .on("mouseleave", hideTooltip)
                  .on("focus", (event, feature) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const syntheticEvent = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
                    showTooltip(syntheticEvent, feature.properties.stateName);
                  })
                  .on("blur", hideTooltip)
                  .on("keydown", (event, feature) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigateToState(feature.properties.stateName, feature.properties.stateAbbr);
                    }
                  })
                  .on("click", (event, feature) => navigateToState(feature.properties.stateName, feature.properties.stateAbbr)),
              (update) => update.attr("fill", getFill).attr("stroke", "#ffffff").attr("stroke-width", 1.1).attr("d", path)
            );

          if (spotlightState) {
            highlightSpotlight(spotlightState);
          }
        }

        function navigateToState(stateName, stateAbbr) {
          const code = stateAbbr || STATE_ABBR_BY_NAME[stateName];
          const target = code ? code : stateName;
          window.location.href = `state.html?state=${encodeURIComponent(target)}`;
        }

        function getFill(feature) {
          const summary = stateSummaries.get(feature.properties.stateName);
          const scale = colorScales[colorMode];
          if (!summary) {
            return "#d1d5db";
          }
          if (colorMode === "remote" && (summary.remoteShare == null || !Number.isFinite(summary.remoteShare))) {
            return `url(#${HATCH_PATTERN_ID})`;
          }
          if (!scale) {
            return "#d1d5db";
          }
          const value = colorMode === "rate" ? summary.ratePer10k : summary.remoteShare;
          if (Number.isFinite(value)) {
            return scale(value);
          }
          return "#d1d5db";
        }

        function showTooltip(event, stateName) {
          tooltip.html(buildTooltipContent(stateName)).classed("hidden", false);
          moveTooltip(event);
        }

        function moveTooltip(event) {
          tooltip
            .style("left", `${event.clientX + 18}px`)
            .style("top", `${event.clientY + 18}px`);
        }

        function hideTooltip() {
          tooltip.classed("hidden", true);
        }

        function buildTooltipContent(stateName) {
          const summary = stateSummaries.get(stateName);
          if (!summary || !summary.baseYear) {
            return `<h3>${stateName}</h3><p>No speeding fine data available.</p>`;
          }

          const metrics = [];
          metrics.push(
            `<div class="metric"><span>Latest fines (${summary.baseYear})</span><strong>${formatCompact.format(summary.totalFines)}</strong></div>`
          );
          metrics.push(
            `<div class="metric"><span>Licences</span><strong>${formatNumber.format(summary.licences)}</strong></div>`
          );
          metrics.push(
            `<div class="metric"><span>Rate / 10k drivers</span><strong>${summary.ratePer10k?.toFixed(1) ?? "—"}</strong></div>`
          );

          if (summary.region) {
            const regionLabel = summary.region.year ? `${summary.region.location} (${summary.region.year})` : summary.region.location;
            metrics.push(
              `<div class="metric"><span>Top region</span><strong>${regionLabel} · ${formatCompact.format(summary.region.fines)}</strong></div>`
            );
          }

          if (summary.topAgeGroup) {
            metrics.push(
              `<div class="metric"><span>Peak age group</span><strong>${summary.topAgeGroup.label} · ${formatCompact.format(summary.topAgeGroup.fines)}</strong></div>`
            );
          }

           if (summary.remoteShare != null) {
            metrics.push(
              `<div class="metric"><span>Remote share</span><strong>${formatPercent.format(summary.remoteShare)}</strong></div>`
            );
          }

          if (summary.policeCameraRatio) {
            metrics.push(
              `<div class="metric"><span>Police / camera ratio (${summary.policeCameraRatio.year})</span><strong>${summary.policeCameraRatio.value.toFixed(2)} : 1</strong></div>`
            );
          }

          if (summary.detectionSplit) {
            const cameraPct = (summary.detectionSplit.cameraShare * 100).toFixed(1);
            metrics.push(
              `<div class="metric"><span>Camera share (${summary.detectionSplit.year})</span><strong>${cameraPct}%</strong></div>`
            );
          }

          if (summary.peakMonth) {
            metrics.push(
              `<div class="metric"><span>Peak month (VIC 2023)</span><strong>${summary.peakMonth.month} · ${formatCompact.format(summary.peakMonth.fines)}</strong></div>`
            );
          }

          return `<h3>${stateName}</h3>${metrics.join("")}`;
        }

        function setupControls() {
          Object.entries(STATE_NAME_MAP).forEach(([abbr, name]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = abbr;
            button.title = name;
            button.addEventListener("click", () => navigateToState(name, abbr));
            stateShortcutList.appendChild(button);
          });

          tourButton.disabled = true;
          tourButton.setAttribute("aria-disabled", "true");

          colorModeButtons.forEach((button) => {
            button.addEventListener("click", () => {
              const mode = button.dataset.mode;
              if (!MODE_CONFIG[mode] || colorMode === mode) return;
              colorMode = mode;
              colorModeButtons.forEach((btn) => {
                const active = btn.dataset.mode === mode;
                btn.classList.toggle("active", active);
                btn.setAttribute("aria-pressed", active);
              });
              buildLegend(colorScales[colorMode], colorMode);
              repaintStates();
              announceColorScale(mode);
            });
          });

          tourButton.addEventListener("click", () => {
            if (tourButton.disabled) return;
            if (tourTimer) {
              stopTour();
            } else {
              startTour();
            }
          });

          document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
              stopTour();
            }
          });
        }

        function announceColorScale(mode = colorMode) {
          if (tourTimer) {
            return;
          }
          const label = MODE_CONFIG[mode]?.label;
          if (label) {
            tourStatus.textContent = `Color scale: ${label}`;
          }
        }

        function repaintStates() {
          const scale = colorScales[colorMode];
          if (!scale) {
            mapLayer.selectAll("path.state").attr("fill", "#d1d5db");
            legend.classed("hidden", true);
            return;
          }
          buildLegend(scale, colorMode);
          mapLayer.selectAll("path.state").attr("fill", getFill);
        }

        function populateTourStops() {
          tourStops = Array.from(stateSummaries.values())
            .filter((summary) => Number.isFinite(summary.ratePer10k))
            .sort((a, b) => d3.descending(a.ratePer10k, b.ratePer10k))
            .slice(0, 5);
        }

        function startTour() {
          if (!tourStops.length) return;
          stopTour();
          tourIndex = 0;
          highlightTourStop();
          tourTimer = setInterval(highlightTourStop, 4500);
          tourButton.textContent = "Stop guided tour";
          tourButton.setAttribute("aria-pressed", "true");
        }

        function stopTour() {
          if (tourTimer) {
            clearInterval(tourTimer);
            tourTimer = null;
          }
          tourButton.textContent = "Start guided tour";
          tourButton.setAttribute("aria-pressed", "false");
          tourStatus.textContent = "";
          if (spotlightState) {
            spotlightState = null;
            mapLayer.selectAll("path.state").classed("state--spotlight", false);
          }
          resetMapView();
          announceColorScale(colorMode);
        }

        function highlightTourStop() {
          if (!tourStops.length) {
            stopTour();
            return;
          }
          const summary = tourStops[tourIndex % tourStops.length];
          const feature = featureByName.get(summary.name);
          if (feature) {
            flyToFeature(feature);
            highlightSpotlight(summary.name);
            tourStatus.textContent = `${summary.name}: ${summary.ratePer10k.toFixed(0)} fines per 10k (${summary.baseYear}).`;
          }
          tourIndex += 1;
        }

        function flyToFeature(feature) {
          if (!currentPath) return;
          const node = mapContainer.node();
          const width = node.clientWidth;
          const height = node.clientHeight;
          const bounds = currentPath.bounds(feature);
          const dx = bounds[1][0] - bounds[0][0];
          const dy = bounds[1][1] - bounds[0][1];
          const x = (bounds[0][0] + bounds[1][0]) / 2;
          const y = (bounds[0][1] + bounds[1][1]) / 2;
          const scale = Math.min(6, 0.85 / Math.max(dx / width, dy / height));
          const translate = [width / 2 - scale * x, height / 2 - scale * y];
          svg
            .transition()
            .duration(900)
            .call(
              zoom.transform,
              d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
            );
        }

        function highlightSpotlight(stateName) {
          spotlightState = stateName;
          mapLayer
            .selectAll("path.state")
            .classed("state--spotlight", (d) => d.properties.stateName === stateName);
        }

        function resetMapView() {
          svg.transition().duration(900).call(zoom.transform, d3.zoomIdentity);
        }

        function disableMapInteractions() {
          svg
            .on("wheel.zoom", null)
            .on("dblclick.zoom", null)
            .on("mousedown.zoom", null)
            .on("mousemove.zoom", null)
            .on("touchstart.zoom", null)
            .on("touchmove.zoom", null);
        }

        function syncMapHeight() {
          if (!heroPanel || !mapElement) {
            return;
          }
          if (mobileLayoutQuery.matches) {
            mapElement.style.height = "";
            return;
          }
          const heroHeight = heroPanel.offsetHeight;
          if (heroHeight > 0) {
            mapElement.style.height = `${heroHeight}px`;
          }
        }

        function handleResize() {
          syncMapHeight();
          render();
        }

      })();
