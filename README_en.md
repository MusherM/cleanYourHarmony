# cleanYourHarmony

中文：[README.md](README.md)

It's the AI era, my friend—why are you still reading a README? Copy this repository's URL and hand it to an agent. All you may need to do yourself is tap the build number repeatedly to enable developer mode, turn on USB debugging, then connect your phone to your computer and authorize the connection.

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
- `dev/`: locally generated reports and evidence, excluded from version control.
- `report-template/`: the required JSON schema, validator, renderer, and HTML template.

The current delivery covers the operation catalog and agent execution/acceptance guidance. Compatibility is limited to the device and versions stated in each report. HarmonyOS 5/6 compatibility requires separate device verification.

## Recommended: run with an agent

Give this repository to an agent that can operate your computer and connected phone. The agent checks the computer's tools and installs anything missing. You only need to connect the phone and follow prompts to enable developer options, USB debugging, and trust for the computer. Enter lock-screen credentials and handle device authorization or system permission prompts yourself. A chat-only agent without computer and device access cannot perform the work.

Start the agent in this repository and send:

```text
Read AGENTS.md, README_en.md, operations.json, and report-template/README_zh.md first.
Execute operations with default_selected set to true on the currently connected HarmonyOS phone.
Run all 20 operations by default; there are no optional items or selection prompts. If multiple devices are connected, ask me to select one.
Check and reuse host tools. If hdc, UI Tree/GUI tooling, or Node.js 18+ is missing, automatically install
a suitable version from official sources and verify it; do not hand the installation task back to me.
Ask for help only with credentials, system permission prompts, phone authorization, or a specific environment restriction that blocks installation.
If no phone is detected or authorization is missing, walk me through the README connection steps for developer mode,
USB debugging, and computer authorization, then check again.
Prefer UI Tree locators and state inspection. Use vision only when necessary and distinguish that fallback in the report.
Mark already-satisfied operations as requiring no change. Mark missing targets, disabled controls,
or changes that fail verification as execution failures.
Keep the user experience improvement program in scope; report failure if it cannot be disabled.
Batch operations by actual page; verify, capture screenshots, and persist progress immediately after execution.
Share images across visible items. Re-enter only changed pages once locally; never repeat the entire run for verification or screenshots.
Record the original Do Not Disturb state, enable it temporarily, and restore it on completion or failure; record the outcome.
Generate actual JSON and HTML reports under the repository's report contract, including per-operation results,
evidence, and uncovered scope. Historical records are references, not a substitute for verifying this device.
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

Results go to dev/device-run/evidence_<current-time>/, including progress.json, screenshots, and command timing. Completion requires evidence for all business items; Do Not Disturb preparation/restoration is recorded separately. A device lease prevents concurrent instances; other agents must not operate that device during the run.

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

Read `report-template/README_zh.md`. Write actual records to the prescribed strict JSON, validate it, then render to a new output path. Keep raw temporary dumps/logs in `/tmp`; retain sanitized evidence needed to support the report.

The agent generates reports from evidence captured during execution. Optional historical experiments retain their own instructions and are outside the default device workflow.
