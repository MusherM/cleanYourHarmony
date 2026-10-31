import AppKit
import CoreGraphics

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let config = NSWorkspace.OpenConfiguration()
config.createsNewApplicationInstance = true
var running: NSRunningApplication?
var failure: Error?
NSWorkspace.shared.openApplication(at: url, configuration: config) { app, error in
    running = app; failure = error
}
func wait(_ seconds: Double, _ check: () -> Bool) -> Bool {
    let until = Date().addingTimeInterval(seconds)
    while Date() < until {
        if check() { return true }
        RunLoop.current.run(until: Date().addingTimeInterval(0.1))
    }
    return false
}
guard wait(30, { running != nil || failure != nil }), let app = running else {
    fatalError("App launch failed: \(String(describing: failure))")
}
defer { if !app.isTerminated { app.forceTerminate() } }
guard wait(30, {
    let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    return windows.contains { window in
        guard window[kCGWindowOwnerPID as String] as? Int32 == app.processIdentifier,
              let bounds = window[kCGWindowBounds as String] as? [String: Any],
              let width = bounds["Width"] as? Double, let height = bounds["Height"] as? Double else { return false }
        return width >= 700 && height >= 400
    }
}) else { fatalError("Installed app did not show its native window") }
let pid = app.processIdentifier
guard !app.isTerminated, app.terminate(), wait(30, {
    // A command-line RunLoop can retain stale NSRunningApplication state after
    // terminateLater completes. Verify process disappearance independently.
    if app.isTerminated { return true }
    return kill(pid, 0) == -1 && errno == ESRCH
}) else {
    fatalError("Installed app did not close normally")
}
print("PASS: installed macOS app launched a native window and closed normally")
