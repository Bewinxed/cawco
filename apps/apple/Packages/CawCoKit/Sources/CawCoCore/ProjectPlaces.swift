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
            case .hub: false
            }
        }
    }

    /// Whether `folder` on `machineId` is one of its machine places or inside one.
    public func holds(machineId: String, folder: String?) -> Bool {
        guard let folder, !folder.isEmpty else { return false }
        return machinePlaces.contains { $0.machineId == machineId && ProjectPlaces.inside(folder, $0.path) }
    }
}

public enum ProjectPlaces {
    /// `folder` is `path` or a folder under it.
    public static func inside(_ folder: String, _ path: String) -> Bool {
        folder == path || folder.hasPrefix(path == "/" ? "/" : path + "/")
    }
}
