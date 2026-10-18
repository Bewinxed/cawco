#if DEBUG
import CawCoCore
import CawCoDesign
import OSLog
import UIKit

/// `-config-probe` (DEBUG only): Configure's project sections against a
/// scratch hub (scripts/probe-kit/specs/ios-config.ts). Each section is
/// opened through the shell as a person opens it, one change is made through
/// the function its control runs, and what the section draws is said in the
/// ConfigProbe log; the spec reads the hub, which is what the web reads.
/// `-config-probe-capture <url>` sends the window at each stage there as
/// `<stage>.png`, for the paired captures beside the dashboard.
@MainActor
enum ConfigProbe {
    static let on = ProcessInfo.processInfo.arguments.contains("-config-probe")
    static let log = Logger(subsystem: "dev.cawco.app", category: "ConfigProbe")

    /// The values the spec seeds, `key=value,…` after `-config-probe-ids`.
    private static let ids: [String: String] = {
        let arguments = ProcessInfo.processInfo.arguments
        guard let at = arguments.firstIndex(of: "-config-probe-ids"), arguments.indices.contains(at + 1) else { return [:] }
        return Dictionary(arguments[at + 1].split(separator: ",").compactMap { pair in
            let parts = pair.split(separator: "=", maxSplits: 1).map(String.init)
            return parts.count == 2 ? (parts[0], parts[1]) : nil
        }, uniquingKeysWith: { _, last in last })
    }()

    private static let captureURL = ProcessInfo.processInfo.arguments.firstIndex(of: "-config-probe-capture").flatMap { at in
        ProcessInfo.processInfo.arguments.indices.contains(at + 1) ? URL(string: ProcessInfo.processInfo.arguments[at + 1]) : nil
    }

    static func start(shell: ShellController) {
        Task { @MainActor [weak shell] in
            guard let shell else { return }
            await run(shell)
            say("done", "ok")
        }
    }

    // MARK: Helpers

    private static func say(_ step: String, _ text: String) {
        // Unified logging cuts a message just under 1 KB: long words go in parts.
        let chunks = stride(from: 0, to: max(text.count, 1), by: 700).map { start -> String in
            let from = text.index(text.startIndex, offsetBy: start, limitedBy: text.endIndex) ?? text.endIndex
            let to = text.index(from, offsetBy: 700, limitedBy: text.endIndex) ?? text.endIndex
            return String(text[from ..< to])
        }
        for (index, chunk) in chunks.enumerated() {
            let part = chunks.count > 1 ? " [part \(index + 1)/\(chunks.count)]" : ""
            log.notice("config \(step, privacy: .public)\(part, privacy: .public): \(chunk, privacy: .public)")
        }
    }

    @discardableResult
    private static func until(_ seconds: Double = 30, _ done: () -> Bool) async -> Bool {
        let end = ContinuousClock.now + .seconds(seconds)
        while !done() {
            if ContinuousClock.now > end { return false }
            try? await Task.sleep(for: .milliseconds(200))
        }
        return true
    }

    private static func controllers<T: UIViewController>(_: T.Type, from root: UIViewController?) -> [T] {
        guard let root else { return [] }
        let below = root.children + [root.presentedViewController].compactMap(\.self)
        let navs = (root as? UINavigationController)?.viewControllers ?? []
        var seen = Set<ObjectIdentifier>()
        return ([root as? T].compactMap(\.self) + (below + navs).flatMap { controllers(T.self, from: $0) })
            .filter { seen.insert(ObjectIdentifier($0)).inserted }
    }

    private static func onScreen<T: UIViewController>(_: T.Type, _ shell: ShellController) -> T? {
        controllers(T.self, from: shell).first { $0.view.window != nil }
    }

    /// The section opened as Configure's list opens it, read once it has its rows.
    private static func open<T: ConfigSectionController>(_ slug: String, _: T.Type, _ shell: ShellController) async -> T? {
        shell.openConfigure(slug)
        guard await until(30, { onScreen(T.self, shell)?.ready == true }), let section = onScreen(T.self, shell) else {
            say("\(slug) opened", "no \(T.self) on screen")
            return nil
        }
        try? await Task.sleep(for: .seconds(1))
        say("\(slug) opened", AccountsProbe.texts(in: section.view).joined(separator: " | "))
        await capture("\(slug)-list", shell)
        return section
    }

    private static func capture(_ stage: String, _ shell: ShellController) async {
        // What a step just changed is laid out, and a hint line's fold has run, before anything is measured.
        try? await Task.sleep(for: .seconds(Motion.durControl + 0.4))
        shell.view.window?.layoutIfNeeded()
        if let window = shell.view.window {
            let cut = AccountsProbe.clipped(in: window)
            say("clipped \(stage)", cut.isEmpty ? "none" : cut.joined(separator: " / "))
        }
        guard let base = captureURL, let window = shell.view.window,
              let png = UIGraphicsImageRenderer(bounds: window.bounds).image(actions: { _ in
                  window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
              }).pngData() else { return }
        var request = URLRequest(url: base.appending(path: "\(stage).png"))
        request.httpMethod = "PUT"
        let status = await (try? URLSession.shared.upload(for: request, from: png)).map { ($0.1 as? HTTPURLResponse)?.statusCode ?? 0 }
        log.notice("capture \(stage, privacy: .public): \(status.map { "sent, \($0)" } ?? "not sent", privacy: .public)")
    }

    // MARK: The run

    private static func run(_ shell: ShellController) async {
        let hub = shell.hub
        guard await until(60, { hub.state == .connected && !hub.fleet.machines.isEmpty && !hub.fleet.projects.isEmpty }) else {
            say("start", "the hub was never read")
            return
        }
        let project = ids["project"] ?? hub.fleet.projects.first?.id ?? ""
        say("start", "machines \(hub.fleet.machines.count), project \(project)")

        // Spend: the fleet's answer, chosen.
        if let spend = await open("spend", SpendSectionController.self, shell) {
            spend.probeChoose("quiet")
            await until { spend.probeChosen == "quiet" && !spend.probeWriting }
            say("spend chosen", AccountsProbe.texts(in: spend.view).joined(separator: " | "))
        }

        // Delegate types: a new one, made in its editor.
        if let types = await open("delegate-types", DelegateTypesSectionController.self, shell) {
            types.probeOpenNew()
            guard await until(30, { onScreen(DelegateTypeEditorController.self, shell) != nil }),
                  let editor = onScreen(DelegateTypeEditorController.self, shell) else { return say("delegate-types editor", "never opened") }
            editor.probeFill(name: "probe-type", description: "Probe delegate type: answers the probe.", model: "probe-model", effort: "high")
            // Left with Back, not Cancel: the edits wait as a draft, the rail says so, and New finds them again.
            editor.navigationController?.popViewController(animated: false)
            await until { onScreen(DelegateTypeEditorController.self, shell) == nil }
            say("delegate-types draft", "unsaved \(ConfigDrafts.shared.unsaved(in: "delegate-types", hub: hub))")
            types.probeOpenNew()
            guard await until(30, { onScreen(DelegateTypeEditorController.self, shell) != nil }),
                  let reopened = onScreen(DelegateTypeEditorController.self, shell) else { return say("delegate-types editor", "never reopened") }
            say("delegate-types reopened", AccountsProbe.texts(in: reopened.view).joined(separator: " | "))
            await capture("delegate-types-editor", shell)
            reopened.probeRunSave()
            await until { onScreen(DelegateTypesSectionController.self, shell) != nil && onScreen(DelegateTypeEditorController.self, shell) == nil }
            try? await Task.sleep(for: .seconds(1))
            say("delegate-types saved", "unsaved \(ConfigDrafts.shared.unsaved(in: "delegate-types", hub: hub)) | "
                + AccountsProbe.texts(in: types.view).joined(separator: " | "))
        }

        // MCP: a command server for one project, made in its editor; then switched off from its row.
        if let mcp = await open("mcp", McpSectionController.self, shell) {
            mcp.probeOpenNew()
            guard await until(30, { onScreen(McpEditorController.self, shell) != nil }),
                  let editor = onScreen(McpEditorController.self, shell) else { return say("mcp editor", "never opened") }
            editor.probeFill(name: "probe-mcp", command: "true", args: "--probe", projectId: project)
            await capture("mcp-editor", shell)
            say("mcp editor", AccountsProbe.texts(in: editor.view).joined(separator: " | "))
            editor.probeRunSave()
            await until { onScreen(McpEditorController.self, shell) == nil }
            await until { hub.configuration.snapshot?.config.mcp.contains { $0.name == "probe-mcp" } == true }
            mcp.probeToggle("probe-mcp", on: false)
            await until { hub.configuration.snapshot?.config.mcp.first { $0.name == "probe-mcp" }?.enabled == false }
            say("mcp saved", AccountsProbe.texts(in: mcp.view).joined(separator: " | "))
        }

        // Connections: GitHub, its key set from the form; then one project allowed.
        if let connections = await open("connections", ConnectionsSectionController.self, shell) {
            connections.probeAdd(service: "github", account: "probe", key: "probe-key")
            await until(60) { connections.probeRow("github-probe") != nil && !connections.probeAdding }
            connections.probeToggle("github-probe", project: project)
            await until { connections.probeRow("github-probe")?.projects.contains(project) == true }
            try? await Task.sleep(for: .seconds(1))
            say("connections saved", AccountsProbe.texts(in: connections.view).joined(separator: " | "))
            await capture("connections-saved", shell)
        }

        // Skills: a skill a machine has, adopted into the fleet; then switched off.
        if let skills = await open("skills", SkillsSectionController.self, shell), let machine = hub.fleet.machines.first {
            await skills.probeAdopt(ids["skill"] ?? "probe-skill", machine: machine)
            await until(60) { hub.configuration.snapshot?.skills.contains { $0.name == ids["skill"] ?? "probe-skill" } == true }
            skills.probeToggle(ids["skill"] ?? "probe-skill", on: false)
            await until { hub.configuration.snapshot?.skills.first { $0.name == ids["skill"] ?? "probe-skill" }?.enabled == false }
            try? await Task.sleep(for: .seconds(1))
            say("skills saved", AccountsProbe.texts(in: skills.view).joined(separator: " | "))
            await capture("skills-saved", shell)
        }

        // Memory: a new document, written, loaded into leaf sessions.
        if let memory = await open("memory", MemorySectionController.self, shell) {
            memory.probeCreate("probe/notes.md")
            guard await until(60, { onScreen(MemoryEditorController.self, shell) != nil }),
                  let editor = onScreen(MemoryEditorController.self, shell) else { return say("memory editor", "never opened") }
            editor.probeWrite("# Probe notes\n\nReleases are cut on **Thursdays**; see `release.md`.\n", role: "leaf")
            await capture("memory-editor", shell)
            say("memory editor", AccountsProbe.texts(in: editor.view).joined(separator: " | "))
            editor.probeRunSave()
            await until { hub.configuration.snapshot?.memoryDocs.first { $0.path == "probe/notes.md" }?.content.contains("Thursdays") == true }
            try? await Task.sleep(for: .seconds(1))
            say("memory saved", AccountsProbe.texts(in: editor.view).joined(separator: " | "))
        }
    }
}
#endif
