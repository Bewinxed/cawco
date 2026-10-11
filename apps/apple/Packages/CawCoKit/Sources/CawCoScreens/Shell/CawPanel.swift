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
    fileprivate static let log = Logger(subsystem: "dev.cawco.app", category: "CawPanel")

    /// A row chosen: the panel has begun to close.
    var onChoose: (HomeModel.NeedsItem) -> Void = { _ in }
    var onAnswer: (HomeModel.NeedsItem, ParkedAsk, NeedsYouStore.Answer) -> Void = { _, _, _ in }
    var onDismiss: (Notice) -> Void = { _ in }
    /// One entry of a group acknowledged alone, by its notice ids.
    var onAcknowledge: ([String]) -> Void = { _ in }
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
        Self.log.notice("panel rows: \(needs.count) needs, \(notices.count) notices, open \(self.open)")
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
        #if DEBUG
        ProbeCounts.panelPlaces += 1
        #endif
        let cap = Self.restingBox(of: glass, under: head, in: host)
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
            self.list.frame = CGRect(x: 0, y: 0, width: width, height: ceil(fit))
            self.scroll.contentSize = self.list.frame.size
        }
        if animated, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeOut.animator(Motion.durMorph) { apply(); self.layoutIfNeeded() }.startAnimation()
        } else {
            apply()
        }
    }

    /// The glass's box in `host` as it stands at rest. The press that opens
    /// the panel is still scaling Caw (`head`) as it lifts, and on a phone
    /// his glass stands inside him: from the glass up to him the box is
    /// walked by each view's centre and bounds, which his scale never moves,
    /// so the neck stays put. From there up (on a wide screen from the glass
    /// itself, which he stands on) UIKit converts it, through every
    /// ancestor's transform and anchor point. The iPad's glass is a bar
    /// item's view, and the navigation bar places its items' views in
    /// containers of its own; a walk by centre and bounds through those
    /// put the glass 2000pt off the screen, its trailing edge at x -1073.
    private static func restingBox(of glass: UIView, under head: UIView?, in host: UIView) -> CGRect {
        var box = CGRect(x: glass.center.x - glass.bounds.width / 2, y: glass.center.y - glass.bounds.height / 2,
                         width: glass.bounds.width, height: glass.bounds.height)
        var at = glass
        if let head, glass.isDescendant(of: head) {
            while at !== head, let parent = at.superview {
                box = box.offsetBy(dx: parent.center.x - parent.bounds.width / 2 - parent.bounds.minX,
                                   dy: parent.center.y - parent.bounds.height / 2 - parent.bounds.minY)
                at = parent
            }
        }
        guard let holder = at.superview else { return box }
        return holder.convert(box, to: host)
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
        #if DEBUG
        // The views over the glass that a transform or an anchor point
        // moves: where a walk by centre and bounds parts from UIKit's.
        var moved: [String] = []
        var at: UIView? = glass
        while let view = at, view !== superview {
            let anchor = view.layer.anchorPoint
            let sub = view.superview.map { CATransform3DIsIdentity($0.layer.sublayerTransform) } ?? true
            if !CATransform3DIsIdentity(view.layer.transform) || anchor != CGPoint(x: 0.5, y: 0.5) || !sub {
                moved.append("\(type(of: view)) anchor \(anchor) transform \(view.transform) parent's sublayer identity \(sub)")
            }
            at = view.superview
        }
        Self.log.notice("panel glass moved by: \(moved.isEmpty ? "nothing" : moved.joined(separator: " < "), privacy: .public)")
        #endif
        place()
        layoutIfNeeded()
        // A Caw mark draws for a moment after it loads, then pauses: one
        // that loaded while the panel was hidden never painted (CawMark
        // `redraw`), and its notice's lead stood empty.
        Self.reveal(in: list)
        setOpen(true)
        glass.setJoined(true)
        head.setJoined(true)
        card.grow()
        UIAccessibility.post(notification: .layoutChanged, argument: list.arrangedSubviews.first)
    }

    /// Draws again every mark under `view` that paints only while drawn (`RedrawsOnReveal`).
    private static func reveal(in view: UIView) {
        for sub in view.subviews {
            if let mark = sub as? RedrawsOnReveal { mark.redraw() }
            reveal(in: sub)
        }
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
/// of `space3`, its first line in body type. The ✕ is the one way a notice
/// leaves; the row answers for its 44pt target too.
private final class NoticeRow: UIView {
    private let close: NoticeCloseButton

    /// The lead's side (NoticeRow's `lead`, AccountTile at 28).
    static let lead = 28.0
    /// What the first line keeps clear for the ✕ (NoticeRow.svelte
    /// `--x-room`): its words stop `space2` short of its box.
    static let xRoom = NoticeCloseButton.side - NoticeCloseButton.inkInset + Space.space2

    init(lead: UIView, column: UIView, nested: Bool, dismissLabel: String, reading: [Any], dismiss: @escaping @MainActor () -> Void) {
        close = NoticeCloseButton(label: dismissLabel, action: dismiss)
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
        // The words, the act and the ✕ each read on their own; the lead is a picture.
        accessibilityElements = reading + [close]
        accessibilityIdentifier = nested ? "caw-notice-entry" : "caw-notice"
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
        stack.addArrangedSubview(Self.head(notice, dismiss: dismiss))
        // The entries, `space2` under the last (`.entries`).
        let entries = UIStackView()
        entries.axis = .vertical
        entries.isLayoutMarginsRelativeArrangement = true
        entries.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 0, bottom: Space.space2, trailing: 0)
        for member in todo { entries.addArrangedSubview(Self.entry(member, acknowledge: acknowledge)) }
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
            for member in done { fold.addArrangedSubview(Self.entry(member, acknowledge: acknowledge)) }
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
