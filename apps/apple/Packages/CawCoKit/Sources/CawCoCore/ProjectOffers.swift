public import CawCoAPI
public import Foundation
import Observation

/// "Make this a project": the one offer a plain session gets when it outgrows itself (core `ProjectOfferSummary`).
public typealias ProjectOffer = Components.Schemas.ProjectOfferSummary
/// What "Create project" did: the project, the plan items it filed, and a new project's conversation.
public typealias ProjectOfferAccepted = Components.Schemas.AcceptResult
/// Where a project's design-system offer stands (core project-conversation.ts `DesignOfferState`).
public typealias DesignOffer = Components.Schemas.DesignOfferState

/// The "make this a project" offers standing on plain sessions, by session
/// (client.svelte.ts `projectOffers`): read with the fleet on connect, then
/// kept by `project_offer` frames. And an offer this device answered by
/// joining a project that already was (`projectJoins`): its card stays
/// where the offer stood, saying what it joined, until put away.
@MainActor
@Observable
public final class ProjectOffers {
    public private(set) var offers: [String: ProjectOffer] = [:]
    public private(set) var joins: [String: ProjectOfferAccepted] = [:]

    public init() {}

    /// The hub's whole list, as it holds it now.
    func replace(with read: [ProjectOffer]) {
        offers = Dictionary(read.map { ($0.instanceId, $0) }, uniquingKeysWith: { _, last in last })
    }

    /// A session's offer, or none once it was answered (anywhere).
    func adopt(_ instanceId: String, offer: ProjectOffer?) {
        offers[instanceId] = offer
    }

    /// Answered here: the offer leaves in the same change the join's card arrives, so the card turns, never blinks.
    func answered(_ instanceId: String, joined: ProjectOfferAccepted?) {
        if let joined { joins[instanceId] = joined }
        offers[instanceId] = nil
    }

    /// Puts away the card that said what an offer joined.
    public func dismissJoin(_ instanceId: String) {
        joins[instanceId] = nil
    }
}

public extension HubConnection {
    /// Answers a session's offer (client.svelte.ts `answerProjectOffer`).
    /// "Create project" makes (or joins, by remote) the project from the
    /// session's folder and moves the session and its delegates into it; a
    /// new project's conversation comes back, which sets it up.
    /// "Not now" is recorded, and the session is never offered again.
    @discardableResult
    func answerProjectOffer(_ instanceId: String, accept: Bool) async throws -> ProjectOfferAccepted? {
        guard let client else { throw TaskRefusal(message: "No hub is connected.") }
        guard accept else {
            let output = try await client.postApiProjectOffersByInstanceIdDismiss(path: .init(instanceId: instanceId))
            guard case .ok = output else { throw await TaskRefusal.reading(output) }
            offers.answered(instanceId, joined: nil)
            return nil
        }
        let output = try await client.postApiProjectOffersByInstanceIdAccept(path: .init(instanceId: instanceId))
        guard case let .ok(answer) = output else { throw await TaskRefusal.reading(output) }
        let accepted = try answer.body.json
        if accepted.conversation != nil {
            offers.answered(instanceId, joined: nil)
        } else {
            offers.answered(instanceId, joined: accepted)
        }
        readProjects()
        return accepted
    }

    /// Where a project's design-system offer stands (client.svelte.ts `readDesignOffer`).
    func designOffer(_ projectId: String) async throws -> DesignOffer {
        guard let client else { throw TaskRefusal(message: "No hub is connected.") }
        let output = try await client.getApiProjectsByIdDesignOffer(path: .init(id: projectId))
        guard case let .ok(answer) = output else { throw await TaskRefusal.reading(output) }
        return try answer.body.json
    }

    /// Answers it (client.svelte.ts `answerDesignOffer`): Build files the task,
    /// Not now records it; the offer as it stands after.
    func answerDesignOffer(_ projectId: String, build: Bool) async throws -> DesignOffer {
        guard let client else { throw TaskRefusal(message: "No hub is connected.") }
        if build {
            let output = try await client.postApiProjectsByIdDesignOfferBuild(path: .init(id: projectId))
            guard case let .ok(answer) = output else { throw await TaskRefusal.reading(output) }
            return try answer.body.json
        }
        let output = try await client.postApiProjectsByIdDesignOfferDismiss(path: .init(id: projectId))
        guard case let .ok(answer) = output else { throw await TaskRefusal.reading(output) }
        return try answer.body.json
    }
}
