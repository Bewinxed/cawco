import CawCoCore
import CawCoDesign
import UIKit

/// A rail row's frame: the 2px rail at the rail edge, its content from the
/// glyph column (app.css `.rail-row`).
class RailRow: UIView, FitsWidth {
    let env: RowEnv
    let rail = UIView()
    let body = UIStackView()
    private var lead: NSLayoutConstraint!
    private var railLead: NSLayoutConstraint!
    /// The rail's ink: the flat --rail, or a failure's --status-fail-ink.
    var railColor: UIColor = RailInk.rail { didSet { rail.backgroundColor = railColor } }

    /// The width the row stands at in the list (RowStore): what its body's
    /// text is laid out at, before layout says it.
    var fitWidth: CGFloat? { didSet { if fitWidth != oldValue { widthChanged() } } }

    /// The body's width: the row's, from the glyph column on.
    var bodyWidth: CGFloat? { fitWidth.map { $0 - env.columns.glyph } }

    /// The row stands at another width: what was laid out for the old one is again.
    func widthChanged() {}

    required init(env: RowEnv) {
        self.env = env
        super.init(frame: .zero)
        rail.translatesAutoresizingMaskIntoConstraints = false
        rail.backgroundColor = railColor
        addSubview(rail)
        body.axis = .vertical
        body.alignment = .fill
        body.translatesAutoresizingMaskIntoConstraints = false
        addSubview(body)
        lead = body.leadingAnchor.constraint(equalTo: leadingAnchor, constant: env.columns.glyph)
        railLead = rail.leadingAnchor.constraint(equalTo: leadingAnchor, constant: env.columns.rail)
        NSLayoutConstraint.activate([
            railLead, rail.widthAnchor.constraint(equalToConstant: 2),
            rail.topAnchor.constraint(equalTo: topAnchor),
            rail.bottomAnchor.constraint(equalTo: bottomAnchor),
            lead, body.trailingAnchor.constraint(equalTo: trailingAnchor),
            body.topAnchor.constraint(equalTo: topAnchor),
            body.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// The columns at the width the row is drawn at.
    func place() {
        lead.constant = env.columns.glyph
        railLead.constant = env.columns.rail
    }

    /// A view hung at the text column (`.rail-hang`), or `offset` from the glyph column.
    func hung(_ view: UIView, offset: Double? = nil) -> UIView {
        let box = UIView()
        box.translatesAutoresizingMaskIntoConstraints = false
        box.pin(view, insets: UIEdgeInsets(top: 0, left: offset ?? env.columns.hang, bottom: 0, right: 0))
        return box
    }
}

/// One call of a run (ToolGroup.svelte): its glyph in the rail cell, the
/// verb, the mono argument, a chip, what it measured out, and — when it has
/// a body — a chevron, the body opening under the line.
final class ToolLineView: RailRow, RowContent, Disclosing {
    var disclosed: Bool { reveal.isOpen }

    private let cell = UIView()
    private let glyph = GlyphView(.toolGeneric, size: Size.iconMd, tint: Palette.inkMuted)
    private let favicon = UIImageView()
    private let verb = LineLabel()
    private let argument = LineLabel()
    private let chip = ChipLabel(insets: UIEdgeInsets(top: 1, left: Space.space2, bottom: 1, right: Space.space2), radius: Radius.radiusXs)
    private let fact = LineLabel()
    private let chevron = Chevron()
    /// ToolGroup's row: the verb `flex: 0 1 auto`, the argument `1 1 auto`,
    /// the chip, the fact and the chevron `0 0 auto`.
    private lazy var line = FlexLine([
        .init(view: cell, size: CGSize(width: Size.txWGlyph, height: Size.txWGlyph)),
        .init(view: verb, shrinks: true),
        .init(view: argument, grows: true, shrinks: true),
        .init(view: chip), .init(view: fact), .init(view: chevron),
    ], gap: Columns.gap)
    private let reveal: Reveal
    private let opened = UIStackView()
    private let preview = PreviewCard()
    private let shots = UIStackView()
    private var key = ""
    private var status = ""
    private var bodyPrint = ""

    required init(env: RowEnv) {
        reveal = Reveal(opened)
        super.init(env: env)
        favicon.translatesAutoresizingMaskIntoConstraints = false
        favicon.layer.cornerRadius = Radius.radiusXs
        favicon.clipsToBounds = true
        cell.addSubview(glyph)
        cell.addSubview(favicon)
        chip.backgroundColor = Palette.surfaceRecess
        NSLayoutConstraint.activate([
            glyph.centerXAnchor.constraint(equalTo: cell.centerXAnchor),
            glyph.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
            favicon.centerXAnchor.constraint(equalTo: cell.centerXAnchor),
            favicon.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
            favicon.widthAnchor.constraint(equalToConstant: Size.txWGlyph - 2),
            favicon.heightAnchor.constraint(equalToConstant: Size.txWGlyph - 2),
            line.heightAnchor.constraint(greaterThanOrEqualToConstant: Columns.line),
        ])
        opened.axis = .vertical
        shots.axis = .vertical
        shots.spacing = Space.space2
        body.addArrangedSubview(line)
        body.addArrangedSubview(preview)
        body.addArrangedSubview(reveal)
        body.addArrangedSubview(shots)
        body.setCustomSpacing(Space.space2, after: reveal)
        line.isUserInteractionEnabled = true
        line.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tap)))
        line.isAccessibilityElement = true
        line.accessibilityTraits = .button
    }

    @objc private func tap() {
        guard !chevron.isHidden else { return }
        env.toggle(key, self)
    }

    func toggled(open: Bool) -> (() -> Void, () -> Void) {
        chevron.set(open: open, animated: true)
        line.accessibilityValue = open ? "Expanded" : "Collapsed"
        if open { fillBody(force: false) }
        return reveal.toggle(open: open)
    }

    override func widthChanged() {
        if reveal.isOpen { fillBody(force: true) }
    }

    private var block: Block?

    /// A `show_preview` card: full presence while the session's open preview
    /// shows this call's page. Called again when the preview changes.
    func previewChanged() {
        guard let block, Self.describe(block).renderer == .preview else { return }
        let input = block.toolInput
        let shown = env.hub?.previews.byInstance[env.sessionId]
        let opened = shown?.state == .open && shown.flatMap(PreviewKey.of) == PreviewKey.of(ask: input)
        preview.configure(input, opened: opened) { [weak self] in self?.env.openPreview(input) }
    }

    func configure(_ item: Item) {
        guard case let .tool(block) = item.kind else { return }
        place()
        self.block = block
        key = block.disclosureKey
        let d = Self.describe(block)
        let failed = block.toolStatus == "error"
        let changed = status != block.toolStatus && !status.isEmpty
        status = block.toolStatus
        glyph.glyph = d.glyph
        glyph.tintColor = failed ? Palette.dataBad : Palette.inkMuted
        if changed, env.watched, !UIAccessibility.isReduceMotionEnabled {
            // A status change is a crossfade on its glyph, up out of a slight shrink.
            glyph.alpha = 0
            glyph.transform = CGAffineTransform(scaleX: 0.8, y: 0.8)
            Motion.easeOut.animator(Motion.durControl) { self.glyph.alpha = 1; self.glyph.transform = .identity }.startAnimation()
        }
        favicon.isHidden = true
        if let url = d.favicon {
            ImageStore.shared.load(url) { [weak self] image in
                guard let self, let image else { return }
                favicon.image = image
                favicon.isHidden = false
                glyph.isHidden = true
            }
        }
        glyph.isHidden = false
        let label = TypeScale.typeLabel
        verb.attributedText = Styled.string(d.label, label, color: Palette.inkStrong, leading: TypeScale.leadingRoot)
        verb.isHidden = d.label.isEmpty
        // ToolGroup `.arg`: the whole argument is set in the mono face, its detail a dimmer tail.
        let arg = NSMutableAttributedString()
        if let object = d.object { arg.append(Styled.string(object, label, color: Palette.inkMuted, size: TypeScale.textLabel, leading: TypeScale.leadingRoot, mono: true)) }
        if let detail = d.detail {
            arg.append(Styled.string(" " + detail, label, color: Palette.inkMuted.withAlphaComponent(0.7), size: TypeScale.textLabel, leading: TypeScale.leadingRoot, mono: true))
        }
        argument.attributedText = arg
        argument.isHidden = arg.length == 0
        chip.attributedText = d.chip.map { Styled.string($0, TypeScale.typeMeta, color: Palette.inkMuted) }
        chip.isHidden = d.chip == nil
        fact.attributedText = d.fact.map { Self.fact($0, diff: d.factDiff) }
        fact.isHidden = d.fact == nil
        let preview = d.renderer == .preview
        self.preview.isHidden = !preview
        line.isHidden = preview
        if preview { previewChanged() }
        let hasBody = ToolDescriptor.hasBody(d.renderer, failed: failed, input: block.toolInput, raw: block.meta["toolResult"],
                                             toolName: block.toolName, patch: block.string("toolDiff"))
        chevron.isHidden = !hasBody
        let open = hasBody && env.isOpen(key)
        chevron.set(open: open, animated: false)
        line.refit()
        line.accessibilityLabel = [d.label, d.object, d.detail, d.chip, d.fact, failed ? "failed" : nil].compactMap(\.self).joined(separator: " ")
        line.accessibilityValue = hasBody ? (open ? "Expanded" : "Collapsed") : nil
        line.accessibilityTraits = hasBody ? .button : .staticText
        if open { fillBody(force: true) } else { bodyPrint = "" ; opened.arrangedSubviews.forEach { $0.removeFromSuperview() } }
        reveal.set(open: open)
        configureShots(block, renderer: d.renderer)
    }

    /// The call as the shared rules read it (packages/core tool-presentation).
    private static func describe(_ block: Block) -> ToolDescriptor {
        ToolDescriptor.describe(block.toolName, input: block.toolInput, result: block.toolResult, status: block.toolStatus,
                                patch: block.string("toolDiff"))
    }

    /// ToolGroup `.d`: a measurement in --ink-strong; a diff's `+` green and its `−` red.
    private static func fact(_ text: String, diff: Bool) -> NSAttributedString {
        let out = NSMutableAttributedString()
        for token in text.split(separator: " ", omittingEmptySubsequences: false) {
            if out.length > 0 { out.append(Styled.string(" ", TypeScale.typeLabel, color: Palette.inkStrong, leading: TypeScale.leadingRoot)) }
            var ink = Palette.inkStrong
            if diff {
                if token.wholeMatch(of: /\+\d[\d,._]*/) != nil { ink = Palette.dataOk }
                if token.wholeMatch(of: /[−-]\d[\d,._]*/) != nil { ink = Palette.dataBad }
            }
            out.append(Styled.string(String(token), TypeScale.typeLabel, color: ink, leading: TypeScale.leadingRoot, tabular: true))
        }
        return out
    }

    /// The disclosed body, built only once the call is open (CollapsibleLazy).
    private func fillBody(force: Bool) {
        guard let block else { return }
        // Built again only for another block or another width.
        let print = String(decoding: block.signature, as: UTF8.self) + "\(bodyWidth ?? -1)"
        guard bodyPrint != print else { return }
        bodyPrint = print
        opened.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let d = Self.describe(block)
        let failed = block.toolStatus == "error"
        let result = ToolDescriptor.resultField(block.meta["toolResult"])
        let content: UIView
        var offset = env.columns.hang - Space.space3
        var margins = (top: Space.space2, bottom: Space.space3)
        switch d.renderer {
        case .diff:
            // What the call changed, one diff per file it touched; a failed call is
            // the diff it attempted, under the harness's reason (ToolGroup `.diffs`).
            let stack = UIStackView()
            stack.axis = .vertical
            stack.spacing = Space.space2
            if failed, let refusal = ToolDescriptor.refusal(result) {
                let label = WrapLabel(wrap: .pretty) // ToolGroup `p.refusal`
                label.attributedText = Styled.string(refusal, TypeScale.typeLabel, color: Palette.dataBad, weight: TypeScale.weightBody,
                                                     leading: TypeScale.leadingRoot, lineBreak: .byCharWrapping)
                stack.addArrangedSubview(hung(label, offset: Size.txDiffHeadInline + 1))
            }
            for change in ToolDescriptor.changes(block.toolInput, toolName: block.toolName, patch: block.string("toolDiff")) {
                let diff = DiffView(env: env)
                diff.configure(path: change.path, old: change.old, new: change.new)
                stack.addArrangedSubview(diff)
            }
            content = stack
            offset = env.columns.hang - (Size.txDiffHeadInline + 1)
        case .memory where !failed:
            let memory = MemoryBody(env: env)
            memory.configure(block)
            content = memory
            offset = env.columns.hang
        case .prose where !failed:
            let prose = MessageBody()
            offset = env.columns.hang
            prose.fitWidth = bodyWidth.map { $0 - offset }
            prose.configure(ToolDescriptor.str(block.toolInput[ToolPresentation.proseField]) ?? "", style: .tool)
            content = prose
            margins = (Space.space1, Space.space3)
        default:
            // ToolGroup `.fields`: each input field in the order the call wrote
            // it, then the result (a failed memory call: only its result).
            var fields: [(String, String)] = d.renderer == .memory ? [] : block.toolInput.keys.sorted(by: Self.inputOrder(block)).map { key in
                (key, ToolDescriptor.text(block.toolInput[key] as Any))
            }
            if let result { fields.append(("result", result.text)) }
            // Its values are laid out at the width they stand at from the
            // start: the well's, from the hang to the row's end.
            content = FieldsView(fields, more: result?.more ?? 0, width: bodyWidth.map { $0 - offset })
        }
        let box = UIView()
        box.pin(content, insets: UIEdgeInsets(top: margins.top, left: offset, bottom: margins.bottom, right: 0))
        opened.addArrangedSubview(box)
    }

    /// The input's keys in the order the call wrote them, as the web reads them.
    private static func inputOrder(_ block: Block) -> (String, String) -> Bool {
        let raw = String(decoding: block.signature, as: UTF8.self)
        return { a, b in
            (raw.range(of: "\"\(a)\"")?.lowerBound ?? raw.endIndex) < (raw.range(of: "\"\(b)\"")?.lowerBound ?? raw.endIndex)
        }
    }

    private func configureShots(_ block: Block, renderer: ToolDescriptor.Renderer) {
        shots.arrangedSubviews.forEach { $0.removeFromSuperview() }
        var urls: [URL] = []
        var views: [(ShotView, URL)] = []
        if renderer == .image, let machine = env.machineId,
           let path = block.toolInput["path"] as? String {
            var parts = URLComponents()
            parts.path = "/api/agents/\(machine)/image"
            parts.queryItems = [URLQueryItem(name: "path", value: path)]
            if let url = parts.string.flatMap(env.url) {
                let shot = ShotView(env: env, thumb: false)
                let caption = block.toolInput["caption"] as? String
                shot.configure(url, alt: caption ?? ToolDescriptor.pathLeaf(path), caption: caption, path: path)
                views.append((shot, url))
            }
        }
        for (i, image) in (block.meta["resultImages"] as? [[String: Any]] ?? []).enumerated() {
            guard let url = (image["src"] as? String).flatMap(env.url) else { continue }
            let shot = ShotView(env: env, thumb: false)
            shot.configure(url, alt: "Image \(i + 1) from \(block.toolName ?? "the tool")")
            views.append((shot, url))
        }
        urls = views.map(\.1)
        for (shot, url) in views {
            shot.onOpen = { [weak self, weak shot] in
                guard let self, let shot else { return }
                env.openLightbox(.images(urls, index: urls.firstIndex(of: url) ?? 0), shot)
            }
            shots.addArrangedSubview(hung(shot))
        }
        shots.isHidden = views.isEmpty
        body.setCustomSpacing(views.isEmpty ? 0 : Space.space2, after: reveal)
    }
}

/// A call's disclosed payload (ToolGroup `.fields`): each input field and the
/// result, key over value, in a recessed well; a value past 300pt scrolls.
final class FieldsView: UIView {
    /// `width`: the well's, where the row knows it; its values stand at that less its padding.
    init(_ fields: [(String, String)], more: Int, width: CGFloat?) {
        let inner = width.map { $0 - CGFloat(2 * Space.space3) }
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRecess
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = Space.space2
        for (i, (key, value)) in fields.enumerated() {
            let field = UIStackView()
            field.axis = .vertical
            field.spacing = Space.space1
            let k = WrapLabel()
            k.fitWidth = inner
            k.attributedText = Styled.string(key, TypeScale.typeLabel, color: Palette.inkMuted, leading: TypeScale.leadingRoot)
            field.addArrangedSubview(k)
            let text = CappedText(value)
            text.fitWidth = inner
            field.addArrangedSubview(text)
            if i == fields.count - 1, more > 0 {
                let note = WrapLabel()
                note.attributedText = Styled.string("… \(more.formatted()) more chars", TypeScale.typeMeta, color: Palette.inkMuted)
                field.addArrangedSubview(note)
            }
            stack.addArrangedSubview(field)
        }
        pin(stack, insets: UIEdgeInsets(top: Space.space3, left: Space.space3, bottom: Space.space3, right: Space.space3))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }
}

/// Mono text that wraps anywhere and scrolls past `--tx-field-cap`.
///
/// Its height is its own: the text's at its width, at most the cap, as an
/// intrinsic size nothing compresses. It was the scroll view's frame held to
/// its content by a constraint below required, which the layout broke
/// whenever the row was measured short: the value, laid out and drawn,
/// stood in a 0pt clip (a 584pt value in a 359×0 frame), its key bunched
/// against the next, and the row's height left blank under them.
final class CappedText: UIView {
    private let scroll = UIScrollView()
    private let text = ProseView()
    private let cap: Double

    init(_ value: String, cap: Double = Size.txFieldCap) {
        self.cap = cap
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        text.attributedText = Styled.string(value, TypeScale.typeCode, color: Palette.inkStrong, size: TypeScale.textLabel,
                                            leading: TypeScale.leadingBody, mono: true, lineBreak: .byCharWrapping, textKit2: true)
        text.translatesAutoresizingMaskIntoConstraints = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        pin(scroll)
        scroll.addSubview(text)
        NSLayoutConstraint.activate([
            text.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            text.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            text.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            text.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            text.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
        ])
        setContentCompressionResistancePriority(.required, for: .vertical)
        setContentHuggingPriority(.required, for: .vertical)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// The width it stands at, where its row knows it.
    var fitWidth: CGFloat? {
        didSet {
            guard fitWidth != oldValue else { return }
            text.fitWidth = fitWidth
            invalidateIntrinsicContentSize()
        }
    }

    override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: min(cap, text.intrinsicContentSize.height))
    }

    /// The width it was given is its text's: measured there, and asked
    /// again; laid out at a height other than its own, its row is measured again.
    override func layoutSubviews() {
        if bounds.width > 0, fitWidth.map({ abs($0 - bounds.width) > 0.5 }) ?? true { fitWidth = bounds.width }
        super.layoutSubviews()
        let own = intrinsicContentSize.height
        if bounds.width > 0, abs(own - bounds.height) > 1, remeasuredAt.map({ abs($0 - own) > 0.5 }) ?? true {
            remeasuredAt = own
            remeasureRow()
        }
    }

    /// The height the row was last asked to measure it at again.
    private var remeasuredAt: CGFloat?
}

/// A `show_preview` call (ToolGroup `.preview-tool`): the artifact's card,
/// its mark, title and path. A tap opens its page in the session's preview;
/// while that preview shows something else, or nothing, the card stands at
/// half presence, as the web draws a preview this tab has not opened.
final class PreviewCard: UIView {
    private let title = LineLabel()
    private let path = LineLabel()
    private var onOpen: () -> Void = {}

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(open)))
        isAccessibilityElement = true
        accessibilityTraits = .button
        accessibilityHint = "Opens the preview"
        let card = UIView()
        card.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = Palette.surfaceRaised
        card.layer.cornerRadius = Radius.radiusMd
        card.layer.cornerCurve = .continuous
        card.layer.borderWidth = 1
        let mark = UIView()
        mark.translatesAutoresizingMaskIntoConstraints = false
        mark.backgroundColor = Palette.mark6
        mark.layer.cornerRadius = Radius.radiusXs
        let glyph = GlyphView(.window, size: Size.iconSm, tint: Palette.markGlyph)
        mark.addSubview(glyph)
        let words = UIStackView(arrangedSubviews: [title, path])
        words.axis = .vertical
        let row = railLine([mark, words])
        card.pin(row, insets: UIEdgeInsets(top: Space.space2 * 2, left: Space.space2 * 2, bottom: Space.space2 * 2, right: Space.space2 * 2))
        addSubview(card)
        NSLayoutConstraint.activate([
            mark.widthAnchor.constraint(equalToConstant: Size.rowMark),
            mark.heightAnchor.constraint(equalToConstant: Size.rowMark),
            glyph.centerXAnchor.constraint(equalTo: mark.centerXAnchor),
            glyph.centerYAnchor.constraint(equalTo: mark.centerYAnchor),
            card.leadingAnchor.constraint(equalTo: leadingAnchor),
            card.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor),
            card.widthAnchor.constraint(lessThanOrEqualToConstant: Size.txPreviewMax),
            card.topAnchor.constraint(equalTo: topAnchor, constant: Space.space2),
            card.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space2),
            card.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.txPreviewMin),
        ])
        card.boxShadow = Shadow.shadowTile
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: PreviewCard, _: UITraitCollection) in view.paint(card) }
        paint(card)
    }

    private func paint(_ card: UIView) {
        card.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    @objc private func open() { onOpen() }

    func configure(_ input: [String: Any], opened: Bool, onOpen: @escaping () -> Void) {
        self.onOpen = onOpen
        alpha = opened ? 1 : 0.5
        title.attributedText = Styled.string("Preview", TypeScale.typeLabel, color: Palette.inkStrong, leading: TypeScale.leadingRoot)
        // source.ts `previewPlace`: a decision page by name, a folder by its leaf.
        let place = (input["page"] as? String).map { "decisions/\($0)" }
            ?? (input["dir"] as? String).map(ToolDescriptor.pathLeaf) ?? ""
        path.attributedText = Styled.string(place, TypeScale.typeMeta, color: Palette.inkMuted, size: TypeScale.textMeta, leading: TypeScale.leadingRoot, mono: true)
        path.isHidden = place.isEmpty
        accessibilityLabel = place.isEmpty ? "Preview" : "Preview, \(place)"
    }
}

/// The call in flight, before its message lands (Transcript `.livetool`): one
/// rail line, 26pt tall, its family's glyph in its ink.
final class LiveToolView: RailRow, RowContent {
    private let cell: RailCell
    private let verb = LineLabel()
    private let argument = LineLabel()
    private let line: FlexLine

    required init(env: RowEnv) {
        cell = RailCell(.toolGeneric)
        // Transcript `.livetool`: the verb and the glance both `flex: 0 1 auto`.
        line = FlexLine([
            .init(view: cell, size: CGSize(width: Size.txWGlyph, height: Size.txWGlyph)),
            .init(view: verb, shrinks: true), .init(view: argument, shrinks: true),
        ], gap: Columns.gap)
        super.init(env: env)
        line.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.txLine).isActive = true
        body.addArrangedSubview(line)
        isAccessibilityElement = true
    }

    func configure(_ item: Item) {
        guard case let .livetool(name, glance) = item.kind else { return }
        place()
        let d = ToolDescriptor.describe(name, input: [:], result: nil, status: "pending")
        cell.glyph.glyph = d.glyph
        // The kind's ink (packages/core tool-presentation).
        cell.glyph.tintColor = d.ink
        verb.attributedText = Styled.string(d.label, TypeScale.typeLabel, color: Palette.inkStrong, leading: TypeScale.leadingRoot)
        verb.isHidden = d.label.isEmpty
        argument.attributedText = Styled.string(glance, TypeScale.typeLabel, color: Palette.inkMuted, size: TypeScale.textLabel, leading: TypeScale.leadingRoot, mono: true)
        line.refit()
        accessibilityLabel = "\(name) running, \(glance)"
    }
}
