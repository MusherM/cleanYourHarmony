# CleanYourHarmony report template

中文：[README_zh.md](README_zh.md)

An extruded H, acceptance report and protocol share one continuous depth space driven by scrolling. The page is a single self-contained HTML file with no external resources and works offline. Requires Node.js 18 or later.

The current entry point is `index.html`, rendered from `example.json`. The previous poster-style preview is retained as `index_2026-10-26_legacy.html` for comparison.

## Visual structure

- **Continuous 3D space**: CSS perspective / preserve-3d creates an extruded H, rings and a depth corridor, without external models or runtime dependencies.
- **Scroll mapping**: native scroll position directly drives camera Z travel through the hero, overview, scope, each check, conclusions and protocol. Check count determines path length.
- **Navigation**: chapter buttons travel along the same camera path; depth and progress appear below.
- **Desktop first**: the landscape scene scales to the window and nodes fit available height. Use “平面阅读” for narrow sidebars or long content.
- **Accessibility**: inactive nodes are excluded from keyboard focus. Reduced-motion preferences default to flat reading. The original report remains readable without JavaScript.
- **Print**: prints the flat report with expanded checks, excluding spatial decoration.

The 3D preview is `index_3d.html`; `index.html` mirrors the current entry. Older screenshots and legacy pages represent historical versions. There is no theme switcher.

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

- `template.html`: hero, report skin, protocol, colophon, responsive layout, motion and print styles.
- `report.schema.json`: version 1 data contract.
- `validate.mjs`: dependency-free validator for the keywords used in this contract, not a general JSON Schema engine. Extend validation and tests when expanding the contract.
- `render.mjs`: escapes content, fills the template and emits presentation hooks such as `data-status` and the check count; no external resources.
- `example.json` / `index.html`: explicitly labeled demo source and current entry page; the timestamp is not a real device acceptance time.
- `landing_2026-10-27_hero.png`, `landing_2026-10-27_mobile.png`, `landing_2026-10-27_full.png`: visual verification captures.
- `index_2026-10-26_legacy.html`: previous preview, retained for comparison.

Run `node --test report-template/test.mjs` to check rejection, status consistency, escaping and file protection. Structural validation, visual checks and device acceptance are separate verification levels. This directory contains no device automation; historical reports remain in `dev/clean-settings/`.
