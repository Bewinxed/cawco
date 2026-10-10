import CawCoCore
import CawCoDesign
import Observation
import UIKit

/// The one way into the New Session form, and the continuations it started
/// (Sidebar.svelte's single dialog mount over continue.svelte.ts): a new
/// session with a place filled in, or "Continue in new session" from any
/// session's menu. The hub carries each continuation to its end whatever
/// happens to the form; one whose form was closed while it runs is seen
/// through here: its new session opens once it starts, or a toast says why it
/// failed, with the way back into the same form.
@MainActor
final class NewSessionFlow {
    private let hub: HubConnection
    /// The controller the form is presented over, at the moment it opens.
    var presenter: () -> UIViewController? = { nil }
    /// Shows a session the form started.
    var open: (String) -> Void = { _ in }
    /// What a continuation's source is called, where the row carries no title of its own.
    var title: (String) -> String? = { _ in nil }

    private var detached: [String: (source: ContinueSource, draft: SessionDraft)] = [:]

    init(hub: HubConnection) {
        self.hub = hub
    }

    /// A new session, with what the caller already knows filled in.
    func start(machineId: String? = nil, cwd: String? = nil, projectId: String? = nil) {
        show(NewSessionViewController(hub: hub, machineId: machineId, cwd: cwd, projectId: projectId))
    }

    /// Continue in new session, by the id the hub knows the source by.
    func continueSession(_ id: String) {
        guard let row = hub.fleet.byId[id] else { return }
        let name = row.title.flatMap { $0.isEmpty ? nil : $0 } ?? title(id) ?? hub.fleet.title(row)
        continueSession(ContinueSource(instanceId: id, machineId: row.machineId, cwd: row.cwd, harness: row.harness ?? "claude",
                                       model: row.model, title: name))
    }

    func continueSession(_ source: ContinueSource, restore: SessionDraft? = nil) {
        show(NewSessionViewController(hub: hub, continuing: source, restore: restore))
    }

    private func show(_ form: NewSessionViewController) {
        guard let presenter = presenter(), !(presenter is NewSessionViewController) else { return }
        form.onOpen = { [weak self] id in self?.open(id) }
        form.onDetach = { [weak self] id, source, draft in
            self?.detached[id] = (source, draft)
            self?.settle()
        }
        presenter.present(form, animated: true)
    }

    /// Each detached continuation, as the hub's table moves.
    private func settle() {
        let table = withObservationTracking {
            hub.fleet.continuations
        } onChange: { [weak self] in
            Task { @MainActor in
                guard let self, !self.detached.isEmpty else { return }
                self.settle()
            }
        }
        for (id, entry) in detached {
            guard let job = table.first(where: { $0.id == id }) else { continue }
            switch job.stage {
            case .started:
                detached[id] = nil
                open(job.targetInstanceId)
            case .failed:
                detached[id] = nil
                // Kept until dismissed or used: it carries the form to recover with.
                Toast.show("Couldn't continue \"\(entry.source.title)\"", description: job.error, kind: .error,
                           action: .init("Reopen") { [weak self] in self?.continueSession(entry.source, restore: entry.draft) },
                           sticky: true, in: presenter()?.view)
            case .cancelled:
                detached[id] = nil
            case .starting, .summarising:
                break
            }
        }
    }
}
