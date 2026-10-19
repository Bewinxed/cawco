import CawCoCore
import CawCoDesign
import UIKit

/// What stands beside the conversation in the session's split
/// (SideSplit.svelte's surface): the preview, or the plan. The split lays it
/// out, drags it, expands it and hands it Esc the same way whichever it is.
protocol SideCard: UIViewController {
    /// Expand or Back pressed: the split moves to the edge or back.
    var onExpand: () -> Void { get set }
    /// Esc with nothing of its own left to close: the split gives the conversation back.
    var onEscapeLeft: () -> Void { get set }
    /// Something in it has the keyboard.
    var holdsKeys: Bool { get }
    /// Expanded over the whole session area: the card meets its edges.
    func standsExpanded(_ expanded: Bool)
    /// Esc on it: false when it had nothing to close.
    func escape() -> Bool
    /// The Plan | Preview switch at the head's start while both are open (SideSurface.svelte `switcher`); nil, none.
    func showSwitcher(_ switcher: UIView?)
}

/// A session's plan beside the conversation (plan/PlanPane.svelte in
/// SideSurface, `recessed={false}`): the side card's head (the switch while
/// the preview is open too, else "Plan", or "To-dos" and the task when the
/// attempt's to-dos stand alone; Expand, Close) over the plan on the card's
/// own surface, one column that scrolls (Peek/TaskPanel.swift `PlanView`).
final class PlanSideController: ObservedViewController, SideCard {
    private let hub: HubConnection
    private let instanceId: String
    private let plan: PlanView
    private let scroll = UIScrollView()
    private let head = UIStackView()
    private let identity = UIStackView()
    private let titleLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let subtitle = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkMuted)
    private var switcher: UIView?
    private var expandButton: UIButton!
    private var expanded = false
    private var headTop: NSLayoutConstraint!
    private var headLeading: NSLayoutConstraint!
    private var headTrailing: NSLayoutConstraint!
    var onExpand: () -> Void = {}
    var onEscapeLeft: () -> Void = {}
    /// Close: the plan leaves the side (PlanPane's `onclose`).
    var onClose: () -> Void = {}

    init(hub: HubConnection, instanceId: String) {
        self.hub = hub
        self.instanceId = instanceId
        plan = PlanView(hub: hub, instanceId: instanceId)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("PlanSideController is built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRaised
        // The head, as the preview's: `height: 44px`, the identity then the actions, `gap-1`.
        identity.axis = .vertical
        identity.addArrangedSubview(titleLabel)
        identity.addArrangedSubview(subtitle)
        identity.isLayoutMarginsRelativeArrangement = true
        identity.directionalLayoutMargins.leading = Space.space1
        titleLabel.accessibilityTraits = .header
        expandButton = KitButton.make("", glyph: .maximize, variant: .ghost, height: .sm) { [weak self] in self?.onExpand() }
        expandButton.accessibilityLabel = "Expand"
        expandButton.toolTip = "Expand"
        let close = KitButton.make("", glyph: .close, variant: .ghost, height: .sm) { [weak self] in self?.onClose() }
        close.accessibilityLabel = "Close"
        for part in [identity, UIView(), expandButton!, close] as [UIView] { head.addArrangedSubview(part) }
        head.spacing = Space.space1
        head.alignment = .center
        head.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(head)
        // `.body`: one column that scrolls, `space-1` under the head, `space-4` at its foot, the head's left edge its own.
        scroll.alwaysBounceVertical = true
        scroll.translatesAutoresizingMaskIntoConstraints = false
        // The card's foot is rounded; the card itself is not clipped, so its shadow stands outside it.
        scroll.layer.cornerRadius = Radius.radiusLg
        scroll.layer.cornerCurve = .continuous
        scroll.layer.maskedCorners = [.layerMinXMaxYCorner, .layerMaxXMaxYCorner]
        scroll.addSubview(plan)
        view.addSubview(scroll)
        headTop = head.topAnchor.constraint(equalTo: view.topAnchor)
        headLeading = head.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Space.space2)
        headTrailing = head.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Space.space2)
        NSLayoutConstraint.activate([
            headTop, headLeading, headTrailing,
            head.heightAnchor.constraint(equalToConstant: 44),
            scroll.topAnchor.constraint(equalTo: head.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            plan.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space1),
            plan.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space4),
            plan.centerXAnchor.constraint(equalTo: scroll.frameLayoutGuide.centerXAnchor),
            plan.widthAnchor.constraint(lessThanOrEqualTo: scroll.frameLayoutGuide.widthAnchor, constant: -2 * (Space.space2 + Space.space1)),
        ])
        // The column fills the card; expanded over the whole session area it keeps the house measure (72ch), centred.
        let fill = plan.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -2 * (Space.space2 + Space.space1))
        fill.priority = .defaultHigh
        let measure = plan.widthAnchor.constraint(lessThanOrEqualToConstant: 72 * ("0" as NSString).size(withAttributes: [.font: TypeScale.typeBody.font]).width)
        NSLayoutConstraint.activate([fill, measure])
    }

    override func refreshContent() {
        plan.refresh()
        let now = plan.plan
        // A task's to-dos alone: the card is titled by them, the task beside.
        titleLabel.text = now?.onlyTodos == true ? Words.Plan.todos : Words.Plan.plan
        subtitle.text = now?.onlyTodos == true ? now?.taskId : nil
        subtitle.isHidden = subtitle.text == nil
        identity.isHidden = switcher != nil
        #if DEBUG
        let line = "plan side \(instanceId) title=\(titleLabel.text ?? "-") switcher=\(switcher != nil) expanded=\(expanded)"
        if line != said {
            said = line
            PreviewProbe.say(line)
        }
        #endif
    }

    #if DEBUG
    private var said = ""
    #endif

    var holdsKeys: Bool { false }

    func standsExpanded(_ expanded: Bool) {
        loadViewIfNeeded()
        self.expanded = expanded
        let glyph: Glyph = expanded ? .minimize : .maximize
        expandButton.configuration?.image = glyph.image.resized(to: Size.iconMd)
        expandButton.accessibilityLabel = expanded ? "Back to conversation" : "Expand"
        expandButton.toolTip = expanded ? "Back to conversation (Esc)" : "Expand"
        scroll.layer.cornerRadius = expanded ? 0 : Radius.radiusLg
        let inset = Space.space2
        headTop.constant = expanded ? inset : 0
        headLeading.constant = expanded ? inset * 2 : inset
        headTrailing.constant = expanded ? -inset * 2 : -inset
    }

    func escape() -> Bool { false }

    func showSwitcher(_ next: UIView?) {
        loadViewIfNeeded()
        guard next !== switcher || next?.superview !== head else { return }
        // The one switch moves between the cards' heads: only its place in this head is taken down here.
        if let switcher, switcher.superview === head { switcher.removeFromSuperview() }
        switcher = next
        if let next { head.insertArrangedSubview(next, at: 0) }
        identity.isHidden = next != nil
        refreshContent()
    }
}
