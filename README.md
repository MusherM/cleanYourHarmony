# cleanYourHarmonyOS

中文：[README_zh.md](README_zh.md)

An evidence-backed catalog for reducing ads, feeds, marketing messages, and unsolicited recommendations on HarmonyOS phones while preserving normal information display and useful services.

## Current deliverables

- `operations.json`: 20 retained operations, UI Tree locator rules, target states, screenshot groups, optional app notifications, and exclusions.
- `dev/reachability/`: current path-verification report and persistent evidence.
- `dev/clean-settings/` and `dev/candidate-audit/`: dated historical findings. Their states are not current-device guarantees.
- `dev/report-template/`: the required JSON schema, validator, renderer, and HTML template.

The current delivery covers the operation catalog and agent execution/acceptance guidance. Compatibility is limited to the device and versions stated in each report. HarmonyOS 5/6 compatibility requires separate device verification.

## Agent execution

1. Discover the connected device and check its actual system/application versions. Use one device serially.
2. Read a fresh UI Tree after navigation. Scope locators to the current panel and the exact app. Prefer text, `originalText`, control type, and same-row relationships; derive coordinates from current bounds.
3. Read `checked` and `enabled`. Skip already-satisfied controls; report disabled or ambiguous controls instead of guessing or replaying toggles.
4. Modify only user-selected settings. Verify the state after the action and after reopening the page, then capture the designated evidence group.
5. Report each result separately. A reachable page does not prove that a setting was changed or that future promotions have stopped.

Screenshots are evidence; saving them does not require a vision model. Use visual reasoning only when the tree cannot expose the required target/state, and explicitly record that fallback.

## Reports

Read `dev/report-template/README_zh.md`. Write actual records to the prescribed strict JSON, validate it, then render to a new output path. Keep raw temporary dumps/logs in `/tmp`; retain sanitized evidence needed to support the report.

Dependencies installed under `node_modules/` are ignored. The main report renderer uses Node.js 18+ without additional dependencies. Optional historical experiments retain their own installation instructions.
