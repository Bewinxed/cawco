import CawCoDesign
import UIKit

extension NSAttributedString.Key {
    /// A paragraph's `text-wrap-style` (LineWrap.Style's raw value).
    nonisolated static let wrapStyle = NSAttributedString.Key("dev.cawco.wrapStyle")
}

/// CSS `text-wrap-style` as WebKit lays it out (Safari, the dashboard's phone
/// browser): app.css gives `p` and `li` `pretty` and h1–h4 `balance`, and a
/// turn's words (MessageBody) `stable`, which wraps as TextKit does. For the
/// first two, the lines' widths are chosen over the whole paragraph by the
/// kit's constrainer (`TextWrap`, the one port of WebKit's rule), and TextKit
/// then lays each line out within its width (`LineWrap.Container`).
nonisolated enum LineWrap {
    enum Style: Int {
        case greedy
        case pretty
        case balance

        var rule: TextWrap {
            switch self {
            case .greedy: .greedy
            case .pretty: .pretty
            case .balance: .balance
            }
        }
    }

    /// The widths the lines of every constrained paragraph in `text` take,
    /// keyed by where each line starts, for a container `width` wide.
    static func widths(for text: NSAttributedString, width: Double) -> [Int: Double] {
        var out: [Int: Double] = [:]
        let string = text.string as NSString
        let codeStarts = codeStarts(in: text)
        var location = 0
        while location < string.length {
            let paragraph = string.paragraphRange(for: NSRange(location: location, length: 0))
            defer { location = NSMaxRange(paragraph) }
            let style = (text.attribute(.wrapStyle, at: paragraph.location, effectiveRange: nil) as? Int).flatMap(Style.init) ?? .greedy
            // A paragraph that wraps as written is TextKit's to lay out, but for
            // one holding inline code: there the two break at different places
            // (WebKit never breaks after a bracket or before a quote inside a
            // word), so its lines are chosen here too.
            if style == .greedy, !holdsCode(text, paragraph) { continue }
            let style0 = text.attribute(.paragraphStyle, at: paragraph.location, effectiveRange: nil) as? NSParagraphStyle
            let indent = style0?.headIndent ?? 0
            // The marker hangs outside the item's box (`\t•\t`): its line starts after it.
            var start = paragraph.location
            if string.character(at: start) == 0x09 {
                let second = string.range(of: "\t", options: [], range: NSRange(location: start + 1, length: NSMaxRange(paragraph) - start - 1))
                if second.location != NSNotFound { start = NSMaxRange(second) }
            }
            var end = NSMaxRange(paragraph)
            while end > start, let scalar = Unicode.Scalar(string.character(at: end - 1)), CharacterSet.newlines.contains(scalar) { end -= 1 }
            let maxWidth = width - indent
            guard end > start, maxWidth > 0 else { continue }
            // A code box's opening padding stands as kern on the white space
            // before it; it is the box's, so it is counted with the code. Code
            // that opens the whole text takes it from the line's start.
            var leading: [Int: Double] = [:]
            for (offset, pad) in codeStarts where offset >= start && offset < end && (offset > start || start == 0) {
                leading[offset - start] = pad
            }
            // Forced breaks (a line separator) part the content into chunks the rule lays out apart.
            let content = text.attributedSubstring(from: NSRange(location: start, length: end - start))
            guard let lines = TextWrap.lines(of: content, width: maxWidth, wrap: style.rule, leading: leading) else { continue }
            for (index, line) in lines.enumerated() {
                // A word wider than the line breaks anywhere: that line is TextKit's.
                guard line.width <= maxWidth else { continue }
                // The rect TextKit fits the line into includes the indent; a
                // hair over the chosen width, never enough for another word.
                out[index == 0 ? paragraph.location : start + line.start] = indent + line.width + 0.5
            }
        }
        return out
    }

    private static func holdsCode(_ text: NSAttributedString, _ range: NSRange) -> Bool {
        var found = false
        text.enumerateAttribute(.inlineCode, in: range) { value, _, stop in
            if value != nil { found = true; stop.pointee = true }
        }
        return found
    }

    /// Where inline code runs start, each with its padding: the kern that
    /// stands for it sits on the character before (MarkdownRender.inline).
    static func codeStarts(in text: NSAttributedString) -> [Int: Double] {
        var out: [Int: Double] = [:]
        text.enumerateAttribute(.inlineCode, in: NSRange(location: 0, length: text.length)) { value, range, _ in
            guard value != nil else { return }
            // Code that opens the text has no character before it to carry its
            // 4pt of room (MarkdownRender.inline): the line's start gives it.
            out[range.location] = range.location > 0
                ? text.attribute(.kern, at: range.location - 1, effectiveRange: nil) as? Double ?? 0
                : Space.space1
        }
        return out
    }

    /// A text container that hands each constrained line the width chosen
    /// for it, and a line that opens on inline code the code box's padding
    /// at its start, as CSS lays out a padded inline box that starts a line.
    final class Container: NSTextContainer {
        var widths: [Int: Double] = [:]
        var codeStarts: [Int: Double] = [:]

        /// As wide as its view and as tall as its text: the height is never
        /// the view's. A view takes its text's exact height, a fraction of a
        /// point, and its frame is then snapped to whole pixels, sometimes
        /// down; a container that short lays out every line but the last, and
        /// the text's final line was not painted (a reader's six-line message
        /// showed five in a well 132.33 tall, six in one 132.67 tall).
        override var size: CGSize {
            get { super.size }
            set { super.size = CGSize(width: newValue.width, height: 0) }
        }

        override var isSimpleRectangularTextContainer: Bool { widths.isEmpty && codeStarts.isEmpty && exclusionPaths.isEmpty }

        override func lineFragmentRect(forProposedRect proposedRect: CGRect, at characterIndex: Int,
                                       writingDirection: NSWritingDirection, remaining remainingRect: UnsafeMutablePointer<CGRect>?) -> CGRect {
            var rect = super.lineFragmentRect(forProposedRect: proposedRect, at: characterIndex, writingDirection: writingDirection, remaining: remainingRect)
            if let width = widths[characterIndex] { rect.size.width = min(rect.width, width) }
            if let pad = codeStarts[characterIndex], pad > 0 {
                rect.origin.x += pad
                rect.size.width -= pad
            }
            return rect
        }
    }
}
