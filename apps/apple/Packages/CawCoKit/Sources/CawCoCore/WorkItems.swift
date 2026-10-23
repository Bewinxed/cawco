public import CawCoAPI
import Foundation
import Observation
import OpenAPIRuntime

/// One delegate's work item as its parent's delegate tray reads it.
public typealias WorkItem = Components.Schemas.WorkItemSummary

/// One child a session's tray lists (client.svelte.ts `TrayChild`): a
/// delegate, by its work item, or a session it started with `start_session`,
/// which runs none. The chip and its panel read only this.
public struct TrayChild: Equatable, Sendable {
    public enum State: Sendable { case starting, running, done, failed, cancelled }

    /// Its chip's key: the work item's id, or the started session's own.
    public let id: String
    public let instanceId: String
    public let title: String
    public let state: State
    /// ms epoch.
    public let createdAt: Double
    public let endedAt: Double?
    public let dismissedAt: Double?
    /// Why it failed, first lines; "" when it has not, or said nothing.
    public let error: String
    /// The delegate's work item; nil on a started session.
    public let work: WorkItem?

    /// A session another one started with `start_session` (or a continuation
    /// of one): it names its starter and runs no work item, the one thing
    /// that tells it from a delegate.
    static func isStarted(_ row: InstanceRow) -> Bool {
        row.parentInstanceId != nil && row.workItemId == nil
    }

    init(item: WorkItem) {
        id = item.id
        instanceId = item.instanceId
        title = item.title
        state = switch item.state {
        case .starting: .starting
        case .done: .done
        case .failed: .failed
        case .cancelled: .cancelled
        default: .running
        }
        createdAt = item.createdAt
        endedAt = item.endedAt
        dismissedAt = item.dismissedAt
        error = item.firstLines.error
        work = item
    }

    /// A started session as its tray says it: what its turn is doing. It is
    /// persistent, so its "done" is a turn that ended (a later turn takes the
    /// chip back); stopped is "cancelled", and one that errored "failed",
    /// with no work item to dismiss.
    @MainActor
    init(session row: InstanceRow, hub: HubConnection) {
        let working = hub.needs.blocked(row.id) || row.status == .moving
            || hub.fleet.activityPulse(row.id).map { $0.activity == .working || $0.activity == .blocked } ?? false
        let state: State = switch row.status {
        case .starting: .starting
        case .error: .failed
        case .stopping, .stopped, .discarded: .cancelled
        default: working ? .running : .done
        }
        id = row.id
        instanceId = row.id
        title = hub.fleet.title(row)
        self.state = state
        createdAt = row.createdMs
        // A turn ends at its own time; a stop or a failure when the row last moved.
        let ended = state == .done && row.turnEndedMs > 0 ? row.turnEndedMs : row.updatedMs
        endedAt = state == .starting || state == .running ? nil : ended
        dismissedAt = nil
        error = state == .failed ? row.lastError ?? "" : ""
        work = nil
    }

    public static func == (a: TrayChild, b: TrayChild) -> Bool {
        a.id == b.id && a.title == b.title && a.state == b.state && a.endedAt == b.endedAt
            && a.dismissedAt == b.dismissedAt && a.error == b.error && a.work == b.work
    }
}

extension ParkedAsk {
    /// A string field of the tool input, as it came.
    private func text(_ key: String) -> String? {
        input.value[key].flatMap { $0 as? String }
    }

    /// present.ts `askShortOf`: the first question, else the tool and its most telling argument.
    public var short: String {
        if let first = questions.first { return "Q1: \(first.question)" }
        if let path = text("filepath") ?? text("filePath") ?? text("path") {
            return "\(toolName) \(path.split(separator: "/").last.map(String.init) ?? path)"
        }
        if let command { return "\(toolName) \(command.prefix(80))" }
        return toolName
    }

    /// present.ts `askDetailOf`: the questions, else the diff under its file,
    /// else the command, else what the hub says of it, its secrets hidden.
    public var detail: String {
        if !questions.isEmpty {
            return questions.enumerated().map { index, question in
                (["Q\(index + 1): \(question.question)"] + question.options.map { "- \($0.label)" }).joined(separator: "\n")
            }.joined(separator: "\n")
        }
        if let diff = text("diff") {
            let path = text("filepath") ?? text("filePath") ?? text("path")
            return (path.map { "\($0)\n\n" } ?? "") + diff
        }
        if let command { return command }
        return ([presentation.summary] + presentation.fields.map { "\($0.key): \($0.value)" }).joined(separator: "\n")
    }
}

/// The work items the hub has told this client of (client.svelte.ts
/// `workItems`): read once for each session a view opens
/// (`GET /api/work-items?parent=`), then kept current by `work_item` frames.
@MainActor @Observable
public final class WorkItemsStore {
    private var items: [String: WorkItem] = [:]
    @ObservationIgnored private unowned let hub: HubConnection
    @ObservationIgnored private var read: Set<String> = []

    init(hub: HubConnection) { self.hub = hub }

    /// What a session's tray lists, oldest first (client.svelte.ts `trayOf`):
    /// the work items it delegated that its tray knows of, and the sessions
    /// it started that run none (`TrayChild.isStarted`).
    public func tray(of instanceId: String) -> [TrayChild] {
        let delegated = items.values.filter { $0.parentInstanceId == instanceId }.map(TrayChild.init(item:))
        let started = hub.fleet.rows.filter { $0.parentInstanceId == instanceId && TrayChild.isStarted($0) }
            .map { TrayChild(session: $0, hub: hub) }
        return (delegated + started).sorted { $0.createdAt < $1.createdAt }
    }

    /// A delegate's or a started session's tray entry, by its instance id.
    public func child(for instanceId: String) -> TrayChild? {
        if let item = items.values.first(where: { $0.instanceId == instanceId }) { return TrayChild(item: item) }
        return hub.fleet.rows.first { $0.id == instanceId && TrayChild.isStarted($0) }.map { TrayChild(session: $0, hub: hub) }
    }

    /// The work items a view's delegate tray opens with. A failed read is asked again.
    public func load(parent instanceId: String) {
        guard !read.contains(instanceId) else { return }
        read.insert(instanceId)
        Task { [weak self] in
            guard let self else { return }
            guard let found = try? await hub.api.delegates.items(.init(query: .init(parent: instanceId))).ok.body.json else {
                read.remove(instanceId)
                return
            }
            // The tray is what the hub lists, nothing more: an item it no
            // longer lists (dismissed, or ended past the tray's hold) goes.
            let listed = Set(found.map(\.id))
            for (id, item) in items where item.parentInstanceId == instanceId && !listed.contains(id) {
                items[id] = nil
            }
            for item in found { items[item.id] = item }
        }
    }

    /// A new connection. The frames sent while this client was away (a chip
    /// dismissed on another screen, a delegate that failed or finished) never
    /// reached it, and the hub does not send them again: every tray it has
    /// read is read once more, and becomes what the hub lists now.
    func reconnected() {
        let parents = read
        read = []
        for parent in parents { load(parent: parent) }
    }

    func adopt(_ item: WorkItem) {
        items[item.id] = item
    }

    /// Takes a failed chip off its tray on every screen, with the reader's
    /// reason: the hub records both.
    public func dismiss(_ id: String, reason: String) async throws {
        let asked = Operations.PostApiWorkItemsByIdDismiss.Input(
            path: .init(id: id), body: .json(.init(value1: .init(reason: reason))))
        switch try await hub.api.delegates.dismiss(asked) {
        case let .ok(ok):
            adopt(try ok.body.json)
        case let .badRequest(answer):
            throw Refused(message: try await Self.said(answer.body.plainText, or: 400))
        case let .notFound(answer):
            throw Refused(message: try await Self.said(answer.body.plainText, or: 404))
        case let .conflict(answer):
            throw Refused(message: try await Self.said(answer.body.plainText, or: 409))
        case let .unprocessableContent(answer):
            throw Refused(message: (try? answer.body.applicationProblemJson).flatMap { Wire.words(problem: $0) }
                ?? "The hub answered 422, so the delegate was not dismissed.")
        case let .undocumented(statusCode, payload):
            throw Refused(message: await Wire.words(payload.body) ?? "The hub answered \(statusCode), so the delegate was not dismissed.")
        }
    }

    func reset() {
        items = [:]
        read = []
    }

    private struct Refused: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /// A refusal's words, as the hub said them, or its status when it said none.
    private static func said(_ body: HTTPBody, or status: Int) async throws -> String {
        let words = try await String(collecting: body, upTo: 64000)
        return words.isEmpty ? "The hub answered \(status), so the delegate was not dismissed." : words
    }
}
