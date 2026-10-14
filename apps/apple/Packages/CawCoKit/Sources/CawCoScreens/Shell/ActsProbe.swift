#if DEBUG
import CawCoCore
import CawCoDesign
import OSLog
import SafariServices
import UIKit

/// `-acts-probe` (DEBUG only): the Stay In Context proof against a scratch
/// hub seeded with the probe sessions (p-stop-ok, p-keep-refuse, …) and a
/// scripted machine that answers, stalls or refuses each request. Each flow
/// runs through the function its menu item runs, and what the rows, the
/// peek, the rename field and the machine menu draw is read off
/// their views at each stage into the ActsProbe log, beside the hub's word.
@MainActor
enum ActsProbe {
    static let on = ProcessInfo.processInfo.arguments.contains("-acts-probe")
    static let log = Logger(subsystem: "dev.cawco.app", category: "ActsProbe")

    static func start(shell: ShellController, home: HomeModel, continuations: NewSessionFlow) {
        Task { @MainActor [weak shell] in
            guard let shell else { return }
            await run(shell, home: home, flow: continuations)
        }
    }

    private static func wait(_ seconds: Double) async {
        try? await Task.sleep(for: .seconds(seconds))
    }

    @discardableResult
    private static func until(_ seconds: Double = 15, _ done: () -> Bool) async -> Bool {
        let end = ContinuousClock.now + .seconds(seconds)
        while !done() {
            if ContinuousClock.now > end { return false }
            await wait(0.1)
        }
        return true
    }

    private static func views<T: UIView>(_: T.Type, in root: UIView) -> [T] {
        [root as? T].compactMap(\.self) + root.subviews.flatMap { views(T.self, in: $0) }
    }

    private static func controllers<T: UIViewController>(_: T.Type, from root: UIViewController?) -> [T] {
        guard let root else { return [] }
        let below = root.children + [root.presentedViewController].compactMap(\.self)
        return [root as? T].compactMap(\.self) + below.flatMap { controllers(T.self, from: $0) }
    }

    /// The row on screen for session `id` (a Recent row is keyed by its
    /// conversation and stands for its instance): one a list keeps hidden
    /// for reuse is no row.
    private static func row(_ id: String, _ shell: ShellController) -> SessionRowView? {
        let windows = shell.view.window?.windowScene?.windows ?? []
        return windows.flatMap { views(SessionRowView.self, in: $0) }
            .first { ($0.accessibilityIdentifier == "session-row-\(id)" || $0.hoverSessionId == id) && shown($0) }
    }

    private static func shown(_ view: UIView) -> Bool {
        var at: UIView? = view
        while let next = at {
            if next.isHidden || next.alpha < 0.01 { return false }
            at = next.superview
        }
        return view.window != nil
    }

    private static func say(_ step: String, _ id: String, _ shell: ShellController) {
        let drawn = row(id, shell)?.probeState ?? "no row on screen"
        let hub = shell.hub
        log.notice("\(step, privacy: .public) [\(id, privacy: .public)] row: \(drawn, privacy: .public) | hub: \(hub.fleet.byId[id]?.status.rawValue ?? "gone", privacy: .public) kind \(hub.fleet.byId[id]?.kind ?? "-", privacy: .public)")
    }

    /// Every item a menu would draw, with the words under it.
    private static func items(_ menu: UIMenu) -> [String] {
        menu.children.flatMap { element -> [String] in
            if let sub = element as? UIMenu { return items(sub) }
            guard let action = element as? UIAction else { return [] }
            let off = action.attributes.contains(.disabled) ? " (disabled)" : ""
            return ["\(action.title)\(off)\(action.subtitle.map { " — \($0)" } ?? "")"]
        }
    }

    private static func menu(_ id: String, _ shell: ShellController, _ host: MenuHost) -> String {
        guard let held = shell.hub.fleet.byId[id] else { return "no session" }
        return items(SessionMenus.live(held, context: shell.sessionMenus, copy: host)).joined(separator: " | ")
    }

    private static func run(_ shell: ShellController, home: HomeModel, flow: NewSessionFlow) async {
        let hub = shell.hub
        log.notice("acts probe: waiting for the seeded fleet")
        guard await until(90, { hub.fleet.byId["p-stop-ok"]?.status == .running && hub.fleet.byId["p-arch-ok"] != nil }) else {
            log.error("acts probe: the seeded sessions never arrived")
            return
        }
        await wait(3)
        let boards = { controllers(HomeViewController.self, from: shell).filter { $0.view.window != nil } }
        func tab(_ next: HomeModel.Tab) async {
            boards().forEach { $0.show(next) }
            await wait(1.5)
        }
        let host = MenuHost(copier: { title, _, _ in UIAction(title: title) { _ in } }, view: nil, refresh: {}, close: {}, whenClosed: { $0() })
        log.notice("acts probe: \(boards().count) board(s) on screen")
        await tab(.working)
        // Sessions at rest are listed under Recent on the phone's home.
        home.recentOpen = true
        await wait(1.5)

        // 1. Stop, which the machine carries out after 4 s: its row and a peek on it.
        await peek("p-stop-ok", "Stop answers", shell, home: home, boards: boards) { peek in
            say("stop before", "p-stop-ok", shell)
            Task { await SessionMenus.stop("p-stop-ok", machineId: "probe-mac", hub: hub) }
            await wait(1)
            say("stop in flight", "p-stop-ok", shell)
            let during = peek()?.probeState ?? "none"
            log.notice("stop in flight [p-stop-ok] peek: \(during, privacy: .public)")
            await until { !hub.acts.inFlight("p-stop-ok") }
            await wait(1)
            say("stop confirmed", "p-stop-ok", shell)
            let after = peek()?.probeState ?? "none"
            log.notice("stop confirmed [p-stop-ok] peek: \(after, privacy: .public)")
        }

        // 2. Stop, which the machine refuses: the reason on its row and in a peek.
        await peek("p-stop-refuse", "Stop refused", shell, home: home, boards: boards) { peek in
            Task { await SessionMenus.stop("p-stop-refuse", machineId: "probe-mac", hub: hub) }
            await wait(0.2)
            say("stop in flight", "p-stop-refuse", shell)
            await until { !hub.acts.inFlight("p-stop-refuse") }
            await wait(1)
            say("stop refused", "p-stop-refuse", shell)
            let refusedPeek = peek()?.probeState ?? "none"
            let refusedMenu = menu("p-stop-refuse", shell, host)
            log.notice("stop refused [p-stop-refuse] peek: \(refusedPeek, privacy: .public)")
            log.notice("stop refused [p-stop-refuse] menu: \(refusedMenu, privacy: .public)")
        }

        // 3. Keep, taken; Keep, whose transcript tag the machine refuses.
        for id in ["p-keep-ok", "p-keep-refuse"] {
            say("keep before", id, shell)
            Task {
                await SessionMenus.runPending(.keep, id: id, host: host, hub: hub, work: {
                    try await hub.keepSession(id: id)
                    return nil
                }, then: { _ in })
            }
            await wait(0.05)
            log.notice("keep in flight [\(id, privacy: .public)] menu: \(menu(id, shell, host), privacy: .public)")
            await until { !hub.acts.inFlight(id) }
            await wait(1)
            say("keep answered", id, shell)
            log.notice("keep answered [\(id, privacy: .public)] menu: \(menu(id, shell, host), privacy: .public)")
        }

        // 4. Rename where the row stands: taken, then refused by the hub.
        if let named = row("p-rename", shell) {
            let editor = SessionMenus.rename("p-rename", over: named, current: "Rename me", hub: hub)
            await wait(1)
            log.notice("rename open [p-rename]: \(editor.probeState, privacy: .public)")
            editor.probeCommit("Renamed in place")
            log.notice("rename in flight [p-rename]: \(editor.probeState, privacy: .public)")
            await until(8) { editor.window == nil }
            await wait(0.5)
            say("rename confirmed", "p-rename", shell)
            log.notice("rename confirmed [p-rename]: field in a window \(editor.window != nil, privacy: .public), hub title '\(hub.fleet.byId["p-rename"]?.title ?? "", privacy: .public)'")
            if let again = row("p-rename", shell) {
                let refused = SessionMenus.rename("p-rename", over: again, current: "Renamed in place", hub: hub)
                await wait(1)
                // U+FEFF: a title the app keeps and the hub trims to nothing, so the hub refuses it.
                refused.probeCommit("\u{FEFF}")
                log.notice("rename in flight [p-rename]: \(refused.probeState, privacy: .public)")
                await wait(2)
                log.notice("rename refused [p-rename]: \(refused.probeState, privacy: .public)")
                refused.probeEscape()
                await wait(1)
                log.notice("rename escaped [p-rename]: field in a window \(refused.window != nil, privacy: .public)")
                say("rename escaped", "p-rename", shell)
            }
        } else {
            log.error("rename: no p-rename row on screen")
        }

        // 5. Continue: a job the hub failed, and one it started, carried on their source rows.
        log.notice("continue: the hub lists \(hub.fleet.continuations.count) job(s)")
        flow.detach("c-fail", source: ContinueSource(instanceId: "p-cont", machineId: "probe-mac", cwd: "/tmp/probe",
                                                     harness: "claude", model: nil, title: "Continue from me"), draft: nil)
        flow.detach("c-done", source: ContinueSource(instanceId: "p-rename", machineId: "probe-mac", cwd: "/tmp/probe",
                                                     harness: "claude", model: nil, title: "Renamed in place"), draft: nil)
        await wait(1.5)
        say("continue failed", "p-cont", shell)
        say("continue started", "p-rename", shell)
        log.notice("continue started [p-rename] menu: \(menu("p-rename", shell, host), privacy: .public)")

        // 6. On Finished: Fork refused, Archive taken and refused, Delete out of its row.
        await tab(.finished)
        for id in ["p-fork", "p-arch-ok", "p-arch-busy", "p-del"] { say("finished", id, shell) }
        Task {
            await SessionMenus.runPending(.fork, id: "p-fork", host: host, hub: hub, work: {
                try await hub.fork(machineId: "probe-mac", cwd: "/tmp/probe", sessionKey: "s-fork")
            }, then: { _ in })
        }
        await wait(0.3)
        say("fork in flight", "p-fork", shell)
        await until { !hub.acts.inFlight("p-fork") }
        await wait(1)
        say("fork refused", "p-fork", shell)

        let finishedBefore = home.finished.map(\.id).joined(separator: ",")
        log.notice("archive: Finished lists \(finishedBefore, privacy: .public)")
        home.archive(["p-arch-ok"])
        await wait(0.02)
        say("archive in flight", "p-arch-ok", shell)
        await until { !hub.acts.inFlight("p-arch-ok") }
        await wait(1.5)
        say("archive confirmed", "p-arch-ok", shell)
        let finishedAfter = home.finished.map(\.id).joined(separator: ",")
        log.notice("archive confirmed: Finished lists \(finishedAfter, privacy: .public)")
        home.archive(["p-arch-busy"])
        await until { !hub.acts.inFlight("p-arch-busy") }
        await wait(1)
        say("archive refused", "p-arch-busy", shell)
        // Delete transcript, Remove session, Discard and Remove machine ask in place: AskProbe.

        // 7. The machine menu: Reload on an offline machine; Sign in an account on probe-mac.
        let ghost = MachineMenu(machineId: "ghost-mac", host: shell)
        log.notice("machine menu [ghost-mac] before: \(ghost.probeItems.joined(separator: " | "), privacy: .public)")
        ghost.probeReload()
        log.notice("machine menu [ghost-mac] in flight: \(ghost.probeItems.joined(separator: " | "), privacy: .public)")
        await wait(4)
        log.notice("machine menu [ghost-mac] refused: \(ghost.probeItems.joined(separator: " | "), privacy: .public)")
        let probe = MachineMenu(machineId: "probe-mac", host: shell)
        log.notice("machine menu [probe-mac]: \(probe.probeItems.joined(separator: " | "), privacy: .public)")
        probe.probeAccounts()
        await wait(3)
        let web = controllers(SFSafariViewController.self, from: shell)
        log.notice("machine menu [probe-mac] sign in: \(web.count, privacy: .public) web page(s) over the app")
        web.first?.dismiss(animated: true)
        await wait(1.5)

        // 8. The delegate tray: Dismiss taken, then refused for an item the hub no longer has.
        shell.openSession("p-cont")
        hub.workItems.load(parent: "p-cont")
        await wait(4)
        let trays = (shell.view.window?.windowScene?.windows ?? []).flatMap { views(DelegateTrayView.self, in: $0) }.filter { $0.window != nil }
        log.notice("tray: \(trays.count, privacy: .public) tray(s) on screen, \(hub.workItems.of(parent: "p-cont").count, privacy: .public) item(s)")
        if let tray = trays.first {
            for id in ["w-ok", "w-gone"] {
                if id == "w-gone" {
                    log.notice("tray: ready to dismiss w-gone")
                    await wait(8)
                }
                let pressed = tray.probeDismiss(id)
                log.notice("tray dismiss in flight [\(id, privacy: .public)] pressed=\(pressed, privacy: .public): \(tray.probePanel(id), privacy: .public)")
                await wait(2.5)
                log.notice("tray dismiss answered [\(id, privacy: .public)]: \(tray.probePanel(id), privacy: .public)")
            }
        }
        log.notice("acts probe: done")
    }

    /// Runs `body` with a peek open on `id` over the board, then puts it away.
    private static func peek(_ id: String, _ title: String, _ shell: ShellController, home: HomeModel,
                             boards: () -> [HomeViewController], body: (() -> PeekController?) async -> Void) async {
        if let board = boards().first {
            Peek.show(PeekTarget(viewId: id, title: title), hub: shell.hub, home: home, from: board) { _ in }
            await wait(1.5)
        }
        let found = { controllers(PeekController.self, from: shell).first }
        log.notice("peek [\(id, privacy: .public)] open: \(found()?.probeState ?? "none", privacy: .public)")
        await body(found)
        if let sheet = found()?.presentingViewController {
            sheet.dismiss(animated: true)
            await wait(1)
        }
    }
}
#endif
