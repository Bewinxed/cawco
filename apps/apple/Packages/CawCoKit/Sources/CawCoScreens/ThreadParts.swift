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
/// (plan/PlanRing.svelte): a tray chip (app.css `.kit-tray-chip`, the
/// delegate chips' recipe: the raised surface on a hairline with the tile's
/// shadow at `--radius-sm`, label type at the strong weight, `--c-pill-gap`
/// apart), the progress ring, "Plan" and its figure. Pressed while the plan
/// is on show: the fill, in the strong ink.
final class PlanRingButton: UIControl {
    private let surface = UIView()
    private let ring = TaskRingView(size: .md)
    private let glyph = GlyphView(.toolTodo, size: Size.iconMd, tint: Palette.inkMuted)
    private let word = KitLabel(TypeScale.typeLabel.with(weight: TypeScale.weightStrong), ink: Palette.inkMuted)
    private let figure = KitLabel(TypeScale.typeLabel.with(weight: TypeScale.weightStrong), ink: Palette.inkMuted)

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        surface.isUserInteractionEnabled = false
        surface.layer.cornerRadius = Radius.radiusSm
        surface.layer.cornerCurve = .continuous
        surface.layer.borderWidth = 1
        surface.boxShadow = Shadow.shadowTile
        addSubview(surface)
        word.text = Words.Plan.plan
        figure.tabular = true
        let line = UIStackView(arrangedSubviews: [ring, glyph, word, figure])
        line.spacing = Size.cPillGap
        line.alignment = .center
        line.isUserInteractionEnabled = false
        hold(line, insets: UIEdgeInsets(top: 0, left: Space.space2, bottom: 0, right: Space.space2))
        heightAnchor.constraint(equalToConstant: Size.cTrayChipCoarse).isActive = true
        isAccessibilityElement = true
        accessibilityTraits = .button
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: PlanRingButton, _: UITraitCollection) in view.paintFill() }
        paintFill()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        surface.frame = bounds
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func configure(done: Int, total: Int) {
        let counted = total > 0
        ring.isHidden = !counted
        glyph.isHidden = counted
        figure.isHidden = !counted
        if counted { ring.configure(done: done, total: total) }
        figure.text = Words.Plan.figure(done: done, total: total)
        accessibilityLabel = Words.Plan.ringLabel(done: done, total: total)
    }

    /// The plan is on show beside the conversation (PlanRing.svelte `aria-pressed`): the strong ink.
    var open = false {
        didSet {
            for label in [word, figure] { label.ink = open ? Palette.inkStrong : Palette.inkMuted }
            glyph.tintColor = open ? Palette.inkStrong : Palette.inkMuted
            accessibilityTraits = open ? [.button, .selected] : .button
            paintFill()
        }
    }

    override var isHighlighted: Bool {
        didSet {
            paintFill()
            // `.kit-tray-chip:active`: the press scale, on the control clock.
            guard !UIAccessibility.isReduceMotionEnabled else { return }
            let scale = isHighlighted ? Motion.pressScale : 1
            Motion.easeOut.animator(Motion.durControl) { self.transform = CGAffineTransform(scaleX: scale, y: scale) }.startAnimation()
        }
    }

    private func paintFill() {
        surface.backgroundColor = open ? Palette.surfaceFill : Palette.surfaceRaised
        surface.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }
}

/// A session's plan, whole (plan/PlanPane.svelte in the phone's sheet): its
/// steps nested as written, its spec, an attempt's to-dos (Peek/TaskPanel.swift
/// `PlanView`), in one column that scrolls, under the sheet's title. It
/// follows the plan as the hub keeps it; whoever opens it follows the session.
final class PlanSheetController: ObservedViewController {
    let scroll = UIScrollView()
    private let plan: PlanView

    init(hub: HubConnection, instanceId: String) {
        plan = PlanView(hub: hub, instanceId: instanceId)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// The sheet's title for `plan` (PlanPane.svelte `cardTitle`): an attempt's to-dos alone are titled by them, their task beside.
    static func title(_ plan: SessionPlan?) -> String {
        guard let plan, plan.onlyTodos else { return Words.Plan.plan }
        return plan.taskId.map { "\(Words.Plan.todos) \($0)" } ?? Words.Plan.todos
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRaised
        scroll.alwaysBounceVertical = true
        view.hold(scroll)
        scroll.addSubview(plan)
        // As tall as the plan: the sheet is as tall as its content, up to its cap, and scrolls past it.
        let natural = scroll.frameLayoutGuide.heightAnchor.constraint(equalTo: scroll.contentLayoutGuide.heightAnchor)
        natural.priority = .defaultHigh - 1
        NSLayoutConstraint.activate([
            // `.body.sheet`: the sheet's content edge, `space-3` under the header's seam, nothing at its foot.
            plan.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            plan.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            plan.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space3),
            plan.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            plan.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
            natural,
        ])
        plan.onResize = { [weak self] in self?.view.setNeedsLayout() }
    }

    override func refreshContent() {
        plan.refresh()
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
    #if DEBUG
    /// The words it read, or why it could not, once drawn.
    private(set) var probeShown: String?
    #endif

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
            #if DEBUG
            probeShown = content
            #endif
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
            #if DEBUG
            probeShown = "failed: \(error.localizedDescription)"
            #endif
        }
        column.arrangedSubviews.forEach { $0.removeFromSuperview() }
        column.addArrangedSubview(shown)
    }
}
