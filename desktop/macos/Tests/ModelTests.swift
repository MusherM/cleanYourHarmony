import Foundation
import Testing
@testable import CleanYourHarmony

@Suite(.serialized) @MainActor struct ModelTests {
    func model() throws -> AppModel {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let catalog = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("operations.json"))) as! [String: Any]
        let model = AppModel()
        model.categories = try JSONDecoder().decode([CleanYourHarmony.Category].self, from: JSONSerialization.data(withJSONObject: catalog["categories"]!))
        model.items = (catalog["operations"] as! [[String: Any]]).map { operation in
            var value = operation
            value["name"] = operation["display_name"] ?? operation["name"]
            value["selected"] = true
            return SettingItem(value)
        }
        return model
    }

    @Test func completionWaitsForCleanupAndReportsOnlyThisRun() throws {
        let model = try model()
        var progress: [String: Any] = ["status": "incomplete", "selected": ["B01", "F01"], "items": ["B01": ["status": "pending"]], "dnd": ["restorePending": true]]
        model.showProgress(progress)
        #expect(!model.showCompletion)
        progress["finishedAt"] = "2026-10-30T00:00:00Z"
        model.showProgress(progress)
        #expect(!model.showCompletion)
        model.showProgress(progress, final: true)
        #expect(model.showCompletion)
        #expect(model.reportItems.count == 2)
        #expect(model.reportItems.allSatisfy { $0.result == "未完成" })
        #expect(model.reportSummary.contains("未完成 2"))
        #expect(model.dndMessage == "勿扰待恢复")
        #expect(model.outcome == "incomplete")
    }

    @Test func completionPresentationUsesVerifiedItemResults() throws {
        let model = try model()
        for (statuses, success, failed) in [
            (["passed", "failed"], true, false),
            (["unchanged", "not_found"], true, false),
            (["failed", "failed"], false, true),
            (["failed", "incomplete"], false, false),
            (["not_found", "not_found"], false, false)
        ] {
            model.showProgress(["status": "incomplete", "selected": ["B01", "B02"],
                "items": ["B01": ["status": statuses[0]], "B02": ["status": statuses[1]]]])
            #expect(model.reportHasSuccess == success)
            #expect(model.reportAllFailed == failed)
        }
        model.showProgress(["status": "incomplete", "selected": [], "items": [:]])
        #expect(!model.reportHasSuccess && !model.reportAllFailed)
    }

    @Test func selectionIsScopedAndPreservesCleanupDefaults() throws {
        let model = try model()
        #expect(model.items.count == 22)
        model.selectAll(false, categoryID: "browser")
        #expect(model.selectedCount == 19)
        #expect(model.items.first { $0.id == "B01" }!.target as? String == "simple")
        #expect(model.items.filter { $0.id != "B01" && $0.id != "C02" }.allSatisfy { $0.target as? Bool == false })
        #expect(model.items.first { $0.id == "C02" }!.target as? String == "星期一")
        let independent = model.items.filter { $0.category != "browser" }.allSatisfy { $0.selected }
        #expect(independent)
        model.selectAll(false)
        #expect(model.selectedCount == 0)
        model.selectAll(true, categoryID: "system")
        #expect(model.items.filter(\.selected).map(\.id) == ["P01"])
        model.selectAll(true)
        #expect(model.selectedCount == 22)
    }

    @Test func executionRequiresAuthorizedIdleDeviceAndSelection() throws {
        let model = try model()
        model.connected = true
        model.devices = [DeviceInfo(id: "fixture", status: "Connected", model: "TEST", software: "7", error: nil)]
        model.deviceID = "fixture"
        #expect(model.canExecute)
        model.working = true; #expect(!model.canExecute); model.working = false
        model.discovering = true; #expect(!model.canExecute); model.discovering = false
        model.selectAll(false); #expect(!model.canExecute); model.selectAll(true)
        model.recoverable = [["deviceId": "fixture", "restorePending": true]]
        #expect(!model.canExecute)
        model.recoverable = []; model.deviceID = "other"; #expect(!model.canExecute)
        model.deviceID = "fixture"
        model.devices = [DeviceInfo(id: "fixture", status: "Unauthorized", model: "TEST", software: "7", error: nil)]
        #expect(!model.canExecute)
    }

    @Test func progressDistinguishesBusinessOutcomesAndDnd() throws {
        let model = try model()
        model.showProgress([
            "status": "completed_with_failures", "selected": ["B01", "B02", "B03", "F01", "P01"],
            "items": ["B01": ["status": "passed"], "B02": ["status": "unchanged"], "B03": ["status": "failed", "error": "disabled"], "F01": ["status": "not_found"]],
            "dnd": ["restorePending": true]
        ])
        #expect(model.completed == 4 && model.total == 5)
        let results = Dictionary(uniqueKeysWithValues: model.items.map { ($0.id, $0.result) })
        #expect(results["B01"] == "已修改" && results["B02"] == "无需修改")
        #expect(results["B03"] == "失败" && results["F01"] == "未找到" && results["P01"] == "未完成")
        #expect(model.items.first { $0.id == "B03" }!.detail == "disabled")
        #expect(model.message == "执行结束，部分项目失败")
        #expect(model.dndMessage == "勿扰待恢复")
        model.showProgress(["status": "incomplete", "selected": [], "items": [:], "dnd": ["restored": ["checked": false]]])
        #expect(model.dndMessage == "勿扰已恢复原状态")
        #expect(model.message == "执行未完成")
    }
}
