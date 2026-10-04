public import CawCoAPI
import Foundation
import Observation

/// One delegate's work item as its parent's delegate tray reads it.
public typealias WorkItem = Components.Schemas.WorkItemSummary

extension ParkedAsk {
    /// present.ts `askShortOf`: the first question, else the tool and its most telling argument.
    public var short: String {
        if let first = questions.first { return "Q1: \(first.question)" }
        let fields = Dictionary(fields.map { ($0.key, $0.value) }, uniquingKeysWith: { first, _ in first })
        if let path = fields["filepath"] ?? fields["filePath"] ?? fields["path"] {
            return "\(toolName) \(path.split(separator: "/").last.map(String.init) ?? path)"
        }
        if let command { return "\(toolName) \(command.prefix(80))" }
        return toolName
    }

    /// present.ts `askDetailOf`: the questions, else the diff under its file,
    /// else the command, else the input as it came.
    public var detail: String {
        if !questions.isEmpty {
            return questions.enumerated().map { index, question in
                (["Q\(index + 1): \(question.question)"] + question.options.map { "- \($0.label)" }).joined(separator: "\n")
            }.joined(separator: "\n")
        }
        let fields = Dictionary(fields.map { ($0.key, $0.value) }, uniquingKeysWith: { first, _ in first })
        if let diff = fields["diff"] {
            let path = fields["filepath"] ?? fields["filePath"] ?? fields["path"]
            return (path.map { "\($0)\n\n" } ?? "") + diff
        }
        if let command { return command }
        return self.fields.map { "\($0.key): \($0.value)" }.joined(separator: "\n")
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

    /// The work items a session delegated that its tray knows of, oldest first.
    public func of(parent instanceId: String) -> [WorkItem] {
        items.values.filter { $0.parentInstanceId == instanceId }.sorted { $0.createdAt < $1.createdAt }
    }

    /// The work item a delegate session runs, when its parent's tray was told of it.
    public func item(for instanceId: String) -> WorkItem? {
        items.values.first { $0.instanceId == instanceId }
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
            for item in found { items[item.id] = item }
        }
    }

    func adopt(_ item: WorkItem) {
        items[item.id] = item
    }

    /// Takes a chip off its tray on every screen: the hub records the dismissal.
    public func dismiss(_ id: String) async throws {
        switch try await hub.api.delegates.dismiss(.init(path: .init(id: id))) {
        case let .ok(ok):
            adopt(try ok.body.json)
        case let .notFound(answer):
            let said = try await String(collecting: answer.body.plainText, upTo: 64000)
            throw Refused(message: said.isEmpty ? "The hub answered 404, so the delegate was not dismissed." : said)
        case let .undocumented(statusCode, _):
            throw Refused(message: "The hub answered \(statusCode), so the delegate was not dismissed.")
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
}
