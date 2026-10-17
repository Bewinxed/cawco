public import CawCoAPI
import Foundation
import OpenAPIRuntime

public extension HubConnection {
    /// Your word on an approved action (client.svelte.ts `decideAction`).
    enum ActionDecision: Sendable {
        /// Run the exact call shown, named by its arguments' hash, so the hub refuses any other.
        case approve
        case deny
        /// Put a failed one, or one of unknown outcome, away once read.
        case checked
    }

    /// Says your decision on `action` to the hub. Nothing is optimistic: the
    /// card leaves when the hub's `actions` frame says so. A refusal is thrown
    /// in the hub's own sentence.
    func decide(_ action: ApprovedAction, _ decision: ActionDecision) async throws {
        guard let client else { throw TaskRefusal(message: "No hub is connected.") }
        switch decision {
        case .approve:
            let output = try await client.postApiActionsByIdApprove(path: .init(id: action.id), body: .json(.init(argsHash: action.argsHash)))
            guard case .ok = output else { throw await TaskRefusal.reading(output) }
        case .deny:
            let output = try await client.postApiActionsByIdDeny(path: .init(id: action.id))
            guard case .ok = output else { throw await TaskRefusal.reading(output) }
        case .checked:
            let output = try await client.postApiActionsByIdChecked(path: .init(id: action.id))
            guard case .ok = output else { throw await TaskRefusal.reading(output) }
        }
    }
}
