import CawCoCore
import CawCoDesign
import Observation
import UIKit

/// The one way into the New Session form, and the continuations it started
/// (Sidebar.svelte's single dialog mount over continue.svelte.ts): a new
/// session with a place filled in, or "Continue in new session" from any
/// session's menu. The hub carries each continuation to its end whatever
/// happens to the form. One whose form was put away while it runs is seen
/// through on the row it was asked from (`HubConnection.acts`): "Continuing
/// in a new session…", then "Continued in a new session" with the new
/// session one menu item away, or the hub's reason why not. Asking to
/// continue that row again brings the form back as it was left.
@MainActor
final class NewSessionFlow {
    private let hub: HubConnection
    /// The controller the form is presented over, at the moment it opens.
    var presenter: () -> UIViewController? = { nil }
    /// Shows a session the form started.
    var open: (String) -> Void = { _ in }
    /// What a continuation's source is called, where the row carries no title of its own.
    var title: (String) -> String? = { _ in nil }

    /// Each continuation carried on without its form, by the hub's job id: the row it was asked from, and the form to recover with.
    private var detached: [String: (row: String, source: ContinueSource, draft: SessionDraft?)] = [:]
    /// What a refused continuation's form held, by its source row: the next ask to continue there starts from it.
    private var refused: [String: (source: ContinueSource, draft: SessionDraft?)] = [:]

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

    func continueSession(_ source: ContinueSource) {
        let row = sourceRow(source)
        let kept = refused.removeValue(forKey: row)
        if kept != nil { hub.acts.clear(row) }
        show(NewSessionViewController(hub: hub, continuing: kept?.source ?? source, restore: kept?.draft ?? nil))
    }

    /// The row a continuation was asked from: the hub's instance, or the stored session's conversation.
    private func sourceRow(_ source: ContinueSource) -> String {
        hub.fleet.byId[source.instanceId] != nil
            ? source.instanceId
            : hub.fleet.conversationId(sessionKey: source.instanceId, machineId: source.machineId, cwd: source.cwd)
    }

    private func show(_ form: NewSessionViewController) {
        guard let presenter = presenter(), !(presenter is NewSessionViewController) else { return }
        form.onOpen = { [weak self] id in self?.open(id) }
        form.onDetach = { [weak self] id, source, draft in self?.detach(id, source: source, draft: draft) }
        presenter.present(form, animated: true)
    }

    /// A continuation the hub carries on while its form is put away: followed on its source's row from here.
    func detach(_ id: String, source: ContinueSource, draft: SessionDraft?) {
        let row = sourceRow(source)
        detached[id] = (row, source, draft)
        hub.acts.begin(.continueOn, [row])
        settle()
    }

    /// Cancels the continuation detached from `row`, in any stage before its
    /// new session starts; the hub's table then says it cancelled, and the
    /// row clears. A refusal stays on the row in the hub's words.
    func cancelDetached(row: String) {
        guard let id = detached.first(where: { $0.value.row == row })?.key else { return }
        Task { [weak self] in
            guard let self else { return }
            do {
                try await hub.cancelContinuation(id: id)
            } catch {
                hub.acts.refuse(row, error.localizedDescription, status: hub.fleet.byId[row]?.status.rawValue)
            }
        }
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
                // The operator has moved on: the new session waits on its source's row, one item away.
                hub.acts.finish(entry.row, "Continued in a new session", opens: job.targetInstanceId)
            case .failed:
                detached[id] = nil
                // The reason on the row; continuing it again brings the form back as it was left.
                refused[entry.row] = (entry.source, entry.draft)
                hub.acts.refuse(entry.row, job.error ?? "", status: hub.fleet.byId[entry.row]?.status.rawValue)
            case .cancelled:
                detached[id] = nil
                hub.acts.clear(entry.row)
            case .filing, .starting, .summarising, .unrecognized:
                break
            }
        }
    }
}
