import CawCoCore
import CawCoDesign
import CawCoMascot
import OSLog
import UIKit

/// Everything that wants the operator, in one place under Caw (CawPanel.svelte,
/// NoticeRow.svelte): Needs you first, longest wait first, a permission
/// answered here with Deny and Approve as equal peers; then Notices, the
/// update that landed, logins moved in and what a new account set moving,
/// each with its ✕. A row opens what it asks for and closes the panel.
///
/// What the glass's card shows for Caw (`GlassContent`; DESIGN.md, "Caw's
/// panel"): it hangs from the glass Caw stands on, and on a phone from his
/// tab, past his foot by the glass's neck, on the tab row's floor so it
/// covers no tab. A finger pulls it down out of his glass and pushes it back
/// up, from Caw or from its body once its list has nothing further to show.
/// A notice is swiped off it sideways (`NoticeRow`).
final class CawPanel: GlassContent {
    /// Its width at most, pt.
    static let wide: CGFloat = 380
    static let tallest: CGFloat = 560
    /// Its content stands this far in from its drawn edge (DESIGN.md, "Caw's panel": 7px).
    static let inset: CGFloat = 7
    fileprivate static let log = Logger(subsystem: "dev.cawco.app", category: "CawPanel")

    /// A row chosen: the panel has begun to close.
    var onChoose: (HomeModel.NeedsItem) -> Void = { _ in }
    var onAnswer: (HomeModel.NeedsItem, ParkedAsk, NeedsYouStore.Answer) -> Void = { _, _, _ in }
    var onDismiss: (Notice) -> Void = { _ in }
    /// One entry of a group acknowledged alone, by its notice ids.
    var onAcknowledge: ([String]) -> Void = { _ in }
    /// The update notice's one act (Retry, Install now).
    var onAct: (Notice) -> Void = { _ in }

    private let scroll = PanelScroll()
    private let list = UIStackView()
    /// The house edge fade where the list runs past what the panel holds
    /// (CawPanel.svelte `kit-edge-fade-block`), at its full 40pt on every
    /// width: a phone's short fade lands in a row's gap and shows nothing.
    private var fade: EdgeFade?
    /// What the rows said last: they are made again only when that changes.
    private var drawn = ""
    /// The groups whose signed-in-everywhere fold stands open: it stays open
    /// when the rows are made again (a wait ticking over).
    private var foldsOpen: Set<Notice.Kind> = []

    /// What each ask's answer has reached (`NeedsYouStore.answerSent`), by item id.
    struct Answers {
        var sent: [String: Ledger.Command] = [:]
    }

    init() {
        super.init(name: "panel", widest: Self.wide, log: Self.log, label: "Notifications", identifier: "caw-panel")
        scroll.frame = bounds
        scroll.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scroll.alwaysBounceVertical = false
        scroll.showsHorizontalScrollIndicator = false
        addSubview(scroll)
        list.axis = .vertical
        list.isLayoutMarginsRelativeArrangement = true
        list.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Self.inset, leading: Self.inset, bottom: Self.inset, trailing: Self.inset)
        // Laid by frame, with the scroll's content size, from the one
        // measure `place` takes: no constraint ties it to the scroll view.
        // Pinned to the scroll's content guide as well as sized by hand, the
        // two wrote its content size against each other, and on an iPad the
        // scroll view's own layout never settled: the main thread stayed in
        // `UIScrollView._applyConstrainedContentSizeIfNecessary` from the tap
        // that opened the panel (FB13170980 is the same seam).
        list.translatesAutoresizingMaskIntoConstraints = true
        scroll.addSubview(list)
        scroll.contentInsetAdjustmentBehavior = .never
        fade = EdgeFade(scroll, length: 40)
    }

    /// The list scrolls only once a push up on the card's body has been ruled out.
    override func joined(_ card: GlassCard) {
        scroll.panGestureRecognizer.require(toFail: card.pushGesture)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CawPanel is built in code")
    }

    // MARK: The glass's card

    /// A push up on the body once its list shows its end.
    override func pushReady() -> Bool {
        scroll.contentOffset.y >= scroll.contentSize.height - scroll.bounds.height - 1
    }

    override func measure(width: CGFloat) -> CGFloat {
        list.systemLayoutSizeFitting(
            CGSize(width: width, height: UIView.layoutFittingCompressedSize.height),
            withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel
        ).height
    }

    override func layContent(width: CGFloat, fit: CGFloat) {
        list.frame = CGRect(x: 0, y: 0, width: width, height: fit)
        scroll.contentSize = list.frame.size
    }

    override func tallest(in _: UIView) -> CGFloat { Self.tallest }

    override var landing: Any? { list.arrangedSubviews.first }

    /// Caw's own press toggles the panel itself, on any bar.
    override func toggles(_ view: UIView) -> Bool { view is NeedsCawButton }

    // MARK: Rows

    /// The rows, as the hub says them now. `quiet`: what Caw says with nothing to list.
    func configure(needs: [HomeModel.NeedsItem], answers: Answers, notices: [Notice], quiet: String, now: Double, live: Bool) {
        let needWords = needs.map { item -> String in
            let stage = Self.stageWords(answers.sent[item.id])
            return "\(item.id)\u{1f}\(item.title)\u{1f}\(item.place)\u{1f}\(item.raisedAt.map { Naming.span(ms: now - $0) } ?? "")\u{1f}\(item.stale)\u{1f}\(stage?.text ?? "")\u{1f}\(answers.sent[item.id].map { $0.stage != .failed } ?? false)"
        }
        let noticeWords = notices.map { notice -> String in
            let head: [String] = [notice.id, notice.closing ?? "", notice.action?.label ?? "", "\(notice.count ?? 0)"]
            let entries: [String] = notice.entries.flatMap { [$0.title] + $0.lines }
            let members: [String] = notice.members.flatMap { [$0.id, $0.title, String(describing: $0.todo)] + $0.lines }
            return (head + entries + members).joined(separator: "\u{1f}")
        }
        let words = (needWords + noticeWords + [quiet, "\(live)"]).joined(separator: "\n")
        guard words != drawn else { return }
        drawn = words
        #if DEBUG
        ProbeCounts.panelRows += 1
        #endif
        for view in list.arrangedSubviews { view.removeFromSuperview() }
        if !needs.isEmpty {
            list.addArrangedSubview(Self.head("Needs you", count: needs.count, glyph: .attention, tint: Palette.statusAttnGlyph))
            for item in needs {
                let row = NeedRow(item, now: now, sent: answers.sent[item.id], live: live)
                row.onChoose = { [weak self] in
                    guard let self else { return }
                    close()
                    onChoose(item)
                }
                row.onAnswer = { [weak self] ask, answer in self?.onAnswer(item, ask, answer) }
                list.addArrangedSubview(row)
            }
        }
        if !notices.isEmpty {
            // The sections part with the vermillion hairline (CawPanel.svelte
            // `.section + .section`): `space2` from the last row to it, and
            // `space2` from it to the head, whose own top margin follows.
            if let last = list.arrangedSubviews.last {
                let rule = SectionRule()
                list.setCustomSpacing(Space.space2, after: last)
                list.addArrangedSubview(rule)
                list.setCustomSpacing(Space.space2, after: rule)
            }
            list.addArrangedSubview(Self.head("Notices", count: notices.count, glyph: .bell, tint: Palette.inkMuted))
            for (at, notice) in notices.enumerated() {
                // Notices part with the grey hairline, as rows of one list do
                // (CawPanel.svelte `.notices > li + li`).
                if at > 0 { list.addArrangedSubview(NoticeRule()) }
                let dismiss: @MainActor () -> Void = { [weak self] in self?.onDismiss(notice) }
                switch notice.lead {
                case .group:
                    let acknowledge: @MainActor ([String]) -> Void = { [weak self] ids in self?.onAcknowledge(ids) }
                    let group = NoticeGroup(notice, open: foldsOpen.contains(notice.kind), dismiss: dismiss, acknowledge: acknowledge)
                    group.resized = { [weak self] open in
                        guard let self else { return }
                        if open { foldsOpen.insert(notice.kind) } else { foldsOpen.remove(notice.kind) }
                        place(animated: true)
                    }
                    list.addArrangedSubview(group)
                case .caw:
                    let act: @MainActor () -> Void = { [weak self] in self?.onAct(notice) }
                    list.addArrangedSubview(NoticeRow.single(notice, dismiss: dismiss, act: act))
                }
            }
        }
        if needs.isEmpty, notices.isEmpty {
            list.addArrangedSubview(Self.empty(quiet))
        }
        let entries = notices.reduce(0) { $0 + $1.members.count }
        Self.log.notice("panel rows: \(needs.count) needs, \(notices.count) notices, \(entries) entries, open \(self.open)")
        if open {
            place(animated: true)
            // Its rows changed under VoiceOver and every reader of the tree: they are read again.
            UIAccessibility.post(notification: .layoutChanged, argument: nil)
        }
    }

    /// A section's head (CawPanel.svelte `.head`): its 16pt Solar duotone
    /// glyph centred in the panel's one 28pt lead column, so its name starts
    /// on the rows' text column `space3` after it; then the name in label
    /// type and how many in the meta ink.
    private static func head(_ title: String, count: Int, glyph: Glyph, tint: UIColor) -> UIView {
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = title
        name.accessibilityTraits = .header
        let figure = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        figure.tabular = true
        figure.text = "\(count)"
        figure.isAccessibilityElement = false
        name.accessibilityValue = "\(count)"
        let words = UIStackView(arrangedSubviews: [name, figure, UIView()])
        words.spacing = Space.space2
        words.alignment = .firstBaseline
        let mark = GlyphView(glyph, size: Size.iconMd, tint: tint)
        let lead = UIView()
        lead.translatesAutoresizingMaskIntoConstraints = false
        lead.addSubview(mark)
        NSLayoutConstraint.activate([
            lead.widthAnchor.constraint(equalToConstant: NoticeRow.lead),
            lead.heightAnchor.constraint(equalToConstant: Size.iconMd),
            mark.centerXAnchor.constraint(equalTo: lead.centerXAnchor),
            mark.centerYAnchor.constraint(equalTo: lead.centerYAnchor),
        ])
        let row = UIStackView(arrangedSubviews: [lead, words])
        row.spacing = Space.space3
        row.alignment = .center
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space3, bottom: Space.space1, trailing: Space.space3)
        row.accessibilityIdentifier = "caw-section-head"
        return row
    }

    /// Nothing listed: Caw at rest and what is known; he rests there only
    /// once "All caught up" is a known answer.
    private static func empty(_ quiet: String) -> UIView {
        let resting = CawMark(status: .ready, side: 48)
        resting.isHidden = quiet != "All caught up"
        let words = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        words.text = quiet
        let stack = UIStackView(arrangedSubviews: [resting, words])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = Space.space2
        stack.isLayoutMarginsRelativeArrangement = true
        stack.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space5, leading: 0, bottom: Space.space4, trailing: 0)
        stack.isAccessibilityElement = true
        stack.accessibilityLabel = quiet
        return stack
    }

    /// An answer's stage, in the operator's words.
    static func stageWords(_ sent: Ledger.Command?) -> (text: String, failed: Bool)? {
        guard let sent else { return nil }
        switch sent.stage {
        case .submitted: return ("Sending…", false)
        case .accepted: return ("The hub has it — waiting for the session.", false)
        case .applied: return ("The session has it.", false)
        case .failed: return ("Couldn't send that answer.\(sent.reason.map { " \($0)" } ?? "")", true)
        }
    }

    // MARK: A notice swiped off

    /// A notice row (or a group, from its head) slid off sideways: the list
    /// closes over it with the panel's height, then it is dismissed the way
    /// its ✕ dismisses it. The rows are made again on the hub's next word,
    /// so one the hub keeps comes back.
    fileprivate func swept(_ row: UIView, dismiss: @escaping @MainActor () -> Void) {
        row.isHidden = true
        drawn = ""
        place(animated: true, then: dismiss)
    }

}

/// The panel's list: it leaves a mostly sideways drag alone, which is a
/// notice being swiped off (`NoticeRow`), as a tab strip leaves a pull down
/// to its tab (PaneTabsView's `StripScroll`).
private final class PanelScroll: UIScrollView {
    override func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
        if gesture === panGestureRecognizer {
            let v = panGestureRecognizer.velocity(in: self)
            if abs(v.x) > abs(v.y) { return false }
        }
        return super.gestureRecognizerShouldBegin(gesture)
    }
}

// MARK: The sections' rule

/// The hairline between Needs you and Notices (DESIGN.md, Caw's panel): 1pt
/// of the brand's vermillion (`brand-solid`) at the session tabs' rim
/// strength (`tab-rim-mix`, by day or by night), across the rows' width, no
/// glow and no fade; solid under Increase Contrast. `color-mix(in oklab,
/// brand-solid N%, transparent)` is the vermillion itself at alpha N.
private final class SectionRule: UIView {
    static let thickness = 1.0

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        accessibilityIdentifier = "caw-section-rule"
        backgroundColor = UIColor { traits in
            let solid = Palette.brandSolid.resolvedColor(with: traits)
            return traits.accessibilityContrast == .high ? solid : solid.withAlphaComponent(Effect.tabRimMix.value(for: traits))
        }
        heightAnchor.constraint(equalToConstant: Self.thickness).isActive = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("SectionRule is built in code")
    }
}

/// The hairline between two notices: 1pt of `border-hairline` across the rows' width.
private final class NoticeRule: UIView {
    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        accessibilityIdentifier = "caw-notice-rule"
        backgroundColor = Palette.borderHairline
        heightAnchor.constraint(equalToConstant: SectionRule.thickness).isActive = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NoticeRule is built in code")
    }
}

// MARK: A row that needs you

/// One thing parked on the operator (NeedsCard.svelte, in Caw's panel):
/// whose it is and how long it has waited, where it runs, what it asks. A
/// permission is answered here, Deny then Approve together at the trailing
/// edge, each filled in its status's tint (The Peer Rule's panel form), a
/// finger's `space4` between them so their 44pt areas meet at the midpoint;
/// a question is answered in its session and a run's in its run. The answer's stage is said under them until the session has it. A
/// press on the row itself opens what it is waiting in.
private final class NeedRow: UIControl {
    var onChoose: () -> Void = {}
    var onAnswer: (ParkedAsk, NeedsYouStore.Answer) -> Void = { _, _ in }

    init(_ item: HomeModel.NeedsItem, now: Double, sent: Ledger.Command?, live: Bool) {
        super.init(frame: .zero)
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        title.text = item.title
        title.lineBreakMode = .byTruncatingTail
        let waited = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        waited.tabular = true
        waited.text = item.raisedAt.map { "waiting \(Naming.span(ms: now - $0))" } ?? "waiting"
        waited.setContentHuggingPriority(.required, for: .horizontal)
        waited.setContentCompressionResistancePriority(.required, for: .horizontal)
        let head = UIStackView(arrangedSubviews: [title, waited])
        head.spacing = Space.space2
        head.alignment = .firstBaseline
        let place = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        place.text = item.stale ? "\(item.place) · machine offline" : item.place
        let ask = KitLabel(TypeScale.typeBody, ink: Palette.inkRow, lines: 2)
        let column = UIStackView(arrangedSubviews: [head, place, ask])
        column.axis = .vertical
        column.spacing = Space.space1
        column.isUserInteractionEnabled = true
        // Held while the hub is not live or its machine is offline: it keeps
        // its place, dimmed, and its answer waits until it can land.
        let stale = !live || item.stale
        let inFlight = sent.map { $0.stage != .failed } ?? false
        switch item.kind {
        case let .ask(parked):
            ask.text = parked.summary
            let actions = UIStackView()
            actions.distribution = .equalSpacing
            if parked.isQuestion {
                actions.addArrangedSubview(UIView())
                actions.addArrangedSubview(KitButton.make("Answer", variant: .secondary, height: .sm) { [weak self] in self?.choose() })
            } else {
                let deny = KitButton.make("Deny", glyph: .close, variant: .fail, height: .sm) { [weak self] in
                    self?.onAnswer(parked, .deny)
                }
                let approve = KitButton.make("Approve", glyph: .tick, variant: .done, height: .sm) { [weak self] in
                    self?.onAnswer(parked, .allow)
                }
                deny.accessibilityLabel = "Deny \(parked.summary) on \(item.title)"
                approve.accessibilityLabel = "Approve \(parked.summary) on \(item.title)"
                deny.accessibilityIdentifier = "caw-need-deny"
                approve.accessibilityIdentifier = "caw-need-approve"
                for peer in [deny, approve] {
                    peer.isEnabled = !stale && !inFlight
                    peer.setContentHuggingPriority(.required, for: .horizontal)
                }
                let room = UIView()
                room.setContentHuggingPriority(.defaultLow - 1, for: .horizontal)
                actions.distribution = .fill
                actions.spacing = Space.space4
                for view in [room, deny, approve] { actions.addArrangedSubview(view) }
            }
            column.addArrangedSubview(actions)
            column.setCustomSpacing(Space.space2, after: ask)
        case .run:
            ask.text = "Waiting on your answer"
            let actions = UIStackView(arrangedSubviews: [UIView(), KitButton.make("Open", variant: .secondary, height: .sm) { [weak self] in self?.choose() }])
            actions.distribution = .equalSpacing
            column.addArrangedSubview(actions)
            column.setCustomSpacing(Space.space2, after: ask)
        }
        if let words = CawPanel.stageWords(sent) {
            let stage = KitLabel(TypeScale.typeMeta, ink: words.failed ? Palette.statusFailInk : Palette.inkMuted, lines: 0)
            stage.text = words.text
            column.addArrangedSubview(stage)
        }
        // Its mark centred in the panel's one 28pt lead column on the title's
        // line (NeedsCard.svelte `.lead`): the session's own mark, as the rail
        // draws it, in the needs-you status; a run its workflow glyph.
        let mark: UIView
        switch item.kind {
        case let .ask(parked):
            let session = SessionMarkView()
            session.configure(id: parked.instanceId, place: item.cwd.isEmpty ? item.machineId : item.cwd, status: .attn)
            mark = session
        case .run:
            mark = GlyphView(.workflow, size: Size.iconMd, tint: Palette.inkMuted)
        }
        mark.isUserInteractionEnabled = false
        let lead = UIView()
        lead.translatesAutoresizingMaskIntoConstraints = false
        lead.isUserInteractionEnabled = false
        lead.addSubview(mark)
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(lead)
        addSubview(column)
        NSLayoutConstraint.activate([
            lead.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
            lead.widthAnchor.constraint(equalToConstant: NoticeRow.lead),
            lead.topAnchor.constraint(equalTo: title.topAnchor),
            lead.bottomAnchor.constraint(equalTo: title.bottomAnchor),
            mark.centerXAnchor.constraint(equalTo: lead.centerXAnchor),
            mark.centerYAnchor.constraint(equalTo: lead.centerYAnchor),
            column.leadingAnchor.constraint(equalTo: lead.trailingAnchor, constant: Space.space3),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3),
            column.topAnchor.constraint(equalTo: topAnchor, constant: Space.space2),
            column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space2),
        ])
        alpha = stale ? 0.55 : 1
        addTarget(self, action: #selector(choose), for: .touchUpInside)
        accessibilityIdentifier = "caw-need"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NeedRow is built in code")
    }

    @objc private func choose() {
        #if DEBUG
        CawPanel.log.notice("panel row chosen: \(self.accessibilityIdentifier ?? "", privacy: .public)")
        #endif
        onChoose()
    }

    #if DEBUG
    /// A simulator probe's word on a press that did not open the row: where it came down and lifted.
    override func beginTracking(_ touch: UITouch, with event: UIEvent?) -> Bool {
        CawPanel.log.notice("panel row press began at \(String(describing: touch.location(in: self)), privacy: .public) in \(String(describing: self.bounds.size), privacy: .public)")
        return super.beginTracking(touch, with: event)
    }

    override func endTracking(_ touch: UITouch?, with event: UIEvent?) {
        let inside = touch.map { point(inside: $0.location(in: self), with: event) }
        CawPanel.log.notice("panel row press ended, inside \(String(describing: inside), privacy: .public), in a window \(self.window != nil, privacy: .public)")
        super.endTracking(touch, with: event)
    }

    override func cancelTracking(with event: UIEvent?) {
        CawPanel.log.notice("panel row press cancelled")
        super.cancelTracking(with: event)
    }
    #endif

    /// A press anywhere on the row but its buttons is the row's own: its
    /// stacks and labels never take the touch (a press between Deny and
    /// Approve landed on the actions' stack and did nothing).
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let hit = super.hitTest(point, with: event) else { return nil }
        var at: UIView? = hit
        while let view = at, view !== self {
            if view is UIControl { return hit }
            at = view.superview
        }
        return self
    }

    /// The press tint (app.css `.press-tint`): `surface-fill` while the finger is down.
    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted ? Palette.surfaceFill : nil }
    }
}

// MARK: A notice

/// The shape every notice row shares (NoticeRow.svelte): its 28pt lead, its
/// words in the text column, and the ✕ (`NoticeCloseButton`, the 24pt ghost)
/// in the first line's trailing cell, where lists put a row's dismiss. Only
/// that cell is the ✕'s: every line under the first runs to the trailing
/// edge, and the first line keeps the ✕'s room (`firstLine`). `nested`: an
/// entry of a group, the same columns with `space1` above and below in place
/// of `space3`, its first line in body type. The row answers for the ✕'s
/// 44pt target too.
///
/// It leaves by its ✕, or swiped off sideways (owner: "the typical slide
/// left right to dismiss"): a mostly sideways drag carries it 1:1 under the
/// finger; let go past `sweep` of its width, carried along its speed, or
/// flicked (`HangPull.flick`), it slides off that way on the house spring at
/// the finger's speed, the list closes over it and it is dismissed as its ✕
/// dismisses it; short of that it springs back. A group's head carries the
/// whole group (`carries`). With less motion it fades out where it stands.
/// VoiceOver has the same as a "Dismiss" action on each of its words.
private final class NoticeRow: UIView {
    private let close: NoticeCloseButton
    private let dismiss: @MainActor () -> Void
    /// What a swipe on the row carries off: the row, or from a group's head its group.
    weak var carries: UIView?
    /// The swipe begins only heading mostly sideways, on the row or any of its
    /// words: up and down is the list's scroll and the panel's push.
    private let swipe = GatedPan(target: nil, action: nil) { $0.heading(.across) }
    private var slide: UIViewPropertyAnimator?
    /// Where the row stood across when the finger took it.
    private var swipeFrom = 0.0
    /// The share of its width a swipe's release, carried along its speed, must pass.
    static let sweep = 0.4

    /// The lead's side (NoticeRow's `lead`, AccountTile at 28).
    static let lead = 28.0
    /// What the first line keeps clear for the ✕ (NoticeRow.svelte
    /// `--x-room`): its words stop `space2` short of its box.
    static let xRoom = NoticeCloseButton.side - NoticeCloseButton.inkInset + Space.space2

    init(lead: UIView, column: UIView, nested: Bool, dismissLabel: String, reading: [Any], dismiss: @escaping @MainActor () -> Void) {
        close = NoticeCloseButton(label: dismissLabel, action: dismiss)
        self.dismiss = dismiss
        super.init(frame: .zero)
        lead.translatesAutoresizingMaskIntoConstraints = false
        lead.isAccessibilityElement = false
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(lead)
        addSubview(column)
        addSubview(close)
        // `space3` above and below, `space1` for a group's entry (NoticeRow.svelte `--pad-block`).
        let pad = nested ? Space.space1 : Space.space3
        let first = nested ? TypeScale.typeBody : TypeScale.typeLabel
        NSLayoutConstraint.activate([
            lead.topAnchor.constraint(equalTo: topAnchor, constant: pad),
            lead.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
            lead.widthAnchor.constraint(equalToConstant: Self.lead),
            lead.heightAnchor.constraint(equalToConstant: Self.lead),
            bottomAnchor.constraint(greaterThanOrEqualTo: lead.bottomAnchor, constant: pad),
            column.topAnchor.constraint(equalTo: topAnchor, constant: pad),
            column.leadingAnchor.constraint(equalTo: lead.trailingAnchor, constant: Space.space3),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3),
            column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -pad),
            // The first line's trailing cell (NoticeRow.svelte `.end`): centred
            // on that line, its box hung past the trailing edge by its ink
            // inset so its stroke ends on the edge the words keep.
            close.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -(Space.space3 - NoticeCloseButton.inkInset)),
            close.centerYAnchor.constraint(equalTo: topAnchor, constant: pad + first.lineHeight / 2),
        ])
        // The words, the act and the ✕ each read on their own; the lead is a
        // picture. Each of the words keeps the swipe's dismissal as an action.
        accessibilityElements = reading + [close]
        accessibilityIdentifier = nested ? "caw-notice-entry" : "caw-notice"
        let gone = UIAccessibilityCustomAction(name: "Dismiss") { _ in
            dismiss()
            return true
        }
        for case let element as NSObject in reading where !(element is UIControl) {
            element.accessibilityCustomActions = (element.accessibilityCustomActions ?? []) + [gone]
        }
        swipe.addTarget(self, action: #selector(swiped(_:)))
        swipe.maximumNumberOfTouches = 1
        addGestureRecognizer(swipe)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NoticeRow is built in code")
    }

    /// A first line that keeps the ✕'s cell clear (`xRoom`).
    static func firstLine(_ parts: [UIView], spacing: Double = Space.space1, alignment: UIStackView.Alignment = .center) -> UIStackView {
        let line = UIStackView(arrangedSubviews: parts)
        line.spacing = spacing
        line.alignment = alignment
        line.isLayoutMarginsRelativeArrangement = true
        line.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 0, bottom: 0, trailing: Self.xRoom)
        return line
    }

    /// A notice that stands alone (UpdateCard.svelte, the hub-newer row): Caw
    /// at its lead, its title and lines, the update's closing words and its
    /// one act at the trailing edge.
    static func single(_ notice: Notice, dismiss: @escaping @MainActor () -> Void, act: @escaping @MainActor () -> Void) -> NoticeRow {
        let column = UIStackView()
        column.axis = .vertical
        column.spacing = 2
        var reading: [Any] = []
        for (at, entry) in notice.entries.enumerated() {
            let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
            title.text = entry.title
            reading.append(title)
            if at == 0 {
                // The failure glyph before the title (UpdateCard `.title`).
                var parts: [UIView] = [title]
                if notice.failed {
                    let glyph = GlyphView(.alert, size: Size.iconMd, tint: Palette.statusFailGlyph)
                    glyph.setContentHuggingPriority(.required, for: .horizontal)
                    parts.insert(glyph, at: 0)
                }
                column.addArrangedSubview(firstLine(parts))
            } else {
                if let last = column.arrangedSubviews.last { column.setCustomSpacing(Space.space3, after: last) }
                column.addArrangedSubview(title)
            }
            for line in entry.lines {
                let said = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
                said.text = line
                column.addArrangedSubview(said)
                reading.append(said)
            }
        }
        if let closing = notice.closing {
            let said = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
            said.text = closing
            column.addArrangedSubview(said)
            reading.append(said)
        }
        if let action = notice.action {
            let button = KitButton.make(action.label, variant: .action, height: .sm) { act() }
            let actions = UIStackView(arrangedSubviews: [UIView(), button])
            actions.alignment = .center
            if let last = column.arrangedSubviews.last { column.setCustomSpacing(Space.space2, after: last) }
            column.addArrangedSubview(actions)
            reading.append(button)
        }
        return NoticeRow(lead: leadView(notice.lead), column: column, nested: false, dismissLabel: notice.dismissLabel, reading: reading, dismiss: dismiss)
    }

    /// Caw's mark in the notice's status, or a group's glyph: the accounts'
    /// own (`IconAccounts`, Solar users-group-rounded), 16pt in muted ink,
    /// centred in the lead as a section head's is (MovedLogins.svelte `.glyph`).
    static func leadView(_ lead: Notice.Lead) -> UIView {
        switch lead {
        case let .caw(status):
            return CawMark(status: Self.status(status), side: Self.lead)
        case .group:
            let box = UIView()
            let glyph = GlyphView(.toolTask, size: Size.iconMd, tint: Palette.inkMuted)
            box.addSubview(glyph)
            NSLayoutConstraint.activate([
                glyph.centerXAnchor.constraint(equalTo: box.centerXAnchor),
                glyph.centerYAnchor.constraint(equalTo: box.centerYAnchor),
            ])
            return box
        }
    }

    /// The mascot's status for a notice's Caw, one for one (UpdateCard.svelte `CawMark status`).
    private static func status(_ lead: Notice.CawLead) -> CawStatus {
        switch lead {
        case .needsYou: .needsYou
        case .working: .working
        case .done: .done
        case .ready: .ready
        case .sleeping: .sleeping
        }
    }

    /// The ✕, when `point` (in the row's space) falls in its 44pt target.
    func closeHit(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard isUserInteractionEnabled, !isHidden, close.point(inside: convert(point, to: close), with: event) else { return nil }
        return close
    }

    /// The ✕'s 44pt target, where it reaches past the row.
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        super.point(inside: point, with: event) || closeHit(point, with: event) != nil
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        closeHit(point, with: event) ?? super.hitTest(point, with: event)
    }

    // MARK: Swiped off

    @objc private func swiped(_ pan: UIPanGestureRecognizer) {
        let moving = carries ?? self
        let dx = pan.translation(in: moving.superview).x
        switch pan.state {
        case .began:
            slide?.stopAnimation(true)
            slide = nil
            swipeFrom = moving.transform.tx
            moving.transform = CGAffineTransform(translationX: swipeFrom + dx, y: 0)
        case .changed:
            moving.transform = CGAffineTransform(translationX: swipeFrom + dx, y: 0)
            #if DEBUG
            let line = String(format: "notice swipe: finger %.1f row %.1f width %.1f", dx, moving.transform.tx, moving.bounds.width)
            CawPanel.log.notice("\(line, privacy: .public)")
            #endif
        case .ended:
            let v = pan.velocity(in: moving.superview).x
            let x = moving.transform.tx
            let carried = x + v * HangPull.project
            let flicked = abs(v) >= HangPull.flick && (x == 0 || (v > 0) == (x > 0))
            #if DEBUG
            let line = String(format: "notice release: x %.1f velocity %.0f width %.1f gone %@", x, v, moving.bounds.width,
                              abs(carried) >= moving.bounds.width * Self.sweep || flicked ? "yes" : "no")
            CawPanel.log.notice("\(line, privacy: .public)")
            #endif
            if abs(carried) >= moving.bounds.width * Self.sweep || flicked {
                sweep(moving, toward: flicked ? (v > 0 ? 1 : -1) : (carried > 0 ? 1 : -1), velocity: v)
            } else {
                settle(moving, to: 0, velocity: v)
            }
        case .cancelled, .failed:
            settle(moving, to: 0, velocity: 0)
        default:
            break
        }
    }

    /// Off the panel `toward` (1 trailing, -1 leading), then dismissed; with less motion it fades where it stands.
    private func sweep(_ moving: UIView, toward side: Double, velocity: Double) {
        swipe.isEnabled = false
        let off = { [weak self, weak moving] in
            guard let self, let moving else { return }
            var at = moving.superview
            while let view = at, !(view is CawPanel) { at = view.superview }
            if let panel = at as? CawPanel {
                panel.swept(moving, dismiss: dismiss)
            } else {
                dismiss()
            }
        }
        if UIAccessibility.isReduceMotionEnabled {
            let fade = Motion.easeOut.animator(Motion.durFade) {
                moving.transform = .identity
                moving.alpha = 0
            }
            fade.addCompletion { _ in off() }
            fade.startAnimation()
            return
        }
        // Clear of the panel's edge, past what the row's own margin leaves.
        settle(moving, to: side * (moving.bounds.width + Space.space6), velocity: velocity, done: off)
    }

    /// Across to `x` on the house spring, leaving at the finger's `velocity`.
    private func settle(_ moving: UIView, to x: Double, velocity: Double, done: @escaping () -> Void = {}) {
        let distance = x - moving.transform.tx
        let spring = UIViewPropertyAnimator(
            duration: Motion.durSettle,
            timingParameters: HouseSpring.timing(velocity: abs(distance) >= 0.5 ? velocity / distance : 0)
        )
        spring.addAnimations { moving.transform = CGAffineTransform(translationX: x, y: 0) }
        spring.addCompletion { [weak self, weak spring] position in
            guard let self, let spring, slide === spring else { return }
            slide = nil
            if position == .end { done() }
        }
        slide = spring
        spring.startAnimation()
    }
}

// MARK: A group of notices

/// Logins moved into CawCo, or the passes an account's arrival set moving,
/// as one group (MovedLogins.svelte, RebalanceNotices.svelte): a head led by
/// the accounts' glyph, its title (and a pass group's count) and one line
/// saying what it means, its ✕ acknowledging them all; then each entry as a
/// row of the panel, not indented, its account's tile in the lead, its own
/// ✕. A moved login still to sign in on some machine stands open; those
/// signed in everywhere fold behind one toggle, so the group never outgrows
/// the panel with nothing to do in it. The head and its line stand apart from
/// the entries by the head's `space3` foot and the first entry's `space1`,
/// against `space1` + `space1` between two entries.
private final class NoticeGroup: UIView {
    /// The fold opened (true) or shut: the panel keeps that and takes its new height.
    var resized: (Bool) -> Void = { _ in }
    private let fold = UIStackView()
    private var toggle: UIButton?
    private var open: Bool
    private let folded: Int
    /// Its head and entries, whose ✕s' targets reach past its box.
    private var rows: [NoticeRow] = []

    init(_ notice: Notice, open: Bool, dismiss: @escaping @MainActor () -> Void, acknowledge: @escaping @MainActor ([String]) -> Void) {
        let todo = notice.members.filter { $0.todo != .everywhere }
        let done = notice.members.filter { $0.todo == .everywhere }
        folded = done.count
        self.open = open
        super.init(frame: .zero)
        let stack = UIStackView()
        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        // A swipe on the head carries the whole group off, as its ✕ acknowledges them all.
        let head = Self.head(notice, dismiss: dismiss)
        head.carries = self
        rows.append(head)
        stack.addArrangedSubview(head)
        // The entries, `space2` under the last (`.entries`).
        let entries = UIStackView()
        entries.axis = .vertical
        entries.isLayoutMarginsRelativeArrangement = true
        entries.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 0, bottom: Space.space2, trailing: 0)
        for member in todo {
            let row = Self.entry(member, acknowledge: acknowledge)
            rows.append(row)
            entries.addArrangedSubview(row)
        }
        if !done.isEmpty {
            let button = KitButton.make(Self.toggleWords(open: open, count: done.count), glyph: open ? .chevronUp : .chevronDown,
                                        variant: .ghost, height: .xs) { [weak self] in
                self?.flip()
            }
            // The chevron after the words, the xs size's 6pt beside an icon.
            button.configuration?.imagePlacement = .trailing
            button.configuration?.contentInsets.trailing = 6 + 1
            button.accessibilityValue = open ? "Expanded" : "Collapsed"
            button.accessibilityIdentifier = "caw-moved-fold"
            toggle = button
            // In the text column, its chevron's ink on the trailing edge: it
            // hangs past by the 1pt border, its 6pt padding and the 12pt
            // chevron's side bearing (its stroke ends at 19.75 of 24).
            let more = UIStackView(arrangedSubviews: [UIView(), button])
            more.isLayoutMarginsRelativeArrangement = true
            more.directionalLayoutMargins = NSDirectionalEdgeInsets(
                top: 0, leading: Space.space3 + NoticeRow.lead + Space.space3, bottom: Space.space1,
                trailing: Space.space3 - (1 + 6 + Size.iconSm * 4.25 / 24)
            )
            entries.addArrangedSubview(more)
            fold.axis = .vertical
            fold.clipsToBounds = true
            for member in done {
                let row = Self.entry(member, acknowledge: acknowledge)
                rows.append(row)
                fold.addArrangedSubview(row)
            }
            fold.isHidden = !open
            fold.alpha = open ? 1 : 0
            entries.addArrangedSubview(fold)
        }
        stack.addArrangedSubview(entries)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NoticeGroup is built in code")
    }

    /// The ✕ whose target `point` falls in, the last row's first (the one
    /// drawn over its neighbours). A row's ✕ reaches past the group's own box
    /// on its trailing side, which no hit test inside the box would see.
    private func closeHit(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        for row in rows.reversed() where row.window != nil && !row.isHidden && row.superview?.isHidden == false {
            if let close = row.closeHit(convert(point, to: row), with: event) { return close }
        }
        return nil
    }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        super.point(inside: point, with: event) || closeHit(point, with: event) != nil
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard isUserInteractionEnabled, !isHidden, alpha > 0.01 else { return nil }
        return closeHit(point, with: event) ?? super.hitTest(point, with: event)
    }

    /// The head: label type in strong ink (with a pass group's count in the
    /// meta ink), its line in muted meta.
    private static func head(_ notice: Notice, dismiss: @escaping @MainActor () -> Void) -> NoticeRow {
        let entry = notice.entries[0]
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
        title.text = entry.title
        var parts: [UIView] = [title]
        if let count = notice.count {
            let figure = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            figure.tabular = true
            figure.text = "\(count)"
            figure.isAccessibilityElement = false
            figure.setContentHuggingPriority(.required, for: .horizontal)
            title.accessibilityValue = "\(count)"
            parts += [figure, UIView()]
        }
        let column = UIStackView(arrangedSubviews: [NoticeRow.firstLine(parts, alignment: .firstBaseline)])
        column.axis = .vertical
        column.spacing = 2
        var reading: [Any] = [title]
        for line in entry.lines {
            let said = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
            said.text = line
            column.addArrangedSubview(said)
            reading.append(said)
        }
        return NoticeRow(lead: NoticeRow.leadView(notice.lead), column: column, nested: false, dismissLabel: notice.dismissLabel,
                         reading: reading, dismiss: dismiss)
    }

    /// One entry (MovedLogin.svelte, a pass): its name a step under the head
    /// (body type, row ink, one line); a moved login's origin with what is
    /// left to do at the line's trailing edge, a pass's lines in muted meta.
    private static func entry(_ member: Notice.Member, acknowledge: @escaping @MainActor ([String]) -> Void) -> NoticeRow {
        let name = KitLabel(TypeScale.typeBody, ink: Palette.inkRow)
        name.text = member.title
        name.lineBreakMode = .byTruncatingTail
        let column = UIStackView(arrangedSubviews: [NoticeRow.firstLine([name])])
        column.axis = .vertical
        column.spacing = 2
        var reading: [Any] = [name]
        if let todo = member.todo {
            let from = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
            from.text = member.lines.first
            let end = Self.todoView(todo)
            let sub = UIStackView(arrangedSubviews: [from, end])
            sub.spacing = Space.space2
            sub.alignment = .center
            column.addArrangedSubview(sub)
            reading += [from, end]
        } else {
            for line in member.lines {
                let said = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
                said.text = line
                column.addArrangedSubview(said)
                reading.append(said)
            }
        }
        // A pass whose first account's provider is not known wears no tile, as on the web.
        let lead: UIView = member.tile.map { AccountTileView($0, side: NoticeRow.lead) } ?? UIView()
        return NoticeRow(lead: lead, column: column, nested: true, dismissLabel: "Dismiss \(member.title)", reading: reading,
                         dismiss: { acknowledge([member.id]) })
    }

    /// What is left to do, in muted meta: the machines still to sign in
    /// (words only; the panel opens no settings), or the success glyph and
    /// "Signed in everywhere".
    private static func todoView(_ todo: Notice.Todo) -> UIView {
        let words = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        // Its last letter on the trailing edge: the words never take slack.
        words.setContentHuggingPriority(.required, for: .horizontal)
        words.setContentCompressionResistancePriority(.required, for: .horizontal)
        let view: UIView
        switch todo {
        case let .signIn(machines):
            words.text = "Sign in on \(machines) machine\(machines == 1 ? "" : "s")"
            view = words
        case .everywhere:
            words.text = "Signed in everywhere"
            let tick = UIStackView(arrangedSubviews: [GlyphView(.passed, size: Size.iconSm, tint: Palette.inkMuted), words])
            tick.spacing = Space.space1
            tick.alignment = .center
            tick.isAccessibilityElement = true
            tick.accessibilityLabel = "Signed in everywhere"
            view = tick
        }
        view.setContentHuggingPriority(.required, for: .horizontal)
        view.setContentCompressionResistancePriority(.required, for: .horizontal)
        return view
    }

    private static func toggleWords(open: Bool, count: Int) -> String {
        "\(open ? "Hide" : "Show") \(count) signed in everywhere"
    }

    /// Opens or shuts the fold (UpdateCard's notes' recipe): open over
    /// `durPanel`, shut quicker over `durExit`; with less motion only the fade.
    private func flip() {
        guard let toggle else { return }
        open.toggle()
        KitButton.setTitle(Self.toggleWords(open: open, count: folded), of: toggle, variant: .ghost, height: .xs)
        toggle.configuration?.image = (open ? Glyph.chevronUp : Glyph.chevronDown).image.resized(to: Size.iconSm)
        toggle.accessibilityValue = open ? "Expanded" : "Collapsed"
        let opening = open
        let change = {
            self.fold.isHidden = !opening
            self.fold.alpha = opening ? 1 : 0
        }
        if UIAccessibility.isReduceMotionEnabled {
            change()
        } else {
            Motion.easeOut.animator(opening ? Motion.durPanel : Motion.durExit) {
                change()
                self.superview?.layoutIfNeeded()
            }.startAnimation()
        }
        resized(opening)
    }
}

/// An account's tile (AccountTile.svelte): its provider's mark in one ink,
/// the account's colour, on that colour at a low alpha, at the small radius.
private final class AccountTileView: UIView {
    init(_ tile: Notice.Tile, side: Double) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        let hue = Self.hue(tile.hue)
        backgroundColor = hue.withAlphaComponent(0.18)
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        isAccessibilityElement = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: side),
            heightAnchor.constraint(equalToConstant: side),
        ])
        guard let logo = BrandLogo.provider(tile.provider) else { return }
        // `mono`: the mark in the account's ink, whatever its own colours.
        let mark = UIImageView(image: logo.image.withRenderingMode(.alwaysTemplate))
        mark.tintColor = hue
        mark.contentMode = .scaleAspectFit
        mark.translatesAutoresizingMaskIntoConstraints = false
        addSubview(mark)
        let glyph = side >= 32 ? 18.0 : 16.0
        NSLayoutConstraint.activate([
            mark.centerXAnchor.constraint(equalTo: centerXAnchor),
            mark.centerYAnchor.constraint(equalTo: centerYAnchor),
            mark.widthAnchor.constraint(equalToConstant: glyph),
            mark.heightAnchor.constraint(equalToConstant: glyph),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("AccountTileView is built in code")
    }

    /// The `account-<hue>` token (core AccountHue).
    private static func hue(_ name: String) -> UIColor {
        switch name {
        case "amber": Palette.accountAmber
        case "green": Palette.accountGreen
        case "cyan": Palette.accountCyan
        case "blue": Palette.accountBlue
        case "rose": Palette.accountRose
        case "violet": Palette.accountViolet
        default: Palette.accountOrange
        }
    }
}
