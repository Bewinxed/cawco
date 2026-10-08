import CawCoCore
import CawCoDesign
import UIKit

/// The quiet ledger's non-turn lines (SystemLine.svelte), every one a rail
/// row in the muted label face: a harness notification folded over its
/// report, a task's line, a command's output in its well, an interruption, a
/// failure in the fail ink with why under it, and a note that opens when it
/// has more to say than its line.
final class SystemLineView: RailRow, RowContent, Disclosing {
    var disclosed: Bool { reveal.isOpen }

    private let cell = RailCell(.info, size: Size.iconSm)
    private let title = WrapLabel()
    private let status = LineLabel(hug: .required, resist: .required)
    private let summary = LineLabel(hug: .defaultLow, resist: .defaultLow)
    private let chevron = Chevron()
    private let line = UIStackView()
    private let below = UIStackView()
    private let opened = UIStackView()
    private let reveal: Reveal
    private var key = ""

    required init(env: RowEnv) {
        reveal = Reveal(opened)
        super.init(env: env)
        for view in [cell, title, status, summary, chevron] { line.addArrangedSubview(view) }
        line.axis = .horizontal
        line.alignment = .center
        line.spacing = Columns.gap
        line.translatesAutoresizingMaskIntoConstraints = false
        title.setContentHuggingPriority(.defaultHigh, for: .horizontal)
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let row = UIView()
        row.addSubview(line)
        NSLayoutConstraint.activate([
            line.leadingAnchor.constraint(equalTo: row.leadingAnchor),
            line.trailingAnchor.constraint(lessThanOrEqualTo: row.trailingAnchor),
            line.topAnchor.constraint(equalTo: row.topAnchor),
            // The line is an inline box on the transcript's own 14 on 20.3 line,
            // which reaches below it: a one-line note's row is 21.27 in the
            // web's DOM around a line 18.85 tall.
            line.bottomAnchor.constraint(equalTo: row.bottomAnchor, constant: -Self.under),
        ])
        below.axis = .vertical
        opened.axis = .vertical
        body.addArrangedSubview(row)
        body.addArrangedSubview(below)
        body.addArrangedSubview(reveal)
        line.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tap)))
        line.isAccessibilityElement = true
    }

    @objc private func tap() {
        guard !chevron.isHidden else { return }
        env.toggle(key, self)
    }

    func toggled(open: Bool) -> (() -> Void, () -> Void) {
        chevron.set(open: open, animated: true)
        line.accessibilityValue = open ? "Expanded" : "Collapsed"
        return reveal.toggle(open: open)
    }

    /// What the transcript's line reaches below a note's line (21.27 - 18.85 at the label size).
    private static let under = 2.42 * TypeScale.textLabel / 13

    /// A note's words: the label size on the transcript's leading (18.85 at 13).
    private func words(_ text: String, ink: UIColor, strong: Bool = true) -> NSAttributedString {
        Styled.string(text, TypeScale.typeLabel, color: ink, weight: strong ? TypeScale.weightStrong : TypeScale.weightBody,
                      leading: TypeScale.leadingBody, lineBreak: .byWordWrapping)
    }

    private func set(_ glyph: Glyph, title text: String, ink: UIColor = Palette.inkMuted) {
        cell.glyph.glyph = glyph
        cell.glyph.tintColor = ink
        title.attributedText = words(text, ink: ink)
    }

    /// A well under the line, its text at the text column (`.well`).
    private func well(_ text: String) -> UIView {
        let box = UIView()
        box.backgroundColor = Palette.surfaceRecess
        box.layer.cornerRadius = Radius.radiusSm
        box.layer.cornerCurve = .continuous
        let label = WrapLabel()
        label.attributedText = Styled.string(text, TypeScale.typeCode, color: Palette.inkStrong, size: TypeScale.textLabel,
                                             leading: TypeScale.leadingBody, mono: true, lineBreak: .byCharWrapping)
        box.pin(label, insets: UIEdgeInsets(top: Space.space3, left: Space.space3, bottom: Space.space3, right: Space.space3))
        let hung = self.hung(box, offset: env.columns.hang - Space.space3)
        let spaced = UIView()
        spaced.pin(hung, insets: UIEdgeInsets(top: Space.space2, left: 0, bottom: 0, right: 0))
        return spaced
    }

    private func report(_ source: String) -> UIView {
        let text = MessageBody()
        text.configure(source)
        let spaced = UIView()
        spaced.pin(hung(text), insets: UIEdgeInsets(top: Space.space3, left: 0, bottom: 0, right: 0))
        return spaced
    }

    func configure(_ item: Item) {
        place()
        below.arrangedSubviews.forEach { $0.removeFromSuperview() }
        opened.arrangedSubviews.forEach { $0.removeFromSuperview() }
        status.isHidden = true
        summary.isHidden = true
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        railColor = RailInk.rail
        var openable = false
        switch item.kind {
        case let .harness(note, key):
            self.key = key
            set(.info, title: note.title)
            if !note.status.isEmpty {
                status.attributedText = words(note.status, ink: note.status == "failed" ? Palette.dataBad : Palette.inkMuted)
                status.isHidden = false
            }
            if !note.body.isEmpty { opened.addArrangedSubview(report(note.body)); openable = true }
        case let .system(block):
            key = block.disclosureKey
            let noteTitle = block.string("noteTitle")
            let errorTitle = block.string("errorTitle")
            let command = block.string("command")
            switch block.type {
            case "system.task":
                let bad = block.content == "task failed"
                set(.info, title: block.content, ink: bad ? Palette.dataBad : Palette.inkStrong)
                cell.glyph.tintColor = Palette.inkMuted
                if let result = block.string("result") {
                    summary.attributedText = words(result, ink: Palette.inkMuted)
                    summary.isHidden = false
                    // The verb keeps its width and the summary is cut short (`.tverb`, `.tsum`).
                    title.setContentCompressionResistancePriority(.required, for: .horizontal)
                }
            case "ui.command_output":
                set(.terminal, title: command ?? "Output")
                below.addArrangedSubview(well(block.content))
            case "ui.interrupted":
                set(.stop, title: "Interrupted")
            case "ui.error", "ui.session_error", "result.error":
                // A failure takes the rail in the fail colours: what failed on the line, why under it.
                railColor = Palette.statusFailInk
                set(.failed, title: errorTitle ?? "Turn failed", ink: Palette.statusFailInk)
                let why = WrapLabel(wrap: .pretty) // SystemLine `p.handoff`
                why.attributedText = Styled.string(block.content, TypeScale.typeLabel, color: Palette.statusFailInk,
                                                   leading: TypeScale.leadingBody, lineBreak: .byWordWrapping)
                let spaced = UIView()
                spaced.pin(hung(why), insets: UIEdgeInsets(top: Space.space1, left: 0, bottom: 0, right: 0))
                below.addArrangedSubview(spaced)
            default:
                let named = noteTitle != nil || errorTitle != nil
                let title = errorTitle ?? noteTitle ?? "Note"
                let shown = named ? title : (block.content.isEmpty ? title : block.content)
                set(.info, title: shown)
                if let command {
                    opened.addArrangedSubview(well(command)); openable = true
                } else if named, !block.content.isEmpty, block.content.trimmingCharacters(in: .whitespacesAndNewlines) != shown {
                    opened.addArrangedSubview(report(block.content)); openable = true
                }
            }
        default:
            return
        }
        chevron.isHidden = !openable
        // With nothing under the line there is nothing there: an empty stack
        // has no height of its own, and took whatever the row was given (a
        // one-line note stood 44 pt tall, its estimate, against 21.3).
        below.isHidden = below.arrangedSubviews.isEmpty
        let open = openable && env.isOpen(key)
        chevron.set(open: open, animated: false)
        reveal.set(open: open)
        line.accessibilityLabel = [title.text, status.isHidden ? nil : status.text, summary.isHidden ? nil : summary.text].compactMap(\.self).joined(separator: ", ")
        line.accessibilityTraits = openable ? .button : .staticText
        line.accessibilityValue = openable ? (open ? "Expanded" : "Collapsed") : nil
    }
}

/// What cawco put in on someone else's behalf (Peer.svelte): a rule that
/// fired, a delegate's report or ask, another session's hand-off, a
/// workflow's notice. One labelled line with the kind's glyph, folded to
/// the first line of what it says; the body opens under it.
final class PeerView: RailRow, RowContent, Disclosing {
    var disclosed: Bool { reveal.isOpen }

    private let glyph = RailCell(.handoff)
    private let label = LineLabel(hug: .defaultHigh, resist: .init(250))
    private let state = LineLabel(hug: .required, resist: .required)
    private let excerpt = LineLabel(hug: .init(1), resist: .init(1))
    private let chevron = Chevron()
    private let reason = WrapLabel(wrap: .pretty) // Peer `p.reason`
    private let text = MessageBody()
    private let reveal: Reveal
    private var key = ""
    private var sender: String?

    required init(env: RowEnv) {
        let box = UIView()
        reveal = Reveal(box)
        super.init(env: env)
        let line = railLine([glyph, label, state, excerpt, chevron])
        line.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.txLine).isActive = true
        body.addArrangedSubview(line)
        let reasonBox = hung(reason)
        body.addArrangedSubview(reasonBox)
        body.setCustomSpacing(Space.space1, after: line)
        box.pin(hung(text), insets: UIEdgeInsets(top: Space.space2, left: 0, bottom: 0, right: 0))
        body.addArrangedSubview(reveal)
        line.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tap)))
        label.isUserInteractionEnabled = true
        label.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(openSender)))
        line.isAccessibilityElement = true
        line.accessibilityTraits = .button
    }

    @objc private func tap() { env.toggle(key, self) }

    @objc private func openSender(_ tap: UITapGestureRecognizer) {
        if let sender { env.openSession(sender) } else { self.tap() }
    }

    func toggled(open: Bool) -> (() -> Void, () -> Void) {
        chevron.set(open: open, animated: true)
        let swap = { self.excerpt.alpha = open ? 0 : 1 }
        let pair = reveal.toggle(open: open)
        return ({ pair.0(); swap() }, pair.1)
    }

    func configure(_ item: Item) {
        guard case let .peer(block) = item.kind else { return }
        place()
        key = block.disclosureKey
        let meta = block.meta
        let peer = block.string("peerName") ?? ""
        var lead = "Hand-off from", name = peer, failed = false, kind = Glyph.handoff
        if block.type == "user.rule" {
            lead = "Rule ·"; name = block.string("ruleName") ?? ""; kind = .rules
        } else if block.type == "user.delegate_ask" {
            lead = "Ask from"; name = block.string("askLabel") ?? ""; kind = .ask
        } else if let report = block.string("reportKind") {
            lead = "Report from"; failed = report == "failed"; kind = failed ? .reportFailed : .report
        } else if let event = meta["workflowEvent"] as? String {
            lead = "Workflow ·"; name = "\(peer) · \(event)"; failed = event.hasSuffix("failed"); kind = .workflow
        }
        glyph.glyph.glyph = kind
        glyph.glyph.tintColor = failed ? Palette.statusFailInk : Palette.brandInk
        // A report's sender, linked where the fleet still has its row.
        sender = nil
        if block.string("reportKind") != nil, let short = block.string("peerSession"), short.count >= 8,
           let row = env.hub?.fleet.rows.first(where: { $0.id == short || $0.id.hasPrefix(short) }) {
            sender = row.id
        }
        let words = NSMutableAttributedString(attributedString: Styled.string(lead + " ", TypeScale.typeLabel, color: Palette.inkMuted, leading: TypeScale.leadingUi))
        var nameAttributes = Styled.attributes(TypeScale.typeLabel, color: Palette.inkStrong, leading: TypeScale.leadingUi)
        if sender != nil {
            nameAttributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
            nameAttributes[.underlineColor] = Palette.inkStrong.withAlphaComponent(0.35)
        }
        words.append(NSAttributedString(string: name, attributes: nameAttributes))
        label.attributedText = words
        var stateWord: (String, UIColor)?
        if block.state == "failed" { stateWord = ("not sent", Palette.statusFailInk) }
        else if failed, block.string("reportKind") != nil { stateWord = ("failed", Palette.statusFailInk) }
        else if block.state == "pending" || block.queued { stateWord = ("queued", Palette.inkMuted) }
        else if meta["urgent"] as? Bool == true { stateWord = ("urgent", Palette.inkMuted) }
        state.attributedText = stateWord.map { Styled.string($0.0, TypeScale.typeLabel, color: $0.1, leading: TypeScale.leadingUi) }
        state.isHidden = stateWord == nil
        let first = block.content.split(separator: "\n").map { $0.replacing(/[*_`#>]/, with: "").trimmingCharacters(in: .whitespaces) }.first { !$0.isEmpty } ?? ""
        excerpt.attributedText = Styled.string(first, TypeScale.typeLabel, color: Palette.inkMuted, weight: TypeScale.weightBody, leading: TypeScale.leadingUi)
        let open = env.isOpen(key)
        excerpt.alpha = open ? 0 : 1
        excerpt.isHidden = first.isEmpty
        chevron.set(open: open, animated: false)
        if block.state == "failed", let why = block.string("sendFailed") {
            reason.attributedText = Styled.string(why, TypeScale.typeMeta, color: Palette.statusFailInk, lineBreak: .byWordWrapping)
            reason.superview?.isHidden = false
        } else { reason.superview?.isHidden = true }
        // The reason's own margin (Peer `.reason`): with no reason there is
        // none, or it stands above the folded body and the row is 4pt tall.
        if let line = body.arrangedSubviews.first {
            body.setCustomSpacing(reason.superview?.isHidden == false ? Space.space1 : 0, after: line)
        }
        text.configure(block.content)
        reveal.set(open: open)
        alpha = block.state == "pending" || block.queued ? Effect.ghostPresence : 1
        line(label: "\(lead) \(name)", state: stateWord?.0, open: open)
    }

    private func line(label: String, state: String?, open: Bool) {
        guard let line = body.arrangedSubviews.first else { return }
        line.accessibilityLabel = [label, state].compactMap(\.self).joined(separator: ", ")
        line.accessibilityValue = open ? "Expanded" : "Collapsed"
    }
}

/// An answered, dismissed or still-open `AskUserQuestion` as it stands in the
/// history (QuestionCard.svelte): a raised card, its head a rail line with
/// the state's mark and pill, each question and its options as chips, the
/// chosen one marked, a freeform answer under them.
final class QuestionCardView: UIView, RowContent {
    private let env: RowEnv
    private let card = UIView()
    private let mark = GlyphView(.ask, size: Size.txWGlyph, tint: Palette.statusAttnInk)
    private let pill = ChipLabel(insets: UIEdgeInsets(top: 0, left: Space.space2, bottom: 0, right: Space.space2), radius: Radius.radiusPill)
    private let content = UIStackView()
    private var cardLead: NSLayoutConstraint!
    private var innerLead: NSLayoutConstraint!

    init(env: RowEnv) {
        self.env = env
        super.init(frame: .zero)
        card.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = Palette.surfaceRaised
        card.layer.cornerRadius = Radius.radiusLg
        card.layer.cornerCurve = .continuous
        card.layer.borderWidth = 1
        card.boxShadow = Shadow.shadowHairline
        addSubview(card)
        let title = LineLabel()
        title.attributedText = Styled.string("Question from the agent", TypeScale.typeLabel, color: Palette.inkStrong, leading: TypeScale.leadingRoot)
        let cell = UIView()
        cell.translatesAutoresizingMaskIntoConstraints = false
        cell.addSubview(mark)
        pill.minHeight = Size.cBadgeH
        let head = railLine([cell, title, pill, UIView()])
        content.axis = .vertical
        content.translatesAutoresizingMaskIntoConstraints = false
        content.addArrangedSubview(head)
        content.setCustomSpacing(Space.space2, after: head)
        card.addSubview(content)
        cardLead = card.leadingAnchor.constraint(equalTo: leadingAnchor)
        innerLead = content.leadingAnchor.constraint(equalTo: card.leadingAnchor)
        NSLayoutConstraint.activate([
            cardLead, card.trailingAnchor.constraint(equalTo: trailingAnchor),
            card.topAnchor.constraint(equalTo: topAnchor), card.bottomAnchor.constraint(equalTo: bottomAnchor),
            innerLead, content.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -Space.space3),
            content.topAnchor.constraint(equalTo: card.topAnchor, constant: Space.space3),
            content.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -Space.space3),
            cell.widthAnchor.constraint(equalToConstant: Size.txWGlyph), cell.heightAnchor.constraint(equalToConstant: Size.txWGlyph),
            mark.centerXAnchor.constraint(equalTo: cell.centerXAnchor), mark.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
        ])
        isAccessibilityElement = false
        card.accessibilityLabel = "Question from the agent"
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: QuestionCardView, _: UITraitCollection) in view.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    private func paint() {
        card.layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
        for case let option as OptionChip in content.arrangedSubviews.flatMap({ ($0 as? FlowView)?.subviews ?? [] }) { option.paint() }
    }

    func configure(_ item: Item) {
        guard case let .question(block) = item.kind else { return }
        // The surface starts on the rail's edge; inside, the content starts on the glyph column.
        cardLead.constant = env.columns.rail
        innerLead.constant = env.columns.glyph - env.columns.rail - 1
        let result = block.meta["toolUseResult"] as? [String: Any]
        let outcome = result?["outcome"] as? String
        let answered = outcome == "answered", dismissed = outcome == "dismissed"
        let failed = !(answered || dismissed) && block.toolStatus == "error"
        let (word, bg, ink, glyph): (String, UIColor, UIColor, Glyph) =
            answered ? ("answered", Palette.statusDoneBg, Palette.statusDoneInk, .check)
            : dismissed ? ("dismissed", Palette.surfaceRecess, Palette.inkMuted, .close)
            : failed ? ("not asked", Palette.surfaceRecess, Palette.inkMuted, .close)
            : ("needs you", Palette.statusAttnBg, Palette.statusAttnInk, .ask)
        mark.glyph = glyph
        mark.tintColor = answered ? Palette.statusDoneInk : (dismissed || failed) ? Palette.inkMuted : Palette.statusAttnInk
        pill.backgroundColor = bg
        pill.attributedText = Styled.string(word, TypeScale.typeLabel, color: ink, leading: 1)
        while content.arrangedSubviews.count > 1 { content.arrangedSubviews.last?.removeFromSuperview() }
        let answers = result?["answers"] as? [String: Any] ?? [:]
        let questions = (block.toolInput["questions"] as? [[String: Any]]) ?? []
        let hang = env.columns.hang
        for question in questions {
            let text = question["question"] as? String ?? ""
            let options = (question["options"] as? [[String: Any]] ?? []).compactMap { $0["label"] as? String }
            let picks: [String] = (answers[text] as? [String]) ?? (answers[text] as? String).map { [$0] } ?? []
            let lede = WrapLabel(wrap: .pretty) // QuestionCard `p.lede`
            lede.attributedText = Styled.string(text, TypeScale.typeBody, color: Palette.inkStrong, lineBreak: .byWordWrapping)
            // Its margin below it is the card's too where it is the last line (`.lede`).
            let under = UIView()
            under.pin(lede, insets: UIEdgeInsets(top: 0, left: 0, bottom: Space.space2, right: 0))
            content.addArrangedSubview(Self.hang(under, hang))
            content.setCustomSpacing(2, after: content.arrangedSubviews.last!)
            let row = FlowView()
            let settled = answered || dismissed
            let shown = settled ? options.enumerated().filter { picks.contains($0.element) && answered } : Array(options.enumerated())
            row.set(shown.map { OptionChip(index: $0.offset + 1, label: $0.element, chosen: settled) }, spacing: Space.space2)
            if !shown.isEmpty {
                // The options' margin below them stands inside the card even
                // where they are its last line (`.qopts`, a flex column's child).
                let below = UIView()
                below.pin(row, insets: UIEdgeInsets(top: 0, left: 0, bottom: Space.space2, right: 0))
                content.addArrangedSubview(Self.hang(below, hang))
            }
            if let other = picks.first(where: { !options.contains($0) }) {
                content.addArrangedSubview(Self.hang(Self.answer("Answered", other), hang))
            }
        }
        if answered, let response = result?["response"] as? String, !response.isEmpty {
            content.addArrangedSubview(Self.hang(Self.answer("In your own words", response), hang))
        }
        card.accessibilityLabel = "Question from the agent, \(word)"
    }

    private static func hang(_ view: UIView, _ offset: Double) -> UIView {
        let box = UIView()
        box.pin(view, insets: UIEdgeInsets(top: 0, left: offset, bottom: 0, right: 0))
        return box
    }

    private static func answer(_ label: String, _ text: String) -> UIView {
        let caps = LineLabel(hug: .required, resist: .required)
        caps.attributedText = NSAttributedString(string: label.uppercased(), attributes: Styled.attributes(TypeScale.typeLabel, color: Palette.inkMuted)
            .merging([.kern: TypeScale.trackCaps * TypeScale.textLabel]) { $1 })
        let words = WrapLabel(wrap: .pretty) // QuestionCard `p.answer-free`
        words.attributedText = Styled.string(text, TypeScale.typeBody, color: Palette.inkStrong, lineBreak: .byWordWrapping)
        let row = UIStackView(arrangedSubviews: [caps, words])
        row.spacing = Space.space2
        row.alignment = .firstBaseline
        return row
    }
}

/// A question's option as a chip (QuestionCard `.opt`): its key cap and its
/// label; the chosen one edged in the brand, its key cap filled.
final class OptionChip: UIView {
    private let chosen: Bool
    private let key = ChipLabel(insets: UIEdgeInsets(top: 0, left: Space.space1, bottom: 0, right: Space.space1), radius: Radius.radiusXs)

    init(index: Int, label: String, chosen: Bool) {
        self.chosen = chosen
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        key.minHeight = Size.rowMark
        key.minWidth = Size.rowMark
        key.attributedText = Styled.string("\(index)", TypeScale.typeMeta, color: chosen ? Palette.chipChosenInk : Palette.inkStrong, leading: 1, mono: true)
        let words = WrapLabel()
        words.attributedText = Styled.string(label, TypeScale.typeLabel, color: Palette.inkStrong, leading: TypeScale.leadingRoot, lineBreak: .byWordWrapping)
        let row = railLine([key, words])
        pin(row, insets: UIEdgeInsets(top: Space.space2, left: Space.space3, bottom: Space.space2, right: Space.space3))
        heightAnchor.constraint(greaterThanOrEqualToConstant: Columns.line).isActive = true
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func paint() {
        backgroundColor = chosen ? Palette.surfaceRecess : Palette.surfaceRaised
        layer.borderColor = (chosen ? Palette.brandSolid : Palette.borderControl).resolvedColor(with: traitCollection).cgColor
        key.backgroundColor = chosen ? Palette.chipChosenBg : Palette.surfaceRecess
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        paint()
    }
}

/// What a fleet memory call (`admin_memory_read`/`admin_memory_write`, the
/// `memory` kind's renderer) read or wrote (MemoryBody.svelte): a write is
/// a diff from the version it replaced, a removal the removed document
/// diffed to nothing, a read the document in its well, a listing its
/// documents, each opening into its well.
final class MemoryBody: UIView {
    private let env: RowEnv
    private let stack = UIStackView()

    init(env: RowEnv) {
        self.env = env
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        stack.spacing = Space.space2
        pin(stack)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    private func well(_ source: String) -> UIView {
        let box = UIView()
        box.backgroundColor = Palette.surfaceRecess
        box.layer.cornerRadius = Radius.radiusSm
        box.layer.borderWidth = 1
        box.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
        let text = MessageBody()
        text.configure(source, style: .tool)
        box.pin(text, insets: UIEdgeInsets(top: Space.space3, left: Space.space3, bottom: Space.space3, right: Space.space3))
        return box
    }

    private func line(_ text: String, mono: Bool = false) -> UIView {
        // MemoryBody's notes are `p`s; a path stands as written.
        let label = WrapLabel(wrap: mono ? .greedy : .pretty)
        label.attributedText = mono ? Styled.string(text, TypeScale.typeMeta, color: Palette.inkMuted, mono: true, tabular: true)
            : Styled.string(text, TypeScale.typeLabel, color: Palette.inkMuted, lineBreak: .byWordWrapping)
        return label
    }

    func configure(_ block: Block) {
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let input = block.toolInput
        let action = input["action"] as? String
        let parsed = MemoryResult(block.toolResult)
        let raw = block.toolResult.flatMap { $0.data(using: .utf8) }.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let doc = (raw?["memory"] as? [String: Any]) ?? raw
        let hash = doc?["hash"] as? String
        let updatedAt = doc?["updatedAt"] as? String
        let footer = [action == "set" || action == "set_doc" ? "saved" : nil, hash.map { String($0.prefix(7)) },
                      updatedAt.flatMap(Self.date).map { Item.clock($0) ?? "" }].compactMap(\.self).joined(separator: " · ")
        switch action {
        case "set", "set_doc", "remove_doc":
            let removes = action == "remove_doc"
            let path = action == "set" ? "CLAUDE.md" : (input["path"] as? String ?? "")
            let loading = UIView()
            loading.backgroundColor = Palette.surfaceRecess
            loading.layer.cornerRadius = Radius.radiusSm
            loading.heightAnchor.constraint(equalToConstant: 80).isActive = true
            stack.addArrangedSubview(loading)
            if !footer.isEmpty, case .doc = parsed { stack.addArrangedSubview(line(footer, mono: true)) }
            guard removes || { if case .doc = parsed { return true } else { return false } }() else { return }
            let written = input["content"] as? String ?? ""
            Task { [weak self] in
                guard let self else { return }
                let before = await self.replaced(action: action ?? "", path: input["path"] as? String, updatedAt: updatedAt,
                                                 expectedHash: input["expectedHash"] as? String, at: block.timestamp)
                let shown: UIView
                switch before {
                case let .version(content):
                    let diff = DiffView(env: env)
                    diff.configure(path: path, old: content, new: removes ? "" : written)
                    shown = diff
                case .empty:
                    let diff = DiffView(env: env)
                    diff.configure(path: path, old: "", new: written)
                    shown = diff
                case .unchanged:
                    shown = line("Saved unchanged: the content matched what was there.")
                case let .missing(why):
                    shown = line("The version this \(removes ? "removed" : "replaced") can't be shown: \(why).")
                }
                guard let index = stack.arrangedSubviews.firstIndex(of: loading) else { return }
                loading.removeFromSuperview()
                stack.insertArrangedSubview(shown, at: index)
                if let cell = sequence(first: self as UIView, next: { $0.superview }).first(where: { $0 is UICollectionViewCell }) as? UICollectionViewCell {
                    cell.invalidateIntrinsicContentSize()
                    (cell.superview as? UICollectionView)?.collectionViewLayout.invalidateLayout()
                }
            }
        case "get":
            if case let .doc(content) = parsed {
                stack.addArrangedSubview(well(content))
                if !footer.isEmpty { stack.addArrangedSubview(line(footer, mono: true)) }
            }
        case "list_docs":
            if case let .docs(docs) = parsed {
                let list = UIStackView()
                list.axis = .vertical
                list.spacing = Space.space1
                for docEntry in docs {
                    let row = DocRow(path: docEntry.path, content: docEntry.content, well: well(docEntry.content))
                    list.addArrangedSubview(row)
                }
                stack.addArrangedSubview(list)
            }
        default: break
        }
    }

    private static func date(_ iso: String) -> Date? {
        let format = ISO8601DateFormatter()
        format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return format.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }

    enum Before { case version(String), empty, unchanged, missing(String) }

    /// Which history row the call replaced or removed (MemoryBody `replaced`).
    private func replaced(action: String, path: String?, updatedAt: String?, expectedHash: String?, at: String?) async -> Before {
        guard let hub = env.hub, let base = hub.address else { return .missing("the hub is not connected") }
        var parts = URLComponents(url: base.appending(path: "/api/fleet/memory/history"), resolvingAgainstBaseURL: false)
        if action != "set", let path { parts?.queryItems = [URLQueryItem(name: "path", value: path)] }
        guard let url = parts?.url, let (data, _) = try? await URLSession.shared.data(from: url),
              let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return .missing("the history could not be read")
        }
        let created = { (row: [String: Any]) in (row["createdAt"] as? String).flatMap(Self.date) ?? .distantPast }
        var found: [String: Any]?
        if action == "set" || action == "set_doc" {
            guard let saved = updatedAt.flatMap(Self.date) else { return .missing("the save did not say when it landed") }
            found = rows.first { row in
                let gap = saved.timeIntervalSince(created(row))
                return gap >= 0 && gap < 1 && (expectedHash == nil || row["hash"] as? String == expectedHash)
            }
            if found == nil { return rows.contains { created($0) < saved } ? .unchanged : .empty }
        } else {
            guard let called = at.flatMap(Self.date) else { return .missing("the call carries no time to match") }
            found = rows.filter { created($0) >= called }.last
            if found == nil { return .missing("the hub no longer keeps the removed version") }
        }
        guard let id = found?["id"], let url = URL(string: "/api/fleet/memory/history/\(id)", relativeTo: base),
              let (data, _) = try? await URLSession.shared.data(from: url),
              let version = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = version["content"] as? String else { return .missing("that version could not be read") }
        return .version(content)
    }
}

/// A listed memory document: its path, age and length, opening into its well.
final class DocRow: UIView {
    private let reveal: Reveal
    private let chevron = Chevron(size: Size.iconSm)

    init(path: String, content: String, well: UIView) {
        let box = UIView()
        box.pin(well, insets: UIEdgeInsets(top: Space.space1, left: 0, bottom: Space.space2, right: 0))
        reveal = Reveal(box)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        let name = LineLabel(hug: .defaultLow, resist: .defaultLow)
        name.attributedText = Styled.string(path, TypeScale.typeLabel, color: Palette.inkStrong, size: TypeScale.textLabel, mono: true)
        let lines = LineLabel(hug: .required, resist: .required)
        lines.attributedText = Styled.string("\(content.split(separator: "\n", omittingEmptySubsequences: false).count) lines", TypeScale.typeMeta, color: Palette.inkMuted, tabular: true)
        let head = railLine([name, lines, chevron])
        head.heightAnchor.constraint(greaterThanOrEqualToConstant: Columns.line).isActive = true
        let column = UIStackView(arrangedSubviews: [head, reveal])
        column.axis = .vertical
        pin(column)
        reveal.set(open: false)
        head.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(toggle)))
        head.isAccessibilityElement = true
        head.accessibilityLabel = path
        head.accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    @objc private func toggle() {
        let open = !reveal.isOpen
        chevron.set(open: open, animated: true)
        let (layout, done) = reveal.toggle(open: open)
        let animator = Motion.easeOut.animator(open ? Motion.durReveal : Motion.durExit) {
            layout()
            var view: UIView? = self
            while let next = view?.superview, !(next is UICollectionView) { view = next }
            view?.superview?.layoutIfNeeded()
            (view?.superview as? UICollectionView)?.collectionViewLayout.invalidateLayout()
            view?.layoutIfNeeded()
        }
        animator.addCompletion { _ in done() }
        animator.startAnimation()
    }
}
