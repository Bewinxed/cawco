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

    /// The session details card for `id` (SessionDetails.svelte), wired to
    /// this host: its Continue button, and the name its tab shows.
    func details(for id: String) -> SessionDetailsController {
        let details = SessionDetailsController(hub: hub, sessionId: id, title: detailsTitle(id), link: link(id))
        details.onContinue = { [weak self] id in self?.continueInNewSession(id) }
        details.onOpenMcp = { [weak self] in self?.onOpenMcp() }
        return details
    }

    func detailsTitle(_ id: String) -> String {
        hub.fleet.byId[id].map(hub.fleet.title) ?? title(id) ?? String(id.prefix(8))
    }

    /// The details' MCP count leads to the fleet's MCP configuration.
    var onOpenMcp: () -> Void = {}

    /// Session details as PaneTabs.svelte hosts them: the house sheet on its
    /// edge where a finger drives, the kit popover hung from the tab where a
    /// pointer does. A workflow run's tab is its own details: it has no card.
    func showDetails(_ id: String, from presenter: UIViewController?, source: UIView? = nil) {
        guard let presenter, BoardRun.runId(of: id) == nil else { return }
        let details = details(for: id)
        if presenter.traitCollection.horizontalSizeClass == .compact || source == nil {
            let sheet = HouseSheetController(details, style: .edge, scroller: details.scroller)
            details.onClose = { [weak sheet] in sheet?.dismiss(animated: true) }
            presenter.present(sheet, animated: true)
        } else if let source {
            let popover = SessionDetailsPopover(details)
            details.onClose = { [weak popover] in popover?.dismiss(animated: true) }
            KitPopover.present(popover, from: source, in: presenter)
        }
    }

    func continueInNewSession(_ id: String) {
        continueHandler?(id)
    }
}
