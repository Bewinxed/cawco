import CawCoCore
import CawCoDesign
import CawCoMascot
import UIKit

/// The role label leading a turn (Who.svelte): the speaker's mark, the name,
/// and the clock, which a touch screen always shows. A note ("queued", "not
/// sent") stands where the clock would, before it.
final class WhoView: UIView {
    private let markBox = UIView()
    private let mark = GradientView()
    private let glyph = GlyphView(.ghost, size: Size.iconSm, tint: Palette.onBrand)
    private let role = LineLabel(hug: .required, resist: .defaultLow)
    private let note = LineLabel(hug: .required, resist: .required)
    private let clock = LineLabel(hug: .required, resist: .required)
    private var you = false

    /// Its parts are laid out by frame (`layoutSubviews`), as the row line it
    /// was (`railLine`: the mark's cell, the role, room, the note, the clock,
    /// a gap between each but none after the room) laid them out: a row that
    /// came on the screen moved every constraint of its speaker line into the
    /// window's layout engine (probe-kit spec `ios-scroll-up`). Its height,
    /// one line, is its intrinsic size, for the stacks it stands in.
    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        mark.layer.cornerCurve = .continuous
        for view in [markBox, role, note, clock] as [UIView] {
            view.translatesAutoresizingMaskIntoConstraints = true
            addSubview(view)
        }
        mark.translatesAutoresizingMaskIntoConstraints = true
        markBox.addSubview(mark)
        glyph.translatesAutoresizingMaskIntoConstraints = true
        mark.addSubview(glyph)
        isAccessibilityElement = true
        accessibilityTraits = .header
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (who: WhoView, _: UITraitCollection) in who.paint() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// A voice's face in the mark's place (Who.svelte `voice.face`): Caw, still.
    private var face: UIView?

    /// One line box of the label on the turn's leading (Who.svelte's h2
    /// inherits --leading-body: 18.85pt at the label size), at least; the mark centred on it.
    private static var leastHeight: Double { TypeScale.textLabel * TypeScale.leadingBody }

    /// A label's size on its line: its text's, whole pixels up in width.
    private func fitted(_ label: UILabel) -> CGSize {
        let natural = label.intrinsicContentSize
        let scale = max(traitCollection.displayScale, 1)
        return CGSize(width: (max(0, natural.width) * scale).rounded(.up) / scale, height: max(0, natural.height))
    }

    override var intrinsicContentSize: CGSize {
        let labels = [role, note, clock].filter { !$0.isHidden }.map { fitted($0).height }
        return CGSize(width: UIView.noIntrinsicMetric, height: ([Self.leastHeight, Size.rowMarkBox] + labels).max() ?? Self.leastHeight)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let width = bounds.width, height = bounds.height, gap = Columns.gap
        let box = Size.rowMarkBox
        markBox.frame = CGRect(x: 0, y: (height - box) / 2, width: box, height: box)
        // The reader's mark: 17pt in the action material, centred in the 18pt cell.
        let side = you ? Size.rowMark : box
        mark.frame = CGRect(x: you ? Size.wellX : 0, y: (box - side) / 2, width: side, height: side)
        let glyphSide = you ? Size.rowMarkGlyph : Size.iconSm
        glyph.frame = CGRect(x: (side - glyphSide) / 2, y: (side - glyphSide) / 2, width: glyphSide, height: glyphSide)
        face?.frame = markBox.bounds
        // From the end: the clock, a gap, the note; the room before them takes no gap.
        var end = width
        for label in [clock, note] where !label.isHidden {
            if end < width { end -= gap }
            let size = fitted(label)
            end -= size.width
            label.frame = CGRect(x: end, y: (height - size.height) / 2, width: size.width, height: size.height)
        }
        // The role a gap after the mark, giving way first when the line is short.
        let start = box + gap
        let size = fitted(role)
        role.frame = CGRect(x: start, y: (height - size.height) / 2, width: max(0, min(size.width, end - gap - start)), height: size.height)
    }

    func configure(_ header: Item.Header) {
        you = header.you
        let voiced = header.face && !header.you
        mark.isHidden = voiced
        if voiced, face == nil {
            let made = CawMark(status: .ready, side: Size.rowMarkBox)
            made.translatesAutoresizingMaskIntoConstraints = true
            markBox.addSubview(made)
            face = made
        }
        face?.isHidden = !voiced
        mark.layer.cornerRadius = you ? Radius.rowMarkR : Radius.radiusXs
        glyph.glyph = you ? .user : .ghost
        glyph.tintColor = you ? Palette.onAction : Palette.onBrand
        setNeedsLayout()
        invalidateIntrinsicContentSize()
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
    nonisolated static func size(_ text: String) -> CGSize {
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
final class PieceView: UIView, Recycled, FitsWidth, FrameRow {
    private let env: RowEnv
    private let who = WhoView()
    private let float = FloatNote()
    private var blocks: [UIView] = []
    /// The room above each block: none above the first, the blocks' own gap above the rest.
    private var gaps: [Double] = []
    /// The width the row stands at in the list, which its blocks span
    /// (ProseView `fitWidth`); nil where the piece is drawn inside another row.
    var fitWidth: CGFloat? {
        didSet {
            guard fitWidth != oldValue else { return }
            invalidateIntrinsicContentSize()
            setNeedsLayout()
        }
    }

    /// The width layout gave it, where nobody said one beforehand: its height is that width's.
    private var laidWidth: CGFloat?

    /// Laid out by frame (`layoutSubviews`), as the column it was (its
    /// speaker line, a space-2 under it, its blocks the blocks' gap apart, the
    /// clock floated into the first line's end), with no constraints in it
    /// (FrameRow): its cell stands it by frame. Where a piece stands in
    /// another row's stack (a branch's transcript), its height at its width
    /// is its intrinsic size.
    init(env: RowEnv) {
        self.env = env
        super.init(frame: .zero)
        for view in [who, float] as [UIView] {
            view.translatesAutoresizingMaskIntoConstraints = true
            addSubview(view)
        }
    }

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
            for view in blocks { addSubview(framedBlock(view)) }
            bringSubviewToFront(float)
        }
        gaps = piece.blocks.indices.map { i in i == 0 ? 0 : MarkdownRender.gap(after: piece.blocks[i - 1], before: piece.blocks[i]) }
        for (i, block) in piece.blocks.enumerated() {
            let view = blocks[i]
            switch block.kind {
            case let .text(text):
                (view as? ProseView)?.show(text, fading: piece.streaming && env.watched)
            case let .code(language, text):
                (view as? CodeWell)?.configure(language: language, text: text)
                (view as? CodeWell)?.join(above: piece.joinsAbove && i == 0, below: piece.joinsBelow && i == piece.blocks.count - 1)
            case let .table(head, rows):
                (view as? TableBlock)?.configure(head: head, rows: rows)
            case let .quote(text):
                (view as? QuoteBlock)?.text.attributedText = text
            case .rule: break
            }
        }
        (blocks.first as? ProseView)?.floatSize = piece.float.map(FloatNote.size) ?? .zero
        invalidateIntrinsicContentSize()
        setNeedsLayout()
    }

    func height(for width: CGFloat) -> CGFloat {
        guard width > 0 else { return 0 }
        var height = who.isHidden ? 0 : who.intrinsicContentSize.height + Space.space2
        for (i, view) in blocks.enumerated() { height += gaps[i] + blockHeight(view, width: width) }
        return height
    }

    override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: height(for: fitWidth ?? laidWidth ?? 0))
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let width = bounds.width
        if fitWidth == nil, laidWidth.map({ abs($0 - width) > 0.5 }) ?? true {
            laidWidth = width
            invalidateIntrinsicContentSize()
        }
        var y: CGFloat = 0
        if !who.isHidden {
            let line = who.intrinsicContentSize.height
            who.frame = CGRect(x: 0, y: 0, width: width, height: line)
            y = line + Space.space2
        }
        for (i, view) in blocks.enumerated() {
            y += gaps[i]
            let height = blockHeight(view, width: width)
            view.frame = CGRect(x: 0, y: y, width: width, height: height)
            y += height
        }
        // A grouped turn's clock, one body line tall at the first line's end.
        if !float.isHidden {
            let size = float.intrinsicContentSize
            let top = (blocks.first as? ProseView)?.frame.minY ?? 0
            float.frame = CGRect(x: width - size.width, y: top, width: size.width, height: TypeScale.textBody * TypeScale.leadingBody)
        }
    }

    func fade(_ now: Double) {
        for case let view as ProseView in blocks { view.fade(now) }
    }

    /// `configure` sets everything a piece draws: nothing of the last one is kept.
    func recycle() {}

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
final class UserTurnView: UIView, Recycled, FitsWidth, FrameRow, UIGestureRecognizerDelegate {
    private let env: RowEnv
    private let who = WhoView()
    private let well = WellSurface()
    private let words = UIView()
    private let body = MessageBody()
    private let float = FloatNote()
    private let chips = FlowView()
    /// The failed send's line and its button: in the row only for a failed send.
    private let failure = UIStackView()
    private let takenTag = ChipLabel(insets: UIEdgeInsets(top: 2, left: 7, bottom: 2, right: 7), radius: Radius.radiusPill)
    private var taken = false
    private let reason = WrapLabel(wrap: .pretty) // MessageRow `p.reason`
    private let retry = UIButton(type: .system)
    private var block: Block?
    /// The room above the words in the well: a hair less under a seam.
    private var wellTop = Space.space2 + 1
    /// The width the row stands at in the list (ProseView `fitWidth`); its
    /// words stand in the well, its padding either side of them.
    var fitWidth: CGFloat? {
        didSet {
            guard fitWidth != oldValue else { return }
            body.fitWidth = fitWidth.map { $0 - 2 * Space.space2 }
            setNeedsLayout()
        }
    }

    /// The width layout gave it, where nobody said one beforehand.
    private var laidWidth: CGFloat?

    /// Laid out by frame (FrameRow, `layoutSubviews`): the speaker line, a
    /// space-2 under it the well, and in the well, its padding in from each
    /// side, a column a space-2 apart of the taken tag, the words, the
    /// attachments and a failed send's line, the clock floated into the
    /// words' first line. A sent message's row, made as the turn starts, asks
    /// nothing of the layout engine.
    init(env: RowEnv) {
        self.env = env
        super.init(frame: .zero)
        for (view, parent) in [(who, self), (well, self), (words, well), (takenTag, words), (body, words), (chips, words), (float, words)] as [(UIView, UIView)] {
            view.translatesAutoresizingMaskIntoConstraints = true
            parent.addSubview(view)
        }
        failure.translatesAutoresizingMaskIntoConstraints = true
        takenTag.backgroundColor = Palette.statusAttnBg
        takenTag.attributedText = Styled.string("Queued · editing it below", TypeScale.typeMeta, color: Palette.statusAttnInk, weight: .medium)
        takenTag.isHidden = true
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
        well.inset = Size.wellX
        well.pad = Space.space2
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: UserTurnView, _: UITraitCollection) in
            view.retry.layer.borderColor = Palette.wellEdge.resolvedColor(with: view.traitCollection).cgColor
        }
        let lift = UITapGestureRecognizer(target: self, action: #selector(lifted))
        lift.delegate = self
        well.addGestureRecognizer(lift)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// The column in the well, shown parts only, with each one's height `width` wide.
    private func column(_ width: CGFloat) -> [(view: UIView, height: CGFloat)] {
        var parts: [(UIView, CGFloat)] = []
        if !takenTag.isHidden { parts.append((takenTag, takenTag.intrinsicContentSize.height)) }
        if !body.isHidden { parts.append((body, body.height(for: width))) }
        if !chips.isHidden {
            parts.append((chips, chips.systemLayoutSizeFitting(CGSize(width: width, height: 0), withHorizontalFittingPriority: .required,
                                                               verticalFittingPriority: .fittingSizeLevel).height))
        }
        if failure.superview === words, !failure.isHidden {
            parts.append((failure, failure.systemLayoutSizeFitting(CGSize(width: width, height: 0), withHorizontalFittingPriority: .required,
                                                                   verticalFittingPriority: .fittingSizeLevel).height))
        }
        return parts
    }

    /// The column's height: its parts', a space-2 apart.
    private static func stacked(_ parts: [(view: UIView, height: CGFloat)]) -> CGFloat {
        parts.reduce(0) { $0 + $1.height } + Space.space2 * Double(max(0, parts.count - 1))
    }

    func height(for width: CGFloat) -> CGFloat {
        guard width > 0 else { return 0 }
        let head = who.isHidden ? 0 : who.intrinsicContentSize.height + Space.space2
        return head + wellTop + Self.stacked(column(width - 2 * Space.space2)) + Space.space2 + 1
    }

    override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: height(for: fitWidth ?? laidWidth ?? 0))
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let width = bounds.width
        if fitWidth == nil, laidWidth.map({ abs($0 - width) > 0.5 }) ?? true {
            laidWidth = width
            invalidateIntrinsicContentSize()
        }
        var y: CGFloat = 0
        if !who.isHidden {
            let line = who.intrinsicContentSize.height
            who.frame = CGRect(x: 0, y: 0, width: width, height: line)
            y = line + Space.space2
        }
        let inner = max(0, width - 2 * Space.space2)
        let parts = column(inner)
        let content = Self.stacked(parts)
        well.frame = CGRect(x: 0, y: y, width: width, height: wellTop + content + Space.space2 + 1)
        words.frame = CGRect(x: Space.space2, y: wellTop, width: inner, height: content)
        var top: CGFloat = 0
        for (view, height) in parts {
            // The tag stands at its own width, at the start (`.row-user.taken`).
            let wide = view === takenTag ? min(inner, takenTag.intrinsicContentSize.width) : inner
            view.frame = CGRect(x: 0, y: top, width: wide, height: height)
            top += height + Space.space2
        }
        if !float.isHidden {
            let side = float.intrinsicContentSize.width
            float.frame = CGRect(x: inner - side, y: 0, width: side, height: TypeScale.textBody * TypeScale.leadingBody)
        }
    }

    func configure(_ item: Item) {
        guard case let .user(turn) = item.kind else { return }
        let block = turn.block
        if self.block?.id != block.id {
            retrying?.cancel()
            retrying = nil
        }
        self.block = block
        // Drawn by this device, not taken by the hub yet (MessageRow.svelte `ghost`):
        // on its way, or kept here until a connection to the hub is back (`LocalSend.State.waiting`).
        let held = block.state == "waiting"
        let ghost = block.state == "sending" || held
        // The hub refused it, and said why: this device's to send again.
        let refused = block.state == "refused"
        let failed = block.state == "failed" || refused
        // A failed send going again says so, not the failure (MessageRow.svelte),
        // until the hub refuses the retry too: then its words are the row's
        // (`Block.retried`, from `SessionTranscript.retries`).
        let again = block.string("retry")
        let sending = retrying != nil || again == "sending"
        let waiting = block.state == "pending" || block.queued
        taken = waiting && env.isTaken(block.id)
        // On a touch screen, a queued message that can be edited says how.
        let tappable = waiting && !taken && Self.touch && env.canEditQueued(block.id)
        let queuedNote = tappable ? "queued · \(env.agentName) is still working · tap to edit" : "queued"
        let note: String? = taken ? nil : held ? "waiting for the hub" : ghost ? "sending…" : failed ? (sending ? "sending…" : "not sent")
            : waiting ? queuedNote : nil
        let clock = failed || waiting || ghost ? nil : Item.clock(block.date)
        who.isHidden = turn.grouped
        who.configure(.init(name: "You", clock: clock, note: note, you: true))
        well.grouped = turn.grouped
        well.runsOn = turn.runsOn
        wellTop = turn.grouped ? Space.space2 : Space.space2 + 1
        let floated = turn.grouped ? [note, clock].compactMap(\.self).joined(separator: " ") : nil
        float.set(floated?.isEmpty == false ? floated : nil)
        body.floatSize = float.isHidden ? .zero : FloatNote.size(floated ?? "")
        body.configure(env.replacement(block.id) ?? block.content, style: .body)
        let presence = (waiting || ghost) && !taken ? Effect.ghostPresence : 1
        who.alpha = presence
        words.alpha = presence
        configureChips(block)
        fold(taken)
        // The failure's line and its button stand in the row, and are drawn,
        // only for a failed send: setting them for every message laid their
        // text out for nothing, and their stack's constraints went with every row.
        if failed, failure.superview == nil { words.addSubview(failure) } else if !failed { failure.removeFromSuperview() }
        failure.isHidden = !failed
        invalidateIntrinsicContentSize()
        setNeedsLayout()
        guard failed else { return }
        if sending {
            showSendingAgain()
        } else {
            let reasonText = again == "refused" ? block.string("retryRefused") : block.string("sendFailed")
            reason.attributedText = Styled.string("Couldn't send that message." + (reasonText.map { " \($0)" } ?? ""), TypeScale.typeMeta,
                                                  color: Palette.statusFailInk, lineBreak: .byWordWrapping)
        }
        retry.setAttributedTitle(Styled.string(sending ? "Sending again…" : "Send again", TypeScale.typeLabel, color: Palette.inkStrong), for: .normal)
        retry.isEnabled = !sending
        retry.isHidden = env.hub.map { $0.state != .connected || $0.fleet.byId[env.sessionId]?.isListed != true } ?? true
        retry.layer.borderColor = Palette.wellEdge.resolvedColor(with: traitCollection).cgColor
    }

    /// Forgets the message it stood for: a retry under way is its own, not the next one's.
    func recycle() {
        retrying?.cancel()
        retrying = nil
        block = nil
    }

    /// Folded down to its tag while its words are in the composer
    /// (`.row-user.taken`): an empty well on the control edge, nothing below it moving.
    private func fold(_ folded: Bool) {
        takenTag.isHidden = !folded
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
                    env.openLightbox(.images(sources.map { Lightbox.Picture(url: $0) }, index: sources.firstIndex(of: src) ?? 0), shot)
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

    /// A failed send, sent again (client.svelte.ts `retryFailed`): its own
    /// words, texts, files and pictures, as a new send that `replaces` this
    /// one, so the hub retires this row as the retry is taken.
    private func tryAgain() {
        guard retrying == nil, let block, let hub = env.hub, hub.state == .connected, let row = hub.fleet.byId[env.sessionId], row.isListed else { return }
        // One the hub refused before keeping a record goes again from this device, under its own id, on this row.
        if block.state == "refused" {
            hub.sessions.resend(block.id)
            return
        }
        let extras = SentMessages.extras(of: block)
        showSendingAgain()
        retry.setAttributedTitle(Styled.string("Sending again…", TypeScale.typeLabel, color: Palette.inkStrong), for: .normal)
        retry.isEnabled = false
        retrying = Task { [weak self] in
            var images: [(mediaType: String, data: Data)] = []
            for image in extras.images {
                guard let url = self?.env.url(image.src), let fetched = try? await URLSession.shared.data(for: .hub(url)) else {
                    self?.retryRefused("A picture it carries couldn't be read.")
                    return
                }
                images.append((image.mediaType, fetched.0))
            }
            guard let self, self.block?.id == block.id else { return }
            retrying = nil
            // The row says the retry from here, as the transcript holds it (`SessionTranscript.retries`).
            _ = hub.sessions.steer(row, text: block.content, images: images, texts: extras.texts, files: extras.files, replaces: block.id)
        }
    }

    /// The pictures being read for a retry.
    private var retrying: Task<Void, Never>?

    /// The reason line while the send is going again: what is happening, in
    /// the meta ink, not the failure it is recovering from.
    private func showSendingAgain() {
        reason.attributedText = Styled.string("Sending that message again…", TypeScale.typeMeta,
                                              color: Palette.inkMuted, lineBreak: .byWordWrapping)
    }

    /// The retry could not be put together: the row says why, and Send again stands again.
    private func retryRefused(_ why: String) {
        retrying = nil
        reason.attributedText = Styled.string("Couldn't send that message. \(why)", TypeScale.typeMeta,
                                              color: Palette.statusFailInk, lineBreak: .byWordWrapping)
        retry.setAttributedTitle(Styled.string("Send again", TypeScale.typeLabel, color: Palette.inkStrong), for: .normal)
        retry.isEnabled = true
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
