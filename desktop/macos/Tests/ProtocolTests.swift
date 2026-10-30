import Foundation
import Testing
@testable import CleanYourHarmony

@Suite(.serialized) @MainActor struct ProtocolTests {
    func waitFor(_ description: String, _ condition: () -> Bool) async throws {
        for _ in 0..<150 { if condition() { return }; try await Task.sleep(for: .milliseconds(100)) }
        Issue.record("Timed out: \(description)")
    }
    @Test func closingDuringStartupDoesNotLeaveExecutorRunning() async throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("cyh startup close \(UUID())")
        let runtime = temporary.appendingPathComponent("runtime")
        try FileManager.default.createDirectory(at: runtime, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: temporary) }
        let node = try #require(ProcessInfo.processInfo.environment["CYH_TEST_NODE"])
        for name in ["node", "hdc"] { try FileManager.default.createSymbolicLink(atPath: runtime.appendingPathComponent(name).path, withDestinationPath: node) }
        try FileManager.default.createSymbolicLink(at: temporary.appendingPathComponent("engine"), withDestinationURL: root)
        let model = AppModel(resources: temporary, dataDirectory: temporary.appendingPathComponent("data"))
        model.start()
        #expect(model.executorRunning && !model.connected)
        var closed = false
        model.termination = { closed = true }
        model.close()
        try await waitFor("startup shutdown", { closed })
        #expect(closed && !model.executorRunning && !model.connected)
    }

    @Test func nativeClientTalksToRealNodeHostAndClosesGracefully() async throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("cyh 协议 \(UUID())")
        let runtime = temporary.appendingPathComponent("runtime")
        try FileManager.default.createDirectory(at: runtime, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: temporary) }
        let node = try #require(ProcessInfo.processInfo.environment["CYH_TEST_NODE"], "Run desktop/tests/macos.sh")
        try FileManager.default.createSymbolicLink(atPath: runtime.appendingPathComponent("node").path, withDestinationPath: node)
        try FileManager.default.createSymbolicLink(atPath: runtime.appendingPathComponent("hdc").path, withDestinationPath: node)
        try FileManager.default.createSymbolicLink(at: temporary.appendingPathComponent("engine"), withDestinationURL: root)
        let model = AppModel(resources: temporary, dataDirectory: temporary.appendingPathComponent("data"))
        model.start()
        do {
            try await waitFor("catalog", { model.items.count == 20 })
            #expect(model.categories.map(\.name) == ["浏览器", "负一屏", "应用通知", "系统"])
            var responses = 0
            for _ in 0..<8 { model.send("catalog") { reply in
                #expect((reply["result"] as? [String: Any])?["operations"] is [[String: Any]])
                responses += 1
            } }
            try await waitFor("concurrent callbacks", { responses == 8 })
            var rejected = false
            model.send("plan", ["selection": []]) { reply in rejected = (reply["error"] as? String)?.contains("至少") == true }
            try await waitFor("empty selection error", { rejected })
            #expect(rejected)
        }
        var closed = false
        model.termination = { closed = true }
        model.close()
        try await waitFor("graceful shutdown", { closed })
        #expect(closed && !model.connected)
    }
}
