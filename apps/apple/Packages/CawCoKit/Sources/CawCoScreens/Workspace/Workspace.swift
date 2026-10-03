import Foundation
import Observation

/// The workspace: what is on screen, as state (workspace/workspace.svelte.ts).
/// A tree of groups: a leaf is a group of tabs with one in front (VS Code's
/// editor group), a branch splits its children along one axis. A
/// conversation lives in exactly one group ("always move"), so nothing keyed
/// by its id — a draft, a scroll position — is ever in two places.
final class PaneLeaf {
    let id: String
    var tabs: [String]
    /// nil is the fleet board: a group holding nothing is where you start.
    var active: String?

    init(id: String = Workspace.nodeId(), tabs: [String] = [], active: String? = nil) {
        self.id = id
        self.tabs = tabs
        self.active = active
    }
}

final class PaneBranch {
    enum Axis: String, Codable { case h, v }
    let id: String
    var dir: Axis
    var kids: [PaneNode]
    /// Percentages, one per child, summing to 100.
    var sizes: [Double]

    init(id: String = Workspace.nodeId(), dir: Axis, kids: [PaneNode], sizes: [Double]) {
        self.id = id
        self.dir = dir
        self.kids = kids
        self.sizes = sizes
    }
}

enum PaneNode {
    case leaf(PaneLeaf)
    case branch(PaneBranch)

    var id: String {
        switch self {
        case let .leaf(leaf): leaf.id
        case let .branch(branch): branch.id
        }
    }
}

/// One window's workspace, persisted under the web's key on every change.
@MainActor
@Observable
final class Workspace {
    private(set) var root: PaneNode
    private(set) var focusedLeaf: String
    /// Bumped on every change, for the views that redraw the tree.
    private(set) var version = 0
    /// The group the last split made; the grid grows it in once.
    @ObservationIgnored private var fresh: String?
    /// The most groups a split may make here (layout-policy.svelte.ts `maxLeaves`).
    @ObservationIgnored var maxLeaves = Int.max

    private static let key = "cawco-workspace"
    private static var seq = 0

    static func nodeId() -> String {
        defer { seq += 1 }
        return "p\(String(Int(Date.now.timeIntervalSince1970 * 1000), radix: 36))\(String(seq, radix: 36))"
    }

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.key), let held = try? JSONDecoder().decode(Stored.self, from: data), let root = held.root.node {
            self.root = root
            focusedLeaf = held.focusedLeaf
        } else {
            let leaf = PaneLeaf()
            root = .leaf(leaf)
            focusedLeaf = leaf.id
        }
        settle(save: false)
    }

    // MARK: Reading

    /// The groups, in tree order: left to right, top to bottom.
    var leaves: [PaneLeaf] { Self.leaves(of: root) }

    /// Every open conversation, in tab order, across every group.
    var openIds: [String] { leaves.flatMap(\.tabs) }

    var focused: PaneLeaf {
        if let leaf = leaf(focusedLeaf) { return leaf }
        let first = leaves[0]
        focusedLeaf = first.id
        return first
    }

    /// What the reader is looking at; nil is the fleet board.
    var activeSessionId: String? { focused.active }

    func leaf(_ id: String) -> PaneLeaf? { leaves.first { $0.id == id } }

    func leafHolding(_ sessionId: String) -> PaneLeaf? { leaves.first { $0.tabs.contains(sessionId) } }

    static func leaves(of node: PaneNode) -> [PaneLeaf] {
        switch node {
        case let .leaf(leaf): [leaf]
        case let .branch(branch): branch.kids.flatMap(leaves(of:))
        }
    }

    // MARK: Changes

    /// Shows a conversation in its group (or the focused one), focusing that group.
    func activate(_ sessionId: String?, in leafId: String? = nil) {
        let leaf = leafId.flatMap(leaf(_:)) ?? sessionId.flatMap(leafHolding) ?? focused
        if let sessionId, !leaf.tabs.contains(sessionId) { leaf.tabs.append(sessionId) }
        leaf.active = sessionId
        focusedLeaf = leaf.id
        changed()
    }

    /// Moves keyboard focus between groups without changing what is shown.
    func focus(_ leafId: String) {
        guard leaf(leafId) != nil, focusedLeaf != leafId else { return }
        focusedLeaf = leafId
        changed()
    }

    /// Opens a conversation: where a group already holds it, else in the focused group.
    func open(_ sessionId: String) {
        activate(sessionId, in: leafHolding(sessionId)?.id)
    }

    /// Back to the board: the focused group shows nothing; its tabs stay.
    func showBoard() {
        focused.active = nil
        changed()
    }

    /// Re-addresses a tab in place (a stored conversation reached by its instance).
    func retarget(_ from: String, to: String) {
        guard let leaf = leafHolding(from), let at = leaf.tabs.firstIndex(of: from) else { return }
        if leaf.tabs.contains(to) { leaf.tabs.remove(at: at) } else { leaf.tabs[at] = to }
        if leaf.active == from { leaf.active = to }
        changed()
    }

    /// Closes a tab; the group falls back to its neighbour, not to the board.
    /// Closing a split half's last tab closes the half.
    func close(_ sessionId: String) {
        guard let leaf = leafHolding(sessionId), let at = leaf.tabs.firstIndex(of: sessionId) else { return }
        leaf.tabs.remove(at: at)
        if leaf.active == sessionId {
            leaf.active = at < leaf.tabs.count ? leaf.tabs[at] : leaf.tabs.last
        }
        settle()
    }

    /// Shows a conversation the reader did not pick (what a wide screen lands on).
    func land(_ sessionId: String) {
        let leaf = leafHolding(sessionId) ?? focused
        if !leaf.tabs.contains(sessionId) { leaf.tabs.append(sessionId) }
        leaf.active = sessionId
        focusedLeaf = leaf.id
        changed()
    }

    /// Every group holding tabs gets one in front (a wide screen has no board in the detail).
    func fillGroups() {
        var moved = false
        for leaf in leaves where leaf.active == nil && !leaf.tabs.isEmpty {
            leaf.active = leaf.tabs[0]
            moved = true
        }
        if moved { changed() }
    }

    /// Folds the tree to at most `max` groups, the extras' tabs into the last kept.
    func capLeaves(_ max: Int) {
        let all = leaves
        guard all.count > max, max > 0 else { return }
        let into = all[max - 1]
        for extra in all[max...] {
            for id in extra.tabs where !into.tabs.contains(id) { into.tabs.append(id) }
            if extra.id == focusedLeaf {
                into.active = extra.active ?? into.active
                focusedLeaf = into.id
            }
            extra.tabs = []
            extra.active = nil
        }
        settle()
    }

    enum Edge { case left, right, top, bottom }

    /// Splits a group, the conversation leaving wherever it was for the new half.
    func split(_ leafId: String, _ edge: Edge, _ sessionId: String) {
        guard let target = leaf(leafId), leaves.count < maxLeaves else { return }
        let from = leafHolding(sessionId)
        if from === target, target.tabs.count < 2 { return }
        if let from {
            from.tabs.removeAll { $0 == sessionId }
            if from.active == sessionId { from.active = from.tabs.first }
        }
        let made = PaneLeaf(tabs: [sessionId], active: sessionId)
        let dir: PaneBranch.Axis = edge == .left || edge == .right ? .h : .v
        let before = edge == .left || edge == .top
        let kids: [PaneNode] = before ? [.leaf(made), .leaf(target)] : [.leaf(target), .leaf(made)]
        replace(target.id, with: .branch(PaneBranch(dir: dir, kids: kids, sizes: [50, 50])))
        focusedLeaf = made.id
        fresh = made.id
        settle()
    }

    /// Moves a conversation into an existing group, at an index in its strip.
    func move(_ sessionId: String, to leafId: String, at index: Int? = nil) {
        guard let target = leaf(leafId) else { return }
        if let from = leafHolding(sessionId) {
            from.tabs.removeAll { $0 == sessionId }
            if from.active == sessionId { from.active = from.tabs.first }
        }
        let at = index.map { Swift.max(0, Swift.min($0, target.tabs.count)) } ?? target.tabs.count
        target.tabs.insert(sessionId, at: at)
        target.active = sessionId
        focusedLeaf = target.id
        settle()
    }

    /// Reorders within one group's strip.
    func reorder(_ leafId: String, _ sessionId: String, to index: Int) {
        guard let leaf = leaf(leafId), let at = leaf.tabs.firstIndex(of: sessionId) else { return }
        leaf.tabs.remove(at: at)
        leaf.tabs.insert(sessionId, at: Swift.max(0, Swift.min(index, leaf.tabs.count)))
        changed()
    }

    /// Whether `leafId` is the group a split just made: true once.
    func takeFresh(_ leafId: String) -> Bool {
        guard fresh == leafId else { return false }
        fresh = nil
        return true
    }

    /// Records a divider's position.
    func resize(_ branchId: String, _ sizes: [Double]) {
        func walk(_ node: PaneNode) -> PaneBranch? {
            guard case let .branch(branch) = node else { return nil }
            if branch.id == branchId { return branch }
            return branch.kids.lazy.compactMap(walk).first
        }
        guard let branch = walk(root), branch.sizes.count == sizes.count else { return }
        branch.sizes = sizes
        save()
    }

    // MARK: Invariants

    private func replace(_ id: String, with next: PaneNode) {
        func walk(_ node: PaneNode) -> Bool {
            guard case let .branch(branch) = node else { return false }
            if let at = branch.kids.firstIndex(where: { $0.id == id }) {
                branch.kids[at] = next
                return true
            }
            return branch.kids.contains { walk($0) }
        }
        if root.id == id { root = next } else { _ = walk(root) }
    }

    /// A branch with one child is no split, an empty group is no pane (the
    /// root excepted: nothing open is the board), and sizes follow children.
    private func normalize(_ node: PaneNode, isRoot: Bool) -> PaneNode? {
        switch node {
        case let .leaf(leaf):
            return leaf.tabs.isEmpty && !isRoot ? nil : node
        case let .branch(branch):
            let kids = branch.kids.compactMap { normalize($0, isRoot: false) }
            if kids.isEmpty { return nil }
            if kids.count == 1 { return kids[0] }
            var flat: [PaneNode] = []
            for kid in kids {
                if case let .branch(inner) = kid, inner.dir == branch.dir { flat += inner.kids } else { flat.append(kid) }
            }
            if flat.count != branch.kids.count || branch.sizes.count != flat.count {
                branch.sizes = Array(repeating: 100 / Double(flat.count), count: flat.count)
            }
            branch.kids = flat
            return node
        }
    }

    private func settle(save shouldSave: Bool = true) {
        root = normalize(root, isRoot: true) ?? .leaf(PaneLeaf())
        if leaf(focusedLeaf) == nil { focusedLeaf = leaves[0].id }
        if shouldSave { changed() }
    }

    private func changed() {
        version += 1
        save()
    }

    // MARK: Persistence

    private func save() {
        guard let data = try? JSONEncoder().encode(Stored(root: StoredNode(root), focusedLeaf: focusedLeaf)) else { return }
        UserDefaults.standard.set(data, forKey: Self.key)
    }

    private struct Stored: Codable {
        let root: StoredNode
        let focusedLeaf: String
    }

    /// The web's tree shape (`t: "l" | "b"`), so the two read alike.
    private struct StoredNode: Codable {
        let t: String
        let id: String
        var tabs: [String]?
        var active: String?
        var dir: PaneBranch.Axis?
        var kids: [StoredNode]?
        var sizes: [Double]?

        init(_ node: PaneNode) {
            switch node {
            case let .leaf(leaf):
                t = "l"; id = leaf.id; tabs = leaf.tabs; active = leaf.active
            case let .branch(branch):
                t = "b"; id = branch.id; dir = branch.dir; kids = branch.kids.map(StoredNode.init); sizes = branch.sizes
            }
        }

        var node: PaneNode? {
            if t == "l", let tabs { return .leaf(PaneLeaf(id: id, tabs: tabs, active: active)) }
            guard t == "b", let dir, let kids, !kids.isEmpty else { return nil }
            let nodes = kids.compactMap(\.node)
            guard nodes.count == kids.count else { return nil }
            return .branch(PaneBranch(id: id, dir: dir, kids: nodes, sizes: sizes ?? []))
        }
    }
}
