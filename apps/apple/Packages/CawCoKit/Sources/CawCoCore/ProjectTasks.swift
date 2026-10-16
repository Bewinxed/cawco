public import CawCoAPI
public import Foundation
import OpenAPIRuntime

// A project's tasks and stages as the hub serves them under
// `/api/projects/:id/tasks` and `/stages` (the dashboard's
// project-tasks.ts). Every write answers with the task as the hub wrote it
// back; a refusal is the hub's own sentence, thrown whole so the sheet says
// it beside what it refused.

public typealias TaskView = Components.Schemas.TaskView
public typealias TaskSummary = Components.Schemas.TaskSummary
public typealias TaskTodo = Components.Schemas.TaskTodo
public typealias TaskAttempt = Components.Schemas.TaskAttempt
/// What a task's newest finished attempt handed back: its session's report (the hub's `TaskResult`).
public typealias TaskResult = Components.Schemas.TaskResult
public typealias StagesView = Components.Schemas.StagesView
public typealias TaskList = Components.Schemas.TaskList
public typealias TaskStage = Components.Schemas.Stage
public typealias StagesTemplateView = Components.Schemas.StagesTemplateView
/// A project's custom view (`views/<name>.oui`, a draft under `views/drafts/`).
public typealias ProjectView = Components.Schemas.ProjectView

/// The hub's refusal, in its own words (`said` in project-tasks.ts).
public struct TaskRefusal: Error, LocalizedError {
    public let message: String
    public var errorDescription: String? { message }

    public init(message: String) {
        self.message = message
    }

    /// The sentence a non-OK answer carries: every error response here is
    /// `text/plain`, found in whichever case the operation's output took.
    public static func reading(_ output: some Sendable) async -> TaskRefusal {
        guard let body = Self.body(in: output),
              let raw = try? await String(collecting: body, upTo: 64_000)
        else { return TaskRefusal(message: "The hub could not be reached. Try again.") }
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        // Elysia refuses with a bare string; JSON only when something else went wrong.
        if let data = text.data(using: .utf8), let parsed = try? JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed) {
            if let sentence = parsed as? String { return TaskRefusal(message: sentence) }
            if let object = parsed as? [String: Any], let message = object["message"] { return TaskRefusal(message: "\(message)") }
        }
        return TaskRefusal(message: text.isEmpty ? "The hub refused. Try again." : text)
    }

    private static func body(in value: Any) -> HTTPBody? {
        if let body = value as? HTTPBody { return body }
        for child in Mirror(reflecting: value).children {
            if let found = body(in: child.value) { return found }
        }
        return nil
    }
}

/// One project's task operations through the generated client.
public struct ProjectTasks: Sendable {
    let client: Client
    /// The hub's address, for the one route read raw (`readOutput`).
    let address: URL?
    public let projectId: String

    @MainActor
    public init(hub: HubConnection, projectId: String) throws {
        guard let client = hub.client else { throw TaskRefusal(message: "No hub is connected.") }
        self.client = client
        address = hub.address
        self.projectId = projectId
    }

    public func read(_ taskId: String) async throws -> TaskView {
        let output = try await client.getApiProjectsByIdTasksByTaskId(path: .init(id: projectId, taskId: taskId))
        if case let .ok(ok) = output { return try ok.body.json }
        throw await TaskRefusal.reading(output)
    }

    /// The project's tasks with what in their files could not be read.
    public func list() async throws -> TaskList {
        let output = try await client.getApiProjectsByIdTasks(path: .init(id: projectId))
        if case let .ok(ok) = output { return try ok.body.json }
        throw await TaskRefusal.reading(output)
    }

    /// A new task, titled, in `stage` (NewTaskForm: the board's column, or the stage picked).
    public func create(title: String, stage: String) async throws -> TaskView {
        let output = try await client.postApiProjectsByIdTasks(path: .init(id: projectId), body: .json(.init(title: title, stage: stage)))
        if case let .ok(ok) = output { return try ok.body.json }
        throw await TaskRefusal.reading(output)
    }

    /// The hub's sets of stages to pick from (StagesControl).
    public func templates() async throws -> [StagesTemplateView] {
        let output = try await client.getApiStageTemplates()
        if case let .ok(ok) = output { return try ok.body.json }
        throw await TaskRefusal.reading(output)
    }

    /// Writes the template's stages.md into the project folder; answers with
    /// the project's stages now, and the tasks whose stage the set lacks.
    public func applyTemplate(_ template: Components.Schemas.StagesTemplate) async throws -> (stages: StagesView, stranded: [String]) {
        // A template a newer hub lists that this app's contract cannot send.
        guard let named = Operations.PostApiProjectsByIdStagesTemplate.Input.Body.JsonPayload.TemplatePayload(rawValue: template.rawValue) else {
            throw TaskRefusal(message: "This app can't apply the \(template.rawValue) stages. Update the app from TestFlight.")
        }
        let output = try await client.postApiProjectsByIdStagesTemplate(path: .init(id: projectId), body: .json(.init(template: named)))
        if case let .ok(ok) = output {
            let answer = try ok.body.json
            return (answer.value1, answer.value2.stranded)
        }
        throw await TaskRefusal.reading(output)
    }

    public func stages() async throws -> StagesView {
        let output = try await client.getApiProjectsByIdStages(path: .init(id: projectId))
        if case let .ok(ok) = output { return try ok.body.json }
        throw await TaskRefusal.reading(output)
    }

    public func update(_ taskId: String, title: String? = nil, description: String? = nil, acceptance: String? = nil) async throws -> TaskView {
        let output = try await client.patchApiProjectsByIdTasksByTaskId(path: .init(id: projectId, taskId: taskId),
            body: .json(.init(title: title, description: description, acceptance: acceptance)))
        if case let .ok(ok) = output { return try ok.body.json }
        throw await TaskRefusal.reading(output)
    }

    public func move(_ taskId: String, to stage: String) async throws -> TaskView {
        let output = try await client.postApiProjectsByIdTasksByTaskIdStage(path: .init(id: projectId, taskId: taskId), body: .json(.init(stage: stage)))
        if case let .ok(ok) = output { return try ok.body.json }
        throw await TaskRefusal.reading(output)
    }

    /// The two edges the sheet sets: what a task waits on, and its parent.
    public enum Edge: Sendable { case after, parent }

    public func link(_ taskId: String, edge: Edge, to: String, remove: Bool = false) async throws -> TaskView {
        let output = try await client.postApiProjectsByIdTasksByTaskIdLinks(path: .init(id: projectId, taskId: taskId),
            body: .json(.init(edge: edge == .after ? .after : .parent, to: to, remove: remove)))
        if case let .ok(ok) = output { return try ok.body.json }
        throw await TaskRefusal.reading(output)
    }

    public func addTodo(_ taskId: String, text: String, under: String?) async throws -> TaskView {
        let output = try await client.postApiProjectsByIdTasksByTaskIdTodos(path: .init(id: projectId, taskId: taskId), body: .json(.init(text: text, under: under)))
        if case let .ok(ok) = output { return try ok.body.json }
        throw await TaskRefusal.reading(output)
    }

    /// Ticks, unticks or rewords one to-do, named by id (`td-3`) or position (`2.1`).
    public func changeTodo(_ taskId: String, todo: String, done: Bool? = nil, text: String? = nil) async throws -> TaskView {
        let output = try await client.patchApiProjectsByIdTasksByTaskIdTodosByTodo(path: .init(id: projectId, taskId: taskId, todo: todo),
            body: .json(.init(done: done, text: text)))
        if case let .ok(ok) = output { return try ok.body.json }
        throw await TaskRefusal.reading(output)
    }

    /// The project's views (client.svelte.ts `viewsOf`): kept ones, then Caw's drafts.
    public func views() async throws -> [ProjectView] {
        let output = try await client.getApiProjectsByIdViews(path: .init(id: projectId))
        if case let .ok(ok) = output { return try ok.body.json }
        throw await TaskRefusal.reading(output)
    }

    /// Keeps a draft (`keepView`): it becomes `views/<name>.oui`, one commit.
    public func keepView(_ name: String) async throws -> ProjectView {
        let output = try await client.postApiProjectsByIdViewsByNameKeep(path: .init(id: projectId, name: name))
        if case let .ok(ok) = output { return try ok.body.json }
        throw await TaskRefusal.reading(output)
    }

    /// Discards a draft (`discardView`): its file is deleted, one commit.
    public func discardView(_ name: String) async throws {
        let output = try await client.deleteApiProjectsByIdViewsDraftsByName(path: .init(id: projectId, name: name))
        if case .ok = output { return }
        throw await TaskRefusal.reading(output)
    }

    /// A fresh attempt at a task whose last one failed or was stopped, in that
    /// attempt's workspace (`retryTask`); it reports to the project's lead.
    public func retry(_ taskId: String) async throws {
        let output = try await client.postApiProjectsByIdTasksByTaskIdRetry(path: .init(id: projectId, taskId: taskId), body: .json(.init()))
        if case .ok = output { return }
        throw await TaskRefusal.reading(output)
    }

    /// A fresh attempt at a task whose last one finished (`startAttempt`); it reports to the project's lead.
    public func startAttempt(_ taskId: String) async throws {
        let output = try await client.postApiProjectsByIdTasksByTaskIdAttempts(path: .init(id: projectId, taskId: taskId), body: .json(.init()))
        if case .ok = output { return }
        throw await TaskRefusal.reading(output)
    }

    /// One output an attempt handed in, whole, by the name the task file gives
    /// it (`readOutput`): a picture's bytes, anything else's text, with the
    /// type the hub served it as. Read raw rather than through the generated
    /// client: the hub answers in the output's own type (`image/png`,
    /// `text/plain`), which the contract's one `application/octet-stream`
    /// would refuse. A refusal is the hub's sentence.
    public func readOutput(_ taskId: String, name: String) async throws -> (data: Data, type: String) {
        guard let address else { throw TaskRefusal(message: "No hub is connected.") }
        var url = address.appending(path: "api/projects").appending(path: projectId).appending(path: "tasks")
            .appending(path: taskId).appending(path: "outputs/file")
        url.append(queryItems: [URLQueryItem(name: "name", value: name)])
        let (data, response) = try await URLSession.shared.data(from: url)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw TaskRefusal(message: Wire.words(data) ?? Wire.reason(data, status: status)) }
        return (data, (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type") ?? "")
    }
}

// MARK: What the views say (project-tasks.ts)

public enum TaskWords {
    /// `ready` → `Ready`, `follow_up` → `Follow up`.
    public static func stage(_ name: String) -> String {
        let words = name.replacing(#/[-_]+/#, with: " ").trimmingCharacters(in: .whitespaces)
        guard let first = words.first else { return "No stage" }
        return first.uppercased() + words.dropFirst()
    }

    /// A span of time in plain words (`spanWords`): `40 s`, `12 min`, `2 h 5 min`.
    public static func span(_ ms: Double) -> String {
        let seconds = Int(max(0, (ms / 1000).rounded()))
        if seconds < 60 { return "\(seconds) s" }
        let minutes = Int((Double(seconds) / 60).rounded())
        if minutes < 60 { return "\(minutes) min" }
        let rest = minutes % 60
        return rest > 0 ? "\(minutes / 60) h \(rest) min" : "\(minutes / 60) h"
    }

    /// The status tint an attempt's state takes (`AttemptTone`).
    public enum AttemptTone: Sendable { case live, done, fail, idle }

    /// An attempt's state in plain words with how long it took or has taken
    /// so far (`attemptSentence`): "Finished in 1 min", "Failed after 3 min",
    /// "Stopped after 40 s", "Working for 2 min". `now` in ms epoch.
    public static func attempt(_ attempt: TaskAttempt, now: Double) -> (tone: AttemptTone, text: String) {
        let took = span((attempt.endedAt ?? now) - attempt.startedAt)
        switch attempt.state {
        case .starting: return (.live, "Starting")
        case .running: return (.live, "Working for \(took)")
        case .done: return (.done, "Finished in \(took)")
        case .failed: return (.fail, "Failed after \(took)")
        case .cancelled, .unrecognized: return (.idle, "Stopped after \(took)")
        }
    }

    /// A kind as its quiet label says it (`KIND_LABEL`; `you` is Needs you).
    public static func kind(_ kind: Components.Schemas.StageKind) -> String {
        switch kind {
        case .todo: "to do"
        case .active: "active"
        case .waiting: "waiting"
        case .you: "needs you"
        case .done: "done"
        case .dropped: "dropped"
        case .unrecognized: "not in stages.md"
        }
    }

    /// Where a new task starts (`firstTodoStage`): the first stage of kind todo, else the first stage.
    public static func firstTodoStage(_ stages: [TaskStage]) -> TaskStage? {
        stages.first { $0.kind == .todo } ?? stages.first
    }

    /// The stages you may move a task to from `from`, as the hub works them
    /// out (`movesFrom`): a stage whose `by:` names someone else is closed,
    /// and a move must be listed for you. The hub checks every move again.
    public static func moves(_ stages: StagesView, from: String) -> Set<String> {
        Set(stages.stages.filter { to in
            to.name != from
                && (to.hooks.by == nil || to.hooks.by == .you)
                && stages.moves.contains { move in
                    (move.from == "*" || move.from == from) && (move.to == "*" || move.to == to.name) && move.who.contains(.you)
                }
        }.map(\.name))
    }
}

public extension TaskTodo {
    /// A to-do is named by its id, or by its place when it has none.
    var ref: String { id ?? path }
}
