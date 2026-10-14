import CawCoCore
import CawCoDesign
import UIKit

/// A tab's screen that its group's one composer writes into: a session's,
/// and a Caw thread's.
@MainActor
protocol ComposerPane: UIViewController {
    var composerBinding: SessionComposerBinding { get }
    /// How far up from the pane's foot the group's composer reaches.
    var composerInset: CGFloat { get set }
    /// The transcript's share of the pane's width, beside a preview.
    var transcriptShare: CGFloat { get }
    var onTranscriptShare: () -> Void { get set }
    var restorationValues: [String: Any] { get }
    func restoreValues(_ values: [AnyHashable: Any])
    func close()
}

extension SessionViewController: ComposerPane {}

/// The conversations live on screen, and one swipe from it
/// (workspace/PaneHost.svelte): a group docks a screen, and a move, a split
/// or a change of layout hands the same controller to another group. A tab
/// its group lets go of is released: its subscription ends, and its draft
/// and scroll are kept here until it is built again.
@MainActor
final class PaneHost {
    private let hub: HubConnection
    private var built: [String: UIViewController] = [:]
    /// A released conversation's draft and scroll, for when it comes back.
    private var parked: [String: [String: Any]] = [:]
    /// A conversation's own back or close: its tab closes.
    var onReturnToFleet: (String) -> Void = { _ in }
    var onOpen: (String) -> Void = { _ in }
    /// A run's Edit workflow: its workflow's own page, on the Program tab.
    var onEditWorkflow: (String) -> Void = { _ in }
    /// Session details' "Continue in new session…", when that flow exists.
    var continueHandler: ((String) -> Void)?
    /// A thread's task card: the task's sheet over its project's page.
    var onOpenTask: (_ projectId: String, _ taskId: String) -> Void = { _, _ in }
    /// A thread's "Open the board": its project's page.
    var onOpenProject: (String) -> Void = { _ in }
    /// A thread's "Check machines": the machines card, from the button.
    var onCheckMachines: (UIView) -> Void = { _ in }
    /// A new thread's tab is the thread's now: the workspace re-addresses it.
    var onRetarget: (_ from: String, _ to: String) -> Void = { _, _ in }

    init(hub: HubConnection) {
        self.hub = hub
    }

    /// The group's composer gets its delegate tray: the active conversation's own delegates.
    func installTray(in dock: ComposerDock) {
        dock.installTray(hub: hub) { [weak self] id in self?.onOpen(id) }
    }

    func controller(for id: String) -> UIViewController {
        if let kept = built[id] { return kept }
        let made: UIViewController
        if let runId = BoardRun.runId(of: id) {
            let run = WorkflowRunViewController(hub: hub, runId: runId)
            run.onReturn = { [weak self] in self?.onReturnToFleet(id) }
            run.onOpen = { [weak self] id in self?.onOpen(id) }
            run.onEdit = { [weak self] id in self?.onEditWorkflow(id) }
            made = run
        } else if ThreadTabs.isThread(id) {
            let thread = ThreadViewController(hub: hub, id: id)
            thread.onReturnToFleet = { [weak self, weak thread] in self?.onReturnToFleet(thread?.viewId ?? id) }
            thread.onOpenSession = { [weak self] id in self?.onOpen(id) }
            thread.onOpenTask = { [weak self] projectId, taskId in self?.onOpenTask(projectId, taskId) }
            thread.onOpenProject = { [weak self] projectId in self?.onOpenProject(projectId) }
            thread.onCheckMachines = { [weak self] source in self?.onCheckMachines(source) }
            thread.onRetarget = { [weak self] from, to in self?.retarget(from, to: to) }
            if let values = parked.removeValue(forKey: id) { thread.restoreValues(values) }
            made = thread
        } else {
            let session = SessionViewController(hub: hub, id: id)
            session.onReturnToFleet = { [weak self] in self?.onReturnToFleet(id) }
            session.onOpenSession = { [weak self] id in self?.onOpen(id) }
            if let values = parked.removeValue(forKey: id) { session.restoreValues(values) }
            made = session
        }
        built[id] = made
        return made
    }

    /// A new thread's first message made it: the screen that wrote it is the
    /// thread's tab now, under the thread's id.
    private func retarget(_ from: String, to: String) {
        if let screen = built.removeValue(forKey: from) { built[to] = screen }
        onRetarget(from, to)
    }

    /// Ends what a closed tab held.
    func drop(_ id: String) {
        parked[id] = nil
        forgetName(id)
        (built.removeValue(forKey: id) as? ComposerPane)?.close()
    }

    /// A tab left its group's window: its subscription ends, and its draft
    /// and scroll wait here for it.
    func release(_ id: String) {
        guard let pane = built.removeValue(forKey: id) as? ComposerPane else {
            built[id] = nil
            return
        }
        parked[id] = pane.restorationValues
        pane.close()
    }

    /// The tab's screen when its group's composer writes into it.
    func pane(_ id: String) -> ComposerPane? { built[id] as? ComposerPane }

    /// Keeps only the conversations the workspace still holds.
    func keep(_ ids: Set<String>) {
        for id in built.keys where !ids.contains(id) { drop(id) }
        parked = parked.filter { ids.contains($0.key) }
        let names = names.filter { ids.contains($0.key) }
        if names.count != self.names.count {
            self.names = names
            saveNames()
        }
    }

    func session(_ id: String) -> SessionViewController? { built[id] as? SessionViewController }

    /// A restored scene's draft and scroll for `id`: given to its screen if
    /// that is built, else kept for when it is. The screen is built when its
    /// group first shows it, which is after the scene asks to restore it.
    func restore(_ values: [AnyHashable: Any], for id: String) {
        if let session = session(id) {
            session.restoreValues(values)
            return
        }
        parked[id] = Dictionary(uniqueKeysWithValues: values.compactMap { key, value in (key as? String).map { ($0, value) } })
    }

    /// What the group's composer draws for a tab: nil for a run, which has no
    /// composer, and for no tab at all.
    /// The composer a tab is drawn with: none while its project is moving
    /// for it (design 2b), as there is no session to write to yet.
    func binding(for id: String?) -> SessionComposerBinding? {
        guard let id, !hub.fleet.moving(id) else { return nil }
        let screen = controller(for: id)
        // A thread whose Caw cannot start now has no composer: a line says why in its place.
        if let thread = screen as? ThreadViewController { return thread.composes ? thread.composerBinding : nil }
        return (screen as? SessionViewController)?.composerBinding
    }

    /// A stored conversation's name, before its transcript has answered.
    func title(_ id: String) -> String? {
        for machine in hub.fleet.machines {
            if let title = hub.fleet.storedTitle(sessionKey: id, machineId: machine.machineId) { return title }
        }
        return nil
    }

    /// The link a copied tab carries: the hub serves the dashboard at the same address.
    func link(_ id: String) -> URL? {
        hub.address?.appendingPathComponent("session").appendingPathComponent(id)
    }

    /// The session details card for `id` (SessionDetails.svelte), wired to
    /// this host: its Continue button, and the name its tab shows.
    func details(for id: String) -> SessionDetailsController {
        let details = SessionDetailsController(hub: hub, sessionId: id, title: detailsTitle(id), link: link(id))
        details.onContinue = { [weak self] id in self?.continueInNewSession(id) }
        details.onOpenMcp = { [weak self] in self?.onOpenMcp() }
        return details
    }

    func detailsTitle(_ id: String) -> String {
        label(id)
    }

    // MARK: What a tab is called (session-name.ts, working-set.svelte.ts `titleOf`)

    private static let namesKey = "cawco-tab-names"
    /// What each open tab was last called by the fleet, kept across launches
    /// as the workspace's tabs are: a tab whose row is gone (a cancelled
    /// move's, which the hub drops) keeps the prompt's words, not its id.
    private var names = UserDefaults.standard.dictionary(forKey: PaneHost.namesKey) as? [String: String] ?? [:]

    /// The one name a tab, its details and its pane go by: the row's own
    /// title (remembered), else the name it last had, else its stored
    /// transcript's, else its row's folder, else who asked what is parked
    /// on it (an ask no row stands behind: a memory proposal), else its id.
    func label(_ id: String) -> String {
        // A thread not started yet (FolderMenu.svelte "New thread").
        if ThreadTabs.newProject(of: id) != nil { return "New thread" }
        let fleet = hub.fleet
        let row = fleet.byId[id]
        if let row, let title = row.title, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let name = fleet.title(row)
            if names[id] != name {
                names[id] = name
                saveNames()
            }
            return name
        }
        return names[id] ?? title(id) ?? row.map(fleet.title)
            ?? hub.needs.parked[id]?.lazy.compactMap(HomeModel.asker).first ?? String(id.prefix(8))
    }

    private func forgetName(_ id: String) {
        guard names.removeValue(forKey: id) != nil else { return }
        saveNames()
    }

    private func saveNames() {
        UserDefaults.standard.set(names, forKey: Self.namesKey)
    }

    /// The details' MCP count leads to the fleet's MCP configuration.
    var onOpenMcp: () -> Void = {}

    func continueInNewSession(_ id: String) {
        continueHandler?(id)
    }
}
