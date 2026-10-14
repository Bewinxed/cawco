import CawCoCore
import CawCoDesign
import UIKit

/// What stands beside a section's name besides its count (ConfigRail.svelte
/// `.fault`): how many rows fail on a machine or at the hub, or (Updates)
/// how many machines wait on the operator.
struct ConfigBadge: Equatable {
    let count: Int
    let waiting: Bool

    /// The badge's words for VoiceOver and the pointer (`title`).
    var said: String { waiting ? "\(count) waiting on you" : "\(count) failing on a machine or at the hub" }
}

/// One entry of Configure's section list (config/sections.ts
/// `ConfigSection`): where it lives and what it is for, and how its screen
/// is made. A section that lists rows has a count; a setting has none.
@MainActor
struct ConfigSection {
    let slug: String
    let group: String
    let label: String
    /// The one line under the section's title.
    let purpose: String
    let glyph: Glyph
    let hue: UIColor
    /// The rows the list counts beside its name, nil while not read; absent
    /// for a setting (`counted: false`).
    var count: ((HubConnection) -> Int?)?
    /// Its badge, nil when there is nothing to say (counts.svelte.ts
    /// `faultsIn`, `updatesWaiting`). By default the fleet faults whose
    /// scope this section owns.
    var badge: (ConfigSection, HubConnection) -> ConfigBadge? = { section, hub in
        let count = hub.configuration.faults(inSection: section.slug, machines: hub.fleet.machines)
        return count > 0 ? ConfigBadge(count: count, waiting: false) : nil
    }
    /// The section's screen.
    let make: (ConfigSection, ShellContext) -> UIViewController
}

/// Every section Configure has, in the web's order (config/sections.ts
/// `SECTIONS`). A section is listed only once its screen exists, so nothing
/// in the list leads to an empty page: each later section adds its entry here.
@MainActor
enum ConfigSections {
    /// The groups the list is drawn in, in this order (`GROUPS`).
    static let groupOrder = ["Automation", "Agents", "Tools", "Memory", "Hub"]

    static let all: [ConfigSection] = [models, phone, updates]

    static let models = ConfigSection(
        slug: "models", group: "Hub", label: "Models CawCo uses",
        purpose: "Jev's route (OpenRouter or a TypeSafe key), and fleet watch",
        glyph: .cpu, hue: Palette.hueOrange500,
        make: { section, context in ModelsSectionController(section: section, context: context) }
    )

    static let phone = ConfigSection(
        slug: "phone", group: "Hub", label: "Phone",
        purpose: "Pushes to the CawCo app when something needs you",
        glyph: .phone, hue: Palette.hueGreen500,
        make: { section, context in PhoneSectionController(section: section, context: context) }
    )

    static let updates = ConfigSection(
        slug: "updates", group: "Hub", label: "Updates",
        purpose: "The builds your machines run, and when they install them",
        glyph: .download, hue: Palette.hueBlue500,
        badge: { _, hub in
            guard let policy = hub.fleet.updatePolicy else { return nil }
            let waiting = UpdateRows.attention(hub.fleet.machines, policy: policy)
            return waiting > 0 ? ConfigBadge(count: waiting, waiting: true) : nil
        },
        make: { section, context in UpdatesSectionController(section: section, context: context) }
    )

    /// The list's groups, in order, each with its sections; a group with none is not drawn.
    static var groups: [(group: String, sections: [ConfigSection])] {
        groupOrder.compactMap { group in
            let sections = all.filter { $0.group == group }
            return sections.isEmpty ? nil : (group, sections)
        }
    }

    static func section(_ slug: String) -> ConfigSection? { all.first { $0.slug == slug } }

    /// The section last opened (`LAST_KEY`): where a wide Configure opens.
    static var last: String? {
        get { UserDefaults.standard.string(forKey: "cawco.config.last") }
        set { UserDefaults.standard.set(newValue, forKey: "cawco.config.last") }
    }
}
