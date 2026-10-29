#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
results="${CYH_TEST_RESULTS:-/tmp/cyh-macos-test-results}"
mkdir -p "$results"
rm -f "$results/native.xml"
export CYH_TEST_NODE="${CYH_TEST_NODE:-$(command -v node)}"
"$CYH_TEST_NODE" --test scripts/runner.test.mjs scripts/desktop.test.mjs 2>&1 | tee "$results/engine.log"
developer="$(xcode-select -p)"
flags=()
if [[ "$developer" == */CommandLineTools ]]; then
  # CLT exposes Testing as a framework, unlike the full Xcode toolchain.
  frameworks="$developer/Library/Developer/Frameworks"
  flags=(-Xswiftc -F -Xswiftc "$frameworks" -Xswiftc -Xfrontend -Xswiftc -disable-cross-import-overlays -Xswiftc -plugin-path -Xswiftc "$developer/usr/lib/swift/host/plugins/testing" -Xlinker "-F$frameworks" -Xlinker -rpath -Xlinker "$frameworks")
fi
swift test --package-path desktop/macos --scratch-path build/macos-tests --disable-xctest --enable-swift-testing --xunit-output "$results/native.xml" "${flags[@]}" 2>&1 | tee "$results/native.log"
