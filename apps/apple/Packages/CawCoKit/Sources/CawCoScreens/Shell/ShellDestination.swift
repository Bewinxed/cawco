import CawCoCore
import CawCoDesign
import UIKit

/// The sidebar's places, one per web route the shell opens
/// (Sidebar.svelte: Fleet `/session`, Workflows `/workflows`, a project
/// `/project/[id]`, Configure `/config`, Usage `/usage`).
public enum ShellDestination: Hashable, Sendable {
    case fleet
    case workflows
    case project(String)
    case configure
    case usage

    /// The bar's crumb (Shell.svelte `crumb`).
    var crumb: String {
        switch self {
        case .fleet: "Fleet"
        case .workflows: "Workflows"
        case .project: "Project"
        case .configure: "Configure"
        case .usage: "Usage"
        }
    }

    /// The sidebar's spokes, top to bottom (route.svelte.ts `SPOKE_ORDER`):
    /// a move between two slides that way. A project is not a spoke.
    var spoke: Int? {
        switch self {
        case .fleet: 0
        case .workflows: 1
        case .usage: 2
        case .configure: 3
        case .project: nil
        }
    }
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
    /// Asks to forget a project (the confirm, then the hub).
    let forgetProject: (ProjectRow) -> Void
}

/// The routing hook each track fills: the screen a destination opens.
/// Workflows (Track 4), Configure (Track 3) and Usage (Track 4) replace
/// their placeholder case here when their screen lands.
@MainActor
enum ShellScreens {
    static func controller(for destination: ShellDestination, context: ShellContext) -> UIViewController {
        switch destination {
        case .fleet:
            preconditionFailure("the fleet is the shell's own page")
        case let .project(id):
            ProjectViewController(projectId: id, context: context)
        case .workflows:
            PlaceholderViewController(destination: destination)
        case .configure:
            PlaceholderViewController(destination: destination)
        case .usage:
            PlaceholderViewController(destination: destination)
        }
    }
}

/// A place whose screen has not landed yet: its name on the page's ground.
final class PlaceholderViewController: UIViewController {
    private let destination: ShellDestination

    init(destination: ShellDestination) {
        self.destination = destination
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PlaceholderViewController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        let label = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted)
        label.text = destination.crumb
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }
}
