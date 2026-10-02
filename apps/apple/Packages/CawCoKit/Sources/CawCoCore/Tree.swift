/// Sessions as the tree they are (apps/dashboard/src/lib/cawco/tree.ts): a
/// delegate names the session that started it and hangs under it. One
/// builder and one collapse model for every list that nests sessions.

public protocol TreeRow {
    var id: String { get }
    var parentInstanceId: String? { get }
}

public struct TreeLine<Row: TreeRow> {
    /// Not in the list: the parent of rows that are, drawn for them.
    public let context: Bool
    /// 0 for a top-level row, 1 for its children, and so on.
    public let depth: Int
    /// Every listed row under this one, at any depth (context lines left out).
    public internal(set) var descendants: [Row]
    public let first: Bool
    public let last: Bool
    /// The line it hangs under, or nil at the top level.
    public let parent: String?
    public let row: Row
}

public enum TreeAnchor: Sendable {
    /// A tree stands at the first of its members in the rows' order.
    case first
    /// …or at the last.
    case last
}

/// `rows` in tree order; `context` finds a row the list does not hold, to
/// stand in for a missing parent.
public func tree<Row: TreeRow>(
    _ rows: [Row],
    anchor: TreeAnchor = .first,
    context: ((String) -> Row?)? = nil
) -> [TreeLine<Row>] {
    var byId: [String: Row] = [:]
    for row in rows {
        byId[row.id] = row
    }
    // Every missing ancestor lifted in just before its first child.
    var standIns = Set<String>()
    var members: [Row] = []
    for row in rows {
        var chain: [Row] = []
        var child = row
        var parent = row.parentInstanceId
        while let context, let up = parent, up != child.id, byId[up] == nil, let found = context(up) {
            byId[up] = found
            standIns.insert(up)
            chain.insert(found, at: 0)
            child = found
            parent = found.parentInstanceId
        }
        members += chain + [row]
    }

    func parentOf(_ row: Row) -> String? {
        guard let parent = row.parentInstanceId, parent != row.id, byId[parent] != nil else {
            return nil
        }
        return parent
    }
    func topOf(_ row: Row) -> Row {
        var seen: Set<String> = [row.id]
        var at = row
        while let up = parentOf(at), !seen.contains(up), let next = byId[up] {
            seen.insert(up)
            at = next
        }
        return at
    }

    var children: [String: [Row]] = [:]
    var anchors: [String: (at: Int, row: Row)] = [:]
    for (at, row) in members.enumerated() {
        if let parent = parentOf(row) {
            children[parent, default: []].append(row)
        }
        let top = topOf(row)
        if parentOf(top) != nil {
            continue
        }
        if anchors[top.id] == nil || anchor == .last {
            anchors[top.id] = (at, top)
        }
    }
    let roots = anchors.values.sorted { $0.at < $1.at }.map(\.row)

    var out: [TreeLine<Row>] = []
    func walk(_ list: [Row], depth: Int, parent: String?) {
        for (at, row) in list.enumerated() {
            out.append(TreeLine(
                context: standIns.contains(row.id),
                depth: depth,
                descendants: [],
                first: at == 0,
                last: at == list.count - 1,
                parent: parent,
                row: row
            ))
            if let kids = children[row.id] {
                walk(kids, depth: depth + 1, parent: row.id)
            }
        }
    }
    walk(roots, depth: 0, parent: nil)
    // Each line's listed rows below it: the lines after it, until one stands no deeper.
    for at in out.indices {
        for below in out[(at + 1)...] {
            if below.depth <= out[at].depth {
                break
            }
            if !below.context {
                out[at].descendants.append(below.row)
            }
        }
    }
    return out
}

/// The rows that hang from a root the list holds: a top-level row, or a child
/// whose whole chain of parents is in `rows` too.
public func rooted<Row: TreeRow>(_ rows: [Row]) -> [Row] {
    var byId: [String: Row] = [:]
    for row in rows {
        byId[row.id] = row
    }
    var kept: [String: Bool] = [:]
    func keeps(_ row: Row, _ seen: inout Set<String>) -> Bool {
        if let known = kept[row.id] {
            return known
        }
        var keep = row.parentInstanceId == nil
        if let parentId = row.parentInstanceId, let parent = byId[parentId], !seen.contains(parent.id) {
            seen.insert(row.id)
            keep = keeps(parent, &seen)
        }
        kept[row.id] = keep
        return keep
    }
    return rows.filter { row in
        var seen = Set<String>()
        return keeps(row, &seen)
    }
}

/// The lines a reader sees: every tree starts folded, and a line shows only
/// when every line it hangs under is open.
public func collapse<Row: TreeRow>(_ lines: [TreeLine<Row>], isOpen: (String) -> Bool) -> [TreeLine<Row>] {
    var out: [TreeLine<Row>] = []
    var foldedBelow = Int.max
    for line in lines {
        if line.depth > foldedBelow {
            continue
        }
        foldedBelow = .max
        out.append(line)
        if !line.descendants.isEmpty, !isOpen(line.row.id) {
            foldedBelow = line.depth
        }
    }
    return out
}
