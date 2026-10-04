import CawCoAPI
public import CawCoCore
import CawCoDesign
import Markdown
import Observation
public import UIKit

/// A row the tail adds after the transcript's own: the question waiting, the
/// one already answered, or the failure (DelegateTail.svelte `TailNote`).
public struct TailNote: Equatable, Sendable {
    public enum Kind: Sendable { case ask, asked, fail }

    /// What tells this note from the one before it: a new key arrives as a new row.
    public let key: String
    public let kind: Kind
    public let text: String

    public init(key: String, kind: Kind, text: String) {
        self.key = key
        self.kind = kind
        self.text = text
    }
}

/// The last six things a session did, one line each, read off its own live
/// transcript (DelegateTail.svelte): the hover panel's and the delegate
/// tray's answer to "what is it doing right now?". A row that arrives lifts
/// the stack by one row and rises into the bottom slot while the top row
/// dissolves under the mask; rows that come faster than one lift queue and
/// play back to back, so the tail never skips.
///
/// Six rows high, as wide as its widest row up to the hover panel's content
/// width; it reports both through `intrinsicContentSize`, so the panel that
/// holds it morphs to them. It watches its session only while it stands in a
/// window.
public final class DelegateTailView: UIView {
    /// The widest the tail grows: the hover panel's cap less its border and padding (HoverPanel.svelte `.cell`).
    public static let maxWidth = Size.hoverPanelMax - 2 - Space.space3 * 2

    /// The question waiting or the failure, which the tail ends on.
    public var note: TailNote? {
        didSet {
            if note != oldValue { take() }
        }
    }

    private static let slots = 6
    private static let row = Size.tailRow

    private let hub: HubConnection
    private let instanceId: String
    private var watching = false

    /// The rows the transcript's blocks read as, kept for its revision.
    private var settled: (revision: Int, rows: [TailRow])?
    /// The keys on screen, oldest first: `slots` of them, one more while it leaves.
    private var shown: [String] = []
    /// The last data each key had, for a row drawn on its way out.
    private var last: [String: TailRow] = [:]
    private var queue: [String] = []
    private var playing = false
    /// The tail has drawn once: what the store held when it came on screen is simply there.
    private var begun = false
    private var loading = true

    private let column = UIView()
    private var rowViews: [String: TailRowView] = [:]
    private let skeleton = UIView()
    private let fade = CAGradientLayer()
    private var width = 0.0

    public init(hub: HubConnection, instanceId: String) {
        self.hub = hub
        self.instanceId = instanceId
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        clipsToBounds = true
        // The top row's height dissolves: a row leaving fades out through it as the stack lifts.
        fade.colors = [UIColor.clear.cgColor, UIColor.black.cgColor]
        fade.startPoint = CGPoint(x: 0.5, y: 0)
        fade.endPoint = CGPoint(x: 0.5, y: 1)
        fade.locations = [0, NSNumber(value: 1.0 / Double(Self.slots))]
        layer.mask = fade
        addSubview(column)
        buildSkeleton()
        setContentHuggingPriority(.required, for: .vertical)
        setContentCompressionResistancePriority(.required, for: .vertical)
        setContentHuggingPriority(.defaultHigh, for: .horizontal)
        setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    }

    @available(*, unavailable)
    public required init?(coder _: NSCoder) {
        fatalError("DelegateTailView is built in code")
    }

    override public var intrinsicContentSize: CGSize {
        CGSize(width: width, height: Self.row * Double(Self.slots))
    }

    // MARK: The session

    override public func didMoveToWindow() {
        super.didMoveToWindow()
        let onScreen = window != nil
        // A run's card passes no session: its tail is the note alone.
        if onScreen != watching, !instanceId.isEmpty {
            watching = onScreen
            if onScreen {
                hub.sessions.watchDelegate(instanceId)
            } else {
                hub.sessions.unwatchDelegate(instanceId)
            }
        }
        if onScreen { take() }
    }

    /// Reads the session's rows and plays what arrived; asks again when the transcript moves.
    private func take() {
        guard window != nil else { return }
        let target = withObservationTracking {
            rows()
        } onChange: { [weak self] in
            Task { @MainActor in self?.take() }
        }
        take(target)
    }

    /// The newest rows, oldest first: a few more than the tail shows, for the one leaving.
    private func rows() -> [TailRow] {
        let transcript = instanceId.isEmpty ? nil : hub.sessions.transcripts[instanceId]
        loading = transcript?.loading ?? true
        var out: [TailRow] = []
        if let transcript {
            if settled?.revision != transcript.blockRevision {
                settled = (transcript.blockRevision, Self.read(transcript.blocks))
            }
            out = settled?.rows ?? []
        }
        // What is being written right now, keyed to where it will settle.
        let at = transcript?.blocks.count ?? 0
        if let thinking = transcript?.tail?.thinkingStream, !thinking.isEmpty, out.last?.isReason != true {
            out.append(TailRow(key: "live:reason:\(at)", kind: .reason))
        }
        let streaming = TailRow.lastLine(transcript?.tail?.streaming ?? "")
        if !streaming.isEmpty {
            out.append(TailRow(key: "live:say:\(at)", kind: .stream(streaming)))
        }
        if let note {
            out.append(TailRow(key: note.key, kind: .note(note)))
        }
        return out
    }

    /// The blocks' rows, newest last: read from the end until the tail and its spare are full.
    private static func read(_ blocks: [Components.Schemas.TranscriptBlock]) -> [TailRow] {
        var out: [TailRow] = []
        var index = blocks.count - 1
        while index >= 0, out.count < slots + 2 {
            // Back-to-back reasoning blocks are one "Reasoning" line.
            if let block = Block(blocks[index]), let row = TailRow(block), !(row.isReason && out.first?.isReason == true) {
                out.insert(row, at: 0)
            }
            index -= 1
        }
        return out
    }

    // MARK: The tail's motion

    private func take(_ target: [TailRow]) {
        let byKey = Dictionary(target.map { ($0.key, $0) }, uniquingKeysWith: { _, newer in newer })
        for row in target {
            last[row.key] = row
        }
        let keys = target.map(\.key)
        let present = Set(keys)
        queue.removeAll { !present.contains($0) }
        let first = !begun
        begun = true
        guard let anchor = (shown + queue).last(where: present.contains), let from = keys.firstIndex(of: anchor) else {
            // Nothing on screen is in the transcript any more (or yet): it is simply there.
            let wasEmpty = shown.isEmpty
            shown = Array(keys.suffix(Self.slots))
            queue = []
            render()
            // Rows that land in a tail already on screen fade in together; one drawn with them does not.
            if !first, wasEmpty, !shown.isEmpty { fadeIn(column) }
            return
        }
        let known = Set(shown + queue)
        var arrivals = keys[(from + 1)...].filter { !known.contains($0) }
        // A line being written that has just settled keeps its place: same row, new key.
        if let end = shown.last, end.hasPrefix("live:"), !present.contains(end), let next = arrivals.first,
           let settles = byKey[next], end.hasPrefix("live:say") ? settles.isSay : settles.isReason {
            shown[shown.count - 1] = next
            arrivals.removeFirst()
        }
        queue.append(contentsOf: arrivals)
        render()
        if !arrivals.isEmpty { pump() }
    }

    /// Plays the queue one row at a time: the first lift over `durMorph`, the rest back to back at `durControl`.
    private func pump() {
        guard !playing else { return }
        playing = true
        lift(Motion.durMorph)
    }

    /// One row into the bottom slot, then the next one queued, if any.
    private func lift(_ duration: TimeInterval) {
        guard !queue.isEmpty, window != nil else {
            playing = false
            return
        }
        let key = queue.removeFirst()
        if UIAccessibility.isReduceMotionEnabled {
            // Reduced motion: the rows shift at once and the new one fades in place.
            shown = Array((shown + [key]).suffix(Self.slots))
            render()
            guard let arriving = rowViews[key] else { return lift(Motion.durControl) }
            arriving.alpha = 0
            let animator = Motion.easeOut.animator(Motion.durControl) { arriving.alpha = 1 }
            animator.addCompletion { [weak self] _ in self?.lift(Motion.durControl) }
            animator.startAnimation()
            return
        }
        shown.append(key)
        render()
        let arriving = rowViews[key]
        let leaving = shown.count > Self.slots ? rowViews[shown[0]] : nil
        arriving?.alpha = 0
        column.transform = CGAffineTransform(translationX: 0, y: Self.row)
        let animator = Motion.easeOut.animator(duration) { [column] in
            arriving?.alpha = 1
            leaving?.alpha = 0
            column.transform = .identity
        }
        animator.addCompletion { [weak self] _ in
            guard let self else { return }
            shown = Array(shown.suffix(Self.slots))
            render()
            lift(Motion.durControl)
        }
        animator.startAnimation()
    }

    private func fadeIn(_ view: UIView) {
        view.alpha = 0
        Motion.easeOut.animator(Motion.durControl) { view.alpha = 1 }.startAnimation()
    }

    // MARK: Drawing

    /// The rows in `shown`, each in its slot from the foot up, and the tail's width for them.
    private func render() {
        for (key, view) in rowViews where !shown.contains(key) {
            view.removeFromSuperview()
            rowViews[key] = nil
        }
        var widest = 0.0
        for key in shown {
            guard let row = last[key] else { continue }
            let view = rowViews[key] ?? {
                let made = TailRowView()
                column.addSubview(made)
                rowViews[key] = made
                return made
            }()
            view.configure(row)
            widest = max(widest, view.naturalWidth)
        }
        last = last.filter { shown.contains($0.key) || queue.contains($0.key) }
        skeleton.isHidden = !(shown.isEmpty && loading)
        column.isHidden = shown.isEmpty
        if !skeleton.isHidden { widest = Self.skeletonWidths.max() ?? 0 }
        let next = min(Self.maxWidth, widest.rounded(.up))
        if next != width {
            width = next
            invalidateIntrinsicContentSize()
        }
        setNeedsLayout()
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        fade.frame = bounds
        CATransaction.commit()
        // The stack stands on the tail's foot and spills over its top.
        // Placed by bounds and centre: the lift's transform stays the column's own.
        let height = Double(shown.count) * Self.row
        column.bounds = CGRect(x: 0, y: 0, width: bounds.width, height: height)
        column.center = CGPoint(x: bounds.midX, y: bounds.height - height / 2)
        for (index, key) in shown.enumerated() {
            rowViews[key]?.frame = CGRect(x: 0, y: Double(index) * Self.row, width: bounds.width, height: Self.row)
        }
        skeleton.frame = bounds
    }

    // MARK: Loading

    /// Its transcript is on the way: three rows' worth of the house skeleton.
    private static let skeletonWidths = [240.0, 180.0, 280.0]

    private func buildSkeleton() {
        skeleton.isAccessibilityElement = true
        skeleton.accessibilityLabel = "Loading its transcript"
        skeleton.accessibilityTraits = .updatesFrequently
        addSubview(skeleton)
        for (index, width) in Self.skeletonWidths.enumerated() {
            let bar = SkeletonView(height: 12)
            skeleton.addSubview(bar)
            let fromFoot = Double(Self.skeletonWidths.count - index) * Self.row
            NSLayoutConstraint.activate([
                bar.leadingAnchor.constraint(equalTo: skeleton.leadingAnchor),
                bar.widthAnchor.constraint(equalToConstant: width),
                bar.centerYAnchor.constraint(equalTo: skeleton.bottomAnchor, constant: -fromFoot + Self.row / 2),
            ])
        }
    }
}

// MARK: Rows

/// One line of the tail (DelegateTail.svelte `Row`).
private struct TailRow {
    enum Kind {
        case tool(glyph: Glyph, tint: UIColor, verb: String, argument: String)
        case reason
        case say(String)
        case stream(String)
        case peer(glyph: Glyph, lead: String, name: String)
        case note(TailNote)
    }

    let key: String
    let kind: Kind

    var isReason: Bool {
        if case .reason = kind { return true }
        return false
    }

    var isSay: Bool {
        if case .say = kind { return true }
        return false
    }

    init(key: String, kind: Kind) {
        self.key = key
        self.kind = kind
    }

    /// The row a block reads as; nil for one the tail does not list.
    init?(_ block: Block) {
        key = block.id
        switch block.type {
        case "tool.use", "tool.handoff":
            let described = ToolDescriptor.describe(block.toolName, input: block.toolInput, result: block.toolResult, status: block.toolStatus)
            kind = .tool(glyph: described.glyph, tint: Self.tint(ToolDescriptor.family(block.toolName)),
                         verb: described.label, argument: described.object ?? described.detail ?? "")
        case "thinking":
            guard !block.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
            kind = .reason
        case "assistant":
            let text = Self.lastLine(block.content)
            guard !text.isEmpty else { return nil }
            kind = .say(text)
        case "user.rule":
            kind = .peer(glyph: .rules, lead: "Rule ·", name: block.string("ruleName") ?? "")
        case "user.peer":
            let report = block.meta["reportKind"] != nil && !(block.meta["reportKind"] is NSNull)
            kind = .peer(glyph: report ? .report : .handoff, lead: report ? "Report from" : "Hand-off from", name: block.string("peerName") ?? "")
        default:
            return nil
        }
    }

    static func lastLine(_ text: String) -> String {
        text.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.last { !$0.isEmpty } ?? ""
    }

    /// A tool family's hue (descriptors.ts `FAMILIES`).
    private static func tint(_ family: ToolDescriptor.Family) -> UIColor {
        switch family {
        case .bash, .js: Palette.toolRun
        case .read: Palette.toolRead
        case .edit, .notebook: Palette.toolEdit
        case .write: Palette.toolWrite
        case .grep, .glob, .toolsearch: Palette.toolSearch
        case .web, .screen, .navigate: Palette.toolWeb
        case .skill: Palette.toolSkill
        case .message, .task: Palette.toolAgent
        case .mcp: Palette.toolMcp
        case .memory, .todo: Palette.toolPlan
        case .question: Palette.toolAsk
        case .other: Palette.mutedForeground
        }
    }
}

/// A row as drawn: a 16pt glyph, the verb, then the argument or the words,
/// which give way with an ellipsis (`.row`, `.ic`, `.verb`, `.arg`, `.text`).
private final class TailRowView: UIView {
    private let glyph = GlyphView(.toolGeneric, size: Size.iconMd, tint: Palette.inkMuted)
    private let verb = LineLabel()
    private let words = LineLabel()
    private lazy var line = FlexLine([
        .init(view: glyph, size: CGSize(width: Size.iconMd, height: Size.iconMd)),
        .init(view: verb),
        .init(view: words, shrinks: true),
    ], gap: Space.space2)

    init() {
        super.init(frame: .zero)
        addSubview(line)
        isAccessibilityElement = true
        accessibilityTraits = .staticText
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    var naturalWidth: Double { line.naturalWidth }

    override func layoutSubviews() {
        super.layoutSubviews()
        line.frame = bounds
    }

    /// A row's text: the meta size in the body face or the mono. Each run is
    /// one line centred in the row (`align-items: center`), and a centred
    /// line box puts the baseline where the font's own content area centred
    /// would, whatever the line height: so the label keeps its natural line.
    private static func attributes(color: UIColor, weight: UIFont.Weight = TypeScale.weightBody, mono: Bool = false) -> [NSAttributedString.Key: Any] {
        let face = mono ? TypeScale.typeCode : TypeScale.typeMeta
        return [.font: face.font(TypeScale.textMeta, weight: weight), .foregroundColor: color]
    }

    private static func set(_ text: String, color: UIColor, weight: UIFont.Weight = TypeScale.weightBody, mono: Bool = false) -> NSAttributedString {
        NSAttributedString(string: text, attributes: attributes(color: color, weight: weight, mono: mono))
    }

    func configure(_ row: TailRow) {
        var icon: (Glyph, UIColor)?
        var lead: NSAttributedString?
        var rest: NSAttributedString?
        switch row.kind {
        case let .tool(glyph, tint, label, argument):
            icon = (glyph, tint)
            if !label.isEmpty { lead = Self.set(label, color: Palette.inkStrong, weight: TypeScale.weightStrong) }
            rest = Self.set(argument, color: Palette.inkMuted, mono: true)
        case .reason:
            icon = (.cpu, Palette.inkMuted)
            lead = Self.set("Reasoning", color: Palette.inkMuted)
        case let .say(text):
            rest = Self.set(text, color: Palette.inkStrong)
        case let .stream(text):
            rest = Self.written(text)
        case let .peer(glyph, label, name):
            icon = (glyph, Palette.inkMuted)
            lead = Self.set(label, color: Palette.inkMuted)
            rest = Self.set(name, color: Palette.inkStrong)
        case let .note(note):
            let ink = switch note.kind {
            case .ask: Palette.statusAttnInk
            case .asked: Palette.inkMuted
            case .fail: Palette.statusFailInk
            }
            rest = Self.set(note.text, color: ink)
        }
        glyph.isHidden = icon == nil
        if let icon {
            glyph.glyph = icon.0
            glyph.tintColor = icon.1
        }
        verb.isHidden = lead == nil
        verb.attributedText = lead
        words.isHidden = rest == nil || rest?.length == 0
        words.attributedText = rest
        line.refit()
        accessibilityLabel = [lead?.string, rest?.string].compactMap(\.self).filter { !$0.isEmpty }.joined(separator: " ")
    }

    /// The line being written, one line tall however the message renders
    /// (`.stream .text *`: every element inline, at the row's own size).
    private static func written(_ source: String) -> NSAttributedString {
        let base = attributes(color: Palette.inkStrong)
        var style = ProseStyle.body
        style.codeSize = TypeScale.textMeta
        let out = NSMutableAttributedString()
        func walk(_ node: Markup, _ attributes: [NSAttributedString.Key: Any]) {
            switch node {
            case is Paragraph:
                out.append(MarkdownRender.inline(node, attributes: attributes, style: style))
            case is Heading:
                out.append(MarkdownRender.inline(node, attributes: MarkdownRender.traits(attributes, bold: true), style: style))
            case let code as CodeBlock:
                var mono = attributes
                mono[.font] = TypeScale.typeCode.font(TypeScale.textMeta, weight: TypeScale.weightBody)
                out.append(NSAttributedString(string: code.code.trimmingCharacters(in: .newlines), attributes: mono))
            case let html as HTMLBlock:
                out.append(NSAttributedString(string: html.rawHTML.trimmingCharacters(in: .newlines), attributes: attributes))
            default:
                for child in node.children { walk(child, attributes) }
            }
        }
        walk(Document(parsing: PartialSyntax.hide(source)), base)
        // Inline code keeps its surface; a label draws it as the run's background.
        out.enumerateAttribute(.inlineCode, in: NSRange(location: 0, length: out.length)) { surface, range, _ in
            if let surface = surface as? UIColor { out.addAttribute(.backgroundColor, value: surface, range: range) }
        }
        return out
    }
}
