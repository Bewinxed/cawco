public import CawCoAPI
public import Foundation
import Observation

/// One project's tasks and stages as its page shows them
/// (routes/project/[id]/+page.svelte): what the hub answered, from the first
/// read and each read after. Every change is a commit on the hub, so the list
/// is read again after each of the page's own writes, whenever the hub says
/// the project's tasks changed (`tasks.changed`: Caw filed one, an attempt
/// moved one), on a reconnect, and when the app comes back. A move shows at
/// once, in the column it is going to, until the hub answers it. The
/// project's custom views are read with them, and again whenever one of its
/// Caw threads moves (he drafts a view in a thread), so a new draft arrives
/// as a tab.
@MainActor
@Observable
public final class ProjectTaskList {
    public let projectId: String
    @ObservationIgnored private let hub: HubConnection

    public private(set) var list: TaskList?
    /// Why the list could not be read, in the hub's words.
    public private(set) var listProblem: String?
    public private(set) var stages: StagesView?
    public private(set) var stagesProblem: String?
    /// Moves the hub has not answered yet, by task: the card already stands in its new column.
    public private(set) var moving: [String: String] = [:]
    /// The project's views, kept then drafted, once read.
    public private(set) var views: [ProjectView]?
    /// Why the views could not be read, in the hub's words; the last read stays shown.
    public private(set) var viewsProblem: String?

    /// Reads so far: only the newest one's answer is kept.
    @ObservationIgnored private var reads = 0
    /// Views reads so far, and keeps and discards: only the newest one's answer is kept.
    @ObservationIgnored private var viewReads = 0
    @ObservationIgnored private var changesSeen: Int
    @ObservationIgnored private var threadsSeen: Int
    @ObservationIgnored private var wasConnected: Bool

    public init(hub: HubConnection, projectId: String) {
        self.hub = hub
        self.projectId = projectId
        changesSeen = hub.tasksChanged[projectId] ?? 0
        threadsSeen = hub.threadsMoved[projectId] ?? 0
        wasConnected = hub.state == .connected
        watch()
    }

    // MARK: What the page reads

    public var stageList: [TaskStage] { stages?.stages ?? [] }

    /// The list with each pending move shown where it is going.
    public var tasks: [TaskSummary] {
        let kinds = Dictionary(stageList.map { ($0.name, $0.kind) }, uniquingKeysWith: { first, _ in first })
        return (list?.tasks ?? []).map { task in
            guard let stage = moving[task.id] else { return task }
            var shown = task
            shown.stage = stage
            shown.kind = kinds[stage]
            shown.needsYou = kinds[stage] == .you
            return shown
        }
    }

    /// Needs you is a filter, not a stage: the tasks whose stage is of kind `you`.
    public var needsYou: [TaskSummary] { tasks.filter { $0.kind == .you } }

    /// The list was read and holds nothing.
    public var empty: Bool { list?.tasks.isEmpty == true }

    /// The column that takes new tasks: the first of kind todo.
    public var newIn: String? { TaskWords.firstTodoStage(stageList)?.name }

    /// The stages a task in `stage` may move to.
    public func allowed(from stage: String) -> Set<String> {
        stages.map { TaskWords.moves($0, from: stage) } ?? []
    }

    // MARK: The hub's reads and writes

    /// The tasks, the stages and the views, read together; a failed read keeps what was shown and says why.
    public func refresh() async {
        reads += 1
        let ticket = reads
        let api: ProjectTasks
        do {
            api = try ProjectTasks(hub: hub, projectId: projectId)
        } catch {
            listProblem = error.localizedDescription
            return
        }
        async let readList = Result(catching: { try await api.list() })
        async let readStages = Result(catching: { try await api.stages() })
        async let viewsRead: Void = readViews()
        let (listed, staged) = await (readList, readStages)
        await viewsRead
        guard ticket == reads else { return }
        switch listed {
        case let .success(value):
            list = value
            listProblem = nil
        case let .failure(error):
            listProblem = error.localizedDescription
        }
        switch staged {
        case let .success(value):
            stages = value
            stagesProblem = nil
        case let .failure(error):
            stagesProblem = error.localizedDescription
        }
    }

    /// A move, shown at once and asked of the hub. A refusal puts the card
    /// back where it was, and the hub's sentence (which names the moves that
    /// are open) is thrown to whoever asked.
    @discardableResult
    public func move(_ taskId: String, to stage: String) async throws -> TaskView {
        moving[taskId] = stage
        defer {
            moving[taskId] = nil
            Task { await refresh() }
        }
        let task = try await ProjectTasks(hub: hub, projectId: projectId).move(taskId, to: stage)
        patch(task)
        return task
    }

    /// A new task, titled, in `stage`; it stands in the list once the hub has read it back.
    public func create(title: String, stage: String) async throws {
        _ = try await ProjectTasks(hub: hub, projectId: projectId).create(title: title, stage: stage)
        await refresh()
    }

    /// The project's views as the hub lists them now.
    public func readViews() async {
        viewReads += 1
        let ticket = viewReads
        do {
            let read = try await ProjectTasks(hub: hub, projectId: projectId).views()
            guard ticket == viewReads else { return }
            views = read
            viewsProblem = nil
        } catch {
            guard ticket == viewReads else { return }
            viewsProblem = error.localizedDescription
        }
    }

    /// Keep: the draft becomes a kept view where its tab stands. The hub's
    /// refusal is thrown to whoever asked.
    public func keepView(_ name: String) async throws {
        let kept = try await ProjectTasks(hub: hub, projectId: projectId).keepView(name)
        // A read still out answers from before the keep.
        viewReads += 1
        views = views?.map { $0.name == name ? kept : $0 }
    }

    /// Discard: the draft goes. The hub's refusal is thrown to whoever asked.
    public func discardView(_ name: String) async throws {
        try await ProjectTasks(hub: hub, projectId: projectId).discardView(name)
        viewReads += 1
        views = views?.filter { $0.name != name }
    }

    /// The project has stages of its own now (StagesControl); the list is read again.
    public func applied(_ next: StagesView) {
        stages = next
        stagesProblem = nil
        Task { await refresh() }
    }

    /// A task the hub just wrote, put into the list until the list is read
    /// again: the fields a card and a row show, on the row the list already
    /// has. A task the list lacks arrives with the read that follows.
    private func patch(_ task: TaskView) {
        guard var current = list, let index = current.tasks.firstIndex(where: { $0.id == task.id }) else { return }
        var row = current.tasks[index]
        row.title = task.title
        row.stage = task.stage
        row.kind = task.kind
        row.needsYou = task.needsYou
        row.after = task.after
        row.labels = task.labels
        row.todos.done = Double(task.todos.filter(\.done).count)
        row.todos.total = Double(task.todos.count)
        row.blockedBy = task.blockedBy
        row.liveAttempt = task.liveAttempt
        row.lastAttemptFailed = task.lastAttemptFailed
        row.queuedStart = task.queuedStart
        row.updatedAt = task.updatedAt
        current.tasks[index] = row
        list = current
    }

    // MARK: What keeps it live

    /// Reads again when the hub says the tasks changed, and on every
    /// reconnect (a foregrounded app's socket is a new one): the tasks the
    /// hub may have moved while it was away. The views alone when one of the
    /// project's threads moved.
    private func watch() {
        withObservationTracking {
            _ = hub.tasksChanged[projectId]
            _ = hub.threadsMoved[projectId]
            _ = hub.state
        } onChange: { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                moved()
                watch()
            }
        }
    }

    private func moved() {
        let changes = hub.tasksChanged[projectId] ?? 0
        let threads = hub.threadsMoved[projectId] ?? 0
        let connected = hub.state == .connected
        let reread = (changes != changesSeen) || (connected && !wasConnected)
        let threadsMoved = threads != threadsSeen
        changesSeen = changes
        threadsSeen = threads
        wasConnected = connected
        guard connected else { return }
        if reread {
            Task { await refresh() }
        } else if threadsMoved {
            Task { await readViews() }
        }
    }
}

private extension Result where Failure == any Error {
    init(catching body: () async throws -> Success) async {
        do {
            self = .success(try await body())
        } catch {
            self = .failure(error)
        }
    }
}
