#!/bin/bash
set -euo pipefail
arch="$1"
results="/tmp/cyh-package-results"
mkdir -p "$results"
work=$(mktemp -d "${TMPDIR:-/tmp}/cyh 安装验证.XXXXXX")
dmg="dist/macos-$arch/cleanYourHarmony-$arch.dmg"
mount="$work/mount"
cleanup() { if mount | grep -F "$mount" >/dev/null; then hdiutil detach "$mount"; fi; }
trap cleanup EXIT
hdiutil verify "$dmg"
hdiutil attach "$dmg" -readonly -nobrowse -mountpoint "$mount"
test -d "$mount/cleanYourHarmony.app"
test -L "$mount/Applications"
test "$(readlink "$mount/Applications")" = '/Applications'
test -d "$mount/Applications"
echo 'PASS: DMG contains the app and an Applications shortcut resolving to /Applications' | tee "$results/dmg-layout.log"
ditto "$mount/cleanYourHarmony.app" "$work/cleanYourHarmony.app"
hdiutil detach "$mount"
codesign --verify --deep --strict "$work/cleanYourHarmony.app"
node packaging/verify-package.mjs "$work/cleanYourHarmony.app/Contents/Resources" 2>&1 | tee "$results/runtime.log"
swift packaging/verify-macos-launch.swift "$work/cleanYourHarmony.app" 2>&1 | tee "$results/installed-ui.log"
shasum -a 256 "$dmg" | tee "$results/dmg.sha256"
