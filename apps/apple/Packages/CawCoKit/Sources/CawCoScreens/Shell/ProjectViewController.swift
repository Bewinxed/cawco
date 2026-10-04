import CawCoCore
import CawCoDesign
import UIKit

/// A project's home (routes/project/[id]/+page.svelte): its name, folder and
/// machine, then the sessions that ran in it, live first, then what its
/// machine has stored.
final class ProjectViewController: ObservedViewController {
    private let projectId: String
    private let context: ShellContext
    private let scroll = UIScrollView()
    private let page = UIStackView()
    private let name = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong)
    private let folder = KitLabel(TypeScale.typeCode.withWeight(.regular), ink: Palette.inkMuted)
    private let machineGlyph = GlyphView(.server, tint: Palette.inkMuted)
    private let machineName = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.inkMuted)
    private let presence = UIView()
    private let sessions = UIStackView()
    private let missing = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted)
    private var showMore = false
    private var inventory: MachineInventoryView!
    private var docsView: ProjectDocsView!
    private var memory: ProjectMemoryCard!
    /// Stored sessions shown before "Show more".
    private static let storedFirst = 8

    init(projectId: String, context: ShellContext) {
        self.projectId = projectId
        self.context = context
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ProjectViewController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = true
        view.addSubview(scroll)
        page.axis = .vertical
        page.spacing = Space.space6
        page.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(page)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            page.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space6),
            page.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space6),
            page.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: Space.space6),
            page.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -Space.space6),
        ])

        // Header: the name, then the folder and the machine it lives on.
        folder.lineBreakMode = .byTruncatingMiddle
        presence.layer.cornerRadius = 4
        presence.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([presence.widthAnchor.constraint(equalToConstant: 8), presence.heightAnchor.constraint(equalToConstant: 8)])
        let machine = UIStackView(arrangedSubviews: [machineGlyph, machineName, presence])
        machine.spacing = 6
        machine.alignment = .center
        // The folder truncates (`truncate`); the machine keeps its name.
        folder.setContentCompressionResistancePriority(.defaultLow - 1, for: .horizontal)
        machineName.setContentCompressionResistancePriority(.required, for: .horizontal)
        machine.setContentCompressionResistancePriority(.required, for: .horizontal)
        let meta = UIStackView(arrangedSubviews: [folder, machine])
        meta.spacing = Space.space3
        meta.alignment = .center
        let titles = UIStackView(arrangedSubviews: [name, meta])
        titles.axis = .vertical
        titles.spacing = Space.space1
        // The header's actions: Forget project… as the kit's ghost button in muted ink.
        var forgetStyle = UIButton.Configuration.plain()
        forgetStyle.attributedTitle = AttributedString("Forget project…", attributes: AttributeContainer(TypeScale.typeButton.attributes(color: Palette.mutedForeground, tracking: -0.01)))
        forgetStyle.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: Space.space4, bottom: 0, trailing: Space.space4)
        forgetStyle.background.cornerRadius = Radius.radiusMd
        let forget = UIButton(configuration: forgetStyle, primaryAction: UIAction { [weak self] _ in
            guard let self, let project = context.hub.fleet.projects.first(where: { $0.id == projectId }) else { return }
            context.forgetProject(project)
        })
        forget.configurationUpdateHandler = { button in
            button.configuration?.background.backgroundColor = button.isHighlighted ? Palette.surfaceFill : .clear
        }
        forget.houseStyle()
        forget.heightAnchor.constraint(equalToConstant: Size.cBtnH).isActive = true
        let head = UIStackView(arrangedSubviews: [titles, forget])
        head.alignment = .center
        head.spacing = Space.space4
        titles.setContentHuggingPriority(.defaultLow, for: .horizontal)
        page.addArrangedSubview(head)

        // The repo's own markdown.
        docsView = ProjectDocsView(hub: context.hub)
        page.addArrangedSubview(docsView)

        // Its CLAUDE.md, summarised: the docs card is where it is read.
        memory = ProjectMemoryCard(hub: context.hub)
        page.addArrangedSubview(memory)

        // What its machine has (MachineInventory, MCP servers).
        inventory = MachineInventoryView(hub: context.hub)
        page.addArrangedSubview(inventory)

        // Sessions, in a card.
        let card = TileView(radius: Radius.radiusLg)
        let title = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong)
        title.text = "Sessions"
        sessions.axis = .vertical
        sessions.spacing = 6
        let body = UIStackView(arrangedSubviews: [title, sessions])
        body.axis = .vertical
        body.spacing = Space.space3
        body.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(body)
        NSLayoutConstraint.activate([
            body.topAnchor.constraint(equalTo: card.topAnchor, constant: Space.space3),
            body.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -Space.space3),
            body.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: Space.space3),
            body.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -Space.space3),
        ])
        page.addArrangedSubview(card)

        missing.text = "No such project."
        missing.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(missing)
        NSLayoutConstraint.activate([
            missing.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            missing.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    override func refreshContent() {
        let fleet = context.hub.fleet
        guard let project = fleet.projects.first(where: { $0.id == projectId }) else {
            scroll.isHidden = fleet.fleetRead
            missing.isHidden = !fleet.fleetRead
            return
        }
        scroll.isHidden = false
        missing.isHidden = true
        name.text = project.name
        folder.text = project.cwd
        let machine = fleet.machines.first { $0.machineId == project.machineId }
        machineGlyph.glyph = Glyph.os(machine?.os ?? "")
        machineName.text = machine.map { Naming.machineLabel($0.hostname) } ?? project.machineId
        let online = machine?.status == "online"
        if context.hub.state == .connected { docsView.load(machineId: project.machineId, cwd: project.cwd, projectId: project.id) }
        if context.hub.state == .connected {
            memory.load(machineId: project.machineId, cwd: project.cwd, projectId: project.id, online: online,
                        machineName: machine.map { Naming.machineLabel($0.hostname) } ?? project.machineId)
        }
        inventory.isHidden = machine == nil
        if let machine { inventory.configure(machines: [machine]) }
        presence.backgroundColor = online ? Palette.success : Palette.mutedForeground.withAlphaComponent(0.4)

        for row in sessions.arrangedSubviews {
            sessions.removeArrangedSubview(row)
            row.removeFromSuperview()
        }
        guard fleet.fleetRead else {
            for _ in 0 ..< 8 { sessions.addArrangedSubview(SkeletonView(height: 36)) }
            return
        }
        // Live: every session the hub holds whose folder is this project's or under it.
        let inside = { (machineId: String, cwd: String?) in
            machineId == project.machineId && (cwd == project.cwd || (cwd ?? "").hasPrefix(project.cwd + "/"))
        }
        let live = fleet.rows.filter { $0.isListed && ($0.projectId == project.id || inside($0.machineId, $0.cwd)) }
        for row in RailModel.sorted(live, hub: context.hub, home: context.home, by: .recent) {
            let view = SessionRowView()
            view.configure(.init(
                id: row.id,
                place: row.cwd.isEmpty ? row.machineId : row.cwd,
                status: HomeViewController.status(row, home: context.home),
                title: fleet.title(row),
                trail: RailAge.short(fleet.lastAt(row), now: context.home.now)
            ))
            sessions.addArrangedSubview(tappable(view) { [weak self] in self?.context.openSession(row.id) })
        }
        let running = Set(fleet.rows.compactMap(\.sessionId))
        let stored = fleet.catalog(project.machineId).filter { inside(project.machineId, $0.cwd) && !running.contains($0.sessionId) }
        let read = !online || fleet.catalogs[project.machineId] != nil
        guard read else {
            for _ in 0 ..< 8 { sessions.addArrangedSubview(SkeletonView(height: 36)) }
            return
        }
        let shown = showMore ? stored : Array(stored.prefix(Self.storedFirst))
        for info in shown {
            let view = SessionRowView()
            let title = fleet.storedTitle(info)
            view.configure(.init(id: info.sessionId, place: info.cwd ?? project.cwd, status: .idle, title: title))
            let id = fleet.conversationId(sessionKey: info.sessionId, machineId: project.machineId, cwd: info.cwd)
            sessions.addArrangedSubview(tappable(view) { [weak self] in self?.context.openSession(id) })
        }
        if live.isEmpty, stored.isEmpty {
            let empty = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.inkMuted, lines: 0)
            empty.text = "Nothing is running in this project, and nothing has been recorded."
            sessions.addArrangedSubview(empty)
        }
        if !showMore, stored.count > Self.storedFirst {
            // `variant="ghost" size="sm"` in muted ink, at the start.
            var ghost = UIButton.Configuration.plain()
            ghost.attributedTitle = AttributedString("Show \(stored.count - Self.storedFirst) more",
                                                     attributes: AttributeContainer(TypeScale.typeLabel.attributes(color: Palette.mutedForeground)))
            ghost.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: Space.space3, bottom: 0, trailing: Space.space3)
            ghost.background.cornerRadius = Radius.radiusMd
            let more = UIButton(configuration: ghost, primaryAction: UIAction { [weak self] _ in
                self?.showMore = true
                self?.requestRefresh()
            })
            more.configurationUpdateHandler = { button in
                button.configuration?.background.backgroundColor = button.isHighlighted ? Palette.surfaceFill : (button.isHovered ? Palette.surfaceHover : .clear)
            }
            more.houseStyle()
            more.heightAnchor.constraint(equalToConstant: Size.cBtnHSm).isActive = true
            let row = UIStackView(arrangedSubviews: [more, UIView()])
            sessions.addArrangedSubview(row)
        }
    }

    private func tappable(_ content: UIView, _ action: @escaping () -> Void) -> UIView {
        let row = RailRow(height: 44, leading: 0, trailing: 0, gap: 0)
        content.isUserInteractionEnabled = false
        content.translatesAutoresizingMaskIntoConstraints = false
        row.content.addArrangedSubview(content)
        row.content.trailingAnchor.constraint(equalTo: row.trailingAnchor).isActive = true
        row.addAction(UIAction { _ in action() }, for: .primaryActionTriggered)
        return row
    }
}
