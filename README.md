
## Responsive drawer regression check

- Resize the inventory drawer in Chrome DevTools against the following presets to confirm no clipping or horizontal scroll: iPhone SE (375×667), iPhone 15 Pro Max (430×932), Pixel Fold (split view 675×842), and a desktop width ≥1280px.
- Ensure RTL mode (Arabic) keeps the header, meta grid, and action buttons aligned by toggling the language switcher while the drawer is open.
- Capture quick reference screenshots or rerun any visual regression tooling (e.g., `npx playwright test` if available) after major layout changes so we can compare future updates.
