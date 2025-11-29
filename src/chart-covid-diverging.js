/**
 * COVID Diverging Area Chart (Butterfly Chart)
 * Visualizes annual camera vs police enforcement fines as a butterfly/diverging area chart
 * Dependencies: D3.js, ui-utils.js (for createResponsiveSvg, formatNumber, etc.)
 * Global variables accessed: STATE_NAME_MAP, covidChartContext, showTooltip, hideTooltip, renderChartLegend
 */

(function () {
    /**
     * Build data and scales for the Diverging Area Chart (Butterfly Chart)
     * @param {string} stateCode - The jurisdiction code (e.g., "VIC", "NSW")
     * @param {Array} annualData - The annual data from q3_annual_all_jurisdiction.csv
     * @returns {Object} Object containing pivoted data, scales, and metadata
     */
    function buildButterflyChartData(stateCode, annualData) {
        // Filter data for the specific state
        const stateRows = annualData.filter(row => row.JURISDICTION === stateCode);

        if (!stateRows.length) {
            return {
                pivotedData: [],
                scales: null,
                maxVal: 0,
                error: `No data available for ${STATE_NAME_MAP[stateCode] || stateCode}`
            };
        }

        // Pivot the data: one object per year
        // Target format: [{ year: 2018, camera: 12345, police: 6789 }, ...]
        const pivotedData = Array.from(
            d3.rollup(
                stateRows,
                (values) => {
                    const entry = { year: values[0].YEAR };

                    // Map "Camera" to camera and "Police" to police
                    values.forEach(row => {
                        const method = row.DETECTION_METHOD;
                        if (method === "Camera") {
                            entry.camera = row["FINES (Sum)"] || 0;
                        } else if (method === "Police") {
                            entry.police = row["FINES (Sum)"] || 0;
                        }
                    });

                    // Ensure both properties exist (default to 0 if missing)
                    entry.camera = entry.camera || 0;
                    entry.police = entry.police || 0;

                    return entry;
                },
                (row) => row.YEAR
            ),
            ([, value]) => value
        ).sort((a, b) => d3.ascending(a.year, b.year));

        // Calculate the maximum fine value found in either category
        const maxVal = d3.max(pivotedData, d => Math.max(d.camera, d.police)) || 0;

        if (maxVal === 0) {
            return {
                pivotedData,
                scales: null,
                maxVal: 0,
                error: `No fine data available for ${STATE_NAME_MAP[stateCode] || stateCode}`
            };
        }

        return {
            pivotedData,
            maxVal,
            error: null
        };
    }

    /**
     * Draw the Diverging Area Chart (Butterfly Chart) for annual camera vs police data
     * @param {D3Selection} container - The D3 selection for the chart container
     * @param {HTMLElement} storyNode - The DOM element for the chart narrative
     * @param {Array} rows - Annual data rows
     * @param {string} stateCode - Jurisdiction code (e.g., "VIC", "NSW")
     */
    function drawCovidAnnualFallback(container, storyNode, rows, stateCode) {
        // Process data using our butterfly chart helper
        const { pivotedData, maxVal, error } = buildButterflyChartData(stateCode, rows);

        // Handle errors
        if (error || !pivotedData.length || maxVal === 0) {
            container.selectAll("*").remove();
            covidChartContext = null;
            container.append("p")
                .attr("class", "chart-empty")
                .text(error || `${STATE_NAME_MAP[stateCode] || stateCode} needs annual camera versus police data.`);
            storyNode.textContent = error || `Upload camera versus police annual files for ${STATE_NAME_MAP[stateCode] || stateCode} to visualize enforcement trends.`;
            renderChartLegend("covid-legend", []);
            return;
        }

        // Dynamic Sizing
        const height = 400;
        const margin = { top: 40, right: 40, bottom: 50, left: 60 };
        const measuredWidth = container.node()?.clientWidth || container.node()?.parentNode?.clientWidth || 600;

        // Define Colors for Butterfly Wings
        const cameraColor = "#377eb8"; // Blue for Camera
        const policeColor = "#ff7f00"; // Orange for Police

        // Initialize chart context on first render or if width changed significantly
        if (!covidChartContext || Math.abs(measuredWidth - covidChartContext.width) > 4) {
            container.selectAll("*").remove();
            const { svg, width } = createResponsiveSvg(container, { height });

            covidChartContext = {
                svg,
                width,
                height,
                margin,
                cameraColor,
                policeColor,
            };

            const ctx = covidChartContext;

            // COVID context band (background layer)
            ctx.covidBand = svg.append("g").attr("class", "covid-context-band");
            ctx.covidBandRect = ctx.covidBand.append("rect")
                .attr("y", margin.top)
                .attr("height", height - margin.top - margin.bottom)
                .attr("fill", "#e5e7eb")
                .attr("opacity", 0.5);
            ctx.covidBandLabel = ctx.covidBand.append("text")
                .attr("y", margin.top + 15)
                .attr("text-anchor", "middle")
                .attr("fill", "#6b7280")
                .attr("font-size", "0.75rem")
                .attr("font-weight", 600)
                .text("COVID Era");

            // Grid group
            ctx.gridGroup = svg.append("g").attr("class", "butterfly-grid");

            // Central baseline at y = 0
            ctx.baseline = svg.append("line")
                .attr("class", "butterfly-baseline")
                .attr("stroke", "#374151")
                .attr("stroke-width", 2.5)
                .attr("stroke-dasharray", "6 4");

            // Butterfly wings group
            ctx.wingsGroup = svg.append("g").attr("class", "butterfly-wings");
            ctx.cameraWing = ctx.wingsGroup.append("path").attr("class", "butterfly-wing--camera");
            ctx.policeWing = ctx.wingsGroup.append("path").attr("class", "butterfly-wing--police");

            // Points group
            ctx.pointsGroup = svg.append("g").attr("class", "butterfly-points");

            // Axes
            ctx.xAxisGroup = svg.append("g").attr("class", "axis axis--x");
            ctx.yAxisGroup = svg.append("g").attr("class", "axis axis--y");

            // Axis labels
            ctx.xLabel = svg.append("text")
                .attr("text-anchor", "middle")
                .attr("fill", "#102135")
                .attr("font-size", "0.85rem")
                .text("Year");

            ctx.yLabel = svg.append("text")
                .attr("text-anchor", "middle")
                .attr("fill", "#102135")
                .attr("font-size", "0.85rem")
                .text("Annual Fines");
        }

        // Update context width
        const ctx = covidChartContext;
        ctx.width = measuredWidth;
        ctx.svg.attr("viewBox", `0 0 ${ctx.width} ${height}`);

        // Update scales
        const xScale = d3.scaleLinear()
            .domain([2018, 2024])
            .range([margin.left, ctx.width - margin.right]);

        const yScale = d3.scaleLinear()
            .domain([-maxVal, maxVal])
            .range([height - margin.bottom, margin.top])
            .nice();

        const centerY = yScale(0);

        // Area generators
        const cameraAreaGenerator = d3.area()
            .x(d => xScale(d.year))
            .y0(yScale(0))
            .y1(d => yScale(d.camera))
            .curve(d3.curveMonotoneX);

        const policeAreaGenerator = d3.area()
            .x(d => xScale(d.year))
            .y0(yScale(0))
            .y1(d => yScale(-d.police))
            .curve(d3.curveMonotoneX);

        // Shared transition
        const transition = ctx.svg.transition().duration(520).ease(d3.easeCubicInOut);

        // Update COVID band
        ctx.covidBandRect
            .attr("x", xScale(2020))
            .attr("width", xScale(2021) - xScale(2020));
        ctx.covidBandLabel.attr("x", (xScale(2020) + xScale(2021)) / 2);

        // Update grid lines
        ctx.gridGroup.selectAll("line").remove();
        yScale.ticks(6).forEach(tick => {
            if (tick !== 0) {
                ctx.gridGroup.append("line")
                    .attr("x1", margin.left)
                    .attr("x2", ctx.width - margin.right)
                    .attr("y1", yScale(tick))
                    .attr("y2", yScale(tick))
                    .attr("stroke", "rgba(15,35,51,0.1)")
                    .attr("stroke-width", 1);
            }
        });

        // Update baseline
        ctx.baseline
            .attr("x1", margin.left)
            .attr("x2", ctx.width - margin.right)
            .attr("y1", centerY)
            .attr("y2", centerY);

        // Animate butterfly wings
        ctx.cameraWing
            .datum(pivotedData)
            .attr("fill", cameraColor)
            .attr("stroke", d3.color(cameraColor).darker(0.5))
            .attr("stroke-width", 1.5)
            .style("opacity", 0.8)
            .transition(transition)
            .attr("d", cameraAreaGenerator);

        ctx.policeWing
            .datum(pivotedData)
            .attr("fill", policeColor)
            .attr("stroke", d3.color(policeColor).darker(0.5))
            .attr("stroke-width", 1.5)
            .style("opacity", 0.8)
            .transition(transition)
            .attr("d", policeAreaGenerator);

        // Raise baseline to appear on top
        ctx.baseline.raise();

        // Update data points with data join
        const cameraPoints = ctx.pointsGroup.selectAll(".point--camera").data(pivotedData, d => d.year);
        const policePoints = ctx.pointsGroup.selectAll(".point--police").data(pivotedData, d => d.year);

        // Camera points
        cameraPoints
            .join(
                enter => enter.append("circle")
                    .attr("class", "point--camera")
                    .attr("cx", d => xScale(d.year))
                    .attr("cy", d => yScale(d.camera))
                    .attr("r", 0)
                    .attr("fill", cameraColor)
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 2)
                    .style("cursor", "pointer")
                    .style("opacity", 0)
                    .on("mouseover", function (event, d) {
                        d3.select(this).attr("r", 6);
                        showTooltip(`<strong>${d.year} - Camera</strong><br/>${formatNumber(d.camera)} fines`, event);
                    })
                    .on("mouseout", function () {
                        d3.select(this).attr("r", 4);
                        hideTooltip();
                    })
                    .call(enter => enter.transition(transition).attr("r", 4).style("opacity", 1))
            )
            .transition(transition)
            .attr("cx", d => xScale(d.year))
            .attr("cy", d => yScale(d.camera));

        // Police points
        policePoints
            .join(
                enter => enter.append("circle")
                    .attr("class", "point--police")
                    .attr("cx", d => xScale(d.year))
                    .attr("cy", d => yScale(-d.police))
                    .attr("r", 0)
                    .attr("fill", policeColor)
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 2)
                    .style("cursor", "pointer")
                    .style("opacity", 0)
                    .on("mouseover", function (event, d) {
                        d3.select(this).attr("r", 6);
                        showTooltip(`<strong>${d.year} - Police</strong><br/>${formatNumber(d.police)} fines`, event);
                    })
                    .on("mouseout", function () {
                        d3.select(this).attr("r", 4);
                        hideTooltip();
                    })
                    .call(enter => enter.transition(transition).attr("r", 4).style("opacity", 1))
            )
            .transition(transition)
            .attr("cx", d => xScale(d.year))
            .attr("cy", d => yScale(-d.police));

        // Update axes with transitions
        const xAxis = d3.axisBottom(xScale).ticks(7).tickFormat(d3.format("d"));
        const yAxis = d3.axisLeft(yScale).ticks(6).tickFormat(d => d3.format(".2s")(Math.abs(d)));

        ctx.xAxisGroup
            .attr("transform", `translate(0, ${height - margin.bottom})`)
            .transition(transition)
            .call(xAxis)
            .call(axis => axis.selectAll("text").attr("fill", "#102135"))
            .call(axis => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.25)"));

        ctx.yAxisGroup
            .attr("transform", `translate(${margin.left},0)`)
            .transition(transition)
            .call(yAxis)
            .call(axis => axis.selectAll("text").attr("fill", "#102135"))
            .call(axis => axis.selectAll("path,line").attr("stroke", "rgba(15,35,51,0.25)"));

        // Update axis labels
        ctx.xLabel.transition(transition)
            .attr("x", (margin.left + ctx.width - margin.right) / 2)
            .attr("y", height - 10);

        ctx.yLabel.transition(transition)
            .attr("transform", `translate(15, ${height / 2}) rotate(-90)`);

        // Update legend
        const legendData = [
            { label: "Camera", color: cameraColor },
            { label: "Police", color: policeColor }
        ];
        renderChartLegend("covid-legend", legendData);

        // Update story text
        const stateName = STATE_NAME_MAP[stateCode] || stateCode;
        const firstYear = pivotedData[0];
        const lastYear = pivotedData[pivotedData.length - 1];
        const peakCamera = d3.max(pivotedData, d => d.camera);
        const peakPolice = d3.max(pivotedData, d => d.police);

        storyNode.textContent = `${stateName} butterfly chart shows enforcement trends from ${firstYear.year} to ${lastYear.year}. ` +
            `Camera detections peaked at ${formatNumber(peakCamera)} fines, while police detections reached ${formatNumber(peakPolice)} fines. ` +
            `The chart uses a centered Y-axis from -${formatNumber(maxVal)} to +${formatNumber(maxVal)} to create the butterfly visualization.`;
    }

    // Expose functions globally (no ES6 export)
    window.buildButterflyChartData = buildButterflyChartData;
    window.drawCovidAnnualFallback = drawCovidAnnualFallback;
})();
