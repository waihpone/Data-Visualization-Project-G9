# Storyboard and Visualisation Design

## 1. Storyboard: Guided, Layered User Journey

1. **Zero-Click Insight** – The landing view loads the national scope (filters = all). KPI cards immediately display total fines, rate per 10k licences, and camera ratio, while all charts present baseline patterns. The user understands the overall story within five seconds.
2. **Filter to Victoria (COVID investigation)** – The policymaker selects "Victoria" in the Jurisdiction filter (Row 2). Every KPI and chart animates to the new context. In the right column the annotated multi-line chart now highlights the Victorian lockdown periods. Hovering over 2020-04 reveals a tooltip noting the collapse in police-issued fines compared to camera detections.
3. **Brush for focus** – The user drags across the context area chart (Q3) to isolate 2020-01 → 2021-12. The focus chart zooms smoothly, preserving the lockdown annotations. They click the legend to temporarily hide "Camera" and allow the Y-axis to re-scale to the police trend.
4. **Cross-filter for jurisdictional drill-down** – Switching to Q5, the analyst clicks the "Western Australia" bar in the top-left chart. This action sets a global cross-filter: the KPI cards, map, and right-column visuals all update to WA while the dropdown mirrors the selection.
5. **Remoteness drill-down and details-on-demand** – Keeping WA active, the user inspects the choropleth. Hovering over the "Remote" region surfaces a tooltip with the precise fine count plus contextual text (jurisdiction, share). They can now answer the multi-part research question.
6. **Demographic deep dive** – Moving down the right column, the analyst inspects Q1. Legend toggles let them compare camera vs. police clusters per age group to prove which demographics drive enforcement load.
7. **Reset for next hypothesis** – The user taps the "Reset Filters" pill. All filters, cross-filters, and legend toggles revert, ready for the next cycle of inquiry.

## 2. Chart Selection Rationale (Table 7)

| Research Question | Chart Type | Why It’s Appropriate | Data Type Represented |
| --- | --- | --- | --- |
| Q1 – Age vs detection method | Clustered horizontal bar chart | Common baseline preserves graphical integrity while the horizontal layout leaves room for readable age labels. Legend toggles support isolating a method. | Categorical (Age Group) + Quantitative (Fines) + Categorical (Detection Method) |
| Q2 – Remoteness comparison | Choropleth map using ASGS remoteness approximation | Spatial encoding answers *where* questions at a glance and mirrors official geographic regions for trustworthy comparison. | Spatial/Categorical (Remoteness Area) + Quantitative (Fines) |
| Q3 – COVID timeline | Annotated multi-line chart + context brush | Focus+context pairing supports storytelling of lockdown periods and offers HD brush interaction for analysts. | Temporal (Month) + Quantitative (Fines) + Categorical (Detection Method & Event) |
| Q4 – Detection ratio evolution | 100% stacked area chart | Keeps the Y-axis fixed at 100% so parts of the whole are directly comparable year-over-year. | Temporal (Year) + Quantitative (Proportion) + Categorical (Method) |
| Q5 – Rate ranking + drill-down | Horizontal bar chart + linked choropleth | Combined system answers the two-part question: ranking for "how much" and map for "where", with cross-filter linking between them. | Bar: Categorical + Quantitative rate; Map: Spatial + Quantitative |

## 3. Adherence to Design Principles

- **Graphical integrity** – Every quantitative axis uses a zero baseline (bars) or explicitly communicates percentage scales (ratio chart). Choropleth values map to a perceptually uniform sequential scale to avoid exaggeration.
- **Accessibility** – Palette relies on blue/orange contrast that is colour-blind safe. Typography stays above 14px, cards maintain 4.5:1 contrast, and interactive elements have clear focus/hover states.
- **Scalability & responsiveness** – The card grid collapses from two columns to one on small screens, maintaining the inverted pyramid order. SVGs rely on `viewBox` so they scale fluidly.
- **Progressive disclosure** – Cards encapsulate logical units (filters, KPIs, charts). Tooltips provide details-on-demand, annotations inject context only where needed, and legend toggles let power users reduce clutter.

## 4. Visual Encoding Choices

- **Colour** – Header blue becomes the primary encoding for absolute values; categorical comparisons use blue (camera) vs coral (police). Choropleth uses `d3.interpolateBlues` for geospatial density, while lockdown annotations use a translucent pink overlay to remain visible yet unobtrusive.
- **Shape & size** – Horizontal bars emphasise length for rate comparisons, stacked areas convey proportion through vertical height, and map polygons preserve spatial identity.
- **Annotations & tooltips** – Lockdown rectangles plus labels tie narrative context directly to the multi-line chart. Rich tooltips display jurisdiction, absolute counts, and derived ratios so analysts can answer precise questions without UI clutter.

## 5. Interaction Design (Table 8)

| Interaction Feature | User Method | System Response / Behaviour | Linked RQs | UX Benefit |
| --- | --- | --- | --- | --- |
| Global filter panel | Click dropdowns, set date range | Updates KPIs and all charts with smooth transitions | All | Enables multivariate exploration & immediate feedback |
| Reset filters button | Click pill button | Clears dropdowns, brush selections, and legend toggles | All | Provides a safe "home base" to encourage experimentation |
| Cross-filter (jurisdiction bar) | Click a bar | Highlights bar, applies jurisdiction filter to entire dashboard, updates map + KPIs | Q5 | Couples ranking with geographic drill-down; reduces clicks |
| Rich tooltips | Hover over bars, lines, map regions | Shows multi-field tooltip "cards" with rates, totals, ratios | All | Supports progressive disclosure and details-on-demand |
| Focus+context brush | Drag selection in context chart | Zooms the main annotated chart to the brushed time window | Q3 | Advanced temporal exploration of lockdown periods |
| Interactive legend toggles | Click legend chips | Series fades out/in, Y-axis rescales, instructions surface if all hidden | Q1, Q3, Q4 | Lets users isolate trends without reloading | 
| Choropleth hover | Hover remoteness polygon | Displays remoteness label, totals, and share | Q2, Q5 | Communicates "where" insight exactly |
| Animated transitions | Automatic on filter/bar/legend changes | Bars, lines, and areas tween to new positions | All | Preserves mental model and makes state changes traceable |

The storyboard and tables satisfy the specification for Sections 3.2 (visualisation design) and 3.3 (interaction design) and map one-to-one with the implemented D3 components in `src/app.js`.
