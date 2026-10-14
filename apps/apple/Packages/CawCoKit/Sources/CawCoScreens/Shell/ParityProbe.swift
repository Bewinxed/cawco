#if DEBUG
import CawCoCore
import CawCoDesign
import OSLog
import UIKit

/// `-parity-probe` (DEBUG only): the web's 685a5ea2 and 464cb194 in the app,
/// against a scratch fleet (scripts/probe-kit/specs/ios-parity.ts, which
/// names its ids in `-parity-probe-ids`). Each flow runs through the
/// function its control runs, and what stands on screen is read off the
/// views into the ParityProbe log:
///
/// 1. a memory curator run's proposal, parked under its own id, opens from
///    its push's fields in the session that made it, its card in that
///    session's composer; a pane opened on the proposal's own id moves
///    there; Approve in that composer answers it, and Caw's panel lists it
///    no longer;
/// 2. on a wide screen, the rail's session row carries the session's menu,
///    and Delete transcript asks under that row, in the page, then deletes;
/// 3. a machine's keychain unlock opens under its row, and the hub's refusal
///    of an install stands under that row too, nothing presented over the page.
@MainActor
enum ParityProbe {
    static let on = ProcessInfo.processInfo.arguments.contains("-parity-probe")
    static let log = Logger(subsystem: "dev.cawco.app", category: "ParityProbe")

    static func start(shell: ShellController, home: HomeModel) {
        Task { @MainActor [weak shell] in
            guard let shell else { return }
            await run(shell, home: home)
            log.notice("parity-probe: done")
        }
    }

    /// `-parity-probe-ids proposal=<p-…>,origin=<session>,del=<session>,ghost=<machine>`.
    private static var ids: [String: String] {
        let pairs = (UserDefaults.standard.string(forKey: "parity-probe-ids") ?? "").split(separator: ",").compactMap { pair -> (String, String)? in
            let parts = pair.split(separator: "=", maxSplits: 1).map(String.init)
            return parts.count == 2 ? (parts[0], parts[1]) : nil
        }
        return Dictionary(pairs, uniquingKeysWith: { first, _ in first })
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

    /// What is presented over the page, if anything: nothing, for what is answered in place.
    private static func modal(_ shell: ShellController) -> String {
        shell.presentedViewController.map { String(describing: type(of: $0)) } ?? "none"
    }

    private static func run(_ shell: ShellController, home: HomeModel) async {
        let hub = shell.hub
        let ids = ids
        guard let proposal = ids["proposal"], let origin = ids["origin"], let ghost = ids["ghost"] else {
            log.error("parity-probe: -parity-probe-ids names proposal, origin and ghost")
            return
        }
        log.notice("parity-probe: waiting for the fleet")
        guard await until(120, {
            hub.needs.parked[proposal] != nil && hub.fleet.byId[origin] != nil
                && hub.fleet.machines.contains { $0.machineId == ghost }
                && ids["del"].map { hub.fleet.byId[$0] != nil } ?? true
        }) else {
            log.error("parity-probe: the fleet never listed the proposal, its origin and the machines")
            return
        }
        await wait(2)

        // 1. The proposal, where it was made.
        let workspace = shell.workspace
        func paneSay(_ step: String) {
            let cards = shell.probePanes.session(origin)?.probeAsks ?? []
            let listed = home.needs.contains { $0.id == "\(proposal):\(proposal)" }
            log.notice("\(step, privacy: .public) [\(proposal, privacy: .public)] front: \(workspace.activeSessionId ?? "board", privacy: .public) | tabs: \(workspace.openIds.joined(separator: ","), privacy: .public) | origin's cards: \(cards.joined(separator: ","), privacy: .public) | parked: \(hub.needs.parked[proposal] != nil ? "yes" : "no", privacy: .public) | Caw's panel lists it: \(listed ? "yes" : "no", privacy: .public) | over the page: \(modal(shell), privacy: .public)")
        }
        // A tap on its push: the hub's `ask` data, routed as PushNote routes a tap.
        let fields = ["kind": "ask", "instanceId": proposal, "requestId": proposal, "machineId": "hub", "originInstanceId": origin]
        let route = PushNote.route(fields)
        log.notice("push route [\(proposal, privacy: .public)] \(String(describing: route), privacy: .public)")
        shell.open(route)
        await until(30) { workspace.activeSessionId == origin && shell.probePanes.session(origin)?.probeAsks.contains(proposal) == true }
        await wait(2)
        paneSay("push landed")

        // A pane opened on the proposal's own id moves to the session that made it.
        shell.returnToFleet(origin)
        await wait(1.5)
        shell.openSession(proposal)
        await until(30) { workspace.activeSessionId == origin && !workspace.openIds.contains(proposal) }
        await wait(2)
        paneSay("proposal's pane moved")

        // Approve in the origin's composer: answered on machine "hub", gone everywhere.
        shell.probePanes.session(origin)?.probeAnswer(proposal, allow: true)
        await until(60) { hub.needs.parked[proposal] == nil }
        await wait(2)
        paneSay("answered in its origin")

        // 2. The rail's session menu, on a wide screen.
        if let del = ids["del"], !shell.probeCompact {
            let rail = shell.probeRail
            await until(30) { rail.probeRow(del) != nil }
            func railSay(_ step: String) {
                log.notice("\(step, privacy: .public) [\(del, privacy: .public)] question: \(shell.sessionAsks.at == nil ? "none on screen" : shell.sessionAsks.view.probeState, privacy: .public) | under its rail row: \(rail.probeAskUnder(del) ? "yes" : "no", privacy: .public) | over the page: \(modal(shell), privacy: .public) | rail row: \(rail.probeRow(del) == nil ? "gone" : "listed", privacy: .public) | hub row: \(hub.fleet.byId[del] == nil ? "gone" : "listed", privacy: .public)")
            }
            if let row = rail.probeRow(del) {
                let host = MenuHost(copier: { title, _, _ in UIAction(title: title) { _ in } }, view: row, refresh: {}, close: {}, whenClosed: { $0() })
                func titles(_ menu: UIMenu) -> [String] {
                    menu.children.flatMap { element -> [String] in
                        if let inner = element as? UIMenu { return titles(inner) }
                        return (element as? UIAction).map { [$0.title] } ?? []
                    }
                }
                let items = row.menu?(host).map(titles) ?? []
                let attached = row.interactions.contains { $0 is UIContextMenuInteraction }
                log.notice("rail menu [\(del, privacy: .public)] attached: \(attached ? "yes" : "no", privacy: .public) | items: \(items.joined(separator: ", "), privacy: .public)")
                // Delete transcript, as its item asks it (SessionMenus `ask`).
                if let live = hub.fleet.byId[del], let question = SessionMenus.deleteQuestion(live, context: shell.sessionMenus.at(rail.probeAskPlace)) {
                    shell.sessionAsks.ask(question.request, at: question.at)
                    await wait(1.5)
                    railSay("rail delete asked")
                    // A local hub answers within a frame: it is held still while the question is read in flight.
                    log.notice("parity-probe: hold the hub")
                    await wait(2)
                    shell.sessionAsks.view.probeConfirm()
                    await wait(1)
                    railSay("rail delete in flight")
                    log.notice("parity-probe: free the hub")
                    await until(60) { !shell.sessionAsks.view.running }
                    await until(30) { rail.probeRow(del) == nil }
                    await wait(1.5)
                    railSay("rail delete answered")
                }
            } else {
                log.error("rail menu [\(del, privacy: .public)]: no rail row on screen")
            }
        }

        // 3. A machine's unlock and its update's refusal, under its row.
        shell.probeOpenMachines()
        await wait(1.5)
        let lists = { (shell.view.window?.windowScene?.windows ?? []).flatMap { views(MachinesListView.self, in: $0) }.filter { $0.window != nil } }
        guard let list = lists().first else {
            log.error("machines [\(ghost, privacy: .public)]: no machines list on screen")
            return
        }
        func machineSay(_ step: String) {
            log.notice("\(step, privacy: .public) [\(ghost, privacy: .public)] under its row: \(list.probeUnder(ghost).joined(separator: " ; "), privacy: .public) | over the page: \(modal(shell), privacy: .public)")
        }
        list.probeUnlock(ghost)
        await wait(1.5)
        machineSay("unlock opened")
        list.probeUnlockView?.probeSubmit("probe-not-a-password")
        await until(30) { list.probeUnlockView.map { !$0.probeState.contains("Unlocking ") } ?? true }
        await wait(1)
        machineSay("unlock answered")
        hub.installUpdate(machineId: ghost)
        await until(30) { hub.updateRefused[ghost] != nil }
        await wait(1.5)
        machineSay("install refused")
        shell.probeCloseMachines()
    }
}
#endif
