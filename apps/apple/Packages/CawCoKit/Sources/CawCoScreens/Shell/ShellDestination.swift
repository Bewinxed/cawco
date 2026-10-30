import CawCoCore
import UIKit

/// The sidebar's places, one per web route the shell opens
/// (Sidebar.svelte: Fleet `/session`, a project `/project/[id]`, Configure
/// `/config`, Usage `/usage`).
public enum ShellDestination: Hashable, Sendable {
    case fleet
    case project(String)
    case configure
    case usage

    /// The bar's crumb (Shell.svelte `crumb`).
    var crumb: String {
        switch self {
        case .fleet: "Fleet"
        case .project: "Project"
        case .configure: "Configure"
        case .usage: "Usage"
        }
    }

    /// The place as the web's path names it, which a scene keeps across a
    /// relaunch (`ShellLanding`): `/session`, `/project/<id>`, `/config`,
    /// `/usage`.
    var route: String {
        switch self {
        case .fleet: "/session"
        case let .project(id): "/project/\(id)"
        case .configure: "/config"
        case .usage: "/usage"
        }
    }

    init?(route: String) {
        let path = route.split(separator: "?", maxSplits: 1).first.map(String.init) ?? ""
        switch path {
        case "/session": self = .fleet
        case "/config": self = .configure
        case "/usage": self = .usage
        default:
            if path.hasPrefix("/project/"), path.count > "/project/".count {
                self = .project(String(path.dropFirst("/project/".count)))
            } else {
                return nil
            }
        }
    }

    /// The sidebar's spokes, top to bottom (route.svelte.ts `SPOKE_ORDER`):
    /// a move between two slides that way. A project is not a spoke.
    var spoke: Int? {
        switch self {
        case .fleet: 0
        case .usage: 1
        case .configure: 2
        case .project: nil
        }
    }
}

/// Where a window's shell comes to rest once the fleet is read
/// (ShellController `land`): what its scene kept when it went to the
/// background, or a new window's conversation. Nothing named is the launch's
/// own start: a phone's Home, a wide screen's kept tabs.
struct ShellLanding {
    var place: ShellDestination?
    /// Opened in this order as tabs, the last in front.
    var sessionIds: [String] = []
    /// The scene's saved values: the last session's draft and transcript place among them.
    var values: [AnyHashable: Any]?
}

/// What a destination's screen is handed: the window's hub and shell.
@MainActor
public struct ShellContext {
    public let hub: HubConnection
    public let home: HomeModel
    /// Opens a session the way a row does.
    public let openSession: (String) -> Void
    /// Goes to another place in the shell.
    public let go: (ShellDestination) -> Void
    /// Opens a task's sheet over its project's page: a card's tap, a row's
    /// and a push's, the one way in, so each opens the same sheet.
    let openTask: (_ projectId: String, _ taskId: String) -> Void
    /// Goes to Configure, at the section of this slug.
    let openConfigure: (String) -> Void
    /// Asks to forget a project (the confirm, then the hub).
    let forgetProject: (_ project: ProjectRow, _ from: UIView?) -> Void
    /// Opens the New Session form, at a place when one is given; `spinOff` opens it as a spin-off.
    let startSession: (_ machineId: String?, _ cwd: String?, _ projectId: String?, _ spinOff: Bool) -> Void
    /// A new conversation in a project: the New Session form at its primary
    /// checkout, scoped to it, on `prompt` when the caller has first words.
    let startConversation: (_ projectId: String, _ prompt: String?) -> Void
    /// What a session's context menu needs from the shell.
    let sessionMenus: SessionMenuContext
}

/// The screen each destination opens.
@MainActor
enum ShellScreens {
    static func controller(for destination: ShellDestination, context: ShellContext) -> UIViewController {
        switch destination {
        case .fleet:
            preconditionFailure("the fleet is the shell's own page")
        case let .project(id):
            ProjectViewController(projectId: id, context: context)
        case .configure:
            ConfigureController(context: context)
        case .usage:
            UsageViewController(context: context)
        }
    }
}
