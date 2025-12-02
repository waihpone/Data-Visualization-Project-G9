/**
 * Age Rose Chart (Radial Age Distribution Chart)
 * Visualizes age group distribution as a radial/polar area chart
 * Dependencies: D3.js, ui-utils.js (for formatNumber, formatPercent, formatDecimal)
 * Global variables accessed: STATE_NAME_MAP, ageProfiles, nationalAgeProfile, ageChartContext, viewState, activeState, showTooltip, hideTooltip, updateAgeFocusButtons
 * Global constants: AGE_ORDER, AGE_COLOR_RANGE
 */

(function () {
    // Age constants (moved from state-page.js)
    const AGE_ORDER = ["0-16", "17-25", "26-39", "40-64", "65 and over"];
    const AGE_COLOR_RANGE = ["#0072B2", "#56B4E9", "#009E73", "#E69F00", "#CC79A7"];

    function drawAgeProfile() {
        const container = d3.select("#age-profile");
        const storyNode = document.getElementById("age-story");
        if (!container.node() || !storyNode) {
            ageChartContext = null;
            return;
        }

        let focusState = viewState.ageFocus;
        const availableStates = ageProfiles && typeof ageProfiles.keys === "function" ? Array.from(ageProfiles.keys()) : [];
        if (!focusState || !ageProfiles.has(focusState)) {
            const fallback = availableStates.includes(activeState) ? activeState : availableStates[0];
            focusState = fallback;
            viewState.ageFocus = fallback;
            updateAgeFocusButtons();
        }

        if (!focusState) {
            container.selectAll("*").remove();
            ageChartContext = null;
            container.append("p").attr("class", "chart-empty").text("The age dataset is unavailable.");
            storyNode.textContent = "Upload q1 age data to unlock this view.";
            return;
        }

        const profile = ageProfiles.get(focusState);
        if (!profile || !profile.total) {
            container.selectAll("*").remove();
            ageChartContext = null;
            container
                .append("p")
                .attr("class", "chart-empty")
                .text(`Age breakdowns for ${STATE_NAME_MAP[focusState] || focusState} are still loading.`);
            storyNode.textContent = `Provide age-segment fines for ${STATE_NAME_MAP[focusState] || focusState} to unlock the polar distribution.`;
            return;
        }

        const valueKey = viewState.ageMode === "share" ? "share" : "value";
        const referenceProfiles = Array.from(ageProfiles.values()).filter((entry) => entry.total > 0);
        const maxValue =
            valueKey === "share"
                ? 1
                : d3.max(referenceProfiles, (entry) => d3.max(entry.series, (node) => node.value)) || profile.total;

        const chartSize = Math.min(container.node()?.clientWidth || 420, 520);
        const totalHeight = chartSize;
        const radius = chartSize / 2 - 16;
        const context = ensureAgeChartContext(container, chartSize, totalHeight);
        context.radius = radius;

        const angle = d3.scaleBand().domain(AGE_ORDER).range([0, 2 * Math.PI]).align(0);
        const radialScale = d3.scaleLinear().domain([0, maxValue]).range([radius * 0.2, radius]).nice();
        const nationalSegments = buildAgeSegments(nationalAgeProfile, valueKey, angle);
        const stateSegments = buildAgeSegments(profile, valueKey, angle);
        const nationalLookup = new Map(nationalSegments.map((segment) => [segment.ageGroup, segment]));
        const nationalArc = d3
            .arc()
            .innerRadius((d) => Math.max(radialScale(d.value) - 6, radialScale(0)))
            .outerRadius((d) => radialScale(d.value))
            .startAngle((d) => d.startAngle)
            .endAngle((d) => d.endAngle)
            .padAngle(0.015)
            .padRadius(radialScale(0));
        const stateArc = d3
            .arc()
            .innerRadius(radialScale(0))
            .outerRadius((d) => radialScale(d.value))
            .startAngle((d) => d.startAngle)
            .endAngle((d) => d.endAngle)
            .padAngle(0.02)
            .padRadius(radialScale(0));
        const buildSegmentTooltip = (datum) => {
            const national = nationalLookup.get(datum.ageGroup);
            const stateText = valueKey === "share" ? formatPercent(datum.value) : formatNumber(datum.value);
            const nationalText = national ? (valueKey === "share" ? formatPercent(national.value) : formatNumber(national.value)) : "n/a";
            const label = `${STATE_NAME_MAP[focusState] || focusState} · ${datum.ageGroup}`;
            return `<strong>${label}</strong><br/>${stateText} vs ${nationalText} nationally`;
        };
        const showSegmentTooltip = (datum, event) => {
            if (!event) {
                return;
            }
            showTooltip(buildSegmentTooltip(datum), event);
        };
        const updateSelectionStyles = () => {
            const pinned = viewState.ageHighlight;
            context.stateGroup
                .selectAll("path")
                .attr("fill-opacity", (d) => {
                    if (!pinned) return 0.85;
                    return d.ageGroup === pinned ? 1 : 0.35;
                })
                .attr("stroke-width", (d) => (d.ageGroup === pinned ? 2.4 : 1.4))
                .classed("age-segment--selected", (d) => d.ageGroup === pinned);
        };
        const displayPinnedTooltip = () => {
            if (!viewState.ageHighlight) {
                return;
            }
            const datum = stateSegments.find((segment) => segment.ageGroup === viewState.ageHighlight);
            if (!datum) {
                viewState.ageHighlight = null;
                hideTooltip();
                updateSelectionStyles();
                return;
            }
            const node = context.stateGroup
                .selectAll("path")
                .filter((d) => d.ageGroup === datum.ageGroup)
                .node();
            if (!node) {
                return;
            }
            const rect = node.getBoundingClientRect();
            showSegmentTooltip(datum, { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
        };
        const togglePinnedSegment = (datum, event) => {
            if (viewState.ageHighlight === datum.ageGroup) {
                viewState.ageHighlight = null;
                hideTooltip();
            } else {
                viewState.ageHighlight = datum.ageGroup;
                showSegmentTooltip(datum, event);
            }
            updateSelectionStyles();
            if (viewState.ageHighlight) {
                displayPinnedTooltip();
            }
        };
        const transition = context.root.transition().duration(520).ease(d3.easeCubicInOut);

        const rings = radialScale.ticks(3);
        context.gridGroup
            .selectAll("circle")
            .data(rings, (d) => d)
            .join((enter) =>
                enter
                    .append("circle")
                    .attr("fill", "none")
                    .attr("stroke", "rgba(15,35,51,0.15)")
                    .attr("stroke-dasharray", "4 6")
            )
            .transition(transition)
            .attr("r", (d) => radialScale(d));

        context.nationalGroup
            .selectAll("path")
            .data(nationalSegments, (d) => d.ageGroup)
            .join((enter) => enter.append("path").attr("fill", "rgba(15,35,51,0.08)"))
            .transition(transition)
            .attr("d", nationalArc);

        const handlePointer = (event, datum) => {
            showSegmentTooltip(datum, event);
        };

        context.stateGroup
            .selectAll("path")
            .data(stateSegments, (d) => d.ageGroup)
            .join((enter) =>
                enter
                    .append("path")
                    .attr("fill-opacity", 0.85)
                    .attr("stroke", "rgba(15,35,51,0.35)")
                    .attr("stroke-width", 1.4)
            )
            .attr("fill", (d) => context.color(d.ageGroup))
            .on("mousemove", handlePointer)
            .on("mouseleave", () => {
                if (viewState.ageHighlight) {
                    displayPinnedTooltip();
                } else {
                    hideTooltip();
                }
            })
            .on("click", (event, datum) => {
                event.stopPropagation();
                togglePinnedSegment(datum, event);
            })
            .transition(transition)
            .attr("d", stateArc);

        context.root.on("click", (event) => {
            const target = event.target;
            if (target && typeof target.closest === "function" && target.closest(".age-radial__state path")) {
                return;
            }
            if (viewState.ageHighlight) {
                viewState.ageHighlight = null;
                hideTooltip();
                updateSelectionStyles();
            }
        });

        updateSelectionStyles();
        if (viewState.ageHighlight) {
            displayPinnedTooltip();
        }

        context.labelGroup
            .selectAll("text")
            .data(stateSegments, (d) => d.ageGroup)
            .join((enter) =>
                enter
                    .append("text")
                    .attr("text-anchor", "middle")
                    .attr("fill", "#102135")
                    .attr("font-size", "0.75rem")
            )
            .transition(transition)
            .attr("x", (d) => Math.cos(((d.startAngle + d.endAngle) / 2) - Math.PI / 2) * (radius + 12))
            .attr("y", (d) => Math.sin(((d.startAngle + d.endAngle) / 2) - Math.PI / 2) * (radius + 12))
            .text((d) => d.ageGroup);

        const peak = profile.series.length ? d3.greatest(profile.series, (d) => d[valueKey === "share" ? "share" : "value"]) : null;
        context.peakLabel.transition(transition).text(peak ? `${peak.ageGroup}` : "");

        storyNode.textContent = buildAgeStory(profile, valueKey, focusState);
    }

    function ensureAgeChartContext(container, chartSize, totalHeight) {
        if (!ageChartContext || Math.abs(chartSize - ageChartContext.chartSize) > 4) {
            ageChartContext = createAgeChartContext(container, chartSize, totalHeight);
        } else {
            ageChartContext.chartSize = chartSize;
            ageChartContext.root.attr("viewBox", `0 0 ${chartSize} ${totalHeight}`);
            ageChartContext.center.attr("transform", `translate(${chartSize / 2}, ${chartSize / 2})`);
        }
        return ageChartContext;
    }

    function createAgeChartContext(container, chartSize, totalHeight) {
        container.selectAll("*").remove();
        const root = container.append("svg").attr("viewBox", `0 0 ${chartSize} ${totalHeight}`).attr("preserveAspectRatio", "xMidYMid meet");
        const center = root.append("g").attr("transform", `translate(${chartSize / 2}, ${chartSize / 2})`);
        const gridGroup = center.append("g").attr("class", "age-radial__grid");
        const nationalGroup = center.append("g").attr("class", "age-radial__national");
        const stateGroup = center.append("g").attr("class", "age-radial__state");
        const labelGroup = center.append("g").attr("class", "age-radial__labels");
        const peakLabel = center
            .append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .attr("fill", "#102135")
            .attr("font-size", "1rem")
            .attr("font-weight", 600);
        const color = d3.scaleOrdinal().domain(AGE_ORDER).range(AGE_COLOR_RANGE);
        return { root, center, gridGroup, nationalGroup, stateGroup, labelGroup, peakLabel, chartSize, color };
    }

    function buildAgeSegments(profile, valueKey, angleScale) {
        if (!profile) {
            return AGE_ORDER.map((age) => ({
                ageGroup: age,
                value: 0,
                startAngle: angleScale(age),
                endAngle: angleScale(age) + angleScale.bandwidth(),
            }));
        }
        return AGE_ORDER.map((age) => {
            const point = profile.series.find((d) => d.ageGroup === age) || { share: 0, value: 0 };
            const value = valueKey === "share" ? point.share : point.value;
            return {
                ageGroup: age,
                value,
                startAngle: angleScale(age),
                endAngle: angleScale(age) + angleScale.bandwidth(),
            };
        });
    }

    function buildAgeStory(profile, valueKey, focusState) {
        if (!profile || !profile.series?.length) {
            return `${STATE_NAME_MAP[focusState] || focusState || "This state"} still needs age-level fines to narrate this chart.`;
        }
        const valueField = valueKey === "share" ? "share" : "value";
        const formatValue = valueKey === "share" ? formatPercent : formatNumber;
        const stateName = STATE_NAME_MAP[focusState] || focusState;
        const sorted = [...profile.series].sort((a, b) => (b[valueField] || 0) - (a[valueField] || 0));
        const lead = sorted[0];
        const runner = sorted[1];
        const laggard = sorted[sorted.length - 1];
        const parts = [];
        if (lead) {
            parts.push(`${stateName} sees ${lead.ageGroup} leading with ${formatValue(lead[valueField] || 0)} ${valueKey === "share" ? "of fines" : "fines"}.`);
        }
        if (lead && runner && lead !== runner) {
            const gap = (lead[valueField] || 0) - (runner[valueField] || 0);
            if (gap !== 0) {
                parts.push(`${lead.ageGroup} sits ${formatAgeDifference(gap, valueKey)} ${gap > 0 ? "ahead of" : "behind"} ${runner.ageGroup}.`);
            }
        }
        if (laggard && laggard !== lead) {
            parts.push(`${laggard.ageGroup} remains the smallest slice at ${formatValue(laggard[valueField] || 0)}.`);
        }
        if (nationalAgeProfile && lead) {
            const nationalPeer = nationalAgeProfile.series.find((entry) => entry.ageGroup === lead.ageGroup);
            if (nationalPeer) {
                const diff = (lead[valueField] || 0) - (nationalPeer[valueField] || 0);
                if (diff) {
                    const direction = diff > 0 ? "above" : "below";
                    parts.push(`${lead.ageGroup} is ${formatAgeDifference(diff, valueKey)} ${direction} the national ${valueKey === "share" ? "share" : "count"}.`);
                }
            }
            const widestGap = profile.series
                .map((point) => {
                    const nationalPoint = nationalAgeProfile.series.find((entry) => entry.ageGroup === point.ageGroup);
                    if (!nationalPoint) return null;
                    return { ageGroup: point.ageGroup, delta: (point[valueField] || 0) - (nationalPoint[valueField] || 0) };
                })
                .filter(Boolean)
                .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
            if (widestGap && Math.abs(widestGap.delta) > 0 && (!lead || widestGap.ageGroup !== lead.ageGroup)) {
                const leaning = widestGap.delta > 0 ? "over-indexes" : "lags";
                parts.push(`${widestGap.ageGroup} ${leaning} Australia by ${formatAgeDifference(widestGap.delta, valueKey)}.`);
            }
        }
        return parts.join(" ") || `${stateName} has no dominant cohort yet.`;
    }

    function formatAgeDifference(diff, valueKey) {
        if (valueKey === "share") {
            return `${formatDecimal(Math.abs(diff) * 100, 1)} pts`;
        }
        return formatNumber(Math.abs(diff));
    }

    // Expose functions globally (no ES6 export)
    window.drawAgeProfile = drawAgeProfile;
    window.buildAgeSegments = buildAgeSegments;
    window.buildAgeStory = buildAgeStory;
    window.formatAgeDifference = formatAgeDifference;
    // Also expose constants
    window.AGE_ORDER = AGE_ORDER;
    window.AGE_COLOR_RANGE = AGE_COLOR_RANGE;
})();
