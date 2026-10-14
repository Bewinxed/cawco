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
    var said: String {
        waiting ? Words.Configure.badgeWaiting(count: count) : Words.Configure.badgeFailing(count: count)
    }
}

/// One entry of Configure's section list: core's definition of it
/// (`Words.Configure.sections`, the web's config/sections.ts reads the same),
/// its glyph and hue as the app draws them, and its screen where the app has
/// one. The list is the web's: every group and every section, in its order.
@MainActor
struct ConfigSection {
    let definition: Words.Configure.Section
    let glyph: Glyph
    let hue: UIColor
    /// The section's screen; nil where the app has none of its own yet.
    let make: ((ConfigSection, ShellContext) -> UIViewController)?

    var slug: String { definition.slug }
    var group: String { definition.group }
    var label: String { definition.label }
    /// The one line under the section's title; nil where the section's rows say it.
    var purpose: String? { definition.purpose }
    /// It lists rows the list counts beside its name; a setting has no count.
    var counted: Bool { definition.counted }
    /// The app opens it: it has its own screen here.
    var opens: Bool { make != nil }

    /// The rows the list counts beside its name, nil while not read
    /// (counts.svelte.ts `countOf`, from the same reads: the fleet's setup,
    /// the rules, hooks, delegate types and tools, and the accounts).
    func count(_ hub: HubConnection) -> Int? {
        guard counted else { return nil }
        let config: FleetConfig = hub.configuration
        let fleet = config.snapshot
        switch slug {
        case "rules": return config.rulesCount
        case "hooks": return config.hooksCount
        case "delegate-types": return config.typesCount
        case "subagents": return fleet?.agents.count
        case "cli-tools": return config.toolsCount
        case "mcp": return fleet?.config.mcp.count
        case "skills": return fleet.map { $0.skills.count + $0.config.plugins.count }
        case "memory": return fleet.map { ($0.memory == nil ? 0 : 1) + $0.memoryDocs.count }
        case "accounts": return FleetAccounts.view(hub)?.accounts.count
        default: return nil
        }
    }

    /// Its badge by the rule its definition names (counts.svelte.ts
    /// `badgeOf`, core `ConfigBadgeRule`), nil when there is nothing to say.
    func badge(_ hub: HubConnection) -> ConfigBadge? {
        switch definition.badge {
        case "account-faults":
            let faults = FleetAccounts.view(hub).map(FleetAccounts.faults) ?? 0
            return faults > 0 ? ConfigBadge(count: faults, waiting: false) : nil
        case "updates-waiting":
            guard let policy = hub.fleet.updatePolicy else { return nil }
            let waiting = UpdateRows.attention(hub.fleet.machines, policy: policy)
            return waiting > 0 ? ConfigBadge(count: waiting, waiting: true) : nil
        default:
            let faults = hub.configuration.faults(inSection: slug, machines: hub.fleet.machines)
            return faults > 0 ? ConfigBadge(count: faults, waiting: false) : nil
        }
    }
}

/// Every section Configure has, in the web's order and groups
/// (`Words.Configure.sections`, `Words.Configure.groups`). A section the app
/// has no screen for yet is listed as the web lists it, with its count and
/// badge, and does not open: nothing in the list leads to an empty page.
@MainActor
enum ConfigSections {
    /// The screens the app has, by section.
    private static let screens: [String: (ConfigSection, ShellContext) -> UIViewController] = [
        "accounts": { section, context in AccountsSectionController(section: section, context: context) },
        "models": { section, context in ModelsSectionController(section: section, context: context) },
        "phone": { section, context in PhoneSectionController(section: section, context: context) },
        "updates": { section, context in UpdatesSectionController(section: section, context: context) },
    ]

    static let all: [ConfigSection] = Words.Configure.sections.map { definition in
        // `bun run words` refuses a section whose glyph or hue the app has not got.
        guard let glyph = Glyph(rawValue: definition.icon) else {
            preconditionFailure("no Glyph \(definition.icon); run `bun run words`")
        }
        return ConfigSection(definition: definition, glyph: glyph, hue: Palette.named(definition.hue), make: screens[definition.slug])
    }

    /// The list's groups, in order, each with its sections.
    static var groups: [(group: String, sections: [ConfigSection])] {
        Words.Configure.groups.map { group in (group, all.filter { $0.group == group }) }
    }

    static func section(_ slug: String) -> ConfigSection? { all.first { $0.slug == slug } }

    /// The sections the app opens, in the list's order.
    static var opening: [ConfigSection] { all.filter(\.opens) }

    /// Configure › Accounts, which a machine's sign-in opens.
    static var accounts: ConfigSection {
        guard let accounts = section("accounts") else { preconditionFailure("core defines no accounts section") }
        return accounts
    }

    /// The section last opened (`LAST_KEY`): where a wide Configure opens.
    static var last: String? {
        get { UserDefaults.standard.string(forKey: "cawco.config.last") }
        set { UserDefaults.standard.set(newValue, forKey: "cawco.config.last") }
    }
}
