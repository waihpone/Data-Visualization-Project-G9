# Data-Visualization-Project-G9

Interactive D3.js dashboard that visualises Australian speeding enforcement activity with a progressive disclosure layout tailored for policymakers, analysts, and the public. The UI mirrors the proposed card-based design: filters, KPI counters, and a dual-column chart narrative.

## Project Structure

- `index.html` – semantic layout, filter controls, KPI cards, chart containers, and tooltip host.
- `styles/styles.css` – responsive card-based styling plus accessibility-focused theming.
- `src/mock-data.js` – deterministic mock dataset generator retained for prototyping and local regression checks.
- `src/ui-utils.js` – shared formatting, legend, and SVG helpers used by every chart for cleaner, reusable code.
- `src/app.js` – D3 visualisations, filter/state management, cross-filtering, brush-enabled time-series, tooltips, and annotations.
- `scripts/extract-remoteness.js` – converts the official ASGS GeoPackage into a simplified GeoJSON that powers the choropleth.
- `docs/design.md` – storyboard, chart rationale, design principles, and interaction table aligned with assessment criteria.

## Run Locally

The project is static; any HTTP server works. For a quick preview from the project root:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000` and interact with the dashboard.

## Updating Remoteness Boundaries

The choropleth uses the ABS ASGS Edition 3 Remoteness Areas GeoPackage, available from the [ABS Digital Boundary Files portal](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files).

Regenerate the simplified remoteness GeoJSON whenever you swap in a new GeoPackage:

```powershell
npm install
npm run extract:remoteness
```

Optional flags allow you to override inputs without editing the script:

```powershell
npm run extract:remoteness -- --input=path/to/ASGS.gpkg --output=path/to/remoteness.geojson --table=RA_2021_AUST_GDA94 --tolerance=0.01
```

The extractor reads `data/ASGS_Ed3_2021_RA_GDA94.gpkg` by default, simplifies the 2021 remoteness polygons (≈2 km tolerance), and writes `data/remoteness.geojson` for the D3 choropleth.

## Design System Highlights

- Light, card-based visual language with badge metadata that reinforces the inverted-pyramid storytelling approach.
- Typography, spacing, and color palette tuned for accessibility (≥4.5:1 contrast) plus motion-limited hover states.
- KPI counters now include contextual microcopy, while charts share a single tooltip + legend system via `src/ui-utils.js`.

## Next Steps

1. Replace the deterministic mock dataset with the cleaned speeding dataset while keeping the same record schema.
2. Wire the filters to the real metadata lists (jurisdiction, remoteness, age groups) and extend the driver licence lookup table if more regions are added.
3. Stress-test the new ASGS-powered choropleth for performance on tablets and low-power laptops, introducing simplified TopoJSON if required.
4. Export final copy and interactions summary from `docs/design.md` into the submission template.
