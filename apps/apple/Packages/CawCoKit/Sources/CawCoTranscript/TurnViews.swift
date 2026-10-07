import CawCoCore
import CawCoDesign
import UIKit

/// The role label leading a turn (Who.svelte): the speaker's mark, the name,
/// and the clock, which a touch screen always shows. A note ("queued", "not
/// sent") stands where the clock would, before it.
final class WhoView: UIView {
    private let mark = GradientView()
    private let glyph = GlyphView(.ghost, size: Size.iconSm, tint: Palette.onBrand)
    private let role = LineLabel(hug: .required, resist: .defaultLow)
    private let note = LineLabel(hug: .required, resist: .required)
    private let clock = LineLabel(hug: .required, resist: .required)
    private var markSide: NSLayoutConstraint!
    private var markLead: NSLayoutConstraint!
    private var you = false

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        mark.translatesAutoresizingMaskIntoConstraints = false
        mark.layer.cornerCurve = .continuous
        mark.addSubview(glyph)
        let spacer = UIView()
        spacer.setContentHuggingPriority(.init(1), for: .horizontal)
        let markBox = UIView()
        markBox.translatesAutoresizingMaskIntoConstraints = false
        markBox.addSubview(mark)
        markSide = mark.widthAnchor.constraint(equalToConstant: Size.rowMarkBox)
        markLead = mark.leadingAnchor.constraint(equalTo: markBox.leadingAnchor)
        let line = railLine([markBox, role, spacer, note, clock])
        line.setCustomSpacing(0, after: spacer)
        addSubview(line)
        // One line box of the label on the turn's leading (Who.svelte's h2
        // inherits --leading-body: 18.85pt at the label size); the mark centred on it.
        let height = TypeScale.textLabel * TypeScale.leadingBody
        NSLayoutConstraint.activate([
            markBox.widthAnchor.constraint(equalToConstant: Size.rowMarkBox),
            markBox.heightAnchor.constraint(equalToConstant: Size.rowMarkBox),
            markLead, markSide,
            mark.heightAnchor.constraint(equalTo: mark.widthAnchor),
            mark.centerYAnchor.constraint(equalTo: markBox.centerYAnchor),
            glyph.centerXAnchor.constraint(equalTo: mark.centerXAnchor),
            glyph.centerYAnchor.constraint(equalTo: mark.centerYAnchor),
            line.leadingAnchor.constraint(equalTo: leadingAnchor),
            line.trailingAnchor.constraint(equalTo: trailingAnchor),
            line.topAnchor.constraint(equalTo: topAnchor),
            line.bottomAnchor.constraint(equalTo: bottomAnchor),
            line.heightAnchor.constraint(greaterThanOrEqualToConstant: height),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .header
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (who: WhoView, _: UITraitCollection) in who.paint() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func configure(_ header: Item.Header) {
        you = header.you
        // The reader's mark: 17pt in the action material, centred in the 18pt cell.
        markSide.constant = you ? Size.rowMark : Size.rowMarkBox
        markLead.constant = you ? Size.wellX : 0
        mark.layer.cornerRadius = you ? Radius.rowMarkR : Radius.radiusXs
        glyph.glyph = you ? .user : .ghost
        glyph.tintColor = you ? Palette.onAction : Palette.onBrand
        let side = you ? Size.rowMarkGlyph : Size.iconSm
        glyph.constraints.forEach { glyph.removeConstraint($0) }
        NSLayoutConstraint.activate([glyph.widthAnchor.constraint(equalToConstant: side), glyph.heightAnchor.constraint(equalToConstant: side)])
        role.attributedText = Styled.string(header.name, TypeScale.typeLabel, color: Palette.inkStrong, leading: TypeScale.leadingBody)
        note.attributedText = header.note.map { Styled.string($0, TypeScale.typeMeta, color: Palette.inkMuted, leading: TypeScale.leadingBody) }
        note.isHidden = header.note == nil
        clock.attributedText = header.clock.map { Styled.string($0, TypeScale.typeMeta, color: Palette.inkMuted, leading: TypeScale.leadingBody, tabular: true) }
        clock.isHidden = header.clock == nil
        accessibilityLabel = [header.name, header.note, header.clock].compactMap(\.self).joined(separator: ", ")
        paint()
    }

    private func paint() {
        // The reader's mark in the action material (a top-highlight gradient), the agent's in solid brand.
        mark.gradient.colors = you ? Palette.actionSurface.colors(for: traitCollection) : nil
        mark.backgroundColor = you ? .clear : Palette.brandSolid
    }
}

/// A grouped turn's clock (or its note), floated into the end of the first
/// line: one body line tall, nine meta figures wide at least, a space-3 clear
/// of the words (Who.svelte `.grouped`).
final class FloatNote: UILabel {
    static func size(_ text: String) -> CGSize {
        let font = TypeScale.typeMeta.font
        let nine = ("000000000" as NSString).size(withAttributes: [.font: font]).width
        let width = max(nine, (text as NSString).size(withAttributes: [.font: font]).width)
        return CGSize(width: ceil(width) + Space.space3, height: TypeScale.textBody * TypeScale.leadingBody)
    }

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        textAlignment = .right
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func set(_ text: String?) {
        isHidden = text == nil
        attributedText = text.map { Styled.string($0, TypeScale.typeMeta, color: Palette.inkMuted, tabular: true) }
    }
}

/// One block of an assistant turn: under its speaker line when it opens the
/// turn, its clock floated into the first line when grouped. The live tail's
/// block shows each chunk's words fading in.
final class PieceView: UIView, RowContent {
    private let env: RowEnv
    private let stack = UIStackView()
    private let who = WhoView()
    private let float = FloatNote()
    private var blocks: [UIView] = []
    /// The width the row stands at in the list, which its blocks span
    /// (ProseView `fitWidth`); nil where the piece is drawn inside another row.
    var fitWidth: CGFloat?

    init(env: RowEnv) {
        self.env = env
        super.init(frame: .zero)
        stack.axis = .vertical
        stack.addArrangedSubview(who)
        stack.setCustomSpacing(Space.space2, after: who)
        pin(stack)
        addSubview(float)
        NSLayoutConstraint.activate([
            float.trailingAnchor.constraint(equalTo: trailingAnchor),
            float.heightAnchor.constraint(equalToConstant: TypeScale.textBody * TypeScale.leadingBody),
        ])
        floatTop = float.topAnchor.constraint(equalTo: topAnchor)
        floatTop.isActive = true
    }

    private var floatTop: NSLayoutConstraint!

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func configure(_ item: Item) {
        guard case let .piece(piece) = item.kind else { return }
        if let header = piece.header { who.configure(header) }
        who.isHidden = piece.header == nil
        float.set(piece.float)
        // Reuse the block views when the kinds line up: the streaming tail's
        // text view keeps its storage and only takes what changed.
        let kinds = piece.blocks.map(Self.kind)
        if blocks.map(Self.kind(of:)) != kinds {
            blocks.forEach { $0.removeFromSuperview() }
            blocks = piece.blocks.map(blockView)
            for view in blocks { stack.addArrangedSubview(view) }
        }
        for (i, block) in piece.blocks.enumerated() {
            let view = blocks[i]
            switch block.kind {
            case let .text(text):
                (view as? ProseView)?.fitWidth = fitWidth
                (view as? ProseView)?.show(text, fading: piece.streaming && env.watched)
            case let .code(language, text):
                (view as? CodeWell)?.configure(language: language, text: text)
                (view as? CodeWell)?.join(above: piece.joinsAbove && i == 0, below: piece.joinsBelow && i == piece.blocks.count - 1)
            case let .table(head, rows):
                (view as? TableBlock)?.fitWidth = fitWidth
                (view as? TableBlock)?.configure(head: head, rows: rows)
            case let .quote(text):
                (view as? QuoteBlock)?.text.fitWidth = fitWidth.map { $0 - QuoteBlock.inset }
                (view as? QuoteBlock)?.text.attributedText = text
            case .rule: break
            }
            if i > 0 { stack.setCustomSpacing(MarkdownRender.gap(after: piece.blocks[i - 1], before: block), after: blocks[i - 1]) }
        }
        let first = blocks.first as? ProseView
        first?.floatSize = piece.float.map(FloatNote.size) ?? .zero
        if piece.float != nil, let first {
            floatTop.isActive = false
            floatTop = float.topAnchor.constraint(equalTo: first.topAnchor)
            floatTop.isActive = true
        }
    }

    func fade(_ now: Double) {
        for case let view as ProseView in blocks { view.fade(now) }
    }

    private static func kind(_ block: MarkdownBlock) -> Int {
        switch block.kind {
        case .text: 0
        case .code: 1
        case .table: 2
        case .quote: 3
        case .rule: 4
        }
    }

    private static func kind(of view: UIView) -> Int {
        switch view {
        case is ProseView: 0
        case is CodeWell: 1
        case is TableBlock: 2
        case is QuoteBlock: 3
        default: 4
        }
    }
}

/// The reader's own turn (MessageRow `.turn.you`): ONE well holding the run
/// of their messages, drawn a row at a time. The run's first row carries the
/// top edge, its last the bottom; a hairline in the seam's coral parts two
/// messages of one run. Sending and queued read at reduced presence, with a
/// note in the clock's place.
///
/// A queued message the harness can take back lifts into the composer on a
/// tap (composer-recall); a touch screen says so in its note. While its
/// words are in the composer the bubble folds down to its tag ("Queued ·
/// editing it below") on an empty well, and unfolds when they come back.
final class UserTurnView: UIView, RowContent, UIGestureRecognizerDelegate {
    private let env: RowEnv
    private let who = WhoView()
    private let well = WellSurface()
    private let words = UIView()
    private let body = MessageBody()
    private let float = FloatNote()
    private let chips = FlowView()
    private let failure = UIStackView()
    private let takenTag = ChipLabel(insets: UIEdgeInsets(top: 2, left: 7, bottom: 2, right: 7), radius: Radius.radiusPill)
    private let tagRow = UIStackView()
    private var taken = false
    private let reason = WrapLabel(wrap: .pretty) // MessageRow `p.reason`
    private let retry = UIButton(type: .system)
    private var wellTop: NSLayoutConstraint!
    private var inner: [NSLayoutConstraint] = []
    private var block: Block?
    private var retried: String?
    /// The width the row stands at in the list (ProseView `fitWidth`).
    var fitWidth: CGFloat?

    init(env: RowEnv) {
        self.env = env
        super.init(frame: .zero)
        let column = UIStackView(arrangedSubviews: [who, well])
        column.axis = .vertical
        column.spacing = Space.space2
        pin(column)
        well.translatesAutoresizingMaskIntoConstraints = false
        words.translatesAutoresizingMaskIntoConstraints = false
        well.addSubview(words)
        takenTag.backgroundColor = Palette.statusAttnBg
        tagRow.addArrangedSubview(takenTag)
        tagRow.addArrangedSubview(UIView())
        tagRow.isHidden = true
        let content = UIStackView(arrangedSubviews: [tagRow, body, chips, failure])
        content.axis = .vertical
        content.spacing = Space.space2
        words.pin(content)
        words.addSubview(float)
        failure.axis = .vertical
        failure.alignment = .leading
        failure.spacing = Space.space2
        failure.addArrangedSubview(reason)
        failure.addArrangedSubview(retry)
        retry.addAction(UIAction { [weak self] _ in self?.tryAgain() }, for: .touchUpInside)
        retry.layer.cornerRadius = Radius.radiusXs
        retry.layer.borderWidth = 1
        retry.backgroundColor = Palette.surfaceRaised
        retry.contentEdgeInsets = UIEdgeInsets(top: Space.space1, left: Space.space2, bottom: Space.space1, right: Space.space2)
        // The well's start edge is the reader's mark's (--well-x); words at the seam inset.
        let pad = Space.space2
        wellTop = words.topAnchor.constraint(equalTo: well.topAnchor, constant: Space.space2 + 1)
        NSLayoutConstraint.activate([
            words.leadingAnchor.constraint(equalTo: well.leadingAnchor, constant: pad),
            words.trailingAnchor.constraint(equalTo: well.trailingAnchor, constant: -pad),
            wellTop,
            words.bottomAnchor.constraint(equalTo: well.bottomAnchor, constant: -(Space.space2 + 1)),
            float.trailingAnchor.constraint(equalTo: words.trailingAnchor),
            float.topAnchor.constraint(equalTo: words.topAnchor),
            float.heightAnchor.constraint(equalToConstant: TypeScale.textBody * TypeScale.leadingBody),
        ])
        well.inset = Size.wellX
        well.pad = pad
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: UserTurnView, _: UITraitCollection) in
            view.retry.layer.borderColor = Palette.wellEdge.resolvedColor(with: view.traitCollection).cgColor
        }
        let lift = UITapGestureRecognizer(target: self, action: #selector(lifted))
        lift.delegate = self
        well.addGestureRecognizer(lift)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func configure(_ item: Item) {
        guard case let .user(turn) = item.kind else { return }
        let block = turn.block
        if self.block?.id != block.id { retried = nil }
        self.block = block
        let failed = block.state == "failed"
        let waiting = block.state == "pending" || block.queued
        taken = waiting && env.isTaken(block.id)
        // On a touch screen, a queued message that can be edited says how.
        let tappable = waiting && !taken && Self.touch && env.canEditQueued(block.id)
        let queuedNote = tappable ? "queued · \(env.agentName) is still working · tap to edit" : "queued"
        let note: String? = taken ? nil : failed ? "not sent" : waiting ? queuedNote : block.meta["urgent"] as? Bool == true ? "urgent" : nil
        let clock = failed || waiting ? nil : Item.clock(block.date)
        who.isHidden = turn.grouped
        who.configure(.init(name: "You", clock: clock, note: note, you: true))
        well.grouped = turn.grouped
        well.runsOn = turn.runsOn
        wellTop.constant = turn.grouped ? Space.space2 : Space.space2 + 1
        let floated = turn.grouped ? [note, clock].compactMap(\.self).joined(separator: " ") : nil
        float.set(floated?.isEmpty == false ? floated : nil)
        body.floatSize = float.isHidden ? .zero : FloatNote.size(floated ?? "")
        // The words stand in the well, its padding either side of them.
        body.fitWidth = fitWidth.map { $0 - 2 * Space.space2 }
        body.configure(env.replacement(block.id) ?? block.content, style: .well)
        let ghost = waiting && !taken ? Effect.ghostPresence : 1
        who.alpha = ghost
        words.alpha = ghost
        configureChips(block)
        takenTag.attributedText = Styled.string("Queued · editing it below", TypeScale.typeMeta, color: Palette.statusAttnInk, weight: .medium)
        fold(taken)
        let reasonText = block.string("sendFailed")
        reason.attributedText = Styled.string("Couldn't send that message." + (reasonText.map { " \($0)" } ?? ""), TypeScale.typeMeta,
                                              color: Palette.statusFailInk, lineBreak: .byWordWrapping)
        let sending = retried != nil
        retry.setAttributedTitle(Styled.string(sending ? "Sending…" : "Try again", TypeScale.typeLabel, color: Palette.inkStrong), for: .normal)
        retry.isEnabled = !sending
        failure.isHidden = !failed
        retry.isHidden = !failed || env.hub?.fleet.byId[env.sessionId]?.isLive != true
        retry.layer.borderColor = Palette.wellEdge.resolvedColor(with: traitCollection).cgColor
    }

    /// Folded down to its tag while its words are in the composer
    /// (`.row-user.taken`): an empty well on the control edge, nothing below it moving.
    private func fold(_ folded: Bool) {
        tagRow.isHidden = !folded
        body.isHidden = folded
        if folded {
            chips.isHidden = true
            failure.isHidden = true
            float.isHidden = true
        }
        well.taken = folded
    }

    /// A touch screen: where tapping the message is how it is edited.
    private static var touch: Bool {
        #if targetEnvironment(macCatalyst)
        false
        #else
        true
        #endif
    }

    /// The view the message's words are drawn in, for the flight to the composer.
    var wordsView: UIView { body }

    /// A replaced message's bubble, marked once.
    func flash() {
        well.flash()
    }

    @objc private func lifted() {
        guard let block, !taken, block.state == "pending" || block.queued, env.canEditQueued(block.id) else { return }
        env.editQueued(block.id)
    }

    /// Not during a text selection, and not on an attachment or a link's own control.
    func gestureRecognizer(_: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard let block, block.state == "pending" || block.queued else { return false }
        if touch.view is UIControl || touch.view?.isDescendant(of: chips) == true { return false }
        return !Self.selecting(in: body)
    }

    func gestureRecognizer(_: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer) -> Bool {
        true
    }

    private static func selecting(in view: UIView) -> Bool {
        if let text = view as? UITextView, text.selectedRange.length > 0 { return true }
        return view.subviews.contains { selecting(in: $0) }
    }

    private func configureChips(_ block: Block) {
        var views: [UIView] = []
        for attachment in block.meta["attachments"] as? [[String: Any]] ?? [] {
            let name = attachment["name"] as? String ?? ""
            if attachment["kind"] as? String == "file" {
                // Any other file: its size; a tap fetches it into the share sheet.
                let doc = DocThumb(name: name, meta: humanSize((attachment["size"] as? NSNumber)?.intValue ?? 0))
                if let ref = attachment["ref"] as? String {
                    doc.onOpen = { [weak self, weak doc] in
                        guard let self, let doc else { return }
                        env.openFile(ref, doc.name, doc)
                    }
                } else {
                    doc.isEnabled = false
                }
                views.append(doc)
                continue
            }
            let content = attachment["content"] as? String ?? ""
            let doc = DocThumb(name: name, meta: DocThumb.size(content))
            doc.onOpen = { [weak self, weak doc] in
                guard let self, let doc else { return }
                env.openLightbox(.text(name: doc.name, content: content), doc)
            }
            views.append(doc)
        }
        let images = block.meta["images"] as? [[String: Any]] ?? []
        let sources = images.compactMap { ($0["src"] as? String).flatMap(env.url) }
        for (i, image) in images.enumerated() {
            if let src = (image["src"] as? String).flatMap(env.url) {
                let shot = ShotView(env: env, thumb: true)
                shot.configure(src, alt: "Attachment \(i + 1) sent with this message")
                shot.onOpen = { [weak self, weak shot] in
                    guard let self, let shot else { return }
                    env.openLightbox(.images(sources, index: sources.firstIndex(of: src) ?? 0), shot)
                }
                views.append(shot)
            } else {
                // A stored transcript can name an image it no longer carries.
                let chip = ChipLabel(insets: UIEdgeInsets(top: 1, left: Space.space2, bottom: 1, right: Space.space2), radius: Radius.radiusXs)
                chip.backgroundColor = Palette.surfaceRecess
                chip.attributedText = Styled.string("Image \(i + 1) · \(image["mediaType"] as? String ?? "")", TypeScale.typeMeta, color: Palette.inkMuted)
                views.append(chip)
            }
        }
        chips.set(views, spacing: Space.space2)
        chips.isHidden = views.isEmpty
    }

    /// A failed send, sent again (MessageRow `tryAgain`): its own words, as a
    /// new send; the hub retires this row as the retry is taken.
    private func tryAgain() {
        guard let block, let hub = env.hub, let row = hub.fleet.byId[env.sessionId], row.isLive else { return }
        retried = hub.sessions.steer(row, text: block.content)
        retry.setAttributedTitle(Styled.string("Sending…", TypeScale.typeLabel, color: Palette.inkStrong), for: .normal)
        retry.isEnabled = false
    }
}

/// The reader's well, a row's part of it: the surface and its edge, open at
/// the top for a later message (the seam's hairline there instead), open at
/// the bottom when another follows.
final class WellSurface: UIView {
    var grouped = false { didSet { setNeedsLayout() } }
    var runsOn = false { didSet { setNeedsLayout() } }
    /// Its words are in the composer: no surface, the control ink for its edge.
    var taken = false { didSet { if taken != oldValue { setNeedsLayout() } } }
    var inset = 0.0
    var pad = 0.0
    private let surface = CAShapeLayer()
    private let edge = CAShapeLayer()
    private let seam = CALayer()

    init() {
        super.init(frame: .zero)
        layer.addSublayer(surface)
        layer.addSublayer(edge)
        layer.addSublayer(seam)
        edge.fillColor = nil
        edge.lineWidth = 1
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (well: WellSurface, _: UITraitCollection) in well.setNeedsLayout() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    override func layoutSubviews() {
        super.layoutSubviews()
        let rect = bounds.inset(by: UIEdgeInsets(top: 0, left: inset, bottom: 0, right: 0))
        let r = Radius.wellR
        var corners: UIRectCorner = []
        if !grouped { corners.formUnion([.topLeft, .topRight]) }
        if !runsOn { corners.formUnion([.bottomLeft, .bottomRight]) }
        let shape = UIBezierPath(roundedRect: rect, byRoundingCorners: corners, cornerRadii: CGSize(width: r, height: r))
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        surface.path = shape.cgPath
        surface.fillColor = taken ? UIColor.clear.cgColor : Palette.surfaceRecessDeep.resolvedColor(with: traitCollection).cgColor
        // The edge: every side but the ones this part leaves open.
        let half = rect.insetBy(dx: 0.5, dy: 0.5)
        let path = UIBezierPath()
        let rr = r - 0.5
        let topR = grouped ? 0 : rr, bottomR = runsOn ? 0 : rr
        path.move(to: CGPoint(x: half.minX, y: grouped ? rect.minY : half.minY + topR))
        path.addLine(to: CGPoint(x: half.minX, y: half.maxY - bottomR))
        if !runsOn {
            path.addArc(withCenter: CGPoint(x: half.minX + bottomR, y: half.maxY - bottomR), radius: bottomR, startAngle: .pi, endAngle: .pi / 2, clockwise: false)
            path.addLine(to: CGPoint(x: half.maxX - bottomR, y: half.maxY))
            path.addArc(withCenter: CGPoint(x: half.maxX - bottomR, y: half.maxY - bottomR), radius: bottomR, startAngle: .pi / 2, endAngle: 0, clockwise: false)
        } else {
            path.addLine(to: CGPoint(x: half.minX, y: rect.maxY))
            path.move(to: CGPoint(x: half.maxX, y: rect.maxY))
        }
        path.addLine(to: CGPoint(x: half.maxX, y: grouped ? rect.minY : half.minY + topR))
        if !grouped {
            path.addArc(withCenter: CGPoint(x: half.maxX - topR, y: half.minY + topR), radius: topR, startAngle: 0, endAngle: -.pi / 2, clockwise: false)
            path.addLine(to: CGPoint(x: half.minX + topR, y: half.minY))
            path.addArc(withCenter: CGPoint(x: half.minX + topR, y: half.minY + topR), radius: topR, startAngle: -.pi / 2, endAngle: .pi, clockwise: false)
        }
        edge.path = path.cgPath
        edge.strokeColor = (taken ? Palette.borderControl : Palette.wellEdge).resolvedColor(with: traitCollection).cgColor
        // The hairline from the message above, across the text column only.
        seam.isHidden = !grouped
        seam.frame = CGRect(x: rect.minX + pad, y: -1, width: rect.width - pad * 2, height: 1)
        seam.backgroundColor = Palette.seam.resolvedColor(with: traitCollection).cgColor
        CATransaction.commit()
    }

    /// Its words were just replaced (`.row-user.flash`): a 2pt brand ring
    /// that fades back to the well's own edge.
    func flash() {
        flashRing?.removeFromSuperlayer()
        let ring = CAShapeLayer()
        flashRing = ring
        let rect = bounds.inset(by: UIEdgeInsets(top: 0, left: inset, bottom: 0, right: 0)).insetBy(dx: 1, dy: 1)
        ring.path = UIBezierPath(roundedRect: rect, cornerRadius: Radius.wellR - 1).cgPath
        ring.fillColor = nil
        ring.lineWidth = 2
        ring.strokeColor = Palette.brandSolid.resolvedColor(with: traitCollection).cgColor
        ring.opacity = 0
        layer.addSublayer(ring)
        // Rests invisible once it has faded; the next flash takes it away.
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 1
        fade.toValue = 0
        fade.duration = Motion.durHold
        fade.timingFunction = Motion.easeOut.function
        ring.add(fade, forKey: "flash")
    }

    private var flashRing: CAShapeLayer?
}

/// Children in rows that wrap (`flex-wrap: wrap`), each at its own size.
final class FlowView: UIView {
    private var items: [UIView] = []
    private var spacing = 0.0
    private var height = 0.0

    func set(_ views: [UIView], spacing: Double) {
        items.forEach { $0.removeFromSuperview() }
        items = views
        self.spacing = spacing
        for view in views {
            view.translatesAutoresizingMaskIntoConstraints = true
            addSubview(view)
        }
        setNeedsLayout()
        invalidateIntrinsicContentSize()
    }

    private func place(_ width: Double, apply: Bool) -> Double {
        var x = 0.0, y = 0.0, line = 0.0
        for view in items {
            var size = view.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
            size.width = min(size.width, width)
            if x > 0, x + size.width > width { x = 0; y += line + spacing; line = 0 }
            if apply { view.frame = CGRect(x: x, y: y, width: size.width, height: size.height) }
            x += size.width + spacing
            line = max(line, size.height)
        }
        return items.isEmpty ? 0 : y + line
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let next = place(bounds.width, apply: true)
        if next != height { height = next; invalidateIntrinsicContentSize() }
    }

    override func systemLayoutSizeFitting(_ target: CGSize, withHorizontalFittingPriority h: UILayoutPriority, verticalFittingPriority v: UILayoutPriority) -> CGSize {
        CGSize(width: target.width, height: place(target.width, apply: false))
    }

    override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: bounds.width > 0 ? place(bounds.width, apply: false) : height)
    }
}
