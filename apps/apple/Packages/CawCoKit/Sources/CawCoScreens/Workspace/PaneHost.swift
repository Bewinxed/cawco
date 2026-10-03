import CawCoCore
import CawCoDesign
import UIKit

/// Every open conversation's screen, built once and kept
/// (workspace/PaneHost.svelte): a group docks it, and a move, a split or a
/// change of layout hands the same controller to another group, so a
/// transcript is never rebuilt and its scroll and draft go with it.
@MainActor
final class PaneHost {
    private let hub: HubConnection
    private var built: [String: UIViewController] = [:]
    /// A conversation's own back or close: its tab closes.
    var onReturnToFleet: (String) -> Void = { _ in }
    var onOpen: (String) -> Void = { _ in }
    /// Session details' "Continue in new session…", when that flow exists.
    var continueHandler: ((String) -> Void)?

    init(hub: HubConnection) {
        self.hub = hub
    }

    func controller(for id: String) -> UIViewController {
        if let kept = built[id] { return kept }
        let made: UIViewController
        if let runId = BoardRun.runId(of: id) {
            let run = WorkflowRunViewController(hub: hub, runId: runId)
            run.onReturn = { [weak self] in self?.onReturnToFleet(id) }
            run.onOpen = { [weak self] id in self?.onOpen(id) }
            made = run
        } else {
            let session = SessionViewController(hub: hub, id: id)
            session.onReturnToFleet = { [weak self] in self?.onReturnToFleet(id) }
            session.onOpenSession = { [weak self] id in self?.onOpen(id) }
            made = session
        }
        built[id] = made
        return made
    }

    /// Ends what a closed tab held.
    func drop(_ id: String) {
        (built.removeValue(forKey: id) as? SessionViewController)?.close()
    }

    /// Keeps only the conversations the workspace still holds.
    func keep(_ ids: Set<String>) {
        for id in built.keys where !ids.contains(id) { drop(id) }
    }

    func session(_ id: String) -> SessionViewController? { built[id] as? SessionViewController }

    /// What the group's composer draws for a tab: nil for a run, which has no
    /// composer, and for no tab at all.
    func binding(for id: String?) -> SessionComposerBinding? {
        id.flatMap { (controller(for: $0) as? SessionViewController)?.composerBinding }
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

    /// Session details in the house sheet on its edge (PaneTabs.svelte's drawer).
    func showDetails(_ id: String, from presenter: UIViewController?) {
        guard let presenter, BoardRun.runId(of: id) == nil else { return }
        let fleet = hub.fleet
        let row = fleet.byId[id]
        let title = row.map(fleet.title) ?? self.title(id) ?? String(id.prefix(8))
        let details = SessionIdentityController(
            title: title,
            face: face(row, id),
            host: row.map { fleet.machineName($0.machineId) } ?? "",
            cwd: row?.cwd ?? ""
        )
        presenter.present(HouseSheetController(details, style: .edge), animated: true)
    }

    func continueInNewSession(_ id: String) {
        continueHandler?(id)
    }

    private func face(_ row: InstanceRow?, _ id: String) -> SessionStatusView.Face {
        guard let row else { return .stored }
        if row.isFailed { return .failed }
        if row.isStale || hub.state != .connected { return .unreachable }
        if row.status == .sleeping { return .sleeping }
        if row.status == .stopped { return .stopped }
        if hub.needs.blocked(id) { return .needsYou }
        return .idle
    }
}
