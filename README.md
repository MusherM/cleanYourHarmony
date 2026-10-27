# cleanYourHarmony

中文：[README_zh.md](README_zh.md)

It's the AI era, my friend—why are you still reading a README? Copy this repository's URL and hand it to an agent. All you may need to do yourself is tap the build number repeatedly to enable developer mode, turn on USB debugging, then connect your phone to your computer and authorize the connection.

An evidence-backed catalog for reducing ads, feeds, marketing messages, and unsolicited recommendations on HarmonyOS phones while preserving normal information display and useful services.

## Current deliverables

- `operations.json`: 20 retained operations, UI Tree locator rules, target states, screenshot groups, optional app notifications, and exclusions.
- `dev/reachability/`: current path-verification report and persistent evidence.
- `dev/clean-settings/` and `dev/candidate-audit/`: dated historical findings. Their states are not current-device guarantees.
- `dev/report-template/`: the required JSON schema, validator, renderer, and HTML template.

The current delivery covers the operation catalog and agent execution/acceptance guidance. Compatibility is limited to the device and versions stated in each report. HarmonyOS 5/6 compatibility requires separate device verification.

## Recommended: run with an agent

Give this repository to an agent with access to a local terminal and the connected HarmonyOS phone. The computer needs the HarmonyOS SDK's `hdc`, working UI Tree inspection and GUI control tools, and Node.js 18+ for reports. Enable developer mode and USB debugging on the phone and authorize the computer. An agent limited to chat cannot execute the operations directly.

Start the agent in this repository and send:

```text
Read AGENTS.md, README.md, operations.json, and dev/report-template/README_zh.md first.
Execute operations with default_selected set to true on the currently connected HarmonyOS phone.
List optional operations without executing them until I select them. If multiple devices are connected, ask me to select one.
If no phone is detected or authorization is missing, walk me through the README connection steps for developer mode,
USB debugging, and computer authorization, then check again.
Prefer UI Tree locators and state inspection. Use vision only when necessary and distinguish that fallback in the report.
Mark already-satisfied operations as requiring no change. Mark missing targets, disabled controls,
or changes that fail verification as execution failures.
Keep the user experience improvement program in scope; report failure if it cannot be disabled.
Verify each state after the action and after reopening the page. Capture the pages and groups specified by screenshot.
Share one screenshot across operations visible on the same page and identify the covered operations.
Generate actual JSON and HTML reports under the repository's report contract, including per-operation results,
evidence, and uncovered scope. Historical records are references, not a substitute for verifying this device.
```

The repository supplies the catalog and acceptance rules; the agent performs the actions using device tools. Existing device records cover page and control reachability, not modification and reopening verification for every operation. Each operation still requires acceptance during execution.

### Execution rules

1. Discover the connected device and check its actual system/application versions. Use one device serially.
2. Read a fresh UI Tree after navigation. Scope locators to the current panel and the exact app. Prefer text, `originalText`, control type, and same-row relationships; derive coordinates from current bounds.
3. Read `checked` and `enabled`. Skip already-satisfied controls; report disabled or ambiguous controls instead of guessing or replaying toggles.
4. Modify only user-selected settings. Verify the state after the action and after reopening the page, then capture the designated evidence group.
5. Report each result separately. A reachable page does not prove that a setting was changed or that future promotions have stopped.

Screenshots are evidence; saving them does not require a vision model. Use visual reasoning only when the tree cannot expose the required target/state, and explicitly record that fallback.

### When no phone is detected

The agent should first confirm that `hdc` is available, then inspect the connection result. Resolve missing or broken host tools first. If the device list is empty or authorization is missing, guide the user through these steps, wait for completion, and check again instead of skipping all operations:

1. Unlock the phone, connect it with a USB cable that supports data transfer, and keep the screen on.
2. Open Settings and search for “Software version”. Alternatively, open “About phone” or the entry named after the device and find “Software version” or “Software version number”. Tap it seven times quickly and follow the prompt to enable developer options. The user must enter any requested lock-screen credential themselves. If a restart is requested, confirm it, wait, and unlock the phone afterward.
3. Open Settings → System → Developer options (also called “Developer settings”; search Settings if necessary). Enable “USB debugging” and confirm the prompt on the phone.
4. Keep the phone unlocked. When a computer authorization prompt such as “Allow USB debugging” appears, verify the computer and tap Allow. Let the user decide whether to select “Always allow this computer”, if offered. If no prompt appears, reconnect the cable and check the phone again.
5. Enumerate devices again. Confirm that the device is online and a fresh UI Tree can be read before executing operations. If connection still fails, try another data cable, connect directly to a computer USB port, and inspect host tools or drivers. Distinguish an undetected device, missing authorization, and a tool failure.

Menu locations and restart behavior follow Huawei's official [developer options guidance](https://consumer.huawei.com/cn/support/content/zh-cn02842747/) and [USB debugging connection guidance](https://consumer.huawei.com/cn/support/content/zh-cn00698619/). Labels may vary by device. These are connection troubleshooting instructions, not a claim that this project has verified initial authorization on every device.

## Reports

Read `dev/report-template/README_zh.md`. Write actual records to the prescribed strict JSON, validate it, then render to a new output path. Keep raw temporary dumps/logs in `/tmp`; retain sanitized evidence needed to support the report.

Dependencies installed under `node_modules/` are ignored. The main report renderer uses Node.js 18+ without additional dependencies. Optional historical experiments retain their own installation instructions.
