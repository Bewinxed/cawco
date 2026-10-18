import CawCoCore
import Observation

/// What each Configure editor has changed and not saved, by the editor's
/// path (`delegate-types/new`, `mcp/<name>`, `memory/<file>`), kept while the
/// app runs (drafts.svelte.ts): leaving an editor and coming back puts the
/// edits back where they were; a save, Cancel or Delete ends them. The rail
/// marks a section that holds one, the memory list each file.
@MainActor
@Observable
final class ConfigDrafts {
    static let shared = ConfigDrafts()

    /// The paths holding a draft: what the rail and the lists read.
    private(set) var paths: Set<String> = []
    /// Each editor's fields, as it kept them.
    @ObservationIgnored private var fields: [String: Any] = [:]

    /// An editor's path: its section and its row, `new` for one not made yet.
    static func path(_ slug: String, _ key: String?) -> String { "\(slug)/\(key ?? "new")" }

    /// The fields an editor kept under `path`, to put back as it opens.
    func kept<Fields>(_ path: String, as _: Fields.Type) -> Fields? { fields[path] as? Fields }

    /// The editor's fields, or nil while they hold what is saved (`put`).
    func keep(_ path: String, _ edited: Any?) {
        fields[path] = edited
        // Only a draft starting or ending is news to the rail, not each keystroke.
        if edited == nil { if paths.contains(path) { paths.remove(path) } } else if !paths.contains(path) { paths.insert(path) }
    }

    /// Cancel, a new row made, or the row deleted: the draft is over (`drop`).
    func drop(_ path: String) { keep(path, nil) }

    func holds(_ path: String) -> Bool { paths.contains(path) }

    /// A section holds an editor with unsaved changes (`unsavedIn`). A draft
    /// left for a row deleted since does not count: there is nothing left to
    /// save it to.
    func unsaved(in slug: String, hub: HubConnection) -> Bool {
        paths.contains { path in
            guard let cut = path.firstIndex(of: "/"), path[..<cut] == slug else { return false }
            return live(slug, String(path[path.index(after: cut)...]), hub: hub)
        }
    }

    /// The editor at `slug`/`key` is for a row that still exists, or for a new one.
    private func live(_ slug: String, _ key: String, hub: HubConnection) -> Bool {
        let config: FleetConfig = hub.configuration
        if key == "new" { return slug != "memory" }
        switch slug {
        case "delegate-types": return config.typeNames?.contains(key) ?? false
        case "mcp": return config.snapshot?.config.mcp.contains { $0.name == key } ?? false
        case "memory": return key == FleetMemory.main || (config.snapshot?.memoryDocs.contains { $0.path == key } ?? false)
        case "accounts": return FleetAccounts.view(hub)?.accounts.contains { $0.id == key } ?? false
        default: return false
        }
    }
}
