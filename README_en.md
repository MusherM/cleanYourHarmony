# cleanYourHarmony

中文：[README.md](README.md)

A HarmonyOS settings utility with a native macOS interface (SwiftUI) and a native Windows project (WinUI 3), sharing a local deterministic executor. Normal operation requires no agent, model, or network.

## Desktop application

The sidebar displays the phone model and software version read through hdc, followed by four setting categories. All 20 settings appear in one continuous list with category subheadings; sidebar buttons scroll to the corresponding section. Each row has only an inclusion checkbox. Selected operations use the catalog cleanup defaults: Simple homepage and all other settings off. Unselected settings remain untouched; changing a checkbox does not immediately modify the phone.

All 20 operations are initially selected with the existing cleanup defaults. Selections survive category changes; unselected settings are untouched. Execute batches operations by actual page and shows live results. Stopping verifies mutations already made and restores Do Not Disturb (DND); interrupted runs can be resumed. Disabling notifications also affects ordinary notifications from those apps.

- Target platforms: macOS 13.5+ (arm64/x64), Windows 11 x64.
- A macOS arm64 development app has been built locally. Intel Mac and Windows installation/business acceptance remain unverified. Source projects and build scripts are not released installers.
- Bundled runtime: Node.js 24.22.2 (official macOS binaries require 13.5), hdc, USB libraries, and executor scripts. Windows uses self-contained .NET / Windows App SDK deployment.
- Enable USB debugging and authorize the computer on the phone. Users enter lock-screen credentials; the app does not change lock-screen configuration.
- Progress and screenshots: ~/Library/Application Support/cleanYourHarmony/runs on macOS; %LOCALAPPDATA%/cleanYourHarmony/runs on Windows. Evidence stays local.
- No automatic updates, telemetry, or cloud execution. There is no whole-device rollback: stopping keeps verified business changes and restores only DND changes made temporarily by this run.

### Build and package

Build hosts need Node.js 24+, the Swift toolchain on macOS, or .NET 8 SDK, Windows SDK, WinUI build tools, and Inno Setup 6 on Windows. End users do not need these development tools.

Obtain the target platform toolchains directory from an official OpenHarmony / HarmonyOS SDK. The Node download URL and SHA-256 are pinned in packaging/runtime-lock.json; archives are cached under build/downloads.

```sh
# macOS arm64; --hdc-dir may be omitted when the local SDK is installed
node packaging/prepare-runtime.mjs --platform darwin-arm64 --hdc-dir /path/to/toolchains
node packaging/build-macos.mjs --arch arm64 --dmg

# Intel Mac requires x64 hdc and USB libraries, not copied arm64 binaries
node packaging/prepare-runtime.mjs --platform darwin-x64 --hdc-dir /path/to/x64/toolchains
node packaging/build-macos.mjs --arch x64 --dmg

# Offline behavior tests; no phone operations
node --test scripts/runner.test.mjs scripts/desktop.test.mjs
```

On a Windows build host:

```powershell
node packaging/prepare-runtime.mjs --platform win32-x64 --hdc-dir C:\SDK\toolchains
pwsh -File packaging/build-windows.ps1
```

Outputs are under dist/macos-arm64, dist/macos-x64, or dist/windows-x64. build and dist are excluded from version control. Without release flags, these are development packages; the Mac app is ad-hoc signed, not a notarized public release.

Before public distribution, review the actual hdc binaries and dependencies, not just the hdc source license. prepare-runtime.mjs --hdc-manifest accepts a reviewed manifest containing platform, source, redistributionReviewed, and files (filename-to-SHA-256 mapping). Without it, tools are recorded as development-only and release mode refuses to proceed.

macOS release builds use --release with CYH_SIGN_IDENTITY and CYH_NOTARY_PROFILE (an existing keychain profile). The packager signs, notarizes, staples, and validates. Windows uses build-windows.ps1 -Release -CertificateThumbprint <existing certificate thumbprint>. Do not commit credentials. Windows optionally accepts -DriverDirectory with reviewed signed drivers; its manifest also needs hardwareIds and inf. The installer requests elevation only for matching connected hardware with driver problems. Without reviewed drivers, it does not replace system drivers; first-connection compatibility requires a clean Windows test.

Platform SDK tools and signing credentials are external release prerequisites, not repository assets. The repository alone cannot produce signed distribution packages without them.

### Automated tests

```sh
# macOS 14+ test host, Swift 6 toolchain, Node 24; requires a desktop session
bash desktop/tests/macos.sh
```

```powershell
# Windows 11 x64 test host, .NET 8 SDK, Node 24; requires a logged-in desktop session
powershell -File desktop/tests/windows.ps1
```

Both entry points cover shared executor behavior, native client protocol, and UI tests. Windows first automates a button in an independent WinUI window and saves a screenshot to verify the runner supports GUI automation, then tests the actual app. macOS uses Apple Swift Testing and accessibility actions on real SwiftUI controls to verify scrolling, group selection, default targets, editing locks, and stopping. Windows uses NUnit and FlaUI UIA3 against the published WinUI app. Protocol tests start the real Node host and verify concurrent requests, Chinese text, error responses, and graceful shutdown. UI execution tests use an isolated simulated device process and never operate a phone; they do not replace USB driver, installer, or physical-device acceptance.

Logs and JUnit/TRX results are saved in temporary directories. Missing dependencies, missing controls, and timeouts fail tests instead of being silently skipped. CI runs the same entry points on macOS and Windows and uploads results. On 2026-10-29, the single-checkbox interface passed 56 shared tests and 6 native tests on macOS arm64, with zero failures or skipped tests. See [Desktop checks](https://github.com/MusherM/cleanYourHarmony/actions/workflows/desktop-checks.yml) for ongoing results on both platforms and the job logs for exact runner environments. Passing CI does not establish Windows 11 installer, USB driver, or physical-device acceptance.

### Local protocol and compatibility

Native interfaces use JSON Lines over stdin/stdout to scripts/desktop-host.mjs. See [desktop/PROTOCOL.md](desktop/PROTOCOL.md). A worker executes device commands serially while the main thread handles cancellation; discovery never runs concurrently with execution.

The initial compatibility baseline is the existing HarmonyOS 7 semantic routes. Unknown overlays, changed routes, and disabled controls never trigger guessed coordinate clicks. Enabling settings may reveal additional confirmation screens; full bidirectional testing across devices is still pending. Legacy schemaVersion 1 runs cannot be resumed directly in the GUI; restore pending DND obligations using the original version before starting a new run.

<details>
<summary>What will it change?</summary>

[operations.json](operations.json) is the agent's checklist. In plain language, it covers:

- **A simpler browser**: switch to the simple homepage and turn off search rankings and trending search terms.
- **Fewer unsolicited recommendations on the leftmost home screen**: disable the listed Utilities, Services, Cards, and News modules and search recommendations, feature-introduction and activity-reminder notifications, and the Xiaohongshu curated-content subscription.
- **Fewer app interruptions**: disable system notifications for Browser, Themes, AppGallery, Game Center, Video, Music, and Reading by default, without a selection prompt. Disabling system notifications also affects those apps' ordinary notifications.
- **Leave the user experience improvement program**: attempt to disable it and report failure if the device does not allow the change.

It does not delete browsing history, cancel services, or change habits such as autoplay. Excluded practical services such as parking, calendars, travel, and deliveries are not targets. Settings already at the requested state are left alone, and each result gets evidence.

</details>

An evidence-backed catalog for reducing ads, feeds, marketing messages, and unsolicited recommendations on HarmonyOS phones while preserving normal information display and useful services.

## Current deliverables

- `scripts/run.mjs`: a fixed semantic-route executor for page batches, screenshots, progress, and Do Not Disturb restoration; the normal path makes no model calls.
- `operations.json`: 20 retained operations, UI Tree locator rules, target states, screenshot groups, app notifications, and exclusions.
- `dev/device-run/`: local execution progress and evidence, excluded from version control.

The new delivery includes native desktop source, the shared executor, and packaging entry points; platform acceptance is described above. Compatibility is limited to the device and versions stated in each report. HarmonyOS 5/6 compatibility requires separate device verification.

Device verification recorded on 2026-10-28: HOP-AL10, HarmonyOS 7.0.0.113, expanded display at 2584×1828. All 20 operations passed: 10 changed and verified after re-entry, and 10 confirmed already at target. Do Not Disturb was restored to its original off state. This record covers only that expanded state and version; the folded outer display and folding during execution were not tested.

A second device run on the same day at 14:15 re-checked the same device and version: all 20 targets were already at their goal state, so every item was recorded as confirmed without modification (0 switch changes), and Do Not Disturb was restored to its original off state. That run's evidence is in dev/device-run/evidence_2026-10-28T14-15-43.259-08-00_77176/.

Desktop GUI verification on 2026-10-29: VYG-AL00, HarmonyOS 7.0.0.109. Of the 20 default operations, 19 were already at target; P01 failed because its system control was disabled. Not-found and incomplete counts were both 0; DND was restored to off. Separate B01/B02 runs verified default homepage / rankings on, then simple homepage / rankings off, with actual changes and re-entry checks. Original targets and DND off were restored. SHA-256 checks passed for 34 evidence images across these three runs. This does not establish reverse-enable coverage for the other 18 operations. All 56 offline tests passed under Node.js 24.22.2.

## Optional: use an agent for CLI execution and exceptions

Give this repository to an agent that can operate your computer and connected phone. The agent checks the computer's tools and installs anything missing. You only need to connect the phone and follow prompts to enable developer options, USB debugging, and trust for the computer. Enter lock-screen credentials and handle device authorization or system permission prompts yourself. A chat-only agent without computer and device access cannot perform the work.

Start the agent in this repository and send:

```text
Read AGENTS.md, README_en.md, and operations.json first.
Execute operations with default_selected set to true on the currently connected HarmonyOS phone.
Run all 20 operations by default; there are no optional items or selection prompts. If multiple devices are connected, ask me to select one.
Check and reuse host tools. If hdc, UI Tree/GUI tooling, or Node.js 18+ is missing, automatically install
a suitable version from official sources and verify it; do not hand the installation task back to me.
Ask for help only with credentials, system permission prompts, phone authorization, or a specific environment restriction that blocks installation.
If no phone is detected or authorization is missing, walk me through the README connection steps for developer mode,
USB debugging, and computer authorization, then check again.
Prefer UI Tree locators and state inspection. Use vision only when necessary and distinguish that fallback in the report.
Mark already-satisfied operations as requiring no change. Mark notification apps without an exact search match as not found;
mark other unlocatable targets, disabled controls, or changes that fail verification as execution failures.
Keep the user experience improvement program in scope; report failure if it cannot be disabled.
Batch operations by actual page; verify, capture screenshots, and persist progress immediately after execution.
Share images across visible items. Re-enter only changed pages once locally; never repeat the entire run for verification or screenshots.
Record the original Do Not Disturb state, enable it temporarily, and restore it on completion or failure; record the outcome.
Report successful and failed operations and failure reasons directly in text. List not-found and incomplete operations separately,
and report Do Not Disturb restoration. Historical records are references, not a substitute for verifying this device.
```

The agent should run the repository script first and handle unknown pages, overlays, or changed controls as exceptions. Accept results from evidence collected on the current device, not historical records.

### Script entry point (for agents)

Prepare the tools, then use these commands. The default only prints a plan; only --execute operates the phone.

```sh
node scripts/run.mjs --plan
node scripts/run.mjs --execute
```

All 20 operations run without notification selection prompts. With multiple devices, use --device <current-device-id>; --hdc <executable-path> reuses an installed SDK. The script groups operations into 16 pages, navigates from the nearest parent, captures evidence immediately after changes, and re-enters changed pages once.

Consecutive reads on the same page reuse the current snapshot for up to 500 ms. Clicks, scrolling, app launches, screenshots, or expiry require a fresh tree. Adjacent notification settings reuse the search page while still checking each app name, foreground page, and control state. The normal route runs entirely in the script without per-step model decisions.

When expanded-screen Settings uses two panes, top-level entries are located and scrolled in the left navigation bar. Switching top-level pages reuses that visible sidebar to avoid exiting Settings with system Back. Detail pages are checked against the last title bar, which also supplies notification search. System multitasking handles outside app content are accepted; other windows overlapping content still block actions. Browser startup waits for recognizable content, target controls receive up to 20 seconds to load, and transient overlays receive a bounded wait to disappear. An exact match for the notice about merging pinned notifications into priority notifications is dismissed with one normal Back action. Other persistent permission or onboarding dialogs are handled by the agent.

Results go to dev/device-run/runs/<current-time>_<run-id>/, including progress.json, screenshots, and command timing. Completion requires evidence for all business items; Do Not Disturb preparation/restoration is recorded separately. A device lease prevents concurrent instances; other agents must not operate that device during the run.

On failure, inspect progress and existing evidence, diagnose and fix the cause, then run node scripts/run.mjs --execute --resume <original-evidence-directory>. Completed pages are not replayed. Device, version, or catalog changes reject resume. Resume continues the same task; it is not a fresh acceptance run using old evidence. After forced termination, first verify the process is gone and inspect /tmp/cyh-device-*.lock/owner.json before removing only its stale lease; never remove a live lease.

Notification apps may have been uninstalled. After verifying the search page, query and result container and waiting for results, an absent exact match is recorded as `not_found` with evidence and execution continues. This does not prove uninstallation or disabled notifications. Resume skips items already recorded as missing in this run. Final reports show “Not found” separately; missing items alone yield `completed_with_missing` and exit code 0, while actual business failures still yield 2. Overlays, loading, device-command errors and wrong pages remain execution failures.

The script follows ordinary UI routes and does not bypass disabled controls. Unknown or ambiguous pages fail without guessing old coordinates. Build reports from captured evidence without replaying the phone workflow.

### Execution rules

1. Check and reuse verified tooling first. If hdc, UI Tree/GUI capabilities, or Node.js 18+ is missing, the agent installs suitable versions for the host OS and architecture from official sources, then verifies that the tools run and can actually operate the device. Do not ask the user to find downloads or installation commands, or reinstall working tools. Explain specific credential, permission, or environment blockers when intervention is needed. Then discover the current device and check system/application versions; operate serially. Plan only selected operations, batch by app and actual page, and reuse the nearest common parent. Do not navigate from the home screen for every item. Run all 20 operations without notification selection prompts.
2. Use `path` and `locator` in `operations.json` as preset semantic routes. Cache reusable entries, selectors, page identifiers, and applicable versions, not old trees, node indices, or absolute coordinates. Refresh after initial arrival, navigation, scrolling, state-changing clicks, or overlays. A visible title does not mean its controls have loaded; wait until the target state can be read. Reuse the current tree while the page is unchanged and extract needed fields together instead of repeatedly launching commands against the same dump.
3. Verified navigation may run serially inside one tool call: fetch tree, match the current page and unique target, click, and check the next page. Return compact results and stop the route on failure. Reduce model round trips while retaining app, foreground panel, uniqueness, and state checks. Derive coordinates from current bounds. A matching search field is not a result row; a background sheet title is not the active page; launching an app does not establish its root page.
4. Read the target control's `checked` and `enabled` values and parse booleans explicitly (the string `"false"` is not true). If already satisfied, record no change and capture evidence immediately without mandatory re-entry. Capture evidence and report failure for disabled or ambiguous controls. Modify only selected items and refresh state after each change; never blindly replay a failed toggle.
5. Follow this order: process the current page, verify state, save screenshots, update progress, leave. Share one image across results visible together; capture before scrolling results out of view. Only pages with changes require one local re-entry from the nearest parent at the end of the page batch, followed by verification and evidence of those changes. Do not re-enter per control or run a second full pass for verification or screenshots.
6. `screenshot.group` groups evidence, not necessarily execution pages. Save F01/F02 child-page evidence immediately, then capture the G03 overview on the normal return to the parent settings page. Parent summaries do not replace child control checks. Resolve screenshot failures while still on the page; never toggle again to recreate a screenshot. Associate images only with actually visible items.
7. Before device actions, create `dev/<topic>/evidence_<Beijing time>/progress.json` recording this run's device/versions, authorized items, current page, per-item before/after states, relative screenshot paths, capture times, SHA-256 hashes, and re-entry status. Persist after each page instead of relying on chat memory. Confirm capture success, nonempty files, and freshness. Resume incomplete items from progress; across sessions, confirm the device and current state rather than treating history as fresh verification.
8. Read and record the original Do Not Disturb state before execution. Enable it temporarily only if originally off and verify; leave it on if already enabled. On completion, failure, or a catchable interruption, restore only changes made by this run and verify restoration. Forced termination cannot guarantee cleanup: keep a pending-restoration marker and handle it first on resume. Do not guess an unreadable original state; report enable/restore failures separately. Do not change schedules, exceptions, or notification permissions as a substitute. Do Not Disturb may not block every banner; detect keyboards, system dialogs, and in-app overlays separately.
9. Use bounded state waits and continue as soon as ready; avoid stacked fixed sleeps. Reuse verified tool capabilities, app entries, and parsers within the run. Validate new parsers offline against saved trees before more device actions.
10. Inspect existing output, current tree, and screenshots on failure; allow at most one targeted recovery after identifying the cause. If it still fails, record the item and continue independent work instead of restarting the route repeatedly. Check exit codes, business success markers, and expected pages separately. Use `set -o pipefail` for pipelines; do not let `head/tail` hide failures. Build the final report from saved evidence without replaying device workflows.

Saving screenshots does not require a vision model. Use visual reasoning only when the tree cannot expose the required target/state and record that fallback. The script executes fixed routes and hands unrecognized pages back to the agent. Results and elapsed time come from the current progress.json and evidence.

### When no phone is detected

The agent should first confirm that the device tools work, then inspect the connection result. Automatically install and verify missing tools, and diagnose and repair broken host tooling first. If the device list is empty or authorization is missing, guide the user through these steps, wait for completion, and check again instead of skipping all operations:

1. Unlock the phone, connect it with a USB cable that supports data transfer, and keep the screen on.
2. Open Settings and search for “Software version”. Alternatively, open “About phone” or the entry named after the device and find “Software version” or “Software version number”. Tap it seven times quickly and follow the prompt to enable developer options. The user must enter any requested lock-screen credential themselves. If a restart is requested, confirm it, wait, and unlock the phone afterward.
3. Open Settings → System → Developer options (also called “Developer settings”; search Settings if necessary). Enable “USB debugging” and confirm the prompt on the phone.
4. Keep the phone unlocked. When a computer authorization prompt such as “Allow USB debugging” appears, verify the computer and tap Allow. Let the user decide whether to select “Always allow this computer”, if offered. If no prompt appears, reconnect the cable and check the phone again.
5. Enumerate devices again. Confirm that the device is online and a fresh UI Tree can be read before executing operations. If connection still fails, try another data cable, connect directly to a computer USB port, and inspect host tools or drivers. Distinguish an undetected device, missing authorization, and a tool failure.

Menu locations and restart behavior follow Huawei's official [developer options guidance](https://consumer.huawei.com/cn/support/content/zh-cn02842747/) and [USB debugging connection guidance](https://consumer.huawei.com/cn/support/content/zh-cn00698619/). Labels may vary by device. These are connection troubleshooting instructions, not a claim that this project has verified initial authorization on every device.

## Reports

The agent reads the current `progress.json` and evidence and reports in conversation which operations succeeded (including those requiring no change), which failed and why. List not-found and incomplete operations separately, and report Do Not Disturb restoration. Report only what was actually verified; do not create JSON or HTML reports or replay device actions for reporting. Keep temporary raw dumps and logs in `/tmp`, and retain progress and screenshots in the run's evidence directory for resumption and inspection.
