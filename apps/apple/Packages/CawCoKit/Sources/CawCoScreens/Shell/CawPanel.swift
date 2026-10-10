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
/// It is not a sheet and not a popover presentation: the shell owns it as a
/// view over its columns, with nothing under it, so the rest of the app keeps
/// working while it is open (owner: "that goes against the multitasking
/// approach we have"). A tap anywhere outside it closes it and still lands on
/// whatever it fell on (`dismissal`).
///
/// It hangs from the glass Caw stands on as one shape with it (DESIGN.md,
/// "Caw's panel"; a `HangCard`): its top edge is the glass's foot, its
/// trailing side runs straight on down from the glass's trailing flank,
/// square there, and the glass's leading foot flares out by `radiusLg` into
/// its top edge. On a phone his glass is a tab tucked into the screen's
/// trailing edge and the panel is too: its trailing side is the screen's
/// edge, square at top and foot with no edge drawn there, and its leading
/// side keeps the phone's 12pt margin. His foot stands clear of the tab
/// row's floor, and the panel hangs from that floor, covering no tab: the
/// glass runs on down to it through a neck at its own width, which exists
/// only while it hangs (`GlassCapsule.neck`). While it hangs the glass takes its
/// material and edge (`GlassCapsule.setJoined`) and the lower half of his
/// rim fades out (`NeedsCawButton.setJoined`). It grows out of the glass
/// over `durPop` and folds back over `durExit` on `easeOut`; with less
/// motion it fades.
final class CawPanel: UIView, UIGestureRecognizerDelegate {
    /// Kept from a wide screen's edges, pt.
    static let edge: CGFloat = 8
    /// A phone's margin on its leading side (DESIGN.md, "Caw's panel": 12px).
    static let phoneMargin: CGFloat = 12
    /// Its width at most, pt.
    static let wide: CGFloat = 380
    static let tallest: CGFloat = 560
    /// Its content stands this far in from its drawn edge (DESIGN.md, "Caw's panel": 7px).
    static let inset: CGFloat = 7
    private static let log = Logger(subsystem: "dev.cawco.app", category: "CawPanel")

    /// A row chosen: the panel has begun to close.
    var onChoose: (HomeModel.NeedsItem) -> Void = { _ in }
    var onAnswer: (HomeModel.NeedsItem, ParkedAsk, NeedsYouStore.Answer) -> Void = { _, _, _ in }
    var onDismiss: (Notice) -> Void = { _ in }
    /// The update notice's one act (Retry, Install now).
    var onAct: (Notice) -> Void = { _ in }
    /// Opened or closed: Caw says so.
    var onOpenChange: (Bool) -> Void = { _ in }

    private(set) var open = false
    /// The glass it hangs from, and Caw standing on it.
    private weak var glass: GlassCapsule?
    private weak var head: NeedsCawButton?
    private let card = HangCard()
    private let scroll = UIScrollView()
    private let list = UIStackView()
    /// What the rows said last: they are made again only when that changes.
    private var drawn = ""

    /// What each ask's answer has reached (`NeedsYouStore.answerSent`), by item id.
    struct Answers {
        var sent: [String: Ledger.Command] = [:]
    }

    init() {
        super.init(frame: .zero)
        isHidden = true
        card.frame = bounds
        card.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        card.accessibilityContainerType = .semanticGroup
        card.accessibilityLabel = "Notifications"
        card.accessibilityIdentifier = "caw-panel"
        addSubview(card)
        scroll.frame = card.content.bounds
        scroll.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scroll.alwaysBounceVertical = false
        scroll.showsHorizontalScrollIndicator = false
        card.content.addSubview(scroll)
        list.axis = .vertical
        list.isLayoutMarginsRelativeArrangement = true
        list.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Self.inset, leading: Self.inset, bottom: Self.inset, trailing: Self.inset)
        list.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(list)
        NSLayoutConstraint.activate([
            list.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            list.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            list.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            list.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            list.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CawPanel is built in code")
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
        Self.log.notice("panel rows: \(needs.count) needs, \(notices.count) notices, open \(self.open)")
        if open {
            place(animated: true)
            // Its rows changed under VoiceOver and every reader of the tree: they are read again.
            UIAccessibility.post(notification: .layoutChanged, argument: nil)
        }
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

    /// On the glass's foot with no gap, or on a phone past it by the glass's
    /// neck, on the tab row's floor so it covers no tab; flush with the
    /// glass's trailing flank: on a phone the screen's edge, its leading side
    /// `phoneMargin` in; on a wide
    /// screen `wide` across, kept `edge` inside the screen. As tall as its
    /// rows, up to what the screen leaves under the glass or `tallest`, its
    /// list scrolling past that. The neck is the glass's span along its top
    /// edge, flared on the leading side by the glass's `flare`.
    private func place(animated: Bool = false) {
        guard let host = superview, let glass, glass.window != nil else { return }
        let cap = Self.restingBox(of: glass, in: host)
        let compact = host.traitCollection.horizontalSizeClass == .compact
        let width = compact
            ? min(Self.wide, cap.maxX - Self.phoneMargin)
            : min(Self.wide, cap.maxX - Self.edge)
        let x = cap.maxX - width
        // On the glass's foot, or past it by its neck: on a phone, the tab row's floor.
        let top = cap.maxY + glass.neck
        let room = host.bounds.height - host.safeAreaInsets.bottom - Self.edge - top
        let fit = list.systemLayoutSizeFitting(
            CGSize(width: width, height: UIView.layoutFittingCompressedSize.height),
            withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel
        ).height
        let size = CGSize(width: width, height: max(0, min(ceil(fit), room, Self.tallest)))
        card.openEnd = compact
        card.hang(from: HangNeck(start: cap.minX - x, end: cap.maxX - x, flareStart: glass.flare, flareEnd: 0, flush: .end))
        // Where it hangs, in the shell's points (the window's): the probe reads the join off this.
        let box = { (r: CGRect) in String(format: "%.2f %.2f %.2f %.2f", r.minX, r.minY, r.width, r.height) }
        let line = "panel hangs: glass \(box(cap)) panel \(box(CGRect(origin: CGPoint(x: x, y: top), size: size))) flare \(glass.flare)"
        Self.log.notice("\(line, privacy: .public)")
        let apply = {
            self.frame = CGRect(origin: CGPoint(x: x, y: top), size: size)
            self.scroll.contentSize = CGSize(width: width, height: ceil(fit))
        }
        if animated, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeOut.animator(Motion.durMorph) { apply(); self.layoutIfNeeded() }.startAnimation()
        } else {
            apply()
        }
    }

    /// A view's box in `host` as it stands at rest: from each view's centre
    /// and bounds, so the press that opens the panel, still scaling Caw (and
    /// the phone's glass inside him) as it lifts, never moves the neck.
    private static func restingBox(of view: UIView, in host: UIView) -> CGRect {
        let local = CGRect(x: view.center.x - view.bounds.width / 2, y: view.center.y - view.bounds.height / 2,
                           width: view.bounds.width, height: view.bounds.height)
        guard let parent = view.superview, parent !== host else { return local }
        let outer = restingBox(of: parent, in: host)
        return local.offsetBy(dx: outer.minX - parent.bounds.minX, dy: outer.minY - parent.bounds.minY)
    }

    /// Caw moved under it (a rotation, the rail stepping aside): it follows him.
    func follow() {
        guard open else { return }
        place()
    }

    // MARK: Open and close

    /// Grows out of `glass`, the glass `head` stands on.
    func show(from head: NeedsCawButton, glass: GlassCapsule) {
        if let previous = self.glass, previous !== glass { previous.setJoined(false) }
        if let previous = self.head, previous !== head { previous.setJoined(false) }
        self.head = head
        self.glass = glass
        superview?.bringSubviewToFront(self)
        isHidden = false
        place()
        layoutIfNeeded()
        setOpen(true)
        glass.setJoined(true)
        head.setJoined(true)
        card.grow()
        UIAccessibility.post(notification: .layoutChanged, argument: list.arrangedSubviews.first)
    }

    func close() {
        guard open else { return }
        setOpen(false)
        glass?.setJoined(false)
        head?.setJoined(false)
        card.fold { [weak self] in
            guard let self, !open else { return }
            isHidden = true
        }
        UIAccessibility.post(notification: .layoutChanged, argument: head)
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

/// One notice row (NoticeRow.svelte, with UpdateCard, MovedLogins and
/// RebalanceNotices in it): its 28pt lead (Caw's mark in the notice's
/// status, or the first account's tile), the entries beside it (a later
/// entry with its own tile), the update's closing words, its one act at the
/// trailing edge, and the ✕ (`NoticeCloseButton`, the 20pt pill) on the
/// lead's top corner, 8pt out from it. The ✕ is the one way it leaves and
/// acknowledges every entry the row shows; its 44pt target reaches past
/// the row, so the row answers for it there too.
private final class NoticeRow: UIView {
    var onDismiss: () -> Void = {}
    var onAct: () -> Void = {}
    private var close: NoticeCloseButton!

    /// The lead's side (NoticeRow's `lead`, AccountTile at 28).
    static let lead = 28.0

    init(_ notice: Notice) {
        super.init(frame: .zero)
        let column = UIStackView()
        column.axis = .vertical
        column.spacing = 2
        var reading: [Any] = []
        for (at, entry) in notice.entries.enumerated() {
            let entryColumn = UIStackView()
            entryColumn.axis = .vertical
            entryColumn.spacing = 2
            let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
            title.text = entry.title
            reading.append(title)
            if at == 0, notice.failed {
                // The failure glyph before the title (UpdateCard `.title`).
                let glyph = GlyphView(.alert, size: Size.iconMd, tint: Palette.statusFailGlyph)
                glyph.setContentHuggingPriority(.required, for: .horizontal)
                let head = UIStackView(arrangedSubviews: [glyph, title])
                head.spacing = Space.space1
                head.alignment = .center
                entryColumn.addArrangedSubview(head)
            } else {
                entryColumn.addArrangedSubview(title)
            }
            for line in entry.lines {
                let said = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
                said.text = line
                entryColumn.addArrangedSubview(said)
                reading.append(said)
            }
            // A later entry stands beside its own tile (MovedLogins `.later`).
            if at > 0, let tile = entry.tile {
                let beside = UIStackView(arrangedSubviews: [AccountTileView(tile, side: Self.lead), entryColumn])
                beside.spacing = Space.space3
                beside.alignment = .top
                column.addArrangedSubview(beside)
            } else {
                column.addArrangedSubview(entryColumn)
            }
            if at > 0 { column.setCustomSpacing(Space.space3, after: column.arrangedSubviews[column.arrangedSubviews.count - 2]) }
        }
        if let closing = notice.closing {
            let said = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
            said.text = closing
            column.addArrangedSubview(said)
            reading.append(said)
        }
        if let action = notice.action {
            let act = KitButton.make(action.label, variant: .action, height: .sm) { [weak self] in self?.onAct() }
            let actions = UIStackView(arrangedSubviews: [UIView(), act])
            actions.alignment = .center
            column.setCustomSpacing(Space.space2, after: column.arrangedSubviews[column.arrangedSubviews.count - 1])
            column.addArrangedSubview(actions)
            reading.append(act)
        }
        let lead = Self.leadView(notice.lead)
        column.translatesAutoresizingMaskIntoConstraints = false
        close = NoticeCloseButton(label: notice.dismissLabel) { [weak self] in self?.onDismiss() }
        addSubview(lead)
        addSubview(column)
        addSubview(close)
        let pad = Space.space3
        NSLayoutConstraint.activate([
            lead.topAnchor.constraint(equalTo: topAnchor, constant: pad),
            lead.leadingAnchor.constraint(equalTo: leadingAnchor, constant: pad),
            lead.widthAnchor.constraint(equalToConstant: Self.lead),
            lead.heightAnchor.constraint(equalToConstant: Self.lead),
            bottomAnchor.constraint(greaterThanOrEqualTo: lead.bottomAnchor, constant: Space.space2),
            column.topAnchor.constraint(equalTo: topAnchor, constant: pad),
            column.leadingAnchor.constraint(equalTo: lead.trailingAnchor, constant: Space.space3),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -pad),
            column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space2),
            // On the lead's top corner, 8pt out from it (NoticeRow `.x`), inside the row's inset.
            close.topAnchor.constraint(equalTo: lead.topAnchor, constant: -8),
            close.leadingAnchor.constraint(equalTo: lead.leadingAnchor, constant: -8),
        ])
        // The words, the act and the ✕ each read on their own; the lead is a picture.
        reading.append(close as Any)
        accessibilityElements = reading
        accessibilityIdentifier = "caw-notice"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NoticeRow is built in code")
    }

    /// Caw's mark in the notice's status, an account's tile, or the lead's room alone.
    private static func leadView(_ lead: Notice.Lead) -> UIView {
        let view: UIView = switch lead {
        case let .caw(status): CawMark(status: CawStatus(rawValue: status) ?? .sleeping, side: Self.lead)
        case let .account(tile): AccountTileView(tile, side: Self.lead)
        case .none: UIView()
        }
        view.translatesAutoresizingMaskIntoConstraints = false
        view.isAccessibilityElement = false
        return view
    }

    /// The ✕'s 44pt target, where it reaches past the row.
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        super.point(inside: point, with: event) || close.point(inside: convert(point, to: close), with: event)
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        if isUserInteractionEnabled, !isHidden, close.point(inside: convert(point, to: close), with: event) {
            return close
        }
        return super.hitTest(point, with: event)
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
