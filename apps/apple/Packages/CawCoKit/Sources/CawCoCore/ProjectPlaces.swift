public import CawCoAPI

/// One of a project's places (WORDS.md: place), by its kind (`PlaceKind`):
/// - `checkout`: a folder on a machine; sessions start in one, the primary
///   names the project's folder line;
/// - `workspace`: a delegate's workspace on a machine, kept while it is
///   active; sessions run in one and belong to the project;
/// - `hub`: the project's folder on the hub (`machineId` "hub", a path
///   relative to the hub's data folder). Every project has one from the moment
///   it is made; no session runs there, so it holds no session's folder and
///   starts none.
public typealias ProjectPlace = Components.Schemas.GetApiProjects200Payload.PlacesPayloadPayload

/// A project is one identity with many places (PRD §5.1: `places[]` and
/// `primaryPlaceId`, no machine or folder of its own); projects.ts. Every
/// screen reads a project's machine and folder through these.
extension Components.Schemas.GetApiProjects200Payload {
    /// Its primary checkout (`checkoutOf`): the place `primaryPlaceId` names.
    /// Nil while it has none, its one place its folder on the hub; then a
    /// session's machine and folder are asked for by the New Session form.
    public var primaryPlace: ProjectPlace? {
        places.first { $0.id == primaryPlaceId }
    }

    /// The folder the project is known by, its hue and its rail row
    /// (`folderOf`): its primary checkout's path, else its folder on the hub's.
    public var folder: String { primaryPlace?.path ?? "projects/\(id)" }

    /// Where a session on `machineId` starts in the project (`checkoutOn`):
    /// its checkout there, the primary first.
    public func checkout(on machineId: String) -> ProjectPlace? {
        let checkouts = places.filter { $0.machineId == machineId && $0.kind == .checkout }
        return checkouts.first(where: \.isPrimary) ?? checkouts.first
    }

    /// Whether a session on `machineId` can be one of the project's: it has a place there (`placedOn`).
    public func placed(on machineId: String) -> Bool {
        places.contains { $0.machineId == machineId }
    }

    /// The places sessions run in: its checkouts and workspaces, on machines.
    public var machinePlaces: [ProjectPlace] {
        places.filter { place in
            switch place.kind {
            case .checkout, .workspace: true
            case .hub, .unrecognized: false
            }
        }
    }

}

public enum ProjectPlaces {
    public typealias Project = Components.Schemas.GetApiProjects200Payload

    /// `folder` is `path` or a folder under it.
    public static func inside(_ folder: String, _ path: String) -> Bool {
        folder == path || folder.hasPrefix(path == "/" ? "/" : path + "/")
    }

    /// The projects a session belongs to (projects.ts `projectsFor`), the one
    /// rule every screen reads: the project its `projectId` names comes first;
    /// then every project with a place on its machine whose folder holds its
    /// folder, deepest first. A folder that is a place of more than one
    /// project belongs to the oldest of them.
    public static func projectsFor(_ projects: [Project], machineId: String, cwd: String, projectId: String?) -> [Project] {
        let owner = projectId.flatMap { id in projects.first { $0.id == id } }
        let at = owner.map { home(of: $0, machineId: machineId, cwd: cwd) } ?? (machineId: machineId, path: trimmed(cwd))
        // Each project once, at the deepest of its places that holds the folder.
        var depth: [String: (project: Project, depth: Int)] = [:]
        for (path, project) in oldest(on: at.machineId, in: projects) {
            guard inside(at.path, path) else { continue }
            if let owner, path == at.path || project.id == owner.id { continue }
            if let held = depth[project.id], held.depth >= path.count { continue }
            depth[project.id] = (project, path.count)
        }
        let claimed = depth.values.sorted { $0.depth > $1.depth }.map(\.project)
        return owner.map { [$0] + claimed } ?? claimed
    }

    /// A folder as places store it: no trailing slash, the root's own kept.
    private static func trimmed(_ cwd: String) -> String {
        var path = Substring(cwd)
        while path.hasSuffix("/") { path = path.dropLast() }
        return path.isEmpty ? "/" : String(path)
    }

    private static func older(_ a: Project, _ b: Project) -> Bool {
        a.createdAt < b.createdAt || (a.createdAt == b.createdAt && a.id < b.id)
    }

    /// Where an owned session counts from (`homeOf`): the owner's place on its
    /// machine that holds its folder (the deepest), else the owner's primary
    /// checkout, else its own folder.
    private static func home(of owner: Project, machineId: String, cwd: String) -> (machineId: String, path: String) {
        let folder = trimmed(cwd)
        var home: (machineId: String, path: String) = owner.primaryPlace.map { (machineId: $0.machineId, path: trimmed($0.path)) } ?? (machineId: machineId, path: folder)
        var deepest = -1
        for place in owner.places {
            let path = trimmed(place.path)
            if place.machineId == machineId, inside(folder, path), path.count > deepest {
                home = (machineId: place.machineId, path: path)
                deepest = path.count
            }
        }
        return home
    }

    /// Each folder on `machineId` that is a place, and the oldest project there (`oldestOn`).
    private static func oldest(on machineId: String, in projects: [Project]) -> [String: Project] {
        var oldest: [String: Project] = [:]
        for project in projects {
            for place in project.places where place.machineId == machineId {
                let path = trimmed(place.path)
                if let previous = oldest[path], !older(project, previous) { continue }
                oldest[path] = project
            }
        }
        return oldest
    }
}
