import CawCoAPI
public import CawCoCore
import CawCoDesign
import Observation
public import UIKit

/// The tail a peek shows (PeekPane.svelte): the last ten things said, flat,
/// with the live text still arriving. A user turn is the one voice tinted;
/// a tool call is its name and its most telling argument; the agent's words
/// read as text, their markdown without its syntax. It follows its end while
/// the reader is at it, and leaves a reader who scrolled where they are
/// (follow-tail.ts).
///
/// It reads the session's transcript from the store; whoever shows it keeps
/// that transcript open (`SessionsStore.setPeeked`).
public final class PeekTailView: UIScrollView, UIScrollViewDelegate {
    /// How much conversation a peek is: enough to see what it is up to.
    private static let tail = 10
    /// What a tail says. The rest is chrome the transcript renders and this does not.
    private static let spoken: Set<String> = ["user", "user.peer", "assistant", "tool.use", "tool.handoff", "result.error"]

    private enum Line: Equatable {
        case reading
        case fault(String)
        case silent
        case tool(name: String, glance: String)
        case asked(String)
        case failed(String)
        case said(String)
    }

    private struct Entry: Equatable {
        let key: String
        let line: Line
    }

    private let hub: HubConnection
    private let instanceId: String
    private let column = UIStackView()
    private let stream = UILabel()
    private var entries: [Entry] = []
    private var settled: (revision: Int, entries: [Entry])?
    private var atEnd = true
    private var pacer: StreamPacer!

    public init(hub: HubConnection, instanceId: String) {
        self.hub = hub
        self.instanceId = instanceId
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        delegate = self
        alwaysBounceVertical = true
        column.axis = .vertical
        column.spacing = 12
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: contentLayoutGuide.topAnchor, constant: 12),
            column.bottomAnchor.constraint(equalTo: contentLayoutGuide.bottomAnchor, constant: -12),
            column.leadingAnchor.constraint(equalTo: frameLayoutGuide.leadingAnchor, constant: 16),
            column.trailingAnchor.constraint(equalTo: frameLayoutGuide.trailingAnchor, constant: -16),
        ])
        stream.numberOfLines = 0
        stream.isHidden = true
        pacer = StreamPacer { [weak self] text in self?.draw(stream: text) }
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: PeekTailView, _: UITraitCollection) in
            view.draw(stream: view.pacer.shown)
        }
    }

    @available(*, unavailable)
    public required init?(coder _: NSCoder) {
        fatalError("PeekTailView is built in code")
    }

    override public func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { take() } else { pacer.stop() }
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        toEnd()
    }

    // MARK: Following the end

    private var end: Double { max(-adjustedContentInset.top, contentSize.height - bounds.height + adjustedContentInset.bottom) }

    private func toEnd() {
        guard atEnd, !isTracking, !isDecelerating, abs(contentOffset.y - end) > 0.5 else { return }
        contentOffset.y = end
    }

    public func scrollViewWillBeginDragging(_: UIScrollView) {
        atEnd = false
    }

    public func scrollViewDidEndDragging(_: UIScrollView, willDecelerate: Bool) {
        if !willDecelerate { rest() }
    }

    public func scrollViewDidEndDecelerating(_: UIScrollView) {
        rest()
    }

    /// At rest, a reader whose scroll reached the end is following it again.
    private func rest() {
        atEnd = contentOffset.y >= end - 1
        toEnd()
    }

    // MARK: The session

    private func take() {
        guard window != nil else { return }
        let read = withObservationTracking {
            read()
        } onChange: { [weak self] in
            Task { @MainActor in self?.take() }
        }
        if read.entries != entries {
            entries = read.entries
            render()
        }
        pacer.target(read.streaming)
        setNeedsLayout()
    }

    private func read() -> (entries: [Entry], streaming: String) {
        guard let transcript = hub.sessions.transcripts[instanceId] else { return ([Entry(key: "state", line: .reading)], "") }
        if settled?.revision != transcript.blockRevision {
            settled = (transcript.blockRevision, Self.read(transcript.blocks))
        }
        let said = settled?.entries ?? []
        let streaming = transcript.tail?.streaming ?? ""
        if said.isEmpty {
            if transcript.loading { return ([Entry(key: "state", line: .reading)], "") }
            if let fault = transcript.fault { return ([Entry(key: "state", line: .fault(fault.message))], "") }
            if streaming.isEmpty { return ([Entry(key: "state", line: .silent)], "") }
        }
        return (said, streaming)
    }

    /// The last ten spoken blocks, oldest first.
    private static func read(_ blocks: [Components.Schemas.TranscriptBlock]) -> [Entry] {
        var out: [Entry] = []
        var index = blocks.count - 1
        while index >= 0, out.count < tail {
            defer { index -= 1 }
            guard let block = Block(blocks[index]), spoken.contains(block.type),
                  !block.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            let line: Line = switch block.type {
            case "tool.use", "tool.handoff": .tool(name: block.toolName ?? block.content, glance: Glance.of(block.toolInput))
            case "user", "user.peer": .asked(block.content)
            case "result.error": .failed(PlainMarkdown.flat(block.content))
            default: .said(PlainMarkdown.flat(block.content))
            }
            out.insert(Entry(key: block.id, line: line), at: 0)
        }
        return out
    }

    // MARK: Drawing

    private func render() {
        column.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for entry in entries {
            column.addArrangedSubview(view(entry.line))
        }
        column.addArrangedSubview(stream)
    }

    private func view(_ line: Line) -> UIView {
        switch line {
        case .reading:
            return words("Reading…", TypeScale.typeMeta, Palette.foreground, lines: 1)
        case let .fault(message):
            return words("Couldn't read this session: \(message)", TypeScale.typeMeta, Palette.error, lines: 0)
        case .silent:
            return words("Nothing said yet.", TypeScale.typeMeta, Palette.foreground, lines: 1)
        case let .tool(name, glance):
            let verb = KitLabel(TypeScale.typeMeta, ink: Palette.mutedForeground)
            verb.text = name
            verb.setContentHuggingPriority(.required, for: .horizontal)
            verb.setContentCompressionResistancePriority(.required, for: .horizontal)
            let row = UIStackView(arrangedSubviews: [verb])
            row.spacing = 6
            row.alignment = .firstBaseline
            if !glance.isEmpty {
                let dot = KitLabel(TypeScale.typeMeta, ink: Palette.mutedForeground)
                dot.text = "·"
                dot.setContentHuggingPriority(.required, for: .horizontal)
                dot.setContentCompressionResistancePriority(.required, for: .horizontal)
                let argument = KitLabel(TypeScale.typeMeta.with(family: FontFamily.fontMono), ink: Palette.mutedForeground)
                argument.text = glance
                argument.lineBreakMode = .byTruncatingTail
                argument.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
                row.addArrangedSubview(dot)
                row.addArrangedSubview(argument)
            }
            row.addArrangedSubview(UIView())
            row.isAccessibilityElement = true
            row.accessibilityLabel = glance.isEmpty ? name : "\(name), \(glance)"
            return row
        case let .asked(text):
            // The one voice worth tinting: what the session was asked.
            let bubble = UIView()
            bubble.backgroundColor = Palette.actionSolid.withAlphaComponent(0.1)
            bubble.layer.cornerRadius = Radius.radiusLg
            bubble.layer.cornerCurve = .continuous
            let label = words(text, TypeScale.typeBody, Palette.foreground, lines: 4)
            label.translatesAutoresizingMaskIntoConstraints = false
            bubble.addSubview(label)
            NSLayoutConstraint.activate([
                label.topAnchor.constraint(equalTo: bubble.topAnchor, constant: 8),
                label.bottomAnchor.constraint(equalTo: bubble.bottomAnchor, constant: -8),
                label.leadingAnchor.constraint(equalTo: bubble.leadingAnchor, constant: 12),
                label.trailingAnchor.constraint(equalTo: bubble.trailingAnchor, constant: -12),
            ])
            return bubble
        case let .failed(text):
            // A failed turn's last words are the agent's too: flat.
            return words(text, TypeScale.typeBody, Palette.error, lines: 3)
        case let .said(text):
            return words(text, TypeScale.typeBody, Palette.foreground, lines: 6)
        }
    }

    private func words(_ text: String, _ role: TypeRole, _ ink: UIColor, lines: Int) -> KitLabel {
        let label = KitLabel(role, ink: ink, lines: lines)
        label.text = text
        label.lineBreakMode = lines == 1 ? .byTruncatingTail : .byTruncatingTail
        return label
    }

    /// The paced stream, flat, held to its last whole word, its caret after it.
    private func draw(stream text: String) {
        guard !text.isEmpty else {
            stream.isHidden = true
            stream.attributedText = nil
            return
        }
        let flat = PlainMarkdown.streaming(text)
        let out = NSMutableAttributedString(string: flat.isEmpty ? "" : flat + " ", attributes: TypeScale.typeBody.attributes(color: Palette.foreground))
        let caret = NSTextAttachment()
        let size = CGSize(width: 3, height: 16)
        let ink = Palette.actionSolid.withAlphaComponent(0.6).resolvedColor(with: traitCollection)
        caret.image = UIGraphicsImageRenderer(size: size).image { _ in
            ink.setFill()
            UIBezierPath(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: 1.5).fill()
        }
        // `align-text-bottom`: its foot on the text's descender line.
        caret.bounds = CGRect(x: 0, y: TypeScale.typeBody.font.descender, width: size.width, height: size.height)
        out.append(NSAttributedString(attachment: caret))
        stream.attributedText = out
        stream.isHidden = false
        stream.accessibilityLabel = flat
        setNeedsLayout()
    }
}

/// Paces a streaming string so a burst arrives as a steady reveal instead of
/// a jump (smooth-text.svelte.ts): a backlog is spread over 24 frames,
/// whatever its size. An idle stream costs nothing: no frame runs once the
/// shown text has caught up.
@MainActor
final class StreamPacer: NSObject {
    private static let catchUpFrames = 24
    private(set) var shown = ""
    private var goal = ""
    private var step = 1
    private var link: CADisplayLink?
    private let draw: (String) -> Void

    init(draw: @escaping (String) -> Void) {
        self.draw = draw
    }

    func target(_ text: String) {
        guard text != goal else { return }
        goal = text
        // A source that no longer continues what is on screen was reset or replaced: it is simply there.
        if UIAccessibility.isReduceMotionEnabled || !text.hasPrefix(shown) {
            stop()
            shown = text
            draw(shown)
            return
        }
        let backlog = text.count - shown.count
        guard backlog > 0 else { return }
        step = max(1, Int((Double(backlog) / Double(Self.catchUpFrames)).rounded(.up)))
        if link == nil {
            let made = CADisplayLink(target: self, selector: #selector(tick))
            made.add(to: .main, forMode: .common)
            link = made
        }
    }

    func stop() {
        link?.invalidate()
        link = nil
    }

    @objc private func tick() {
        shown = String(goal.prefix(shown.count + step))
        draw(shown)
        if shown.count >= goal.count { stop() }
    }
}
