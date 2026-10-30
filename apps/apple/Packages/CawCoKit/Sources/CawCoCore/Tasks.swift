public import Foundation
import Observation
import os

/// One step of a session's plan (core plan.ts `PlanStep`): an ACP plan entry with its nesting depth.
public struct PlanStep: Sendable, Equatable {
    public let id: String
    public let content: String
    /// Nesting by indent: 0 for a top-level step, one more than its parent's for a sub-step.
    public let depth: Int
    /// `pending`, `in_progress` or `completed`.
    public let status: String
}

/// One to-do of a task attempt's task (core plan.ts `TaskTodo`), nested and ticked as its file has them.
public struct PlanTodo: Sendable, Equatable {
    /// Its marker (`td-3`), else its position (`2.1`): stable within the list.
    public let id: String
    public let text: String
    public let depth: Int
    public let done: Bool
}

/// A session's plan as the hub keeps it (core plan.ts `SessionPlan`,
/// `GET /api/instances/:id/plan` and the live frames): its steps, its spec
/// (the session's own document, read-only), and on a task attempt the
/// task's to-dos.
public struct SessionPlan: Sendable, Equatable {
    public let steps: [PlanStep]
    /// The spec's Markdown, once the session has written one.
    public let spec: String?
    /// On a task attempt: the task.
    public let taskId: String?
    /// On a task attempt: the task's to-dos.
    public let todos: [PlanTodo]

    init(_ raw: [String: Any]) {
        steps = (raw["steps"] as? [[String: Any]] ?? []).enumerated().map { index, step in
            PlanStep(id: step["id"] as? String ?? "\(index)", content: step["content"] as? String ?? "",
                     depth: (step["depth"] as? NSNumber)?.intValue ?? 0, status: step["status"] as? String ?? "pending")
        }
        todos = (raw["todos"] as? [[String: Any]] ?? []).enumerated().map { index, todo in
            PlanTodo(id: todo["id"] as? String ?? todo["path"] as? String ?? "\(index)", text: todo["text"] as? String ?? "",
                     depth: (todo["depth"] as? NSNumber)?.intValue ?? 0, done: todo["done"] as? Bool == true)
        }
        spec = (raw["spec"] as? [String: Any])?["markdown"] as? String
        taskId = raw["taskId"] as? String
    }

    /// How far it has got: its steps, else its task's to-dos (PlanPane.svelte `planProgress`).
    public var progress: (done: Int, total: Int) {
        steps.isEmpty
            ? (todos.count { $0.done }, todos.count)
            : (steps.count { $0.status == "completed" }, steps.count)
    }

    /// It has something to show: steps, a spec, or a task's to-dos (PlanPane.svelte `planShows`).
    public var shows: Bool { !steps.isEmpty || spec != nil || !todos.isEmpty }

    /// The task's to-dos are shown: an attempt's, with its task named (PlanPane.svelte `showsTodos`).
    public var showsTodos: Bool { !todos.isEmpty && taskId != nil }

    /// Only a task's to-dos, no steps or spec: the panel is titled by them (PlanPane.svelte `onlyTodos`).
    public var onlyTodos: Bool { steps.isEmpty && spec == nil && !todos.isEmpty }
}

/// The plans this device follows (client.svelte.ts `watchPlan`, core
/// plan.ts): a session's screen and its peek.
/// `plan.follow` names them, the hub answers each new one with its
/// `plan.snapshot` (what `GET /api/instances/:id/plan` reads), then
/// `plan.delta`s, RFC 6902 patches applied in sequence; a gap asks it
/// whole (`plan.resync`).
@MainActor
@Observable
public final class PlanFollows {
    public private(set) var plans: [String: SessionPlan] = [:]
    @ObservationIgnored private var held: [String: (rev: Int, raw: [String: Any])] = [:]
    @ObservationIgnored private var readers: [String: Int] = [:]
    @ObservationIgnored private var sent: [String]?
    @ObservationIgnored var post: (Data) -> Bool = { _ in false }
    private let log = Logger(subsystem: "dev.cawco.app", category: "Plan")

    /// One more reader of a session's plan; it stays followed while any remains.
    public func follow(_ instanceId: String) {
        readers[instanceId, default: 0] += 1
        sync()
    }

    /// A reader let go; the last one stops following it.
    public func unfollow(_ instanceId: String) {
        guard let count = readers[instanceId] else { return }
        if count > 1 {
            readers[instanceId] = count - 1
            return
        }
        readers[instanceId] = nil
        held[instanceId] = nil
        plans[instanceId] = nil
        sync()
    }

    /// The socket opened: the hub follows nothing for it yet.
    func reconnected() {
        sent = nil
        held = [:]
        sync()
    }

    private func sync() {
        let ids = readers.keys.sorted()
        guard ids != sent else { return }
        let message: [String: Any] = ["type": "plan.follow", "instanceIds": ids]
        guard let data = try? JSONSerialization.data(withJSONObject: message), post(data) else { return }
        sent = ids
    }

    /// A `plan.snapshot` or `plan.delta` off the socket.
    func take(_ data: Data) {
        guard let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = raw["instanceId"] as? String, readers[id] != nil,
              let rev = (raw["rev"] as? NSNumber)?.intValue else { return }
        switch raw["type"] as? String {
        case "plan.snapshot":
            held[id] = (rev, raw)
        case "plan.delta":
            // Already held (a snapshot that crossed it): nothing to apply.
            if let before = held[id], rev <= before.rev { return }
            // A gap, or a patch that does not apply: the hub sends it whole.
            guard let before = held[id], before.rev == rev - 1, let patch = raw["patch"] as? [[String: Any]],
                  let after = JSONPatch.apply(patch, to: before.raw) else {
                let resync: [String: Any] = ["type": "plan.resync", "instanceId": id]
                if let ask = try? JSONSerialization.data(withJSONObject: resync) { _ = post(ask) }
                log.notice("plan \(id.prefix(8), privacy: .public) delta \(rev, privacy: .public) not applied: asked whole")
                return
            }
            held[id] = (rev, after)
        default:
            return
        }
        guard let now = held[id] else { return }
        let plan = SessionPlan(now.raw)
        if plans[id] != plan { plans[id] = plan }
        #if DEBUG
        let steps = plan.steps.map { "\($0.id):\($0.depth):\($0.status)" }.joined(separator: ",")
        let todos = plan.todos.map { "\($0.id):\($0.depth):\($0.done ? "done" : "open")" }.joined(separator: ",")
        log.notice("plan \(id, privacy: .public) rev=\(now.rev, privacy: .public) steps=\(steps, privacy: .public) spec=\(plan.spec?.count ?? 0, privacy: .public) task=\(plan.taskId ?? "-", privacy: .public) todos=\(todos, privacy: .public)")
        #endif
    }
}
