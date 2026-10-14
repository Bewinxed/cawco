#if DEBUG
import CawCoCore
import CawCoDesign
import OSLog
import UIKit

/// `-ask-probe` (DEBUG only): The Open Page Rule's proof for the questions
/// that were dialogs, against a scratch fleet (scripts/probe-ios-ask-here.ts,
/// which names its sessions and machines in `-ask-probe-ids`). Each question
/// is asked through the function its menu item runs, and what stands on
/// screen is read off the views into the AskProbe log at each stage: the
/// question's own state (its title, its confirm's label and spinner,
/// Cancel, the refusal, what it names), whether it is the line right under
/// the row that asked, whether anything is presented over the page, and
/// the row's own line. Lines starting "ask-probe: take" / "ask-probe: bring"
/// hand the script its turn to take a machine down or bring it back.
@MainActor
enum AskProbe {
    static let on = ProcessInfo.processInfo.arguments.contains("-ask-probe")
    static let log = Logger(subsystem: "dev.cawco.app", category: "AskProbe")

    static func start(shell: ShellController, home: HomeModel) {
        Task { @MainActor [weak shell] in
            guard let shell else { return }
            await run(shell, home: home)
            log.notice("ask-probe: done")
        }
    }

    /// `-ask-probe-ids del=<id>,remove=<id>,discard=<id>,main=<machine>,ghost=<machine>`.
    private static var ids: [String: String] {
        let pairs = (UserDefaults.standard.string(forKey: "ask-probe-ids") ?? "").split(separator: ",").compactMap { pair -> (String, String)? in
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

    private static func controllers<T: UIViewController>(_: T.Type, from root: UIViewController?) -> [T] {
        guard let root else { return [] }
        let below = root.children + [root.presentedViewController].compactMap(\.self)
        return [root as? T].compactMap(\.self) + below.flatMap { controllers(T.self, from: $0) }
    }

    /// What is presented over the page, if anything: nothing, for a question in place.
    private static func modal(_ shell: ShellController) -> String {
        shell.presentedViewController.map { String(describing: type(of: $0)) } ?? "none"
    }

    private struct Found {
        let board: HomeViewController
        let place: String
        let item: HomeViewController.Item
    }

    /// Session `id`'s row on screen, in whichever home and list shows it.
    private static func find(_ id: String, _ shell: ShellController, home: HomeModel) async -> Found? {
        let homes = { shell.probeHomes.filter { $0.isViewLoaded && $0.view.window != nil } }
        for tab in [home.tab, home.tab == .working ? .finished : .working] {
            homes().forEach { $0.show(tab) }
            await wait(1.5)
            for board in homes() {
                if let found = board.probeRow(id) { return Found(board: board, place: found.place, item: found.item) }
            }
        }
        return nil
    }

    /// One line: the question, where it stands, the page, and the row.
    private static func say(_ step: String, _ id: String, _ found: Found, _ shell: ShellController) {
        let at = "\(found.place)/\(id)"
        let asked = found.board.probeAsk(at, after: found.item)
        let row = found.board.probeRow(id)?.row.probeState ?? "no row on screen"
        log.notice("\(step, privacy: .public) [\(id, privacy: .public)] question: \(asked?.view.probeState ?? "none on screen", privacy: .public) | under its row: \(asked.map { $0.under ? "yes" : "no" } ?? "-", privacy: .public) | over the page: \(modal(shell), privacy: .public) | row: \(row, privacy: .public)")
    }

    /// Runs `body` while the script holds the hub still (SIGSTOP), so what is
    /// asked of it stays in flight until the hub is let go.
    private static func holdingHub(_ body: () async -> Void) async {
        log.notice("ask-probe: hold the hub")
        await wait(2)
        await body()
        log.notice("ask-probe: free the hub")
    }

    /// Asks `question` from session `id`'s row; nil when the row is not on screen.
    private static func ask(_ name: String, _ id: String, _ shell: ShellController, home: HomeModel,
                            _ question: (InstanceRow, SessionMenuContext) -> SessionQuestion?) async -> Found? {
        guard let found = await find(id, shell, home: home), let row = shell.hub.fleet.byId[id],
              let asked = question(row, shell.sessionMenus.at(found.place))
        else {
            log.error("\(name, privacy: .public) [\(id, privacy: .public)]: no row on screen to ask from")
            return nil
        }
        shell.sessionAsks.ask(asked.request, at: asked.at)
        await wait(1.2)
        say("\(name) asked", id, found, shell)
        return found
    }

    /// Presses the standing question's confirm and reads it in flight and once answered.
    private static func confirm(_ name: String, _ id: String, _ found: Found, _ shell: ShellController, answer seconds: Double = 45) async {
        guard let view = found.board.probeAsk("\(found.place)/\(id)", after: found.item)?.view else {
            log.error("\(name, privacy: .public) [\(id, privacy: .public)]: no question on screen to confirm")
            return
        }
        // A local hub answers within a frame: it is held while the question is read in flight.
        await holdingHub {
            view.probeConfirm()
            await wait(1)
            say("\(name) in flight", id, found, shell)
        }
        await until(seconds) { !shell.sessionAsks.view.running }
        await wait(2)
        say("\(name) answered", id, found, shell)
    }

    private static func run(_ shell: ShellController, home: HomeModel) async {
        let hub = shell.hub
        let ids = ids
        guard let del = ids["del"], let remove = ids["remove"], let discard = ids["discard"],
              let main = ids["main"], let ghost = ids["ghost"]
        else {
            log.error("ask-probe: -ask-probe-ids names del, remove, discard, main and ghost")
            return
        }
        log.notice("ask-probe: waiting for the fleet")
        guard await until(120, { [del, remove, discard].allSatisfy { hub.fleet.byId[$0] != nil } && hub.fleet.machines.count >= 2 }) else {
            log.error("ask-probe: the fleet never listed the probe's sessions")
            return
        }
        home.recentOpen = true
        await wait(3)
        let online = { (machine: String) in hub.fleet.machines.first { $0.machineId == machine }?.status == "online" }

        // 1. Remove session: asked, put away by Cancel, asked again and confirmed.
        if let found = await ask("remove", remove, shell, home: home, { row, context in SessionMenus.removeQuestion(row, context: context) }) {
            found.board.probeAsk("\(found.place)/\(remove)", after: found.item)?.view.probeCancel()
            await wait(1.2)
            say("remove cancelled", remove, found, shell)
            if let again = await ask("remove again", remove, shell, home: home, { row, context in SessionMenus.removeQuestion(row, context: context) }) {
                await confirm("remove", remove, again, shell)
            }
        }

        // 2. Discard a spin-off: asked and confirmed.
        if let found = await ask("discard", discard, shell, home: home, { row, context in SessionMenus.discardQuestion(row, context: context) }) {
            await confirm("discard", discard, found, shell)
        }

        // 3. Delete transcript while its machine is away: the hub refuses, and the refusal stays.
        log.notice("ask-probe: take \(main, privacy: .public) offline")
        guard await until(90, { !online(main) }) else {
            log.error("ask-probe: \(main, privacy: .public) never went offline")
            return
        }
        await wait(1)
        let deleting = await ask("delete", del, shell, home: home) { row, context in SessionMenus.deleteQuestion(row, context: context) }
        if let deleting { await confirm("delete", del, deleting, shell) }

        // 4. Remove machine, while the machine is away: under its row, naming its sessions.
        shell.probeOpenMachines()
        await wait(1.5)
        let lists = { (shell.view.window?.windowScene?.windows ?? []).flatMap { views(MachinesListView.self, in: $0) }.filter { $0.window != nil } }
        func machineSay(_ step: String, _ machine: String) {
            let list = lists().first
            let asked = list?.probeAsk(machine)
            log.notice("\(step, privacy: .public) [\(machine, privacy: .public)] question: \(asked?.view.probeState ?? "none on screen", privacy: .public) | under its row: \(asked.map { $0.under ? "yes" : "no" } ?? "-", privacy: .public) | over the page: \(modal(shell), privacy: .public) | row: \(list.map { $0.probeHasRow(machine) ? "listed" : "gone" } ?? "no list on screen", privacy: .public)")
        }
        lists().first?.probeAskRemove(main)
        await wait(1.2)
        machineSay("remove machine asked", main)

        // Back online: the delete is tried again from its question, and the machine's question goes.
        log.notice("ask-probe: bring \(main, privacy: .public) back")
        guard await until(120, { online(main) }) else {
            log.error("ask-probe: \(main, privacy: .public) never came back")
            return
        }
        await wait(2)
        machineSay("remove machine, back online", main)
        if let deleting {
            await wait(2)
            await confirm("delete again", del, deleting, shell)
        }

        // 5. Remove a machine that is gone: confirmed under its row.
        shell.probeOpenMachines()
        await wait(1.2)
        lists().first?.probeAskRemove(ghost)
        await wait(1.2)
        machineSay("remove machine asked", ghost)
        if let list = lists().first, let view = list.probeAsk(ghost)?.view {
            await holdingHub {
                view.probeConfirm()
                await wait(1)
                machineSay("remove machine in flight", ghost)
            }
            await until { !list.probeRunning }
            await wait(2)
            machineSay("remove machine answered", ghost)
        }
        shell.probeCloseMachines()
        await wait(1)

        // 6. Full Send: asked under the permission list, which stays live; another pick puts it away.
        let board = shell.probeHomes.first { $0.isViewLoaded && $0.view.window != nil }
        guard let board else { return }
        var picked: String?
        let modes = PermissionLook.modes(for: "claude").map { (value: $0, disabled: false) }
        let picker = PermissionPopover(modes: modes, value: "bypassPermissions", harness: "claude", restarts: true) { mode in
            picked = mode
        }
        let shown = KitPopover.present(picker, from: board.view, rect: CGRect(x: 40, y: 120, width: 1, height: 1), in: shell.dialogPresenter, align: .start)
        await wait(1.5)
        func fullSendSay(_ step: String) {
            log.notice("\(step, privacy: .public) [fullSend] question: \(picker.probeAsk, privacy: .public) | under the list: \(picker.probeUnder ? "yes" : "no", privacy: .public) | over the popover: \(picker.presentedViewController.map { String(describing: type(of: $0)) } ?? "none", privacy: .public) | rows live: \(picker.probeRowsLive, privacy: .public) | picked: \(picked ?? "nothing", privacy: .public)")
        }
        picker.probePick("fullSend")
        await wait(1.2)
        fullSendSay("full send asked")
        picker.probeCancelAsk()
        await wait(1)
        fullSendSay("full send cancelled")
        picker.probePick("fullSend")
        await wait(1.2)
        picker.probePick("acceptEdits")
        await wait(1)
        fullSendSay("full send, another mode picked")
        picked = nil
        picker.probePick("fullSend")
        await wait(1.2)
        picker.probeConfirmAsk()
        await until(5) { picked != nil }
        await wait(0.5)
        fullSendSay("full send confirmed")
        picker.dismiss(animated: true)
        _ = shown
        await wait(1)

        // 7. Cancel a workflow run: under the run's head, naming the step running now.
        log.notice("ask-probe: start a run")
        // The run is found by its step: the session running it names its run.
        let stepRun = { hub.fleet.rows.first { $0.workflowRunId != nil && $0.status == .running }?.workflowRunId }
        guard await until(240, { stepRun() != nil }), let runId = stepRun() else {
            log.error("ask-probe: no workflow run came")
            return
        }
        let runRow = BoardRun.prefix + runId
        shell.openSession(runRow)
        let runViews = { controllers(WorkflowRunViewController.self, from: shell).filter { $0.view.window != nil } }
        guard await until(30, { runViews().first?.probeStatus.contains("running") == true }), let runView = runViews().first else {
            log.error("ask-probe: the run's page never showed it running")
            return
        }
        await wait(2)
        func runSay(_ step: String) {
            log.notice("\(step, privacy: .public) [\(runRow, privacy: .public)] question: \(runView.probeAsk, privacy: .public) | under its head: \(runView.probeUnder ? "yes" : "no", privacy: .public) | over the page: \(modal(shell), privacy: .public) | run: \(runView.probeStatus, privacy: .public)")
        }
        runView.probeAskCancel()
        await wait(1.2)
        runSay("workflow cancel asked")
        await holdingHub {
            runView.probeConfirm()
            await wait(1)
            runSay("workflow cancel in flight")
        }
        await until(60) { !runView.probeRunning }
        await until(30) { runView.probeStatus.contains("cancel") }
        await wait(2)
        runSay("workflow cancel answered")
    }
}
#endif
