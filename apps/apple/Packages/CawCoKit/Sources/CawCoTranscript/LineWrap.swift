import CawCoDesign
import CoreText
import UIKit

extension NSAttributedString.Key {
    /// A paragraph's `text-wrap-style` (LineWrap.Style's raw value).
    nonisolated static let wrapStyle = NSAttributedString.Key("dev.cawco.wrapStyle")
}

/// CSS `text-wrap-style` as WebKit lays it out (Safari, the dashboard's phone
/// browser): app.css gives `p` and `li` `pretty` and h1–h4 `balance`, and a
/// turn's words (MessageBody) `stable`, which wraps as TextKit does. For the
/// first two, the lines' widths are chosen over the whole paragraph, a port of
/// WebKit's InlineContentConstrainer (Source/WebCore/layout/
/// formattingContexts/inline/InlineContentConstrainer.cpp), and TextKit then
/// lays each line out within its width (`LineWrap.Container`).
nonisolated enum LineWrap {
    enum Style: Int {
        case greedy
        case pretty
        case balance
    }

    // InlineContentConstrainer's constants.
    private static let maximumLinesToBalanceWithLineRequirement = 12
    private static let stretchability: Double = 15
    private static let shrinkability: Double = 15
    private static let maxStretch: Double = 3
    private static let maxShrink: Double = 3
    /// `2 * lastLinePreferredInlineItemCount + 1`: the break opportunities
    /// before the end past which a line may leave the ideal width's bounds.
    private static let lastLineBreakingPointOffset = 5

    /// A run between two break opportunities (UAX #14, as CoreText breaks):
    /// its width with and without the white space it ends on.
    private struct Chunk {
        let start: Int
        var width: Double
        var trailing: Double
    }

    /// The widths the lines of every constrained paragraph in `text` take,
    /// keyed by where each line starts, for a container `width` wide.
    static func widths(for text: NSAttributedString, width: Double) -> [Int: Double] {
        var out: [Int: Double] = [:]
        let string = text.string as NSString
        var location = 0
        while location < string.length {
            let paragraph = string.paragraphRange(for: NSRange(location: location, length: 0))
            defer { location = NSMaxRange(paragraph) }
            let style = (text.attribute(.wrapStyle, at: paragraph.location, effectiveRange: nil) as? Int).flatMap(Style.init) ?? .greedy
            // A paragraph that wraps as written is TextKit's to lay out, but for
            // one holding inline code: there the two break at different places
            // (`chunks`), so its lines are chosen here too.
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
            guard end > start else { continue }
            // Forced breaks (a line separator) split the content into chunks laid out apart.
            var chunkStart = start
            while chunkStart < end {
                let separator = string.range(of: "\u{2028}", options: [], range: NSRange(location: chunkStart, length: end - chunkStart))
                let chunkEnd = separator.location == NSNotFound ? end : separator.location
                let range = NSRange(location: chunkStart, length: chunkEnd - chunkStart)
                if range.length > 0, let lines = constrain(text, range: range, maxWidth: width - indent, style: style) {
                    for (lineStart, lineWidth) in lines {
                        // The rect TextKit fits the line into includes the indent; a
                        // hair over the chosen width, never enough for another word.
                        out[lineStart == start ? paragraph.location : lineStart] = indent + lineWidth + 0.5
                    }
                }
                chunkStart = separator.location == NSNotFound ? end : NSMaxRange(separator)
            }
        }
        return out
    }

    /// The paragraph's chunks: CoreText's line-break opportunities, each run
    /// measured on its own as WebKit measures inline items.
    private static func chunks(_ text: NSAttributedString, range: NSRange) -> [Chunk] {
        let string = text.string as NSString
        let cf = text.string as CFString
        guard let tokenizer = CFStringTokenizerCreate(nil, cf, CFRange(location: range.location, length: range.length),
                                                      kCFStringTokenizerUnitLineBreak, nil) else { return [] }
        var out: [Chunk] = []
        while CFStringTokenizerAdvanceToNextToken(tokenizer).rawValue != 0 {
            let token = CFStringTokenizerGetCurrentTokenRange(tokenizer)
            let run = NSRange(location: token.location, length: token.length)
            var content = run.length
            while content > 0, let scalar = Unicode.Scalar(string.character(at: run.location + content - 1)),
                  CharacterSet.whitespaces.contains(scalar) { content -= 1 }
            let word = measure(text, NSRange(location: run.location, length: content))
            let space = measure(text, NSRange(location: run.location + content, length: run.length - content))
            out.append(Chunk(start: run.location, width: word + space, trailing: space))
        }
        // Inside inline code WebKit breaks at white space only (and anywhere
        // when one word alone is wider than the line), where UAX #14 also
        // allows a break after a bracket or before a quote: `${name}` stays
        // with the backtick after it. Mobile Safari sets "`Hello, ${name}`" in
        // a 143pt cell as "`Hello," and "${name}`".
        var merged: [Chunk] = []
        for chunk in out {
            if let last = merged.last, last.trailing == 0, chunk.start > range.location,
               text.attribute(.inlineCode, at: chunk.start, effectiveRange: nil) != nil,
               text.attribute(.inlineCode, at: chunk.start - 1, effectiveRange: nil) != nil {
                merged[merged.count - 1].width += chunk.width
                merged[merged.count - 1].trailing = chunk.trailing
            } else {
                merged.append(chunk)
            }
        }
        out = merged
        // A code box's opening padding stands as kern on the white space
        // before it; it is the box's, so it goes with the code's chunk.
        let codeStarts = codeStarts(in: text)
        if let first = out.first, first.start == 0, let pad = codeStarts[0] { out[0].width += pad }
        for index in out.indices.dropLast() {
            guard let pad = codeStarts[out[index + 1].start], pad > 0, out[index].trailing >= pad else { continue }
            out[index].width -= pad
            out[index].trailing -= pad
            out[index + 1].width += pad
        }
        return out
    }

    private static func measure(_ text: NSAttributedString, _ range: NSRange) -> Double {
        guard range.length > 0 else { return 0 }
        let line = CTLineCreateWithAttributedString(text.attributedSubstring(from: range))
        return CTLineGetTypographicBounds(line, nil, nil, nil)
    }

    /// LayoutUnit::fromFloatCeil(width + LayoutUnit::epsilon()): 1/64ths, up.
    private static func lineWidth(_ width: Double) -> Double {
        ((width + 1.0 / 64) * 64).rounded(.up) / 64
    }

    /// The width of chunks `from..<to` on one line, trailing white space trimmed.
    private static func span(_ chunks: [Chunk], _ sums: [Double], _ from: Int, _ to: Int) -> Double {
        guard to > from else { return 0 }
        return lineWidth(sums[to] - sums[from] - chunks[to - 1].trailing)
    }

    private static func raggedness(_ width: Double, ideal: Double) -> Double {
        let difference = width - ideal
        let intermediate = difference / (difference > 0 ? stretchability : shrinkability)
        return 100 * abs(pow(intermediate, 3))
    }

    private static func validPretty(_ width: Double, ideal: Double) -> Bool {
        let difference = width - ideal
        return difference > 0 ? difference <= stretchability * maxStretch : abs(difference) <= shrinkability * maxShrink
    }

    /// Each line's start and width, or nil where WebKit leaves the wrap as it is.
    private static func constrain(_ text: NSAttributedString, range: NSRange, maxWidth: Double, style: Style) -> [(Int, Double)]? {
        let chunks = chunks(text, range: range)
        guard chunks.count > 1, maxWidth > 0 else { return nil }
        var sums = [0.0]
        for chunk in chunks { sums.append(sums.last! + chunk.width) }
        // The `text-wrap: wrap` layout: its line count and widths.
        var greedy: [Double] = []
        var greedyEnds: [Int] = []
        var from = 0
        while from < chunks.count {
            var to = from + 1
            while to < chunks.count, span(chunks, sums, from, to + 1) <= maxWidth { to += 1 }
            greedy.append(span(chunks, sums, from, to))
            greedyEnds.append(to)
            from = to
        }
        guard greedy.count > 1 else { return nil }
        // breaks[k] is a break opportunity before chunk breaks[k]; breaks[0] the start.
        let breaks = Array(0 ... chunks.count)
        let lines: [Int]?
        switch style {
        case .pretty:
            let ideal = maxWidth - stretchability * maxStretch
            let widest = chunks.map { lineWidth($0.width - $0.trailing) }.max() ?? 0
            guard ideal >= widest else { return nil }
            lines = pretty(chunks, sums, breaks, ideal: ideal, maxWidth: maxWidth)
        case .balance:
            let ideal = greedy.reduce(0, +) / Double(greedy.count)
            lines = greedy.count <= maximumLinesToBalanceWithLineRequirement
                ? balance(chunks, sums, breaks, ideal: ideal, maxWidth: maxWidth, lines: greedy.count)
                : balance(chunks, sums, breaks, ideal: ideal, maxWidth: maxWidth, lines: nil)
        case .greedy:
            lines = greedyEnds
        }
        guard let ends = lines else { return nil }
        var out: [(Int, Double)] = []
        var start = 0
        for end in ends {
            let width = span(chunks, sums, start, end)
            // A word wider than the line breaks anywhere: that line is TextKit's.
            if width <= maxWidth { out.append((chunks[start].start, width)) }
            start = end
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

    /// prettifyRange: the lowest total raggedness, every line but the last
    /// few within the ideal's bounds. The chosen lines' ends, in chunks.
    private static func pretty(_ chunks: [Chunk], _ sums: [Double], _ breaks: [Int], ideal: Double, maxWidth: Double) -> [Int]? {
        let count = breaks.count
        var cost = [Double](repeating: .infinity, count: count)
        var previous = [Int](repeating: 0, count: count)
        cost[0] = 0
        func lineCost(_ width: Double, _ breakIndex: Int) -> Double {
            if breakIndex < count - lastLineBreakingPointOffset, !validPretty(width, ideal: ideal) { return .infinity }
            return raggedness(width, ideal: ideal)
        }
        /// layoutSingleLineForPretty: where no line within the bounds can start
        /// at `start`, a plain line as wide as the box, leaving the last line
        /// its preferred items (five inline items: a word and its space are two).
        func forcedLine(from start: Int) -> Int? {
            var end = start + 1
            while end + 1 < count, span(chunks, sums, breaks[start], breaks[end + 1]) <= maxWidth { end += 1 }
            guard end < count else { return nil }
            let items = 2 * (count - 1)
            let enoughForThis = items - 2 * start > lastLineBreakingPointOffset
            let enoughForNext = 2 * end + lastLineBreakingPointOffset < items
            if enoughForThis, end != count - 1, !enoughForNext {
                end = max(start + 1, min(end, (items - lastLineBreakingPointOffset) / 2))
            }
            return end
        }
        var lastValid: Int?
        for breakIndex in 1 ..< count {
            let width = span(chunks, sums, 0, breaks[breakIndex])
            if width > maxWidth { break }
            let line = lineCost(width, breakIndex)
            if line < cost[breakIndex] { cost[breakIndex] = line; previous[breakIndex] = 0; lastValid = breakIndex }
        }
        if lastValid == nil {
            guard let end = forcedLine(from: 0) else { return nil }
            cost[end] = 0
            previous[end] = 0
            lastValid = end
        }
        var firstStart = 1
        for breakIndex in 2 ..< max(2, count) {
            while firstStart < breakIndex, span(chunks, sums, breaks[firstStart], breaks[breakIndex]) > maxWidth { firstStart += 1 }
            if let valid = lastValid, firstStart > valid {
                guard let end = forcedLine(from: valid), end != valid else { return nil }
                cost[end] = cost[valid]
                previous[end] = valid
                lastValid = end
            }
            guard firstStart < breakIndex else { continue }
            for start in firstStart ..< breakIndex where cost[start].isFinite {
                let width = span(chunks, sums, breaks[start], breaks[breakIndex])
                let total = cost[start] + lineCost(width, breakIndex)
                if total < cost[breakIndex] { cost[breakIndex] = total; previous[breakIndex] = start; lastValid = breakIndex }
            }
        }
        guard cost[count - 1].isFinite else { return nil }
        return backtrack(previous, breaks, from: count - 1)
    }

    /// balanceRange: lines as near the greedy layout's average width as can
    /// be, on as many lines as it took (up to twelve), or as few as fit.
    private static func balance(_ chunks: [Chunk], _ sums: [Double], _ breaks: [Int], ideal: Double, maxWidth: Double, lines: Int?) -> [Int]? {
        let count = breaks.count
        guard let lines else {
            var cost = [Double](repeating: .infinity, count: count)
            var previous = [Int](repeating: 0, count: count)
            cost[0] = 0
            for breakIndex in 1 ..< count {
                for start in 0 ..< breakIndex where cost[start].isFinite {
                    let width = span(chunks, sums, breaks[start], breaks[breakIndex])
                    guard width <= maxWidth else { continue }
                    let total = cost[start] + raggedness(width, ideal: ideal)
                    if total < cost[breakIndex] { cost[breakIndex] = total; previous[breakIndex] = start }
                }
            }
            guard cost[count - 1].isFinite else { return nil }
            return backtrack(previous, breaks, from: count - 1)
        }
        // state[i][j]: the best j lines ending before breaks[i].
        var cost = [[Double]](repeating: [Double](repeating: .infinity, count: lines + 1), count: count)
        var previous = [[Int]](repeating: [Int](repeating: 0, count: lines + 1), count: count)
        cost[0][0] = 0
        for breakIndex in 1 ..< count {
            for start in 0 ..< breakIndex {
                let width = span(chunks, sums, breaks[start], breaks[breakIndex])
                guard width <= maxWidth else { continue }
                let line = raggedness(width, ideal: ideal)
                for index in 1 ... lines where cost[start][index - 1].isFinite {
                    let total = line + cost[start][index - 1]
                    // WebKit keeps the later start on a tie (`<` or essentially equal).
                    if total < cost[breakIndex][index] || abs(total - cost[breakIndex][index]) < 1e-4 {
                        cost[breakIndex][index] = total
                        previous[breakIndex][index] = start
                    }
                }
            }
        }
        guard cost[count - 1][lines].isFinite else { return nil }
        var ends: [Int] = []
        var breakIndex = count - 1
        for index in stride(from: lines, to: 0, by: -1) {
            ends.append(breaks[breakIndex])
            breakIndex = previous[breakIndex][index]
        }
        return ends.reversed()
    }

    private static func backtrack(_ previous: [Int], _ breaks: [Int], from last: Int) -> [Int] {
        var ends: [Int] = []
        var breakIndex = last
        repeat {
            ends.append(breaks[breakIndex])
            breakIndex = previous[breakIndex]
        } while breakIndex > 0
        return ends.reversed()
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
