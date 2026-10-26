import CawCoCore
import CawCoDesign
import UIKit

/// An artifact in a tab of its own (routes/artifact/[id]/+page.svelte): the
/// artifact panel's head and its page at the tab's whole width, joined to the
/// same document as its session's panel, so a pick here is a pick there. The
/// session's panel shows this artifact while the tab is open on it (the hub
/// serves a session one artifact at a time): opened, the tab asks it to.
/// Close goes back to the session; an artifact the hub can't find says why,
/// with the way back to the fleet.
final class ArtifactTabController: ObservedViewController {
    let artifactId: String
    private let hub: HubConnection
    private var preview: PreviewController?
    private var problem: KitEmptyState?
    /// The session the artifact is its: Close goes back there.
    var onBackToSession: (String) -> Void = { _ in }
    var onReturnToFleet: () -> Void = {}
    /// The artifact's name, for its tab.
    var onNamed: (String) -> Void = { _ in }

    init(hub: HubConnection, artifactId: String) {
        self.hub = hub
        self.artifactId = artifactId
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("ArtifactTabController is built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRaised
        find()
    }

    /// The artifact and its session (artifact-api.ts `findArtifact`); not shown, the session's panel is asked to.
    private func find() {
        Task { [weak self, hub, artifactId] in
            do {
                let found = try await hub.findArtifact(artifactId)
                if !found.shown { hub.openArtifact(artifactId, in: found.instanceId) }
                self?.stand(found.instanceId, name: found.name)
            } catch {
                self?.refused(error.localizedDescription)
            }
        }
    }

    private func stand(_ instanceId: String, name: String) {
        self.instanceId = instanceId
        onNamed(name)
        let preview = PreviewController(hub: hub, instanceId: instanceId, ownTab: true)
        preview.onBackToSession = { [weak self] in self?.onBackToSession(instanceId) }
        addChild(preview)
        view.hold(preview.view)
        preview.didMove(toParent: self)
        // The tab's whole width: the card meets its edges.
        preview.standsExpanded(true)
        self.preview = preview
        requestRefresh()
    }

    /// The artifact page's empty state (`This artifact didn't open`): the hub's words, and the way back.
    private func refused(_ why: String) {
        let back = KitButton.make("Back to the fleet", variant: .outline, height: .standard) { [weak self] in self?.onReturnToFleet() }
        let state = KitEmptyState(icon: .alert, title: "This artifact didn't open", line: "\(why) Open it again from its session's panel.", action: back)
        state.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(state)
        NSLayoutConstraint.activate([
            state.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            state.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Space.space6),
            state.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Space.space6),
        ])
        problem = state
    }

    /// The session's preview as the hub says it now: the tab draws what its panel shows.
    override func refreshContent() {
        preview?.show()
        #if DEBUG
        if let instanceId {
            let frame = hub.previews.byInstance[instanceId]
            let line = "artifact tab \(artifactId) shows \(frame?.artifact.id ?? "-") state=\(frame?.state.rawValue ?? "-")"
            if line != said {
                said = line
            }
        }
        #endif
    }

    /// The session the artifact is its, once found.
    private var instanceId: String?
    #if DEBUG
    private var said = ""
    #endif

    /// Whether its tab is the one in front of its group: behind, its page is let go, as a session's preview's is.
    func standsInFront(_ front: Bool) {
        preview?.standsInFront(front)
    }
}
