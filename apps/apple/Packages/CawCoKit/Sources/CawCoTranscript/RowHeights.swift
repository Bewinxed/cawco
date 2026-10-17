import CawCoDesign
import UIKit

/// A row's exact height, worked out where the transcript is prepared
/// (TranscriptPrep), off the main thread and before any view of it exists:
/// the list lays the row out there (RowLayout) and its cell measures
/// nothing. Made of the same parts its view stacks, each measured as that
/// view measures it.
///
/// An assistant turn's block (PieceView): its speaker line when it opens
/// the turn and the gap under it, then each block and the gap between two.
/// A text is laid out by TextKit 2 as ProseView lays it out: the same
/// container (LineWrap.Container, its lines' widths and code starts), the
/// same fragments, the float kept clear at its first line's end, its last
/// line's leading under it. A listing (CodeWell) is its lines at their own
/// width and the well's padding; a quote its text past the rule; a rule a
/// point; a table its geometry (TableGeometry) at the screen's `scale`, each
/// cell's words laid out at its column's width, as TableBlock draws it.
nonisolated enum PieceHeight {
    static func of(_ piece: Item.Piece, width: Double, speaker: Double, scale: Double, measure: TextMeasure) -> Double {
        var height = piece.header == nil ? 0 : speaker + Space.space2
        let last = piece.blocks.count - 1
        for (i, block) in piece.blocks.enumerated() {
            if i > 0 { height += MarkdownRender.gap(after: piece.blocks[i - 1], before: block) }
            switch block.kind {
            case let .text(text):
                let float = i == 0 ? piece.float.map(FloatNote.size) ?? .zero : .zero
                height += measure.height(text, width: width, float: float)
            case let .code(_, source):
                let text = CodeWell.listing(source, ink: Palette.inkStrong)
                height += measure.height(text, width: CodeWell.width(of: text))
                height += piece.joinsAbove && i == 0 ? 0 : Size.txCodePadBlock
                height += piece.joinsBelow && i == last ? 0 : Size.txCodePadBlock
            case let .quote(text):
                height += measure.height(text, width: width - QuoteBlock.inset)
            case .rule:
                height += 1
            case let .table(head, rows):
                let lines = head.isEmpty ? rows : [head] + rows
                let columns = TableGeometry.columns(TableGeometry.extents(of: lines), fitting: width)
                let inner = TableGeometry.inner(columns)
                let words = lines.map { line in zip(line, inner).map { cell, room in measure.height(cell, width: room) } }
                height += TableGeometry(columns: columns, words: words, headed: !head.isEmpty, scale: scale).height
            }
        }
        return height
    }
}

/// Lays a text out as ProseView does and says its height (`intrinsicContentSize`):
/// one TextKit 2 stack, kept by whoever measures (TranscriptPrep) and used
/// only there.
nonisolated final class TextMeasure: NSObject, NSTextLayoutManagerDelegate {
    private let container = LineWrap.Container(size: .zero)
    private let layout = NSTextLayoutManager()
    private let content = NSTextContentStorage()

    override init() {
        super.init()
        container.lineFragmentPadding = 0
        layout.textContainer = container
        content.addTextLayoutManager(layout)
        content.primaryTextLayoutManager = layout
        layout.delegate = self
    }

    func textLayoutManager(_: NSTextLayoutManager, textLayoutFragmentFor _: any NSTextLocation,
                           in textElement: NSTextElement) -> NSTextLayoutFragment {
        ProseFragment(textElement: textElement, range: textElement.elementRange)
    }

    /// `text`'s height `width` wide, `float` kept clear at its first line's end.
    func height(_ text: NSAttributedString, width: Double, float: CGSize = .zero) -> Double {
        guard width > 0, text.length > 0 else { return 0 }
        content.textStorage?.setAttributedString(text)
        container.size = CGSize(width: width, height: 0)
        container.exclusionPaths = float == .zero ? [] : [UIBezierPath(rect: CGRect(x: width - float.width, y: 0, width: float.width, height: float.height))]
        container.widths = LineWrap.widths(for: text, width: width)
        container.codeStarts = LineWrap.codeStarts(in: text)
        layout.invalidateLayout(for: layout.documentRange)
        layout.ensureLayout(for: layout.documentRange)
        // The last line's leading under it (ProseView `closeLastLine`).
        let style = text.attribute(.paragraphStyle, at: text.length - 1, effectiveRange: nil) as? NSParagraphStyle
        return layout.usageBoundsForTextContainer.height + (style?.lineSpacing ?? 0)
    }
}
