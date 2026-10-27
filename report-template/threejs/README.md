# CleanYourHarmony — Three.js spatial report

中文：[README_zh.md](README_zh.md)

A real WebGL scene using pinned Three.js 0.180.0, maintained separately from earlier CSS perspective experiments. Open `index.html`. Content comes from `example.json` and is explicitly demo data, not device acceptance evidence.

## Implementation

- `WebGLRenderer` and `PerspectiveCamera` render the world. The H uses beveled `ExtrudeGeometry`; floors, rails, pedestal, rings and boards are meshes.
- Report text is wrapped and paginated into `CanvasTexture` maps on `PlaneGeometry`. Spatial mode has no HTML report planes, only navigation/progress HUD controls.
- Scrolling drives camera X/Y/Z coordinates with reading dwell followed by continuous travel. Chapter buttons follow the same path.
- Long reports paginate. Flat mode preserves selectable original text, assistive reading and printing. Reduced motion defaults to flat mode. Renderer creation failure/context loss falls back to flat reading.
- Designed for desktop landscape. Narrow viewports move the camera back to preserve the composition; enlarge the window or use flat mode to read details.

## Build and generate

Requires Node.js 18+ and npm. Initial dependency installation requires network access; generated pages work offline.

```sh
cd report-template/threejs
npm ci
npm run build
node validate.mjs example.json
node render.mjs example.json /tmp/harmony-three-preview.html
node --test test.mjs
```

Agents must produce strict JSON matching `report.schema.json` and validate before rendering. Actual reports need real timestamps, commits, environment, scope, levels, observations, evidence and limitations, with `mode: actual`. Rendering validates again and refuses overwrite. Name new reports `stage_report_YYYY-MM-DD_HH-mm.html`.

`scene.js` is maintained source; `scene.bundle.js` is the bundled browser runtime. `render.mjs` embeds it into the template to create standalone HTML. Never edit generated reports directly. The delivered bundle allows generation without installing development dependencies. Rebuild after source changes.

To avoid concurrent edits to the earlier template, this directory contains an independent template, generator, validator and contract snapshot. Agents using this version follow the commands above. Earlier files do not establish this version's implementation or verification status.

## Verification boundaries

JSON, generation, escaping and overwrite tests are available. Browser checks must verify WebGL canvas rendering, camera travel, last-chapter navigation and flat reading. Canvas attributes `data-renderer`, `data-revision`, `data-camera`, `data-triangles` and `data-frames` expose runtime evidence, not device acceptance. Documentation was retrieved through Context7 from the official Three.js repository `/mrdoob/three.js`; package-lock pins the installed version.
