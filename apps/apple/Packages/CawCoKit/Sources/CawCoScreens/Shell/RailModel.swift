import CawCoAPI
import CawCoCore
import Foundation

typealias ProjectRow = Components.Schemas.GetApiProjects200Payload

/// A session in the rail and the sessions it started (Sidebar.svelte `Branch`).
struct RailBranch {
    let row: InstanceRow
    let children: [RailBranch]
    /// Every row under it, at any depth, and how many of those failed.
    let count: Int
    let failed: Int
}

/// What one project lists (Sidebar.svelte `splitOf`): its recent sessions
/// (running, waiting on the operator, or moved in the last day) and the
/// rest folded under one "N older" row, each as trees.
struct RailProjectList {
    let project: ProjectRow
    /// What is running in it, for the count at its row's trailing edge.
    let running: Int
    let recent: [RailBranch]
    let older: [RailBranch]
}

/// The rail's projects, read off the fleet the way Sidebar.svelte reads them.
@MainActor
enum RailModel {
    static let dayMs = 24.0 * 60 * 60 * 1000

    /// Sidebar.svelte's `drawsAlike`/`keep`: replacement fleet snapshots
    /// that describe the same rows are the same derivation input.
    struct RowInput: Equatable {
        let id: String
        let status: String
        let parent: String?
        let project: String?
        let machine: String
        let folder: String
        let title: String?
        let updatedDate: Date?
        let updatedText: String?
        let activity: Activity
        let recent: Bool
    }

    struct Inputs {
        let rows: [RowInput]
        let live: Int
        let blocked: Int
    }

    static func inputs(hub: HubConnection, home: HomeModel, sort: RailPrefs.Sort) -> Inputs {
        let sessions = hub.fleet.rows
        var live = 0
        var blocked = 0
        let rows = (sessions + hub.fleet.runRows).enumerated().map { index, row in
            let watchesActivity = row.isLive || row.isStale || sort == .state
            let activity = watchesActivity ? home.activity(row.id) : .idle
            if index < sessions.count, row.isLive {
                live += 1
                if activity == .blocked { blocked += 1 }
            }
            let settled = watchesActivity ? hub.fleet.activityPulse(row.id)?.at : nil
            var updated = 0.0
            if let date = row.updatedAt?.value1 {
                updated = date.timeIntervalSince1970 * 1000
            } else if let text = row.updatedAt?.value2,
                      let date = try? Date(text, strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true)) {
                updated = date.timeIntervalSince1970 * 1000
            }
            return RowInput(id: row.id, status: row.status.rawValue, parent: row.parentInstanceId,
                     project: row.projectId, machine: row.machineId, folder: row.cwd,
                     title: row.title, updatedDate: settled == nil ? row.updatedAt?.value1 : nil,
                     updatedText: settled == nil ? row.updatedAt?.value2 : nil,
                     activity: sort == .state || !row.isLive ? activity : .idle,
                     recent: row.isLive || activity == .blocked || home.now - (settled ?? updated) < dayMs)
        }
        return Inputs(rows: rows, live: live, blocked: blocked)
    }

    /// Pinned projects first, then by name (`orderedProjects`).
    static func projects(_ fleet: FleetStore, prefs: RailPrefs) -> [ProjectRow] {
        fleet.projects.sorted { a, b in
            let pa = prefs.isPinned(a.id), pb = prefs.isPinned(b.id)
            if pa != pb { return pa }
            return a.name.localizedCompare(b.name) == .orderedAscending
        }
    }

    static func lists(hub: HubConnection, home: HomeModel, prefs: RailPrefs) -> [RailProjectList] {
        let fleet = hub.fleet
        let ordered = projects(fleet, prefs: prefs)
        // A folder on a machine, as the lookups key it.
        var projectsAt: [String: [String]] = [:]
        for project in fleet.projects {
            for place in project.machinePlaces { projectsAt["\(place.machineId)\u{0}\(place.path)", default: []].append(project.id) }
        }
        let ids = Set(fleet.projects.map(\.id))
        /// The session a row's work belongs to: itself, or for a delegate the
        /// session at the top of the chain that started it.
        func owner(_ row: InstanceRow) -> InstanceRow {
            var seen: Set<String> = [row.id]
            var at = row
            while let up = at.parentInstanceId.flatMap({ fleet.byId[$0] }), !seen.contains(up.id) {
                seen.insert(up.id)
                at = up
            }
            return at
        }
        /// The projects a row belongs to: the one its `projectId` names, and
        /// every project on its machine whose folder is its folder or holds
        /// it. A delegate belongs to its parent session's projects, whatever
        /// machine and path it runs on itself.
        func projectsOf(_ delegate: InstanceRow) -> Set<String> {
            let row = owner(delegate)
            var found = Set<String>()
            if let id = row.projectId, ids.contains(id) { found.insert(id) }
            let cwd = row.cwd
            guard !cwd.isEmpty else { return found }
            func claim(_ folder: Substring) {
                for id in projectsAt["\(row.machineId)\u{0}\(folder)"] ?? [] { found.insert(id) }
            }
            claim(cwd[...])
            var at = cwd.startIndex
            while let slash = cwd[at...].firstIndex(of: "/") {
                claim(cwd[..<slash])
                at = cwd.index(after: slash)
            }
            return found
        }

        // What is running now, and what rests but can be picked up again.
        let running = fleet.rows.filter(\.isLive) + fleet.runRows.filter { $0.status == .running }
        let resting = fleet.rows.filter { $0.isListed && ($0.isResumable || $0.isStale || $0.isFailed) } + fleet.runRows.filter(\.isFailed)
        var live: [String: [InstanceRow]] = [:]
        var rest: [String: [InstanceRow]] = [:]
        var liveIds = Set<String>()
        for row in running {
            liveIds.insert(row.id)
            for id in projectsOf(row) { live[id, default: []].append(row) }
        }
        for row in resting where !liveIds.contains(row.id) {
            for id in projectsOf(row) { rest[id, default: []].append(row) }
        }

        return ordered.map { project in
            var liveRows = live[project.id] ?? []
            var restRows = rest[project.id] ?? []
            // With the Delegates switch off, a delegate whose parent the project does not list is left out.
            if !home.delegates {
                let kept = Set(rooted(liveRows + restRows).map(\.id))
                liveRows = liveRows.filter { kept.contains($0.id) }
                restRows = restRows.filter { kept.contains($0.id) }
            }
            let (recent, older) = split(liveRows, restRows, hub: hub, home: home)
            let (shown, folded) = topUp(
                branches(recent, hub: hub, home: home, prefs: prefs),
                branches(older, hub: hub, home: home, prefs: prefs),
                hub: hub
            )
            return RailProjectList(project: project, running: liveRows.count, recent: shown, older: folded)
        }
    }

    /// How many rows a project shows before anything folds.
    static let shownAtLeast = 6

    /// Owner, 2026-10-03: "Load older shouldn't hide the project sessions if
    /// there's only few of them". Fewer than six recent rows are topped up
    /// from the older ones, most recent first, until six show; only the rest
    /// folds under "N older", and a lone one left over lists inline too.
    private static func topUp(_ recent: [RailBranch], _ older: [RailBranch], hub: HubConnection) -> ([RailBranch], [RailBranch]) {
        var shown = recent
        var rest = older
        if shown.count < shownAtLeast, !rest.isEmpty {
            let byRecency = rest.enumerated().map { (index: $0.offset, at: hub.fleet.lastAt($0.element.row)) }
                .sorted { $0.at != $1.at ? $0.at > $1.at : $0.index < $1.index }
            let lifted = Set(byRecency.prefix(shownAtLeast - shown.count).map { rest[$0.index].row.id })
            shown += rest.filter { lifted.contains($0.row.id) }
            rest.removeAll { lifted.contains($0.row.id) }
        }
        if rest.count == 1 {
            shown += rest
            rest = []
        }
        return (shown, rest)
    }

    /// `splitRows`: a tree stays whole on the side its top row is on.
    private static func split(_ live: [InstanceRow], _ resting: [InstanceRow], hub: HubConnection, home: HomeModel) -> ([InstanceRow], [InstanceRow]) {
        var recentIds = Set(live.map(\.id))
        for row in resting where home.activity(row.id) == .blocked || home.now - hub.fleet.lastAt(row) < dayMs {
            recentIds.insert(row.id)
        }
        let all = live + resting
        var byId: [String: InstanceRow] = [:]
        for row in all { byId[row.id] = row }
        func top(_ row: InstanceRow) -> InstanceRow {
            var seen: Set<String> = [row.id]
            var at = row
            while let up = at.parentInstanceId.flatMap({ byId[$0] }), !seen.contains(up.id) {
                seen.insert(up.id)
                at = up
            }
            return at
        }
        var recent: [InstanceRow] = []
        var older: [InstanceRow] = []
        for row in all {
            if recentIds.contains(top(row).id) { recent.append(row) } else { older.append(row) }
        }
        return (recent, older)
    }

    /// One comparator for every list in the rail (`sorted`); recency breaks every tie.
    static func sorted(_ rows: [InstanceRow], hub: HubConnection, home: HomeModel, by sort: RailPrefs.Sort) -> [InstanceRow] {
        let rank: [Activity: Int] = [.blocked: 0, .working: 1, .idle: 2]
        // Read each key once, not on every comparator call (the fleet's
        // pulse and generated row accessors were the sort's measured cost).
        // Original position explicitly preserves the stable order on ties.
        let keys = rows.enumerated().map { index, row in
            (index: index, at: hub.fleet.lastAt(row),
             name: sort == .name ? hub.fleet.title(row) : "",
             rank: sort == .state ? (rank[home.activity(row.id)] ?? 2) : 0)
        }
        return keys.sorted { a, b in
            switch sort {
            case .name:
                let order = a.name.localizedCompare(b.name)
                if order != .orderedSame { return order == .orderedAscending }
            case .state:
                if a.rank != b.rank { return a.rank < b.rank }
            case .recent:
                break
            }
            return a.at != b.at ? a.at > b.at : a.index < b.index
        }.map { rows[$0.index] }
    }

    /// The shared tree builder needs identity and parentage, not a copy of
    /// the generated wire row (and all its optional payloads) at each step.
    private struct TreeIndex: TreeRow {
        let id: String
        let parentInstanceId: String?
        let index: Int
    }

    /// `branches`: the rows as the tree they are, siblings in the rail's order at every depth.
    private static func branches(_ rows: [InstanceRow], hub: HubConnection, home: HomeModel, prefs: RailPrefs) -> [RailBranch] {
        let ordered = sorted(rows, hub: hub, home: home, by: prefs.sort)
        let lines = tree(ordered.enumerated().map {
            TreeIndex(id: $0.element.id, parentInstanceId: $0.element.parentInstanceId, index: $0.offset)
        })
        var children: [String: [Int]] = [:]
        var roots: [Int] = []
        for line in lines where !line.context {
            if let parent = line.parent { children[parent, default: []].append(line.row.index) } else { roots.append(line.row.index) }
        }
        func build(_ index: Int) -> RailBranch {
            let row = ordered[index]
            let kids = (children[row.id] ?? []).map(build)
            let count = kids.reduce(0) { $0 + 1 + $1.count }
            let failed = kids.reduce(0) { $0 + ($1.row.isFailed ? 1 : 0) + $1.failed }
            return RailBranch(row: row, children: kids, count: count, failed: failed)
        }
        return roots.map(build)
    }
}
