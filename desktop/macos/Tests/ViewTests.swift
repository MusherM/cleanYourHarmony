import AppKit
import SwiftUI
import Testing
@testable import CleanYourHarmony

// Operates the real SwiftUI view through native accessibility actions and its
// NSScrollView. No phone or HDC is used by this UI-only suite.
@Suite(.serialized) @MainActor struct ViewTests {
    struct Accessible {
        let node: NSObject
        func object(_ selector: String) -> Any? {
            let action = NSSelectorFromString(selector)
            guard node.responds(to: action) else { return nil }
            return node.perform(action)?.takeUnretainedValue()
        }
        func boolean(_ selector: String) -> Bool {
            let action = NSSelectorFromString(selector)
            guard node.responds(to: action), let implementation = node.method(for: action) else { return false }
            typealias Getter = @convention(c) (AnyObject, Selector) -> Bool
            return unsafeBitCast(implementation, to: Getter.self)(node, action)
        }
        var children: [Any] { object("accessibilityChildren") as? [Any] ?? [] }
        func accessibilityIdentifier() -> String? { object("accessibilityIdentifier") as? String }
        func isAccessibilityEnabled() -> Bool { boolean("isAccessibilityEnabled") }
        func accessibilityPerformPress() -> Bool { boolean("accessibilityPerformPress") }
    }
    func settle() async throws { try await Task.sleep(for: .milliseconds(250)) }
    func waitForScroll(_ scroll: NSScrollView, matching condition: (CGFloat) -> Bool) async throws {
        var previous = scroll.contentView.bounds.origin.y
        var stableSamples = 0
        try await ProtocolTests().waitFor("scroll animation reached a stable destination", {
            let position = scroll.contentView.bounds.origin.y
            stableSamples = condition(position) && abs(position - previous) < 0.1 ? stableSamples + 1 : 0
            previous = position
            return stableSamples >= 3
        })
    }

    func elements(_ root: Any) -> [Accessible] {
        guard let node = root as? NSObject else { return [] }
        return [Accessible(node: node)] + Accessible(node: node).children.flatMap { elements($0) }
    }
    func element(_ id: String, in window: NSWindow) throws -> Accessible {
        try #require(elements(window).first { $0.accessibilityIdentifier() == id }, "Missing accessible control: \(id)")
    }
    func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
    func host(_ model: AppModel) -> NSWindow {
        _ = NSApplication.shared
        NSApp.setActivationPolicy(.regular)
        NSApp.accessibilitySetValue(true, forAttribute: NSAccessibility.Attribute(rawValue: "AXEnhancedUserInterface"))
        let window = NSWindow(contentRect: NSRect(x: 60, y: 60, width: 1120, height: 820), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = NSHostingView(rootView: MainView(model: model))
        window.makeKeyAndOrderFront(nil)
        return window
    }

    @Test func uiExecutesDefaultTargetsReportsFailureAndStopsAfterCleanup() async throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("cyh UI \(UUID())")
        let runtime = temporary.appendingPathComponent("runtime"), engine = temporary.appendingPathComponent("engine")
        let fm = FileManager.default
        try fm.createDirectory(at: runtime, withIntermediateDirectories: true)
        try fm.createDirectory(at: engine, withIntermediateDirectories: true)
        try fm.copyItem(at: root.appendingPathComponent("scripts"), to: engine.appendingPathComponent("scripts"))
        try fm.copyItem(at: root.appendingPathComponent("operations.json"), to: engine.appendingPathComponent("operations.json"))
        try fm.removeItem(at: engine.appendingPathComponent("scripts/desktop-host.mjs"))
        try fm.copyItem(at: root.appendingPathComponent("desktop/tests/ui-host-fixture.mjs"), to: engine.appendingPathComponent("scripts/desktop-host.mjs"))
        let node = try #require(ProcessInfo.processInfo.environment["CYH_TEST_NODE"])
        for name in ["node", "hdc"] { try fm.createSymbolicLink(atPath: runtime.appendingPathComponent(name).path, withDestinationPath: node) }
        let data = temporary.appendingPathComponent("data")
        let model = AppModel(resources: temporary, dataDirectory: data), window = host(model)
        defer { window.close(); model.close() }
        try await ProtocolTests().waitFor("fixture ready", { model.canExecute })
        try await settle()
        #expect(try element("clear-all", in: window).accessibilityPerformPress())
        #expect(try element("select-group-browser", in: window).accessibilityPerformPress())
        try await settle()
        #expect(!elements(window).contains { ($0.accessibilityIdentifier() ?? "").hasPrefix("target-") })
        #expect(try element("execute", in: window).accessibilityPerformPress())
        try await settle()
        #expect(model.working)
        #expect(try !element("select-B02", in: window).isAccessibilityEnabled())
        try await ProtocolTests().waitFor("partial result", { !model.working })
        #expect(model.message == "执行结束，部分项目失败")
        #expect(model.dndMessage == "勿扰已恢复原状态")
        let request = try JSONSerialization.jsonObject(with: Data(contentsOf: data.appendingPathComponent("ui-request.json"))) as! [String: Any]
        let selected = request["selection"] as! [[String: Any]]
        #expect(selected.compactMap { $0["id"] as? String } == model.items.filter(\.selected).map(\.id))
        #expect(selected.first { $0["id"] as? String == "B01" }!["target"] as? String == "simple")
        #expect(selected.first { $0["id"] as? String == "B02" }!["target"] as? Bool == false)
        #expect(selected.first { $0["id"] as? String == "B03" }!["target"] as? Bool == false)
        #expect(model.showCompletion)
        try await settle()
        if let view = window.contentView, let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) {
            view.cacheDisplay(in: view.bounds, to: bitmap)
            try bitmap.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: "/tmp/cyh-completion-page.png"))
        }
        try await ProtocolTests().waitFor("completion report", {
            elements(window).contains { $0.accessibilityIdentifier() == "back-to-settings" && $0.isAccessibilityEnabled() }
        })
        #expect(try element("back-to-settings", in: window).accessibilityPerformPress())
        // The model completes before SwiftUI has necessarily rendered its next frame.
        try await ProtocolTests().waitFor("execute button after completion", {
            elements(window).contains { $0.accessibilityIdentifier() == "execute" && $0.isAccessibilityEnabled() }
        })
        #expect(try element("execute", in: window).accessibilityPerformPress())
        try await settle()
        #expect(try element("stop", in: window).accessibilityPerformPress())
        try await ProtocolTests().waitFor("cancel cleanup", { !model.working })
        #expect(model.message == "执行未完成")
        #expect(model.dndMessage == "勿扰已恢复原状态")
        // Closing during an active run must request shutdown and still receive cleanup results.
        model.execute()
        #expect(model.working)
        var closed = false; model.termination = { closed = true }; model.close()
        try await ProtocolTests().waitFor("fixture shutdown after active run cleanup", { closed })
        #expect(model.message == "执行器已退出；重新打开应用可检查未完成任务。")
        #expect(model.dndMessage == "勿扰已恢复原状态")
        #expect(!model.executorRunning)
        try fm.removeItem(at: temporary)
    }

    @Test func continuousListNavigationAndSelection() async throws {
        let model = try ModelTests().model(), window = host(model)
        defer { window.close() }
        try await settle()
        let scroll = try #require(descendants(window.contentView!).compactMap { $0 as? NSScrollView }.first { $0.documentView!.frame.height > $0.contentView.bounds.height })
        #expect(model.items.count == 20)
        let checkboxes = elements(window).filter { ($0.accessibilityIdentifier() ?? "").hasPrefix("select-") && !($0.accessibilityIdentifier() ?? "").hasPrefix("select-group-") && $0.accessibilityIdentifier() != "select-all" }
        #expect(checkboxes.count == 20)
        let initial = scroll.contentView.bounds.origin.y
        #expect(try element("nav-system", in: window).accessibilityPerformPress())
        try await waitForScroll(scroll) { $0 > initial + 500 }
        #expect(scroll.contentView.bounds.origin.y > initial + 500)
        #expect(try element("select-P01", in: window).accessibilityPerformPress())
        #expect(!model.items.first { $0.id == "P01" }!.selected)
        #expect(try element("nav-browser", in: window).accessibilityPerformPress())
        try await waitForScroll(scroll) { abs($0 - initial) < 4 }
        #expect(abs(scroll.contentView.bounds.origin.y - initial) < 4)
        #expect(!model.items.first { $0.id == "P01" }!.selected)

        // Scroll from the first section to the last without switching categories.
        let wheel = try #require(CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: -2000, wheel2: 0, wheel3: 0))
        scroll.scrollWheel(with: try #require(NSEvent(cgEvent: wheel)))
        try await waitForScroll(scroll) { $0 > 500 }
        #expect(scroll.contentView.bounds.origin.y > 500)
        #expect(elements(window).contains { $0.accessibilityIdentifier() == "select-B01" })
        #expect(elements(window).contains { $0.accessibilityIdentifier() == "select-P01" })
        // Pressing the already selected category must still navigate.
        #expect(try element("nav-browser", in: window).accessibilityPerformPress())
        try await waitForScroll(scroll) { abs($0 - initial) < 4 }
        #expect(abs(scroll.contentView.bounds.origin.y - initial) < 4)

        #expect(try element("clear-group-browser", in: window).accessibilityPerformPress())
        try await settle()
        #expect(model.selectedCount == 16)
        #expect(try element("clear-all", in: window).accessibilityPerformPress())
        try await settle()
        #expect(model.selectedCount == 0)
        #expect(try !element("execute", in: window).isAccessibilityEnabled())
        #expect(try element("select-all", in: window).accessibilityPerformPress())
        try await settle()
        #expect(model.selectedCount == 20)

        model.working = true
        try await settle()
        #expect(try !element("select-B01", in: window).isAccessibilityEnabled())
        #expect(try !element("clear-all", in: window).isAccessibilityEnabled())
        #expect(try element("stop", in: window).isAccessibilityEnabled())
    }
}
