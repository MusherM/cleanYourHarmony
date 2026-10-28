# CleanYourHarmony report template

中文：[README_zh.md](README_zh.md)

The landing page opens with a **CSS 3D chrome H monogram** and an oversized wordmark, followed by a consistent acceptance report with only the main report content. The page is a single self-contained HTML file with no external models or runtime dependencies and works offline. Requires Node.js 18 or later.

The final report design is maintained in `template.html`; `index.html` is its current preview, rendered from `example.json`. Decorative captions, slogans, the protocol section and the colophon have been removed. The version 1 JSON contract is unchanged: content fields are rendered, schema version is validated, mode controls the demo warning, and status/counts reflect the checks. The previous 2D poster preview is retained as `index_2026-10-26_legacy.html`. `alternate_3d_2026-10-27/` preserves a concurrently written scroll-driven 3D implementation and is not the current entry.

## Visual structure

- **3D hero**: ink-black ground, warm chrome, signal orange. The H is extruded from 42 clipped slices across 38px of depth, with a moving chrome gradient on the front face, a closed back, and an orange rim light. CSS 3D gyroscope rings, a perspective floor grid and floating motes frame it.
- **Interaction**: pointer movement tilts the whole scene with parallax; the H slowly swings, floats and catches a moving specular sheen. Everything is CSS 3D, transforms and `clip-path`; no WebGL, Three.js or external models.
- **Acceptance report**: warm paper, serif headings, monospace labels, derived statistics, expandable checks and a dark limits panel.
- **Responsive / motion**: a `100svh` hero with narrow and landscape reflow; `prefers-reduced-motion` disables the 3D motion and scroll reveal.
- **Print**: the 3D scene is removed, all checks expand, and a flat H mark prints with the report.

The previous three-theme switcher has been removed; `?style=` no longer changes the page. For a visual variant, copy `template.html` to a new file rather than overwriting historical reports.

## Agent workflow

1. Read `report.schema.json`; use `example.json` as a structural reference. Output pure JSON without Markdown fences to `dev/<topic>/report_YYYY-MM-DD_HH-mm.json`. Use `actual` for real reports and `demo` for demonstrations.
2. Record the actual Beijing time (`+08:00`), a 40-character commit SHA or `N/A：reason`, environment, scope, limitations and next steps. Every check records expected and observed behavior, verification level, status and evidence. Never mark untested work as passed.
3. Validate before generating:

```sh
node report-template/validate.mjs dev/<topic>/report_YYYY-MM-DD_HH-mm.json
node report-template/render.mjs dev/<topic>/report_YYYY-MM-DD_HH-mm.json dev/<topic>/stage_report_YYYY-MM-DD_HH-mm.html
```

Invalid input exits with code 1 and reports field paths. Fix the JSON and validate again; never bypass validation by editing final HTML. The generator validates again and refuses to overwrite existing files. Generated pages inline styles and scripts and work offline.

Overall status: all passed means `passed`; all untested means `not_tested`; only blocked/untested with at least one blocked means `blocked`; all other combinations mean `partial`. Passed and failed checks require evidence. Counts are derived from checks, never supplied by agents.

Evidence entries are plain text references: preferably project-relative paths, capture times, SHA-256 hashes and key observations. Attachments and links are not loaded or executed. Validation does not establish evidence existence or truth; verify these separately. Exclude device accounts, tokens and other sensitive data.

## Maintenance and verification

- `template.html`: final 3D hero and report template, responsive layout, motion and print styles.
- `report.schema.json`: version 1 data contract.
- `validate.mjs`: dependency-free validator for the keywords used in this contract, not a general JSON Schema engine. Extend validation and tests when expanding the contract.
- `render.mjs`: escapes content, fills the template and emits presentation hooks such as `data-status` and the check count; no external resources.
- `example.json` / `index.html`: explicitly labeled demo source and current entry page; the timestamp is not a real device acceptance time.
- `landing_2026-10-27_hero.png`, `landing_2026-10-27_mobile.png`, `landing_2026-10-27_full.png`: historical captures from before the caption cleanup; they do not verify the current preview.
- `index_2026-10-26_legacy.html`: previous 2D preview, retained for comparison.
- `alternate_3d_2026-10-27/`: a concurrently written scroll-driven 3D implementation, preserved unchanged for comparison.

Run `node --test report-template/test.mjs` to check rejection, status consistency, escaping and file protection. Structural validation, visual checks and device acceptance are separate verification levels. This directory contains no device automation; historical reports remain in `dev/clean-settings/`.

Use check status `not_found` for notification apps with no exact search result, with captured evidence. Reports count this separately from passed and failed; reports containing missing apps have overall status `partial`. Overlays, loading, and tool errors must not use this status.
