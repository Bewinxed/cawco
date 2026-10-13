import CawCoCore
import UIKit

/// The sidebar's places, one per web route the shell opens
/// (Sidebar.svelte: Fleet `/session`, Workflows `/workflows`, a project
/// `/project/[id]`, Configure `/config`, Usage `/usage`).
public enum ShellDestination: Hashable, Sendable {
    case fleet
    case workflows
    /// A workflow's own page (`/workflows/[id]`), on its Program tab when asked (`?tab=program`).
    case workflow(id: String, program: Bool)
    case project(String)
    case configure
    case usage

    /// The bar's crumb (Shell.svelte `crumb`).
    var crumb: String {
        switch self {
        case .fleet: "Fleet"
        case .workflows, .workflow: "Workflows"
        case .project: "Project"
        case .configure: "Configure"
        case .usage: "Usage"
        }
    }

    /// The place as the web's path names it, which a scene keeps across a
    /// relaunch (`ShellLanding`): `/session`, `/workflows`,
    /// `/workflows/<id>` (`?tab=program` on its Program tab), `/project/<id>`,
    /// `/config`, `/usage`.
    var route: String {
        switch self {
        case .fleet: "/session"
        case .workflows: "/workflows"
        case let .workflow(id, program): "/workflows/\(id)" + (program ? "?tab=program" : "")
        case let .project(id): "/project/\(id)"
        case .configure: "/config"
        case .usage: "/usage"
        }
    }

    init?(route: String) {
        let parts = route.split(separator: "?", maxSplits: 1)
        let path = parts.first.map(String.init) ?? ""
        let program = parts.count > 1 && parts[1] == "tab=program"
        switch path {
        case "/session": self = .fleet
        case "/workflows": self = .workflows
        case "/config": self = .configure
        case "/usage": self = .usage
        default:
            if path.hasPrefix("/workflows/"), path.count > "/workflows/".count {
                self = .workflow(id: String(path.dropFirst("/workflows/".count)), program: program)
            } else if path.hasPrefix("/project/"), path.count > "/project/".count {
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
        case .workflows, .workflow: 1
        case .usage: 2
        case .configure: 3
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
    /// Opens a session (or a run, `run:<id>`) the way a row does.
    public let openSession: (String) -> Void
    /// Goes to another place in the shell.
    public let go: (ShellDestination) -> Void
    /// Opens a task's sheet over its project's page: a card's tap, a row's
    /// and a push's, the one way in, so each opens the same sheet.
    let openTask: (_ projectId: String, _ taskId: String) -> Void
    /// Asks to forget a project (the confirm, then the hub).
    let forgetProject: (ProjectRow) -> Void
    /// Starts a session, at a place when one is given (the New Session flow).
    let startSession: (_ machineId: String?, _ cwd: String?, _ projectId: String?) -> Void
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
        case .workflows:
            WorkflowsViewController(context: context)
        case let .workflow(id, program):
            WorkflowEditorController(context: context, workflowId: id, program: program)
        case .configure:
            ConfigureController(context: context)
        case .usage:
            UsageViewController(context: context)
        }
    }
}
