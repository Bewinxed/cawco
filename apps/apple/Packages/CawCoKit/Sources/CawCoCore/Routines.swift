public import CawCoAPI
public import Foundation
import Observation

// A project's routines page as the hub holds it, read together
// (routines/routines-api.ts): its routines with their newest runs, what
// fires them (its event routes, connector polls and the repository's GitHub
// poller), its relays, and the actions its sessions proposed. A row's
// actions are the hub's routine routes; a refusal is thrown in the hub's
// own sentence.

public typealias Routine = Components.Schemas.RoutineView
public typealias RoutineRun = Components.Schemas.RoutineRunView
public typealias EventRoute = Components.Schemas.EventRouteView
public typealias Relay = Components.Schemas.RelayView

/// A source read on a schedule: a connector poll, or the repository's GitHub poller (`Poll`).
public struct RoutinePoll: Equatable, Sendable {
    public let id: String
    /// The service it reads, as a provider mark names it.
    public let service: String
    /// The tool it calls, for a connector poll; nil for the GitHub poller.
    public let tool: String?
    /// What it reads, in the owner's words: its connection's name, or the repository.
    public let what: String
    /// How often it is read, in seconds; nil when the hub sets it.
    public let everyS: Double?
    public let polledAt: Double?
    /// Why its last read failed; nil while it reads.
    public let failure: String?
}

/// A route that sends a service's events to a routine, with the service its source is.
public struct RoutineRoute: Equatable, Sendable {
    public let route: EventRoute
    /// The service its source is, as a provider mark names it (lower case).
    public let service: String
}

/// The page, each part as the hub answered it (`RoutinesPage`).
public struct RoutinesPage: Sendable {
    public let routines: [Routine]
    public let routes: [RoutineRoute]
    public let polls: [RoutinePoll]
    public let relays: [Relay]
    public let actions: [ApprovedAction]
}

public extension ProjectTasks {
    /// The project's routines page, each part read at once (`readRoutinesPage`).
    func routinesPage() async throws -> RoutinesPage {
        async let routinesRead = client.getApiRoutines(query: .init(projectId: projectId))
        async let ingressRead = client.getApiProjectsByIdIngress(path: .init(id: projectId))
        async let relaysRead = client.getApiProjectsByIdRelays(path: .init(id: projectId))
        async let actionsRead = client.getApiActions(query: .init(projectId: projectId))
        async let connectionsRead = client.getApiConnections()
        let (routinesOut, ingressOut, relaysOut, actionsOut, connectionsOut) =
            try await (routinesRead, ingressRead, relaysRead, actionsRead, connectionsRead)
        guard case let .ok(routines) = routinesOut else { throw await TaskRefusal.reading(routinesOut) }
        guard case let .ok(ingressAnswer) = ingressOut else { throw await TaskRefusal.reading(ingressOut) }
        guard case let .ok(relays) = relaysOut else { throw await TaskRefusal.reading(relaysOut) }
        guard case let .ok(actions) = actionsOut else { throw await TaskRefusal.reading(actionsOut) }
        guard case let .ok(connections) = connectionsOut else { throw await TaskRefusal.reading(connectionsOut) }
        let ingress = try ingressAnswer.body.json
        /// Each connection by its name: what polls and `conn:` sources name it by.
        let connectionOf = Dictionary(try connections.body.json.connections.map { ($0.name, $0) }, uniquingKeysWith: { first, _ in first })
        var polls = ingress.connectorPolls.filter(\.enabled).map { poll in
            RoutinePoll(id: poll.id, service: connectionOf[poll.connection]?.service ?? poll.connection, tool: poll.tool,
                        what: connectionOf[poll.connection]?.name ?? poll.connection, everyS: poll.intervalS,
                        polledAt: poll.polledAt, failure: poll.reason)
        }
        /// A route's source (`github:<repo>`, `conn:<connection>:<tool>`) as its service.
        let serviceOf = { (source: String) -> String in
            let parts = source.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
            let kind = parts.first ?? "", name = parts.count > 1 ? parts[1] : ""
            return (kind == "conn" ? connectionOf[name]?.service ?? name : kind).lowercased()
        }
        let github = ingress.github
        if github.connection != nil {
            polls.insert(RoutinePoll(id: "github", service: "github", tool: nil, what: github.repo ?? Words.Routines.theRepository,
                                     everyS: nil, polledAt: github.polledAt, failure: github.polled ? nil : github.state), at: 0)
        }
        return RoutinesPage(
            routines: try routines.body.json,
            routes: ingress.routes.filter(\.enabled).map { RoutineRoute(route: $0, service: serviceOf($0.source)) },
            polls: polls,
            relays: try relays.body.json,
            actions: try actions.body.json.actions
        )
    }

    /// Pauses or resumes a routine, or keeps one past its days (`updateRoutine`).
    func updateRoutine(_ id: String, enabled: Bool? = nil, keep: Bool? = nil) async throws {
        let output = try await client.patchApiRoutinesById(path: .init(id: id), body: .json(.init(enabled: enabled, keep: keep)))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
    }

    /// Runs a routine now, beside its schedule (`runRoutineNow`): the run the hub started.
    @discardableResult
    func runRoutineNow(_ id: String) async throws -> RoutineRun {
        let output = try await client.postApiRoutinesByIdRun(path: .init(id: id))
        if case let .ok(ok) = output { return try ok.body.json }
        throw await TaskRefusal.reading(output)
    }

    /// Deletes a routine; its past runs stay in the project's history (`deleteRoutine`).
    func deleteRoutine(_ id: String) async throws {
        let output = try await client.deleteApiRoutinesById(path: .init(id: id))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
    }

    /// A starter pressed into a composer went, as it stood or changed
    /// (`tellStarterOutcome`): Jev's steering, told without a wait.
    func tellStarterOutcome(picked: Bool, place: Components.Schemas.StarterPlace, text: String) async throws {
        guard let wirePlace = Operations.PostApiProjectsByIdStartersOutcome.Input.Body.JsonPayload.PlacePayload(rawValue: place.rawValue) else { return }
        let output = try await client.postApiProjectsByIdStartersOutcome(path: .init(id: projectId),
            body: .json(.init(place: wirePlace, text: text, outcome: picked ? .picked : .edited)))
        guard case .ok = output else { throw await TaskRefusal.reading(output) }
    }
}

/// A project's routines page as its tab holds it (ViewRoutines.svelte): read
/// on arrival and on every reconnect, again when the project's threads move
/// (a run notes its slot and its result in one) or the actions waiting on
/// you change, when the app comes back, after each of its own row actions,
/// and every few seconds while a run goes (a delegate's run notes it in no
/// thread). Only the newest read's answer is kept.
@MainActor
@Observable
public final class ProjectRoutines {
    public let projectId: String
    @ObservationIgnored private let hub: HubConnection

    /// The page as the hub last answered it; nil until the first read lands.
    public private(set) var page: RoutinesPage?
    /// Why the last read failed, while nothing has been read.
    public private(set) var problem: String?

    @ObservationIgnored private var reads = 0
    @ObservationIgnored private var seen: String
    @ObservationIgnored private var wasConnected: Bool
    @ObservationIgnored private var ticking: Task<Void, Never>?
    /// While a run goes its end is read every few seconds.
    private static let runRead: Duration = .seconds(5)

    public init(hub: HubConnection, projectId: String) {
        self.hub = hub
        self.projectId = projectId
        seen = ""
        wasConnected = hub.state == .connected
        seen = moved
        watch()
    }

    /// What moving means for the page: its threads, and the waiting actions' states.
    private var moved: String {
        "\(hub.threadsMoved[projectId] ?? 0)|\(hub.fleet.actions.map { "\($0.id):\($0.state.rawValue)" }.joined(separator: ","))"
    }

    public func read() async {
        reads += 1
        let ticket = reads
        do {
            let next = try await ProjectTasks(hub: hub, projectId: projectId).routinesPage()
            guard ticket == reads else { return }
            page = next
            problem = nil
        } catch {
            guard ticket == reads else { return }
            problem = error.localizedDescription
        }
        tick()
    }

    /// A row action, as the hub answers it: the page is read again after;
    /// a refusal is thrown in the hub's own sentence.
    public func act(_ work: (ProjectTasks) async throws -> Void) async throws {
        defer { Task { await read() } }
        try await work(ProjectTasks(hub: hub, projectId: projectId))
    }

    /// Its newest run is going now: starting or running.
    public static func going(_ routine: Routine) -> Bool {
        routine.runs.first.map { $0.state == .starting || $0.state == .running } ?? false
    }

    public static func queued(_ routine: Routine) -> Bool {
        routine.runs.first?.state == .queued
    }

    /// Reads every few seconds while a run goes or waits its turn.
    private func tick() {
        let going = page?.routines.contains { Self.going($0) || Self.queued($0) } ?? false
        guard going else {
            ticking?.cancel()
            ticking = nil
            return
        }
        guard ticking == nil else { return }
        ticking = Task { [weak self] in
            try? await Task.sleep(for: Self.runRead)
            guard !Task.isCancelled, let self else { return }
            ticking = nil
            await read()
        }
    }

    private func watch() {
        withObservationTracking {
            _ = moved
            _ = hub.state
        } onChange: { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let now = moved
                let connected = hub.state == .connected
                let reread = now != seen || (connected && !wasConnected)
                seen = now
                wasConnected = connected
                if connected, reread { Task { await self.read() } }
                watch()
            }
        }
    }
}
