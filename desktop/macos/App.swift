import SwiftUI
import Foundation
import AppKit

struct Category: Decodable, Identifiable { let id: String; let name: String; let icon: String }
struct DeviceInfo: Identifiable {
    let id: String; let status: String; let model: String; let software: String; let error: String?
    var title: String { model.isEmpty ? "设备 \(id.suffix(6))" : model }
    var ready: Bool { status == "Connected" && error == nil && !model.isEmpty }
}
final class SettingItem: ObservableObject, Identifiable {
    let id: String; let name: String; let category: String; let target: Any
    @Published var selected: Bool
    @Published var result = ""; @Published var detail = ""; @Published var evidence: [String] = []
    init(_ value: [String: Any]) {
        id = value["id"] as! String; name = value["name"] as! String; category = value["category"] as! String
        let control = value["control"] as! [String: Any]
        selected = value["selected"] as? Bool ?? true
        target = control["default"]!
    }
}

final class AppModel: ObservableObject {
    @Published var categories: [Category] = []
    @Published var items: [SettingItem] = []
    @Published var devices: [DeviceInfo] = []
    @Published var deviceID = ""
    @Published var category = "browser"
    @Published var working = false
    @Published var discovering = false
    @Published var stopping = false
    @Published var connected = false
    @Published var message = "正在准备设备工具…"
    @Published var dndMessage = ""
    @Published var completed = 0
    @Published var total = 0
    @Published var directory = ""
    @Published var showCompletion = false
    @Published var outcome = ""
    @Published var reportIDs: [String] = []
    @Published var reportMessage = ""
    var reportItems: [SettingItem] { items.filter { reportIDs.contains($0.id) } }
    var reportHasSuccess: Bool { reportItems.contains { ["已修改", "无需修改"].contains($0.result) } }
    var reportAllFailed: Bool { !reportItems.isEmpty && reportItems.allSatisfy { $0.result == "失败" } }
    var reportSummary: String { ["已修改", "无需修改", "失败", "未找到", "未完成"].map { label in "\(label) \(reportItems.filter { $0.result == label }.count)" }.joined(separator: " · ") }
    @Published var recoverable: [[String: Any]] = []
    private var process: Process?
    private var input: FileHandle?
    private var callbacks: [String: ([String: Any]) -> Void] = [:]
    private var timer: Timer?
    private var hasRunOutcome = false
    private var buffer = Data()
    private let readQueue = DispatchQueue(label: "cyh.protocol")
    var termination: (() -> Void)?
    var device: DeviceInfo? { devices.first { $0.id == deviceID } }
    var selectedCount: Int { items.filter(\.selected).count }
    var pending: [String: Any]? { recoverable.first { $0["deviceId"] as? String == deviceID && $0["restorePending"] as? Bool == true } ?? recoverable.first { $0["deviceId"] as? String == deviceID } }
    var canExecute: Bool { connected && device?.ready == true && selectedCount > 0 && !working && !discovering && !(pending?["restorePending"] as? Bool ?? false) }
    let dataDirectory: URL
    private let resources: URL
    init(resources: URL = Bundle.main.resourceURL!, dataDirectory: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("cleanYourHarmony")) {
        self.resources = resources; self.dataDirectory = dataDirectory
    }

    func start() {
        guard process == nil else { return }
        let node = resources.appendingPathComponent("runtime/node")
        let hdc = resources.appendingPathComponent("runtime/hdc")
        let host = resources.appendingPathComponent("engine/scripts/desktop-host.mjs")
        guard [node, hdc, host].allSatisfy({ FileManager.default.fileExists(atPath: $0.path) }) else { message = "应用工具包不完整，请重新安装完整应用。"; return }
        do {
            try FileManager.default.createDirectory(at: dataDirectory, withIntermediateDirectories: true)
            let log = dataDirectory.appendingPathComponent("desktop.log")
            if !FileManager.default.fileExists(atPath: log.path) { FileManager.default.createFile(atPath: log.path, contents: nil) }
            let errorLog = try FileHandle(forWritingTo: log); try errorLog.seekToEnd()
            let task = Process(), stdin = Pipe(), stdout = Pipe()
            task.executableURL = node
            task.arguments = [host.path, "--hdc", hdc.path, "--data-dir", dataDirectory.path]
            task.currentDirectoryURL = resources
            task.standardInput = stdin; task.standardOutput = stdout; task.standardError = errorLog
            var environment = ProcessInfo.processInfo.environment
            environment.removeValue(forKey: "NODE_OPTIONS"); environment.removeValue(forKey: "NODE_PATH")
            task.environment = environment
            input = stdin.fileHandleForWriting
            stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let data = handle.availableData
                if data.isEmpty { handle.readabilityHandler = nil; return }
                self?.readQueue.async { [weak self] in
                    guard let self = self else { return }; self.buffer.append(data)
                    while let end = self.buffer.firstIndex(of: 10) {
                        let line = self.buffer.prefix(upTo: end); self.buffer.removeSubrange(...end)
                        if let object = try? JSONSerialization.jsonObject(with: line) as? [String: Any] {
                            DispatchQueue.main.async { self.receive(object) }
                        }
                    }
                }
            }
            task.terminationHandler = { [weak self] _ in DispatchQueue.main.async {
                guard let self = self else { return }
                self.connected = false; self.working = false; self.discovering = false
                self.message = "执行器已退出；重新打开应用可检查未完成任务。"
                self.timer?.invalidate(); self.termination?()
            } }
            try task.run(); process = task
            timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.refresh() }
        } catch { message = "工具启动失败：\(error.localizedDescription)" }
    }
    func send(_ method: String, _ params: [String: Any] = [:], callback: (([String: Any]) -> Void)? = nil) {
        guard let input = input, process?.isRunning == true else { return }
        let id = UUID().uuidString
        if let callback = callback { callbacks[id] = callback }
        do {
            var data = try JSONSerialization.data(withJSONObject: ["id": id, "method": method, "params": params]); data.append(10)
            try input.write(contentsOf: data)
        } catch { message = "执行器通信失败：\(error.localizedDescription)"; callbacks.removeValue(forKey: id) }
    }
    func receive(_ object: [String: Any]) {
        if let id = object["id"] as? String { callbacks.removeValue(forKey: id)?(object); return }
        switch object["event"] as? String {
        case "ready":
            connected = true; recoverable = object["recoverable"] as? [[String: Any]] ?? []
            send("catalog") { [weak self] reply in
                guard let self = self, let result = reply["result"] as? [String: Any] else { return }
                self.items = (result["operations"] as? [[String: Any]] ?? []).map(SettingItem.init)
                if let data = try? JSONSerialization.data(withJSONObject: result["categories"] ?? []), let cats = try? JSONDecoder().decode([Category].self, from: data) { self.categories = cats }
                self.refresh()
            }
        case "progress":
            directory = object["directory"] as? String ?? directory
            if let progress = object["progress"] as? [String: Any] { showProgress(progress) }
        case "idle":
            working = false; discovering = false; stopping = false
            recoverable = object["recoverable"] as? [[String: Any]] ?? []
            if termination != nil { send("shutdown") }
        default: break
        }
    }
    func refresh() {
        guard connected && !working && !discovering && termination == nil else { return }
        discovering = true
        send("devices") { [weak self] reply in
            guard let self = self else { return }
            if let error = reply["error"] as? String { self.devices = []; self.discovering = false; self.message = error; return }
            self.devices = (reply["result"] as? [[String: Any]] ?? []).map { d in DeviceInfo(id: d["id"] as? String ?? "", status: d["status"] as? String ?? "Unknown", model: d["model"] as? String ?? "", software: d["software"] as? String ?? "", error: d["error"] as? String) }
            if !self.devices.contains(where: { $0.id == self.deviceID }) { self.deviceID = self.devices.count == 1 ? self.devices[0].id : "" }
            if self.devices.isEmpty { self.message = "未检测到手机" }
            else if self.deviceID.isEmpty { self.message = "请选择要操作的手机" }
            else if self.device?.status == "Unauthorized" { self.message = "请在手机上允许 USB 调试" }
            else if let error = self.device?.error { self.message = error }
            else if !self.hasRunOutcome { self.message = self.device?.ready == true ? "已连接" : "设备未就绪" }
        }
    }
    func selectAll(_ selected: Bool, categoryID: String? = nil) {
        for item in items where categoryID == nil || item.category == categoryID { item.selected = selected }
        objectWillChange.send()
    }
    func execute() {
        guard canExecute else { return }
        let selection = items.filter(\.selected).map { ["id": $0.id, "target": $0.target] as [String: Any] }
        startRun("execute", ["request": ["deviceId": deviceID, "selection": selection]])
    }
    func resume(_ recoveryOnly: Bool = false) {
        guard let run = pending, let directory = run["directory"] as? String, !working, !discovering, device?.ready == true else { return }
        startRun(recoveryOnly ? "recover" : "resume", ["directory": directory, "deviceId": deviceID])
    }
    private func startRun(_ method: String, _ params: [String: Any]) {
        hasRunOutcome = true
        showCompletion = false; outcome = ""; reportIDs = []
        working = true; stopping = false; directory = ""; completed = 0; total = 0; dndMessage = ""; message = "正在检查设备…"
        for item in items { item.result = ""; item.detail = ""; item.evidence = [] }
        send(method, params) { [weak self] reply in
            guard let self = self else { return }
            if let error = reply["error"] as? String { self.message = error; self.working = false; return }
            if let result = reply["result"] as? [String: Any], let progress = result["progress"] as? [String: Any] { self.directory = result["directory"] as? String ?? ""; self.showProgress(progress, final: true) }
        }
    }
    func stop() { stopping = true; message = "正在停止并恢复勿扰…"; send("cancel") }
    func close() { timer?.invalidate(); if working || discovering { stop() } else { send("shutdown") } }
    func showProgress(_ progress: [String: Any], final: Bool = false) {
        let records = progress["items"] as? [String: [String: Any]] ?? [:]
        let selected = progress["selected"] as? [String] ?? []
        reportIDs = selected
        total = selected.count; completed = records.values.filter { ["passed","unchanged","failed","not_found"].contains($0["status"] as? String ?? "") }.count
        let labels = ["passed":"已修改", "unchanged":"无需修改", "failed":"失败", "not_found":"未找到", "pending":"执行中", "incomplete":"未完成"]
        for item in items {
            let record = records[item.id]
            item.result = record.flatMap { labels[$0["status"] as? String ?? ""] } ?? (selected.contains(item.id) ? "未完成" : "")
            item.detail = record?["error"] as? String ?? record?["reason"] as? String ?? ""
            item.evidence = (record?["evidence"] as? [[String: Any]] ?? []).compactMap { $0["path"] as? String }
        }
        let status = progress["status"] as? String ?? ""
        outcome = status
        if status == "running" {
            let name = items.first { $0.id == progress["currentItem"] as? String }?.name
            message = stopping ? "正在停止并恢复勿扰…" : name.map { "正在处理：\($0)" } ?? "正在准备执行…"
        } else {
            message = ["completed":"全部所选项目已验证", "completed_with_missing":"执行结束，部分应用未找到", "completed_with_failures":"执行结束，部分项目失败", "incomplete":"执行未完成"][status] ?? status
            if let reason = progress["stopReason"] as? String { message += "：" + reason }
        }
        if let dnd = progress["dnd"] as? [String: Any] {
            if dnd["restorePending"] as? Bool == true { dndMessage = "勿扰待恢复" }
            else if let error = dnd["enableError"] as? String { dndMessage = "勿扰准备失败：" + error }
            else if dnd["restored"] != nil { dndMessage = "勿扰已恢复原状态" }
            else if dnd["original"] as? Bool == true { dndMessage = "勿扰原已开启，保持开启" }
            else { dndMessage = "勿扰已临时开启" }
        }
        if final, status != "running", progress["finishedAt"] != nil {
            for item in reportItems where item.result == "执行中" { item.result = "未完成" }
            reportMessage = message
            showCompletion = true
        }
    }
    func openEvidence(_ name: String) {
        let root = URL(fileURLWithPath: directory).standardizedFileURL
        let file = root.appendingPathComponent(name).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/") else { return }
        NSWorkspace.shared.open(file)
    }
}

struct ResultIcon: View {
    let result: String
    private var symbol: String {
        switch result {
        case "已修改", "无需修改": return "checkmark.circle.fill"
        case "失败": return "xmark.circle.fill"
        case "未找到": return "questionmark.circle.fill"
        case "执行中": return "hourglass.circle"
        default: return "clock"
        }
    }
    private var color: Color {
        switch result {
        case "已修改", "无需修改": return .green
        case "失败": return .red
        case "未找到": return .orange
        default: return .secondary
        }
    }
    var body: some View {
        Image(systemName: symbol).font(.system(size: 19)).foregroundStyle(color)
            .help(result).accessibilityLabel(result).accessibilityIdentifier("result-\(result)")
    }
}
struct SettingRow: View {
    @ObservedObject var item: SettingItem
    @ObservedObject var model: AppModel
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 20) {
                Toggle("执行 \(item.name)", isOn: $item.selected).labelsHidden().toggleStyle(.checkbox).frame(width: 44)
                    .accessibilityIdentifier("select-\(item.id)").disabled(model.working)
                    .onChange(of: item.selected) { _ in model.objectWillChange.send() }
                Text(item.name).font(.system(size: 16)).frame(maxWidth: .infinity, alignment: .leading)
                if !item.result.isEmpty { ResultIcon(result: item.result) }
            }
            if !item.detail.isEmpty { Text(item.detail).font(.callout).foregroundStyle(.secondary).padding(.leading, 64).textSelection(.enabled) }
        }.padding(.horizontal, 20).padding(.vertical, 17)
    }
}
struct CompletionView: View {
    @ObservedObject var model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    private var success: Bool { model.reportHasSuccess }
    var body: some View {
        VStack(spacing: 20) {
            VStack(spacing: 16) {
                Image(systemName: success ? "checkmark.circle.fill" : model.reportAllFailed ? "xmark.circle.fill" : "minus.circle")
                    .font(.system(size: 72)).foregroundStyle(success ? Color.green : model.reportAllFailed ? Color.red : Color.secondary)
                    .scaleEffect(appeared ? 1 : 0.65).opacity(appeared ? 1 : 0)
                Text(success ? "执行完成" : model.reportAllFailed ? "执行失败" : "执行已结束").font(.system(size: 30, weight: .bold)).accessibilityIdentifier("completion-page")
                Text(model.reportMessage).foregroundStyle(.secondary).textSelection(.enabled)
                Text(model.reportSummary).font(.callout)
                Text(model.dndMessage.isEmpty ? "勿扰状态未确认" : model.dndMessage).font(.callout)
            }.frame(maxWidth: .infinity).padding(.top, 28)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("执行报告").font(.title2.bold()).padding(.bottom, 16)
                    ForEach(model.reportItems) { item in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(item.name)
                                Spacer()
                                Text(item.result).foregroundStyle(["失败", "未找到", "未完成"].contains(item.result) ? Color.orange : Color.secondary)
                                if let evidence = item.evidence.last { Button("查看证据") { model.openEvidence(evidence) } }
                            }
                            if !item.detail.isEmpty { Text(item.detail).font(.callout).foregroundStyle(.secondary).textSelection(.enabled) }
                        }.padding(.vertical, 12)
                        Divider()
                    }
                }.padding(24)
            }.background(Color.secondary.opacity(0.05), in: RoundedRectangle(cornerRadius: 12))
            Button("返回设置") { model.showCompletion = false }.accessibilityIdentifier("back-to-settings").controlSize(.large).disabled(model.working)
        }.padding(32)
            .onAppear { withAnimation(reduceMotion ? nil : .spring(response: 0.55, dampingFraction: 0.65)) { appeared = true } }
    }
}
struct MainView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        if model.showCompletion {
            CompletionView(model: model).frame(minWidth: 960, minHeight: 700).frame(maxWidth: .infinity, maxHeight: .infinity).background(Color(nsColor: .windowBackgroundColor))
        } else {
        ScrollViewReader { scroll in
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 24) {
                Text("cleanYourHarmony").font(.system(size: 20, weight: .semibold)).padding(.top, 20)
                VStack(alignment: .leading, spacing: 8) {
                    if model.devices.count > 1 {
                        Picker("手机", selection: $model.deviceID) { Text("选择手机").tag(""); ForEach(model.devices) { Text($0.title).tag($0.id) } }.labelsHidden().disabled(model.working)
                    }
                    Text(model.device?.title ?? "未连接手机").font(.headline)
                    if let software = model.device?.software, !software.isEmpty { Text(software).font(.callout).foregroundStyle(.secondary).textSelection(.enabled) }
                    Label(model.device?.ready == true ? "已连接" : model.device?.status == "Unauthorized" ? "等待手机授权" : "未就绪", systemImage: model.device?.ready == true ? "checkmark.circle.fill" : "cable.connector").font(.callout).foregroundStyle(model.device?.ready == true ? Color.green : Color.secondary)
                }.padding(14).frame(maxWidth: .infinity, alignment: .leading).background(.background.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
                VStack(spacing: 4) {
                    ForEach(model.categories) { category in
                        Button { model.category = category.id; withAnimation { scroll.scrollTo(category.id, anchor: .top) } } label: {
                            HStack(spacing: 12) { Image(systemName: category.icon).frame(width: 22); Text(category.name); Spacer(); Text("\(model.items.filter { $0.category == category.id }.count)").foregroundStyle(.secondary) }.font(.system(size: 16)).padding(.horizontal, 12).padding(.vertical, 12).contentShape(Rectangle())
                        }.buttonStyle(.plain).accessibilityIdentifier("nav-\(category.id)").background(model.category == category.id ? Color.accentColor.opacity(0.13) : .clear, in: RoundedRectangle(cornerRadius: 8)).foregroundStyle(model.category == category.id ? Color.accentColor : Color.primary)
                    }
                }
                Spacer()
                if model.device?.ready != true {
                    Text("解锁手机并用 USB 数据线连接。\n在开发者选项中开启 USB 调试，然后在手机上允许此电脑。").font(.callout).foregroundStyle(.secondary)
                    Button("重新检测") { model.refresh() }.disabled(model.working || model.discovering)
                }
            }.padding(20).frame(width: 246).frame(maxHeight: .infinity).background(.ultraThinMaterial)
            Divider()
            VStack(alignment: .leading, spacing: 0) {
                Text("手机设置").font(.system(size: 30, weight: .bold)).padding(28)
                HStack { Text("执行").frame(width: 44); Text("设置项目"); Spacer() }.font(.callout).foregroundStyle(.secondary).padding(.horizontal, 20).padding(.vertical, 12).background(Color.secondary.opacity(0.07)).padding(.horizontal, 28)
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(model.categories) { category in
                            VStack(spacing: 0) {
                                HStack {
                                    Text(category.name).font(.headline).accessibilityAddTraits(.isHeader)
                                    Spacer()
                                    Button("全选本组") { model.selectAll(true, categoryID: category.id) }.accessibilityIdentifier("select-group-\(category.id)")
                                    Button("取消本组") { model.selectAll(false, categoryID: category.id) }.accessibilityIdentifier("clear-group-\(category.id)")
                                }.padding(.horizontal, 20).padding(.top, 24).padding(.bottom, 12).disabled(model.working)
                                ForEach(model.items.filter { $0.category == category.id }) { item in
                                    SettingRow(item: item, model: model)
                                    Divider().padding(.leading, 20)
                                }
                            }.id(category.id)
                        }
                    }.padding(.bottom, 16)
                }.accessibilityIdentifier("settings-list").padding(.horizontal, 28)
                VStack(alignment: .leading, spacing: 10) {
                    if model.working { ProgressView(value: Double(model.completed), total: Double(max(model.total, 1))); Text("已处理 \(model.completed) / \(model.total) 项").font(.callout).foregroundStyle(.secondary) }
                    Text(model.message).font(.callout).textSelection(.enabled)
                    if !model.dndMessage.isEmpty { Text(model.dndMessage).font(.callout).foregroundStyle(.secondary) }
                    if let pending = model.pending, !model.working {
                        HStack { Text(pending["restorePending"] as? Bool == true ? "上次任务的勿扰尚未恢复" : "有未完成的任务").font(.callout)
                            if pending["restorePending"] as? Bool == true { Button("恢复勿扰") { model.resume(true) }.disabled(model.discovering || model.device?.ready != true) }
                            Button("继续原任务") { model.resume() }.disabled(model.discovering || model.device?.ready != true)
                        }
                    }
                }.padding(.horizontal, 28).padding(.vertical, 14)
                Divider()
                HStack(spacing: 14) {
                    Text("已选 \(model.selectedCount) 项").font(.headline).accessibilityIdentifier("selection-count")
                    Button("全选") { model.selectAll(true) }.accessibilityIdentifier("select-all").disabled(model.working)
                    Button("全不选") { model.selectAll(false) }.accessibilityIdentifier("clear-all").disabled(model.working)
                    Spacer()
                    if model.working { Button(model.stopping ? "正在收尾…" : "停止执行") { model.stop() }.accessibilityIdentifier("stop").disabled(model.stopping) }
                    else { Button("执行所选项目") { model.execute() }.accessibilityIdentifier("execute").buttonStyle(.borderedProminent).controlSize(.large).disabled(!model.canExecute) }
                }.padding(24)
            }.frame(maxWidth: .infinity, maxHeight: .infinity).background(Color(nsColor: .windowBackgroundColor))
        }.frame(minWidth: 960, minHeight: 700).onAppear { model.start() }
        }
        }
    }
}
final class AppDelegate: NSObject, NSApplicationDelegate {
    let model = AppModel()
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard model.connected else { return .terminateNow }
        model.termination = { NSApplication.shared.reply(toApplicationShouldTerminate: true) }
        model.close(); return .terminateLater
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
@main struct CleanYourHarmonyApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    var body: some Scene {
        WindowGroup { MainView(model: delegate.model) }.defaultSize(width: 1120, height: 820)
            .commands { CommandGroup(replacing: .newItem) {} }
    }
}
