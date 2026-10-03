import Foundation
import Observation

/// The rail's own order and what the reader said about each directory
/// (apps/dashboard/src/lib/cawco/rail.svelte.ts and folder-prefs.svelte.ts):
/// how session lists sort, which projects are pinned, and per folder whether
/// it is shut and which hue it wears. One store for the app, so the rail in
/// the split column and the rail in the phone's sheet read the same answer.
@MainActor
@Observable
final class RailPrefs {
    /// How the rail orders the sessions inside a project (rail.svelte.ts `RailSort`).
    enum Sort: String, CaseIterable {
        case recent, name, state

        var label: String {
            switch self {
            case .recent: "Last activity"
            case .name: "Name"
            case .state: "State"
            }
        }
    }

    static let shared = RailPrefs()

    private enum Keys {
        static let layout = "cawco-rail-layout"
        static let folders = "cawco-folder-prefs"
    }

    private(set) var sort: Sort
    private(set) var pins: [String]
    /// Per cwd: shut in the rail, and a hand-picked identity hue.
    private var collapsedFolders: Set<String>
    private var hues: [String: Double]

    private init() {
        let defaults = UserDefaults.standard
        let layout = defaults.dictionary(forKey: Keys.layout) ?? [:]
        sort = (layout["sort"] as? String).flatMap(Sort.init(rawValue:)) ?? .recent
        pins = layout["pins"] as? [String] ?? []
        let folders = defaults.dictionary(forKey: Keys.folders) as? [String: [String: Any]] ?? [:]
        collapsedFolders = Set(folders.filter { $0.value["collapsed"] as? Bool == true }.keys)
        hues = folders.compactMapValues { $0["hue"] as? Double }
    }

    func setSort(_ next: Sort) {
        sort = next
        saveLayout()
    }

    func isPinned(_ projectId: String) -> Bool { pins.contains(projectId) }

    func togglePin(_ projectId: String) {
        if let at = pins.firstIndex(of: projectId) { pins.remove(at: at) } else { pins.append(projectId) }
        saveLayout()
    }

    func collapsed(_ cwd: String) -> Bool { collapsedFolders.contains(cwd) }

    func setCollapsed(_ cwd: String, _ shut: Bool) {
        if shut { collapsedFolders.insert(cwd) } else { collapsedFolders.remove(cwd) }
        saveFolders()
    }

    /// The hue this directory wears: the chosen one, else the hashed one.
    func hue(_ cwd: String) -> Double { hues[cwd] ?? Self.identityHue(cwd) }

    /// Only the chosen one: what the picker rings, and what "Auto" clears.
    func chosenHue(_ cwd: String) -> Double? { hues[cwd] }

    func setHue(_ cwd: String, _ hue: Double?) {
        hues[cwd] = hue
        saveFolders()
    }

    private func saveLayout() {
        UserDefaults.standard.set(["sort": sort.rawValue, "pins": pins], forKey: Keys.layout)
    }

    private func saveFolders() {
        var out: [String: [String: Any]] = [:]
        for cwd in collapsedFolders { out[cwd, default: [:]]["collapsed"] = true }
        for (cwd, hue) in hues { out[cwd, default: [:]]["hue"] = hue }
        UserDefaults.standard.set(out, forKey: Keys.folders)
    }

    /// Ten identity hues (oklch); none below 40, a red folder reads as alarm (identity.ts).
    static let identityHues: [Double] = [55, 85, 115, 145, 175, 205, 235, 265, 295, 330]

    /// identity.ts `identityHue`: FNV-1a over the UTF-16 units, then one of the ten.
    static func identityHue(_ key: String) -> Double {
        var h: UInt32 = 0x811C_9DC5
        for unit in key.utf16 {
            h ^= UInt32(unit)
            h = h &* 0x0100_0193
        }
        return identityHues[Int(h % UInt32(identityHues.count))]
    }
}
