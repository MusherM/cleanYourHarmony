# Shared execution core and extensions

main owns core/, operations.json, the CLI and shared tests. desktop-app merges main in one direction; never patch the core independently on the desktop branch. Run `node scripts/check-core.mjs --pin <main-commit>` there, then `node scripts/check-core.mjs`. Verification covers shared sources, catalog, tests and extension documentation. Packages retain the commit, file SHA-256 hashes and aggregate digest in core-source.json. This document defines the development contract; it is not device acceptance evidence.

## Interface and boundaries

Import readCatalog, validateCatalog, resolveSelection, publicCatalog, plan, discoverDevices, executeSession, discoverRuns, dataRoot and finalStatus from core/index.mjs. executeSession accepts request (deviceId and selection: [{id,target}]), hdc, root, resume, recoveryOnly, cancelled and emit. Tests and static extensions can inject catalog, registry, DeviceClass and NavigatorClass. It returns {directory,progress}. Progress is persisted before emitting a progress event. Diagnostic events carry level/message; the caller renders them. The core never writes stdout.

scripts/run.mjs remains the CLI entry point and executes all default selections. The GUI maps JSON Lines requests to the same core; its worker only schedules serial work and transports cancellation. Old scripts/ modules are compatibility exports, not business implementations.

## Adding an ordinary operation

1. Add a unique id, display_name, category, default_selected, page, control, locator and screenshot to operations.json. Copy existing metadata for that control type; preserve historical verification scope without inventing evidence.
2. page references a stable pages key. A page declares app, route (semantic entry array) and kind (standard or notification). Declare each application/route destination once; operations on one page share a category.
3. control.type supports toggle / choice, and default must occur in values. Toggle values are booleans; choice values are strings. Locators use Toggle / Radio and uniquely identify a control in the current tree. path is human-readable only; ID prefixes do not determine routing.
4. Same-page operations are batched automatically. Configure parent-page evidence in overviews using id, app, route and operations; returning to that page captures selected, verified operations only. dnd declares the separate do-not-disturb page.
5. Run `node scripts/run.mjs --plan` and `node --test scripts/runner.test.mjs scripts/session.test.mjs scripts/core.test.mjs`. Test-only extension operations never enter the production catalog.

## Adding an application or special page

apps declares bundle, ability, root and adapter. Ordinary hierarchical pages use standard. Add special behavior as a static core/adapters/ module and register it in index.mjs. Optional hooks use Navigator as this:

| Hook | Contract |
|---|---|
| root(app) | Special entry ending at the root; otherwise generic launch/back is used |
| ready(scope), normalizeRoot(scope) | Wait for launch content and normalize the root |
| isPage(scope,app,route) | Boolean, or undefined to use the generic title check |
| dismiss(tree,app) | Recognize a known informational popup dismissible by Back, at most once per wait |
| entryScope(scope,fromRoot) | Select the current semantic search/scroll area |
| step(app,route) | true if handled; otherwise generic navigation; common page verification follows |
| beforeParent(app,previous) | Return a verified view to avoid unnecessary Back, or nothing |
| afterBack(app,previous) | Handle transient menus/search after Back, before common verification |
| sibling(page) | Return a verified view for a sibling shortcut, or nothing |

Reuse common waits, cancellation, fresh trees, overlay checks and evidence. Never retain coordinates or bypass state verification. New adapters need sanitized tree fixtures, offline behavior tests and a device verification scope. Existing adapters were extracted from historical HarmonyOS 7 routes and do not claim support for every OS/application version.

## Recovery and compatibility

New runs use progress schemaVersion 3. Resume requires matching device, application versions, catalog and selection; pending do-not-disturb restoration first verifies device identity. Versions 1/2 cannot resume business operations. With a pending restoration, identity is verified, progress.before-core-v3.json is preserved, and only do-not-disturb is restored without changing schemaVersion. Unknown versions are rejected.

Use `node scripts/run.mjs --recover --resume <original-evidence-directory> --device <online-device-id>` for restoration only. Version 1 additionally checks its original device/application fingerprint because it lacks deviceId. Removed catalog operations do not block restoration. Restoration does not imply business completion.

## Acceptance levels

Report shared offline tests, GUI protocol/native tests, package/install/launch checks, and phone business acceptance separately. Never run CLI and GUI concurrently on one device. Do not replace running deployments. Device reports consume the current progress.json and on-site evidence only.
