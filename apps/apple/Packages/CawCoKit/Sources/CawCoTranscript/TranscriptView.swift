import CawCoCore
import CawCoDesign
import OSLog
public import UIKit

/// A virtualized native transcript. Hub blocks are stable list identities;
/// settled Markdown pieces are cached and only the open tail is reconfigured.
public final class TranscriptView: UIView, UICollectionViewDelegate {
    private struct Row {
        let id: String
        let source: String
        let speaker: String
        let streaming: Bool
        let well: Bool
        let code: Bool
    }
    private let collection: UICollectionView
    private var dataSource: UICollectionViewDiffableDataSource<Int, String>!
    private var rows: [String: Row] = [:]
    private var cached: [String: NSAttributedString] = [:]
    private var fingerprints: [String: String] = [:]
    private var staticRows: [Row] = []
    private var segments: [String: (signature: String, rows: [Row])] = [:]
    private var blockRevision = -1
    private var tailRows: [Row] = []
    private var splitter = MarkdownSplitter()
    private var received = ""
    private var characters: [Character] = []
    private var cursor = 0
    private var shown = 0.0
    private var rate = 0.0
    private var lastTick = 0.0
    private var lastArrival = 0.0
    private var arrivals: [(end: Int, time: Double)] = []
    private var drainDeadline: Double?
    private var busy = false
    private var dirty = true
    private var following = true
    private var link: CADisplayLink?
    private var proxy: DisplayTarget?
    private let signposter = OSSignposter(subsystem: "dev.cawco.app", category: "Transcript")

    public override init(frame: CGRect) {
        let layout = UICollectionViewCompositionalLayout { _, _ in
            let size = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1), heightDimension: .estimated(44))
            let item = NSCollectionLayoutItem(layoutSize: size)
            let section = NSCollectionLayoutSection(group: .vertical(layoutSize: size, subitems: [item]))
            section.interGroupSpacing = Space.space3
            section.contentInsets = .init(top: Space.space5, leading: Space.space5, bottom: Space.space5, trailing: Space.space5)
            return section
        }
        collection = UICollectionView(frame: .zero, collectionViewLayout: layout)
        super.init(frame: frame)
        backgroundColor = Palette.surfacePage
        collection.backgroundColor = Palette.surfacePage
        collection.delegate = self
        collection.keyboardDismissMode = .interactive
        collection.translatesAutoresizingMaskIntoConstraints = false
        addSubview(collection)
        NSLayoutConstraint.activate([
            collection.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor),
            collection.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor),
            collection.topAnchor.constraint(equalTo: topAnchor),
            collection.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        let registration = UICollectionView.CellRegistration<TranscriptCell, String> { [weak self] cell, _, id in
            guard let self, let row = rows[id] else { return }
            let attributed = cached[id] ?? render(row)
            cached[id] = attributed
            cell.configure(attributed, speaker: row.speaker, well: row.well, streaming: row.streaming, code: row.code)
        }
        dataSource = UICollectionViewDiffableDataSource(collectionView: collection) { view, index, id in
            view.dequeueConfiguredReusableCell(using: registration, for: index, item: id)
        }
        registerForTraitChanges([UITraitUserInterfaceStyle.self, UITraitPreferredContentSizeCategory.self]) { (view: TranscriptView, _: UITraitCollection) in
            view.cached = [:]; view.fingerprints = [:]; view.dirty = true
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("TranscriptView is built in code") }

    override public func didMoveToWindow() {
        super.didMoveToWindow()
        link?.invalidate(); link = nil
        if window != nil {
            let target = DisplayTarget(self)
            proxy = target
            let link = CADisplayLink(target: target, selector: #selector(DisplayTarget.tick(_:)))
            link.add(to: .main, forMode: .common)
            self.link = link
            lastTick = 0
        }
    }

    public func configure(_ transcript: SessionTranscript) {
        if transcript.blockRevision != blockRevision {
            blockRevision = transcript.blockRevision
            let blocks = transcript.blocks + transcript.branches.flatMap { $0.value2.blocks } + transcript.queued
            staticRows = blocks.flatMap { block -> [Row] in
                let kind = block._type.value3?.rawValue ?? block._type.value1 ?? block._type.value2 ?? ""
                if kind == "send.ref" || kind == "system.init" { return [] }
                let signature = kind + block.content + (block.metadata?.toolResult ?? "") + (block.state?.rawValue ?? "")
                if let held = segments[block.id], held.signature == signature { return held.rows }
                let user = kind.hasPrefix("user")
                let tool = kind.hasPrefix("tool")
                let speaker = user ? (kind == "user.peer" ? block.metadata?.peerName ?? "Peer" : kind == "user.rule" ? "Rule" : "You") : tool ? block.metadata?.toolName ?? "Tool" : kind == "thinking" ? "Thinking" : kind == "assistant" ? "Assistant" : kind
                var text = block.content
                if tool, let result = block.metadata?.toolResult, !result.isEmpty { text += "\n\n" + result }
                if let state = block.state, state != .read { text += "\n\n" + state.rawValue.capitalized }
                var split = MarkdownSplitter()
                let pieces = split.split(text)
                let drawn = (pieces.settled + [pieces.tail]).enumerated().map { i, source in
                    Row(id: "\(block.id):\(i)", source: source, speaker: i == 0 ? speaker : "", streaming: false, well: user || tool, code: tool)
                }
                segments[block.id] = (signature, drawn)
                return drawn
            }
            let kept = Set(blocks.map(\.id))
            segments = segments.filter { kept.contains($0.key) }
            dirty = true
        }
        let tail = transcript.tail
        busy = tail?.busy == true
        let next = tail?.streaming ?? ""
        if next != received {
            let now = CACurrentMediaTime()
            if !next.hasPrefix(received) || next.isEmpty {
                splitter = MarkdownSplitter(); tailRows = []; cursor = 0; shown = 0; rate = 0
                arrivals = []
            }
            received = next
            characters = Array(next)
            arrivals.append((characters.count, now))
            lastArrival = now
            drainDeadline = nil
            dirty = true
        }
        var live: [Row] = []
        if let thinking = tail?.thinkingStream, !thinking.isEmpty {
            live.append(Row(id: "live-thinking", source: PartialSyntax.hide(thinking), speaker: "Thinking", streaming: true, well: false, code: false))
        }
        if let tool = tail?.currentTool {
            live.append(Row(id: "live-tool", source: tool.glance, speaker: tool.name, streaming: false, well: true, code: false))
        }
        if busy, next.isEmpty, live.isEmpty {
            live.append(Row(id: "live-status", source: "Working…", speaker: "", streaming: false, well: false, code: false))
        }
        if auxiliary.map(\.source) != live.map(\.source) || auxiliary.map(\.id) != live.map(\.id) { auxiliary = live; dirty = true }
    }

    private var auxiliary: [Row] = []

    fileprivate func frame(_ link: CADisplayLink) {
        let now = CACurrentMediaTime()
        let dt = lastTick == 0 ? link.targetTimestamp - link.timestamp : min(0.1, now - lastTick)
        lastTick = now
        if cursor < characters.count {
            let pending = Double(characters.count) - shown
            let oldest = arrivals.first { $0.end > cursor }?.time ?? now
            if UIAccessibility.isReduceMotionEnabled || now - oldest > 2 {
                shown = Double(characters.count)
            } else {
                rate += (pending / 0.18 - rate) * (1 - exp(-dt / 0.25))
                rate = min(900, max(12, rate))
                var step = rate * dt
                if !busy || now - lastArrival >= 0.2 {
                    let deadline = drainDeadline ?? now + 0.4
                    drainDeadline = deadline
                    step = max(step, pending * dt / max(dt, deadline - now))
                }
                shown = min(Double(characters.count), shown + step)
            }
            var end = Int(shown)
            while end > cursor, end < characters.count {
                let a = characters[end - 1], b = characters[end]
                if (a == "*" && b == "*") || (a == "`" && b == "`") || (a == "]" && b == "(") { end -= 1 } else { break }
            }
            if end > cursor {
                cursor = end
                arrivals.removeAll { $0.end <= cursor }
                let pieces = splitter.split(String(characters[..<end]))
                if tailRows.last?.id == "live-tail" { tailRows.removeLast() }
                for source in pieces.settled {
                    tailRows.append(Row(id: "live-piece-\(tailRows.count)", source: source, speaker: tailRows.isEmpty ? "Assistant" : "", streaming: false, well: false, code: false))
                }
                tailRows.append(Row(id: "live-tail", source: PartialSyntax.hide(pieces.tail), speaker: tailRows.isEmpty ? "Assistant" : "", streaming: true, well: false, code: false))
                dirty = true
            }
        }
        if dirty { dirty = false; commit() }
        // Self-sizing can refine an estimated height after a snapshot's completion.
        // Follow that refinement too, rather than landing halfway through history.
        if following { latest() }
        for case let cell as TranscriptCell in collection.visibleCells { cell.fade(now) }
    }

    private func render(_ row: Row) -> NSAttributedString {
        if row.code {
            return DiffView.text(row.source)
        }
        return MarkdownText.render(row.source, dark: traitCollection.userInterfaceStyle == .dark, highlight: !row.streaming)
    }

    private func commit() {
        let interval = signposter.beginInterval("transcriptFrame")
        defer { signposter.endInterval("transcriptFrame", interval) }
        let ordered = staticRows + auxiliary + tailRows
        let ids = ordered.map(\.id)
        let old = dataSource.snapshot()
        let previous = Set(old.itemIdentifiers)
        rows = Dictionary(uniqueKeysWithValues: ordered.map { ($0.id, $0) })
        var changed: [String] = []
        for row in ordered {
            let print = row.source + row.speaker
            if fingerprints[row.id] != print {
                fingerprints[row.id] = print
                cached[row.id] = nil
                if previous.contains(row.id) { changed.append(row.id) }
            }
        }
        cached = cached.filter { rows[$0.key] != nil }
        fingerprints = fingerprints.filter { rows[$0.key] != nil }
        if old.itemIdentifiers == ids, changed.isEmpty { return }
        var snapshot = NSDiffableDataSourceSnapshot<Int, String>()
        snapshot.appendSections([0]); snapshot.appendItems(ids); snapshot.reconfigureItems(changed)
        let follow = following
        dataSource.apply(snapshot, animatingDifferences: false) { [weak self] in
            guard let self else { return }
            collection.layoutIfNeeded()
            if follow { latest() }
        }
    }

    public func latest() {
        following = true
        let bottom = max(-collection.adjustedContentInset.top, collection.contentSize.height - collection.bounds.height + collection.adjustedContentInset.bottom)
        collection.setContentOffset(CGPoint(x: 0, y: bottom), animated: false)
    }

    public func scrollViewDidScroll(_ scrollView: UIScrollView) {
        if scrollView.isDragging || scrollView.isDecelerating {
            following = scrollView.contentSize.height - scrollView.contentOffset.y - scrollView.bounds.height <= Space.space8
        }
    }

    private final class DisplayTarget: NSObject {
        weak var owner: TranscriptView?
        init(_ owner: TranscriptView) { self.owner = owner }
        @objc func tick(_ link: CADisplayLink) { owner?.frame(link) }
    }
}

private final class TranscriptCell: UICollectionViewCell {
    private let speaker = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let text = UITextView(usingTextLayoutManager: true)
    private let diff = DiffView()
    private var fades: [(range: NSRange, at: Double, color: UIColor)] = []

    override init(frame: CGRect) {
        super.init(frame: frame)
        text.isEditable = false; text.isSelectable = true; text.isScrollEnabled = false
        text.backgroundColor = .clear; text.textContainerInset = .zero; text.textContainer.lineFragmentPadding = 0
        text.adjustsFontForContentSizeCategory = true
        let stack = UIStackView(arrangedSubviews: [speaker, text, diff])
        stack.axis = .vertical; stack.spacing = Space.space2; stack.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(stack)
        contentView.layer.cornerRadius = Radius.radiusMd
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: Space.space3),
            stack.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -Space.space3),
            stack.topAnchor.constraint(equalTo: contentView.topAnchor, constant: Space.space2),
            stack.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -Space.space2),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("TranscriptCell is built in code") }

    func configure(_ next: NSAttributedString, speaker: String, well: Bool, streaming: Bool, code: Bool) {
        self.speaker.text = speaker; self.speaker.isHidden = speaker.isEmpty
        contentView.backgroundColor = well ? Palette.surfaceRecess : .clear
        diff.isHidden = !code
        text.isHidden = code
        if code { diff.configure(next); return }
        let storage = text.textStorage
        let old = storage.string as NSString
        let new = next.string as NSString
        let prefix = storage.string.commonPrefix(with: next.string) as NSString
        var start = old.paragraphRange(for: NSRange(location: min(prefix.length, old.length), length: 0)).location
        start = min(start, new.length)
        if start > 0, !storage.attributedSubstring(from: NSRange(location: 0, length: start)).isEqual(to: next.attributedSubstring(from: NSRange(location: 0, length: start))) { start = 0 }
        storage.beginEditing()
        storage.replaceCharacters(in: NSRange(location: start, length: old.length - start), with: next.attributedSubstring(from: NSRange(location: start, length: new.length - start)))
        storage.endEditing()
        if streaming, !UIAccessibility.isReduceMotionEnabled, new.length > old.length {
            new.enumerateSubstrings(in: NSRange(location: old.length, length: new.length - old.length), options: [.byWords, .substringNotRequired]) { _, word, _, _ in
                let color = storage.attribute(.foregroundColor, at: word.location, effectiveRange: nil) as? UIColor ?? Palette.inkStrong
                self.fades.append((word, CACurrentMediaTime(), color))
            }
        }
    }

    func fade(_ now: Double) {
        guard let manager = text.textLayoutManager, let content = manager.textContentManager else { return }
        fades.removeAll { entry in
            guard NSMaxRange(entry.range) <= text.textStorage.length,
                  let start = content.location(content.documentRange.location, offsetBy: entry.range.location),
                  let end = content.location(start, offsetBy: entry.range.length),
                  let range = NSTextRange(location: start, end: end) else { return true }
            let progress = UIAccessibility.isReduceMotionEnabled ? 1 : min(1, (now - entry.at) / Motion.durMenu)
            if progress >= 1 { manager.removeRenderingAttribute(.foregroundColor, for: range); return true }
            manager.addRenderingAttribute(.foregroundColor, value: entry.color.withAlphaComponent(Motion.easeOut.value(at: progress)), for: range)
            return false
        }
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        fades = []
        text.text = ""
    }
}

/// Unified diff lines keep their exact text, using the web's add/delete tokens.
public final class DiffView: UIView {
    private let textView = UITextView(usingTextLayoutManager: true)

    public override init(frame: CGRect) {
        super.init(frame: frame)
        textView.isEditable = false
        textView.isSelectable = true
        textView.isScrollEnabled = false
        textView.backgroundColor = .clear
        textView.textContainerInset = .zero
        textView.textContainer.lineFragmentPadding = 0
        textView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(textView)
        NSLayoutConstraint.activate([
            textView.leadingAnchor.constraint(equalTo: leadingAnchor),
            textView.trailingAnchor.constraint(equalTo: trailingAnchor),
            textView.topAnchor.constraint(equalTo: topAnchor),
            textView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("DiffView is built in code") }

    func configure(_ value: NSAttributedString) { textView.attributedText = value }

    static func text(_ source: String) -> NSAttributedString {
        let value = NSMutableAttributedString(string: "")
        let font = UIFontMetrics(forTextStyle: .body).scaledFont(for: UIFont.monospacedSystemFont(ofSize: TypeScale.typeCode.points, weight: .regular))
        for line in source.components(separatedBy: "\n") {
            var attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: Palette.inkStrong]
            if line.hasPrefix("+") { attributes[.backgroundColor] = Palette.diffAddBg }
            if line.hasPrefix("-") { attributes[.backgroundColor] = Palette.diffDelBg }
            value.append(NSAttributedString(string: line + "\n", attributes: attributes))
        }
        return value
    }
}
