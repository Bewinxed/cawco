import CawCoCore
import CawCoDesign
import CawCoMascot
import UIKit

/// Everything that wants the operator, in one place under Caw (CawPanel.svelte,
/// NoticeRow.svelte): Needs you first, longest wait first, a permission
/// answered here with Deny and Approve as equal peers; then Notices, the
/// update that landed, logins moved in and what a new account set moving,
/// each with its ✕. A row opens what it asks for and closes the panel.
///
/// It is not a sheet and not a popover presentation: the shell owns it as a
/// view over its columns, with nothing under it, so the rest of the app keeps
/// working while it is open (owner: "that goes against the multitasking
/// approach we have"). A tap anywhere outside it closes it and still lands on
/// whatever it fell on (`dismissal`). It is `.kit-pop`'s card: the raised
/// surface, a 1pt control border, `radiusLg` and the overlay shadow, grown out
/// of Caw from the pop scale and rise over `durPop` on the drawer curve and
/// gone over `durExit`; with less motion it fades.
final class CawPanel: UIView, UIGestureRecognizerDelegate {
    /// Its top under Caw's glass, pt.
    static let gap: CGFloat = 8
    /// Kept from the screen's edges, pt.
    static let edge: CGFloat = 8
    /// Its width beside a wide screen's bar, pt; a phone's is the screen's less `edge` each side.
    static let wide: CGFloat = 380
    static let tallest: CGFloat = 560

    /// A row chosen: the panel has begun to close.
    var onChoose: (HomeModel.NeedsItem) -> Void = { _ in }
    var onAnswer: (HomeModel.NeedsItem, ParkedAsk, NeedsYouStore.Answer) -> Void = { _, _, _ in }
    var onDismiss: (Notice) -> Void = { _ in }
    /// The update notice's one act (Retry, Install now).
    var onAct: (Notice) -> Void = { _ in }
    /// Opened or closed: Caw says so.
    var onOpenChange: (Bool) -> Void = { _ in }

    private(set) var open = false
    private weak var source: UIView?
    private let card = UIView()
    private let scroll = UIScrollView()
    private let list = UIStackView()
    private var motion: UIViewPropertyAnimator?
    /// What the rows said last: they are made again only when that changes.
    private var drawn = ""

    /// What each ask's answer has reached (`NeedsYouStore.answerSent`), by item id.
    struct Answers {
        var sent: [String: Ledger.Command] = [:]
    }

    init() {
        super.init(frame: .zero)
        isHidden = true
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        boxShadow = Shadow.shadowOverlay
        card.frame = bounds
        card.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        card.backgroundColor = Palette.surfaceRaised
        card.layer.cornerRadius = Radius.radiusLg
        card.layer.cornerCurve = .continuous
        card.layer.borderWidth = 1
        card.clipsToBounds = true
        card.accessibilityContainerType = .semanticGroup
        card.accessibilityLabel = "Notifications"
        card.accessibilityIdentifier = "caw-panel"
        addSubview(card)
        scroll.frame = card.bounds
        scroll.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scroll.alwaysBounceVertical = false
        scroll.showsHorizontalScrollIndicator = false
        card.addSubview(scroll)
        list.axis = .vertical
        list.isLayoutMarginsRelativeArrangement = true
        list.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space2, bottom: Space.space2, trailing: Space.space2)
        list.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(list)
        NSLayoutConstraint.activate([
            list.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            list.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            list.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            list.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            list.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (panel: CawPanel, _: UITraitCollection) in panel.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CawPanel is built in code")
    }

    private func paint() {
        card.layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
    }

    // MARK: Rows

    /// The rows, as the hub says them now. `quiet`: what Caw says with nothing to list.
    func configure(needs: [HomeModel.NeedsItem], answers: Answers, notices: [Notice], quiet: String, now: Double, live: Bool) {
        let needWords = needs.map { item -> String in
            let stage = Self.stageWords(answers.sent[item.id])
            return "\(item.id)\u{1f}\(item.title)\u{1f}\(item.place)\u{1f}\(item.raisedAt.map { Naming.span(ms: now - $0) } ?? "")\u{1f}\(item.stale)\u{1f}\(stage?.text ?? "")\u{1f}\(answers.sent[item.id].map { $0.stage != .failed } ?? false)"
        }
        let noticeWords = notices.map { notice in
            ([notice.id, notice.closing ?? "", notice.action?.label ?? ""] + notice.entries.flatMap { [$0.title] + $0.lines }).joined(separator: "\u{1f}")
        }
        let words = (needWords + noticeWords + [quiet, "\(live)"]).joined(separator: "\n")
        guard words != drawn else { return }
        drawn = words
        for view in list.arrangedSubviews { view.removeFromSuperview() }
        if !needs.isEmpty {
            list.addArrangedSubview(Self.head("Needs you", count: needs.count))
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
            let head = Self.head("Notices", count: notices.count)
            list.addArrangedSubview(head)
            if !needs.isEmpty { list.setCustomSpacing(Space.space3, after: list.arrangedSubviews[list.arrangedSubviews.count - 2]) }
            for notice in notices {
                let row = NoticeRow(notice)
                row.onDismiss = { [weak self] in self?.onDismiss(notice) }
                row.onAct = { [weak self] in self?.onAct(notice) }
                list.addArrangedSubview(row)
            }
        }
        if needs.isEmpty, notices.isEmpty {
            list.addArrangedSubview(Self.empty(quiet))
        }
        if open { place(animated: true) }
    }

    /// A section's head: its name and how many, in the meta ink.
    private static func head(_ title: String, count: Int) -> UIView {
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = title
        name.accessibilityTraits = .header
        let figure = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        figure.tabular = true
        figure.text = "\(count)"
        figure.isAccessibilityElement = false
        name.accessibilityValue = "\(count)"
        let row = UIStackView(arrangedSubviews: [name, figure, UIView()])
        row.spacing = Space.space2
        row.alignment = .firstBaseline
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space3, bottom: Space.space1, trailing: Space.space3)
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

    // MARK: Where it stands

    /// Under Caw's glass: across a phone less `edge` each side; beside a
    /// wide bar `wide` across, its end on his. As tall as its rows, up to
    /// what the screen leaves under him or `tallest`, its list scrolling past that.
    private func place(animated: Bool = false) {
        guard let host = superview, let source, source.window != nil else { return }
        let cap = source.convert(source.bounds, to: host)
        let compact = host.traitCollection.horizontalSizeClass == .compact
        let width = compact ? host.bounds.width - 2 * Self.edge : min(Self.wide, host.bounds.width - 2 * Self.edge)
        let x = compact ? Self.edge : min(max(Self.edge, cap.maxX - width), host.bounds.width - Self.edge - width)
        let top = cap.maxY + Self.gap
        let room = host.bounds.height - host.safeAreaInsets.bottom - Self.edge - top
        let fit = list.systemLayoutSizeFitting(
            CGSize(width: width, height: UIView.layoutFittingCompressedSize.height),
            withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel
        ).height
        let size = CGSize(width: width, height: max(0, min(ceil(fit), room, Self.tallest)))
        // It grows from the point on its top edge under Caw.
        let anchor = CGPoint(x: min(1, max(0, (cap.midX - x) / width)), y: 0)
        let apply = {
            self.layer.anchorPoint = anchor
            self.bounds = CGRect(origin: .zero, size: size)
            self.layer.position = CGPoint(x: x + anchor.x * size.width, y: top)
            self.scroll.contentSize = CGSize(width: width, height: ceil(fit))
        }
        if animated, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeOut.animator(Motion.durMorph) { apply(); self.layoutIfNeeded() }.startAnimation()
        } else {
            apply()
        }
    }

    /// Caw moved under it (a rotation, the rail stepping aside): it follows him.
    func follow() {
        guard open, motion == nil else { return }
        place()
    }

    // MARK: Open and close

    /// Where it comes from and goes back to: the pop scale, `popRise` up toward Caw.
    private var away: CGAffineTransform {
        UIAccessibility.isReduceMotionEnabled ? .identity
            : CGAffineTransform(translationX: 0, y: -Motion.popRise).scaledBy(x: Motion.popScale, y: Motion.popScale)
    }

    func show(from source: UIView) {
        self.source = source
        superview?.bringSubviewToFront(self)
        motion?.stopAnimation(true)
        if isHidden {
            alpha = 0
            transform = .identity
            place()
            transform = away
        } else {
            place()
        }
        isHidden = false
        setOpen(true)
        let move = Motion.easeDrawer.animator(Motion.durPop) {
            self.alpha = 1
            self.transform = .identity
        }
        move.addCompletion { [weak self] _ in self?.motion = nil }
        motion = move
        move.startAnimation()
        UIAccessibility.post(notification: .layoutChanged, argument: list.arrangedSubviews.first)
    }

    func close() {
        guard open else { return }
        setOpen(false)
        motion?.stopAnimation(true)
        let leaving = away
        let move = Motion.easeOut.animator(Motion.durExit) {
            self.alpha = 0
            self.transform = leaving
        }
        move.addCompletion { [weak self] _ in
            guard let self else { return }
            motion = nil
            guard !open else { return }
            isHidden = true
            transform = .identity
        }
        motion = move
        move.startAnimation()
        UIAccessibility.post(notification: .layoutChanged, argument: source)
    }

    private func setOpen(_ next: Bool) {
        guard next != open else { return }
        open = next
        onOpenChange(next)
    }

    override func accessibilityPerformEscape() -> Bool {
        close()
        return true
    }

    // MARK: Light dismiss

    /// A tap anywhere in `host` outside the panel and off Caw closes it. The
    /// tap is never taken from what it landed on (`cancelsTouchesInView`
    /// off, recognised alongside every other recognizer): a tap on a
    /// transcript row closes the panel and opens the row in the same touch.
    func dismissal(in host: UIView) {
        let tap = UITapGestureRecognizer(target: self, action: #selector(tappedOutside))
        tap.cancelsTouchesInView = false
        tap.delaysTouchesBegan = false
        tap.delaysTouchesEnded = false
        tap.delegate = self
        host.addGestureRecognizer(tap)
    }

    @objc private func tappedOutside() { close() }

    func gestureRecognizer(_: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard open else { return false }
        if point(inside: touch.location(in: self), with: nil) { return false }
        // Caw's own press toggles the panel itself.
        var at = touch.view
        while let view = at {
            if view is NeedsCawButton { return false }
            at = view.superview
        }
        return true
    }

    func gestureRecognizer(_: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer) -> Bool {
        true
    }
}

// MARK: A row that needs you

/// One thing parked on the operator (NeedsCard.svelte, in Caw's panel):
/// whose it is and how long it has waited, where it runs, what it asks. A
/// permission is answered here, Deny and Approve as equal recessed peers at
/// opposite ends; a question is answered in its session and a run's in its
/// run. The answer's stage is said under them until the session has it. A
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
                let deny = KitButton.make("Deny", glyph: .close, glyphTint: Palette.inkMuted, variant: .secondary, height: .sm) { [weak self] in
                    self?.onAnswer(parked, .deny)
                }
                let approve = KitButton.make("Approve", glyph: .tick, glyphTint: Palette.inkStrong, variant: .secondary, height: .sm) { [weak self] in
                    self?.onAnswer(parked, .allow)
                }
                deny.accessibilityLabel = "Deny \(parked.summary) on \(item.title)"
                approve.accessibilityLabel = "Approve \(parked.summary) on \(item.title)"
                deny.isEnabled = !stale && !inFlight
                approve.isEnabled = !stale && !inFlight
                actions.addArrangedSubview(deny)
                actions.addArrangedSubview(approve)
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
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
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

    @objc private func choose() { onChoose() }

    /// The press tint (app.css `.press-tint`): `surface-fill` while the finger is down.
    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted ? Palette.surfaceFill : nil }
    }
}

// MARK: A notice

/// One notice row (NoticeRow.svelte, UpdateCard, MovedLogins,
/// RebalanceNotices): each entry's title and its lines, the update's
/// closing words and its one act, and the row's ✕, which acknowledges every
/// entry it shows on every device.
private final class NoticeRow: UIView {
    var onDismiss: () -> Void = {}
    var onAct: () -> Void = {}

    init(_ notice: Notice) {
        super.init(frame: .zero)
        let column = UIStackView()
        column.axis = .vertical
        column.spacing = 2
        for (at, entry) in notice.entries.enumerated() {
            let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
            title.text = entry.title
            if at == 0, notice.failed {
                // The failure glyph before the title (UpdateCard `.title`).
                let glyph = GlyphView(.alert, size: Size.iconMd, tint: Palette.statusFailGlyph)
                glyph.setContentHuggingPriority(.required, for: .horizontal)
                let head = UIStackView(arrangedSubviews: [glyph, title])
                head.spacing = Space.space1
                head.alignment = .center
                column.addArrangedSubview(head)
            } else {
                column.addArrangedSubview(title)
            }
            if at > 0 { column.setCustomSpacing(Space.space3, after: column.arrangedSubviews[column.arrangedSubviews.count - 2]) }
            for line in entry.lines {
                let said = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
                said.text = line
                column.addArrangedSubview(said)
            }
        }
        if let closing = notice.closing {
            let said = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
            said.text = closing
            column.addArrangedSubview(said)
        }
        if let action = notice.action {
            let act = KitButton.make(action.label, variant: .action, height: .sm) { [weak self] in self?.onAct() }
            let actions = UIStackView(arrangedSubviews: [act, UIView()])
            column.setCustomSpacing(Space.space2, after: column.arrangedSubviews[column.arrangedSubviews.count - 1])
            column.addArrangedSubview(actions)
        }
        accessibilityLabel = notice.label
        let close = RowActionButton(.close)
        close.accessibilityLabel = notice.dismissLabel
        close.addAction(UIAction { [weak self] _ in self?.onDismiss() }, for: .touchUpInside)
        let row = UIStackView(arrangedSubviews: [column, close])
        row.spacing = Space.space2
        row.alignment = .top
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space1),
            row.topAnchor.constraint(equalTo: topAnchor, constant: Space.space2),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space2),
        ])
        accessibilityIdentifier = "caw-notice"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NoticeRow is built in code")
    }
}
