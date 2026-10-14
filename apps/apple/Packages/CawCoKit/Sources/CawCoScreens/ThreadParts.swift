import CawCoAPI
import CawCoCore
import CawCoDesign
import CawCoMascot
import CawCoTranscript
import UIKit

extension UIView {
    /// Adds `child` filling this view, `insets` in.
    func hold(_ child: UIView, insets: UIEdgeInsets = .zero) {
        child.translatesAutoresizingMaskIntoConstraints = false
        addSubview(child)
        NSLayoutConstraint.activate([
            child.leadingAnchor.constraint(equalTo: leadingAnchor, constant: insets.left),
            child.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -insets.right),
            child.topAnchor.constraint(equalTo: topAnchor, constant: insets.top),
            child.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -insets.bottom),
        ])
    }
}

extension UIViewController {
    /// Why nothing can be sent from a session's or a thread's composer now,
    /// other than an empty field: the composer's action box wears it as its
    /// warning state and explains on a tap. Nothing is said unasked (HIG
    /// Alerts: "Avoid using an alert merely to provide information"). The
    /// first seconds of a connect, and a swipe, are too brief to explain.
    func sendBlock(_ hub: HubConnection) -> SendBlock? {
        // The hub answered in a shape this app cannot read (HubConnection
        // `incompatible`, the same check, words and `/health` version the
        // connect screen uses): the fix is an update, so it is told in an alert.
        if let incompatible = hub.incompatible {
            return SendBlock(reason: HubConnection.Incompatible.title) { [weak self, weak hub] in
                guard let self, let hub else { return }
                explainIncompatible(incompatible, hub: hub)
            }
        }
        // Local Network privacy refuses the hub: known as soon as the socket is
        // refused, so said from then (no outage grace), and its one fix is the
        // status line's, Open Settings (no Reconnect: trying again can't help).
        if hub.localNetworkDenied {
            let reason = LocalNetwork.refusal
            return SendBlock(reason: reason, menu: UIMenu(title: reason, children: [
                UIAction(title: LocalNetwork.settingsAction, image: Glyph.settings.image) { _ in UIApplication.shared.open(LocalNetwork.settingsURL) },
            ]))
        }
        if hub.state == .unreachable {
            let reason = "Reconnecting to the hub…"
            return SendBlock(reason: reason, menu: UIMenu(title: reason, children: [
                UIAction(title: "Reconnect", image: Glyph.refresh.image) { [weak hub] _ in hub?.reconnectNow() },
            ]))
        }
        return nil
    }

    /// The one reason that carries its fix in an alert: this app and the hub
    /// don't match, and either update fixes it (HubMismatchController's words).
    private func explainIncompatible(_ incompatible: HubConnection.Incompatible, hub: HubConnection) {
        let alert = UIAlertController(title: HubConnection.Incompatible.title,
                                      message: incompatible.message(host: hub.address?.host() ?? "your hub"), preferredStyle: .alert)
        let open = UIAlertAction(title: "Open TestFlight", style: .default) { _ in
            UIApplication.shared.open(HubConnection.Incompatible.testFlight)
        }
        alert.addAction(open)
        alert.addAction(UIAlertAction(title: "Reconnect", style: .default) { [weak hub] _ in hub?.reconnect() })
        alert.preferredAction = open
        present(alert, animated: true)
    }
}

/// The task cards under one of Caw's replies (ThreadPane.svelte
/// `.thread-tasks`, `repeat(auto-fill, minmax(14rem, 1fr))`): as many
/// 14rem columns as the row's width holds, each card stretched to its
/// column. The column count is chosen at the width the row is laid out at,
/// which the transcript gives it before measuring its height.
final class TaskGridView: UIView {
    private let cards: [UIView]
    private let lines = UIStackView()
    private var columns = 0
    private static let column: CGFloat = 14 * 16

    init(_ cards: [UIView]) {
        self.cards = cards
        super.init(frame: .zero)
        lines.axis = .vertical
        lines.spacing = Space.space2
        hold(lines)
        arrange(1)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("TaskGridView is built in code") }

    override func layoutSubviews() {
        if bounds.width > 0 {
            arrange(max(1, Int((bounds.width + Space.space2) / (Self.column + Space.space2))))
        }
        super.layoutSubviews()
    }

    private func arrange(_ count: Int) {
        guard count != columns else { return }
        columns = count
        for line in lines.arrangedSubviews { line.removeFromSuperview() }
        for start in stride(from: 0, to: cards.count, by: count) {
            let line = UIStackView()
            line.axis = .horizontal
            line.spacing = Space.space2
            line.distribution = .fillEqually
            line.alignment = .top
            for at in start ..< start + count {
                line.addArrangedSubview(at < cards.count ? cards[at] : UIView())
            }
            lines.addArrangedSubview(line)
        }
    }
}

/// A thread row's mark (SessionMark.svelte): Caw at what the thread is
/// doing, on the row's tile; nothing for a session's row.
@MainActor
enum ThreadFace {
    static func portrait(_ id: String, status: MarkStatus, held: UIView?) -> UIView? {
        guard ThreadTabs.isThread(id) else { return nil }
        let caw: CawStatus = switch status {
        case .live: .working
        case .attn: .needsYou
        default: .ready
        }
        if let held = held as? ThreadPortrait, held.caw == caw { return held }
        return ThreadPortrait(caw)
    }
}

/// Caw, still, at one status: what a thread row's tile wears.
final class ThreadPortrait: UIView {
    let caw: CawStatus

    init(_ caw: CawStatus) {
        self.caw = caw
        super.init(frame: .zero)
        hold(CawMark(status: caw, side: SessionMarkView.tile))
        isAccessibilityElement = false
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }
}

/// How far a conversation's plan has got, as the control that opens it
/// (plan/PlanRing.svelte): a tray chip, the progress ring, "Plan" and its figure.
final class PlanRingButton: UIControl {
    private let ring = TaskRingView(size: .md)
    private let glyph = GlyphView(.toolTodo, size: Size.iconSm, tint: Palette.inkMuted)
    private let word = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
    private let figure = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        word.text = "Plan"
        figure.tabular = true
        let line = UIStackView(arrangedSubviews: [ring, glyph, word, figure])
        line.spacing = Space.space2
        line.alignment = .center
        line.isUserInteractionEnabled = false
        hold(line, insets: UIEdgeInsets(top: 0, left: Space.space2, bottom: 0, right: Space.space2))
        heightAnchor.constraint(equalToConstant: Size.cTrayChipCoarse).isActive = true
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func configure(done: Int, total: Int) {
        let counted = total > 0
        ring.isHidden = !counted
        glyph.isHidden = counted
        figure.isHidden = !counted
        if counted { ring.configure(done: done, total: total) }
        figure.text = "\(done)/\(total)"
        accessibilityLabel = counted ? "Plan, \(done) of \(total) done" : "Plan"
    }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted ? Palette.surfaceFill : .clear }
    }
}

/// A session's plan, whole (plan/PlanPane.svelte): its steps, each with
/// where it stands, nested as written, then its spec. It follows the plan
/// as the hub keeps it.
final class PlanSheetController: ObservedViewController {
    let scroll = UIScrollView()
    private let hub: HubConnection
    private let instanceId: String
    private let steps = UIStackView()
    private let spec = MarkdownDocumentView()
    private let empty = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)

    init(hub: HubConnection, instanceId: String) {
        self.hub = hub
        self.instanceId = instanceId
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRaised
        let column = UIStackView(arrangedSubviews: [empty, steps, spec])
        column.axis = .vertical
        column.spacing = Space.space5
        steps.axis = .vertical
        steps.spacing = Space.space2
        empty.text = "No steps yet."
        scroll.alwaysBounceVertical = true
        view.hold(scroll)
        column.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(column)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: Space.space5),
            column.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -Space.space5),
            column.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space4),
            column.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space6),
            column.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -2 * Space.space5),
        ])
    }

    override func refreshContent() {
        let plan = hub.plans.plans[instanceId]
        steps.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for step in plan?.steps ?? [] {
            steps.addArrangedSubview(Self.row(step))
        }
        empty.isHidden = !(plan?.steps.isEmpty ?? true) || plan?.spec != nil
        spec.isHidden = plan?.spec == nil
        if let markdown = plan?.spec { spec.setSource(markdown) }
    }

    private static func row(_ step: PlanStep) -> UIView {
        let mark: UIView
        switch step.status {
        case "completed":
            mark = GlyphView(.tick, size: Size.iconSm, tint: Palette.statusDoneInk)
        case "in_progress":
            let dot = UIView()
            dot.backgroundColor = Palette.statusLiveGlyph
            dot.layer.cornerRadius = 4
            dot.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([dot.widthAnchor.constraint(equalToConstant: 8), dot.heightAnchor.constraint(equalToConstant: 8)])
            mark = dot
        default:
            let ring = UIView()
            ring.layer.borderWidth = 1.5
            ring.layer.borderColor = Palette.borderControl.cgColor
            ring.layer.cornerRadius = 5
            ring.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([ring.widthAnchor.constraint(equalToConstant: 10), ring.heightAnchor.constraint(equalToConstant: 10)])
            mark = ring
        }
        let cell = UIView()
        cell.translatesAutoresizingMaskIntoConstraints = false
        mark.translatesAutoresizingMaskIntoConstraints = false
        cell.addSubview(mark)
        NSLayoutConstraint.activate([
            cell.widthAnchor.constraint(equalToConstant: Size.iconSm),
            cell.heightAnchor.constraint(equalToConstant: TypeScale.textBody * TypeScale.leadingBody),
            mark.centerXAnchor.constraint(equalTo: cell.centerXAnchor),
            mark.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
        ])
        let words = KitLabel(TypeScale.typeBody, ink: step.status == "completed" ? Palette.inkMuted : Palette.inkStrong, lines: 0)
        words.text = step.content
        let line = UIStackView(arrangedSubviews: [cell, words])
        line.spacing = Space.space2
        line.alignment = .top
        line.isLayoutMarginsRelativeArrangement = true
        line.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: Double(step.depth) * Space.space5, bottom: 0, trailing: 0)
        line.isAccessibilityElement = true
        let state = ["completed": "done", "in_progress": "in progress"][step.status] ?? "to do"
        line.accessibilityLabel = "\(step.content), \(state)"
        return line
    }
}

/// The project folder's files a Caw reply names (project/FolderFiles.svelte):
/// one chip each, its path, which opens the file as it reads on the hub.
final class FolderFilesView: UIView {
    init(files: [String], open: @escaping (String) -> Void) {
        super.init(frame: .zero)
        let chips: [UIView] = files.map { path in
            let chip = KitButton.make(path, glyph: .document, variant: .outline, height: .sm) { open(path) }
            chip.accessibilityLabel = "Open \(path)"
            return chip
        }
        hold(WrapLayout(chips))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }
}

/// One file of a project's folder, read as it is on the hub: Markdown drawn,
/// anything else as text (FolderFiles.svelte's sheet).
final class FolderFileController: UIViewController {
    let scroll = UIScrollView()
    private let hub: HubConnection
    private let projectId: String
    private let path: String
    private let column = UIStackView()

    init(hub: HubConnection, projectId: String, path: String) {
        self.hub = hub
        self.projectId = projectId
        self.path = path
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRaised
        column.axis = .vertical
        column.spacing = Space.space3
        scroll.alwaysBounceVertical = true
        view.hold(scroll)
        column.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(column)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: Space.space5),
            column.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -Space.space5),
            column.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space4),
            column.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space6),
            column.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -2 * Space.space5),
        ])
        for _ in 0 ..< 4 { column.addArrangedSubview(SkeletonView(height: TypeScale.textBody * TypeScale.leadingBody)) }
        Task { [weak self] in await self?.read() }
    }

    private func read() async {
        let shown: UIView
        do {
            let content = try await hub.threads.file(projectId, path: path)
            if path.hasSuffix(".md") {
                let markdown = MarkdownDocumentView()
                markdown.setSource(content)
                shown = markdown
            } else {
                let text = KitLabel(TypeScale.typeCode, ink: Palette.inkStrong, lines: 0)
                text.role = TypeScale.typeCode.with(points: TypeScale.textLabel, leading: TypeScale.leadingCode)
                text.text = content
                shown = text
            }
        } catch {
            let said = KitLabel(TypeScale.typeBody, ink: Palette.statusFailInk, lines: 0)
            said.text = error.localizedDescription
            shown = said
        }
        column.arrangedSubviews.forEach { $0.removeFromSuperview() }
        column.addArrangedSubview(shown)
    }
}
