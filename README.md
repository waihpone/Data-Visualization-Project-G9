# Data-Visualization-Project-G9

Interactive D3.js dashboard that visualises Australian speeding enforcement activity with a progressive disclosure layout tailored for policymakers, analysts, and the public. The UI mirrors the proposed card-based design: filters, KPI counters, and a dual-column chart narrative.

## Project Structure

- `index.html` – semantic layout, filter controls, KPI cards, chart containers, and tooltip host.
- `styles/styles.css` – responsive card-based styling plus accessibility-focused theming.
- `src/mock-data.js` – deterministic mock dataset generator plus lightweight remoteness geojson and lockdown annotations.
- `src/ui-utils.js` – shared formatting, legend, and SVG helpers used by every chart for cleaner, reusable code.
- `src/app.js` – D3 visualisations, filter/state management, cross-filtering, brush-enabled time-series, tooltips, and annotations.
- `docs/design.md` – storyboard, chart rationale, design principles, and interaction table aligned with assessment criteria.

## Run Locally

The project is static; any HTTP server works. For a quick preview from the project root:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000` and interact with the dashboard.

## Design System Highlights

- Light, card-based visual language with badge metadata that reinforces the inverted-pyramid storytelling approach.
- Typography, spacing, and color palette tuned for accessibility (≥4.5:1 contrast) plus motion-limited hover states.
- KPI counters now include contextual microcopy, while charts share a single tooltip + legend system via `src/ui-utils.js`.

## Next Steps

1. Replace the deterministic mock dataset with the cleaned speeding dataset while keeping the same record schema.
2. Wire the filters to the real metadata lists (jurisdiction, remoteness, age groups) and extend the driver licence lookup table if more regions are added.
3. Connect the choropleth to the official ASGS remoteness shapefile for production fidelity.
4. Export final copy and interactions summary from `docs/design.md` into the submission template.
