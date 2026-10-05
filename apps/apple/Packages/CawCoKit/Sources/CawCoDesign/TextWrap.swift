// This file follows the behaviour of these files of WebKit (https://webkit.org),
// commit d96b145709, under Source/WebCore/:
//
//   layout/formattingContexts/inline/InlineContentConstrainer.cpp, .h
//       the paragraph-level programme for pretty and balance, its costs and constants
//       Copyright (C) 2023 Apple Inc. All rights reserved.
//   layout/formattingContexts/inline/InlineFormattingUtils.cpp
//       a break entry before every inline item; item widths
//       Copyright (C) 2018-2026 Apple Inc. All rights reserved.
//   layout/formattingContexts/inline/InlineItemsBuilder.cpp
//       text cut into word, space and line-break items
//       Copyright (C) 2021-2023 Apple Inc. All rights reserved.
//   layout/formattingContexts/inline/text/TextUtil.cpp
//       the longest prefix that fits before an ellipsis
//       Copyright (C) 2018-2024 Apple Inc. All rights reserved.
//       Copyright (C) 2014 Google Inc. All rights reserved.
//   layout/formattingContexts/inline/display/InlineDisplayLineBuilder.cpp
//       when a line takes an ellipsis and the room kept for it
//       Copyright (C) 2021 Apple Inc. All rights reserved.
//   rendering/BreakablePositions.cpp
//       which pairs of characters up to U+00FF a line may break between
//       Copyright (C) 2005-2024 Apple Inc. All rights reserved.
//       Copyright (C) 2011-2024 Google Inc. All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions
// are met:
// 1. Redistributions of source code must retain the above copyright
//    notice, this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright
//    notice, this list of conditions and the following disclaimer in the
//    documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY APPLE INC. AND ITS CONTRIBUTORS ``AS IS''
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
// THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
// PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL APPLE INC. OR ITS CONTRIBUTORS
// BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
// THE POSSIBILITY OF SUCH DAMAGE.
//
// The same notice ships in the app as Resources/Licenses/WebKit.txt.

import CoreText
import Foundation

/// How a paragraph's lines are chosen, as CSS `text-wrap-style` names them.
/// `greedy` fills each line in turn (UIKit's own wrapping, the web's `auto`
/// and `stable`); `pretty` and `balance` choose every break of the paragraph
/// together, by WebKit's rule, so a label breaks where Mobile Safari breaks
/// the same words in the same box.
///
/// The rule is WebKit's `InlineContentConstrainer.cpp`: a dynamic programme
/// over the paragraph's break entries that costs each line by how far it
/// stands from an ideal width. The tail cut beside it is
/// `InlineDisplayLineBuilder.cpp` and `TextUtil.cpp`'s word breaking.
public enum TextWrap: Sendable {
    case greedy, pretty, balance

    /// Where each line after the first starts, in UTF-16 offsets into `text`,
    /// when `text` is set in a box `width` wide; nil when the rule leaves the
    /// paragraph as greedy wrapping has it.
    public static func lineStarts(of text: NSAttributedString, width: Double, wrap: TextWrap) -> [Int]? {
        WrapParagraph(text).lineStarts(width: width, wrap: wrap)
    }

    /// How many UTF-16 units of `line` stay before a U+2026 when the line is
    /// cut at its tail in a box `width` wide; nil when no ellipsis is due.
    /// A line that `continues` is the last visible one of a clamped box: it
    /// takes the ellipsis even when it fits, and is cut only when the two
    /// together do not.
    public static func tailCut(_ line: NSAttributedString, width: Double, continues: Bool = false) -> Int? {
        let length = line.length
        guard length > 0 else { return nil }
        let content = Float(measure(line))
        let ellipsis = max(0, Float(measure(NSAttributedString(string: "\u{2026}", attributes: line.attributes(at: 0, effectiveRange: nil)))))
        let box = Float(width)
        if continues {
            if !(content + ellipsis > box) { return length }
        } else if !(content > box) {
            return nil
        }
        var cutoff = max(0, box - ellipsis)
        if cutoff != 0 { cutoff += epsilon }
        // The grapheme clusters' ends, each a place the line may be cut.
        let string = line.string
        var ends: [Int] = []
        var index = string.startIndex
        while index < string.endIndex {
            index = string.index(after: index)
            ends.append(index.utf16Offset(in: string))
        }
        // The longest prefix no wider than the cutoff; one as wide is kept.
        var low = 0
        var high = ends.count
        while low < high {
            let middle = (low + high + 1) / 2
            let prefix = Float(measure(line.attributedSubstring(from: NSRange(location: 0, length: ends[middle - 1]))))
            if prefix > cutoff {
                high = middle - 1
            } else {
                low = middle
            }
        }
        // The first character is never cut away.
        return ends[max(low, 1) - 1]
    }

    /// `LayoutUnit::epsilon()`: layout units have six fractional bits.
    static let epsilon: Float = 1 / 64

    /// A width taken up to the next 1/64, as `LayoutUnit::fromFloatCeil`.
    static func ceil64(_ value: Float) -> Float {
        (value * 64).rounded(.up) / 64
    }

    /// The typographic width CoreText gives `text` set on one line.
    static func measure(_ text: NSAttributedString) -> Double {
        CTLineGetTypographicBounds(CTLineCreateWithAttributedString(text), nil, nil, nil)
    }
}

/// A paragraph cut into WebKit's inline items (words and the spaces between
/// them), each measured once, with the places a line may start.
struct WrapParagraph {
    private struct Item {
        let start: Int
        let width: Float
        let space: Bool
    }

    /// The text between two forced breaks. `breaks` are the break entries,
    /// as item indices: the chunk's first item, then every item after it
    /// (WebKit offers a break before each inline item, so before a space
    /// and again before the word after it), and the chunk's end.
    private struct Chunk {
        var breaks: [Int]
        /// The UTF-16 offset one past the chunk's last item.
        var end: Int
    }

    /// A line as the greedy pass leaves it: break indices and its width.
    private struct Line {
        let start: Int
        let end: Int
        let width: Float
    }

    private let items: [Item]
    /// `sums[i]` is the width of every item before item `i`.
    private let sums: [Double]
    private let chunks: [Chunk]
    /// The widest single item of the paragraph.
    private let widest: Float
    /// A soft hyphen or a tab: WebKit leaves such a paragraph alone.
    private let unconstrainable: Bool

    init(_ text: NSAttributedString) {
        let string = text.string as NSString
        let length = string.length
        var items: [Item] = []
        var sums: [Double] = [0]
        var chunks: [Chunk] = []
        var widest: Float = 0
        var plain = true
        // The system's line-break iterator, asked only about a pair with a
        // character above U+00FF: below that the pair rule decides alone.
        var opportunities = Set<Int>()
        let tokenizer = CFStringTokenizerCreate(nil, string, CFRange(location: 0, length: length), kCFStringTokenizerUnitLineBreak, nil)
        while !CFStringTokenizerAdvanceToNextToken(tokenizer).isEmpty {
            let token = CFStringTokenizerGetCurrentTokenRange(tokenizer)
            opportunities.insert(token.location + token.length)
        }
        var chunk = Chunk(breaks: [], end: 0)
        var run: (start: Int, space: Bool)?
        func close(_ end: Int) {
            guard let open = run else { return }
            let width = max(0, Float(TextWrap.measure(text.attributedSubstring(from: NSRange(location: open.start, length: end - open.start)))))
            items.append(Item(start: open.start, width: width, space: open.space))
            sums.append(sums[sums.count - 1] + Double(width))
            widest = max(widest, width)
            run = nil
        }
        func finish(_ end: Int) {
            close(end)
            if !chunk.breaks.isEmpty {
                chunk.breaks.append(items.count)
                chunk.end = end
                chunks.append(chunk)
            }
            chunk = Chunk(breaks: [], end: 0)
        }
        for offset in 0 ..< length {
            let unit = string.character(at: offset)
            if unit == 0x0A || unit == 0x0D || unit == 0x2028 || unit == 0x2029 {
                finish(offset)
                continue
            }
            if unit == 0x00AD || unit == 0x09 { plain = false }
            let space = unit == 0x20
            // A new item: the chunk's first, a space after a word or a word
            // after a space, or a place inside a word where a line may break.
            // A line may break before a space and before the word after it:
            // read in Mobile Safari 27.2 on 5 October 2026, where a sentence
            // in a 1pt box breaks at every space and nowhere else.
            var parts = run == nil || run?.space != space
            if !parts, !space {
                let before = string.character(at: offset - 1)
                if before <= 0xFF, unit <= 0xFF {
                    parts = Self.breaks(after: before, before: unit, behind: offset > 1 ? string.character(at: offset - 2) : nil)
                } else {
                    parts = opportunities.contains(offset)
                }
            }
            if parts {
                close(offset)
                chunk.breaks.append(items.count)
                run = (offset, space)
            }
        }
        finish(length)
        self.items = items
        self.sums = sums
        self.chunks = chunks
        self.widest = widest
        unconstrainable = !plain
    }

    /// Whether a line may break between two characters of one word, both at
    /// or under U+00FF: the pairs WebKit's line-break data
    /// (`BreakablePositions.cpp`) allows under `line-break: auto`, restated
    /// as rules. WebKit never asks the system iterator about such a pair.
    /// `behind` is the character before `first`.
    private static func breaks(after first: unichar, before second: unichar, behind: unichar?) -> Bool {
        func digit(_ unit: unichar) -> Bool { unit >= 0x30 && unit <= 0x39 }
        func letter(_ unit: unichar) -> Bool { (unit >= 0x41 && unit <= 0x5A) || (unit >= 0x61 && unit <= 0x7A) }
        func among(_ unit: unichar, _ set: String) -> Bool { set.utf16.contains(unit) }
        // A hyphen before a digit: see `hyphenBeforeDigit`.
        if first == 0x2D, digit(second) { return hyphenBeforeDigit(behind) }
        guard first >= 0x21, first <= 0xFF, second >= 0x21, second <= 0xFF else { return false }
        // The Latin-1 characters a break may stand before, by family.
        let acute = second == 0xB4
        let symbols = (0xA1 ... 0xA5).contains(second) || second == 0xB0 || second == 0xB1 || acute || second == 0xBF
        let most = (0xA1 ... 0xAA).contains(second) || second == 0xAC || (0xAE ... 0xBA).contains(second) || second >= 0xBC
        if first >= 0x80 {
            switch first {
            case 0xA0, 0xA1, 0xAB, 0xB4, 0xBB, 0xBF:
                // No-break space, inverted marks, guillemets, the acute: never after them.
                return false
            case 0xA2 ... 0xA5, 0xB0, 0xB1:
                // Currency signs, degree, plus-minus.
                return among(second, "$%(+[\\{") || symbols
            case 0xAD:
                // The soft hyphen.
                return second >= 0x80
                    ? most || second == 0xA0
                    : letter(second) || digit(second) || among(second, "#$%&(*+<=>@[\\^_`{~")
            case 0x85:
                return true
            default:
                // Accented letters and the rest: only before an acute accent.
                return acute
            }
        }
        if second >= 0x80 {
            if among(first, "!}/?") { return most }
            if first == 0x7C { return most || second == 0xA0 }
            if first == 0x2D { return (0xA0 ... 0xA5).contains(second) || second == 0xB0 || second == 0xB1 || acute || second >= 0xBF }
            if among(first, "$%)+,.:;\\]") { return symbols }
            if among(first, "\"'([{") { return false }
            return acute
        }
        guard first <= 0x7E, second <= 0x7E else { return false }
        if among(first, "!\"#%&)*+,.:;=>\\]|}~") { return among(second, "(<[{") }
        if first == 0x2D { return !among(second, ",.") }
        if first == 0x3F { return letter(second) || digit(second) || among(second, "#$%&(*+-<=>@[\\^_`{|~") }
        // After $ ' ( / < @ [ ^ _ ` {, a letter or a digit: never.
        return false
    }

    /// A hyphen before a digit breaks only when a letter or a digit stands
    /// before the hyphen: it parts a word from its number, never a sign from
    /// its figure. This rule is taken from Mobile Safari's own layout, read
    /// on 5 October 2026 in Safari 27.2 (iOS simulator), each string an
    /// unbroken run in a 120pt box and again in a 1pt box, 12px Figtree,
    /// `text-wrap: wrap`: "a-1" repeated breaks after every hyphen, and so
    /// does "1-2" repeated; "(-1" repeated and "=-5" repeated never break.
    private static func hyphenBeforeDigit(_ behind: unichar?) -> Bool {
        guard let behind else { return false }
        return (behind >= 0x30 && behind <= 0x39) || (behind >= 0x41 && behind <= 0x5A) || (behind >= 0x61 && behind <= 0x7A)
    }

    // MARK: Measuring

    /// The width of the items between two break entries, less the spaces that
    /// lead and trail them: a line's own spaces at its ends never count.
    private func trimmed(_ chunk: Chunk, _ from: Int, _ to: Int) -> Float {
        var first = chunk.breaks[from]
        var last = chunk.breaks[to]
        while first < last, items[first].space { first += 1 }
        while last > first, items[last - 1].space { last -= 1 }
        return Float(sums[last] - sums[first])
    }

    /// A candidate line's width: `fromFloatCeil(width + epsilon)`.
    private func candidate(_ chunk: Chunk, _ from: Int, _ to: Int) -> Float {
        TextWrap.ceil64(trimmed(chunk, from, to) + TextWrap.epsilon)
    }

    /// The lines greedy wrapping makes of a chunk in a box `box` wide.
    private func greedy(_ chunk: Chunk, box: Float) -> [Line] {
        var lines: [Line] = []
        let last = chunk.breaks.count - 1
        var start = 0
        while start < last {
            var end = start + 1
            // A line takes what fits, and never only the spaces that lead it.
            while end < last, trimmed(chunk, start, end + 1) <= box || trimmed(chunk, start, end) == 0 { end += 1 }
            lines.append(Line(start: start, end: end, width: candidate(chunk, start, end)))
            start = end
        }
        return lines
    }

    /// Where the line that starts at a break entry puts its first character:
    /// past the spaces that lead it, which never show.
    private func offset(_ chunk: Chunk, _ entry: Int) -> Int {
        var item = chunk.breaks[entry]
        let end = chunk.breaks[chunk.breaks.count - 1]
        while item < end, items[item].space { item += 1 }
        return item < end ? items[item].start : chunk.end
    }

    // MARK: Lines

    /// Where each line after the first starts when the paragraph wraps
    /// greedily in a box `width` wide.
    func greedyStarts(width: Double) -> [Int] {
        var starts: [Int] = []
        for (index, chunk) in chunks.enumerated() {
            if index > 0 { starts.append(offset(chunk, 0)) }
            starts += greedy(chunk, box: Float(width)).dropFirst().map { offset(chunk, $0.start) }
        }
        return starts
    }

    /// Where each line after the first starts under `wrap`, or nil when the
    /// rule does not constrain the paragraph. With a `limit`, the paragraph
    /// is the first `limit` greedy lines, as under `-webkit-line-clamp`.
    func lineStarts(width: Double, wrap: TextWrap, limit: Int = 0) -> [Int]? {
        guard wrap != .greedy, !unconstrainable else { return nil }
        let box = Float(width)
        var ranges = chunks
        var greedyLines = ranges.map { greedy($0, box: box) }
        if limit > 0, greedyLines.reduce(0, { $0 + $1.count }) > limit {
            var left = limit
            for index in ranges.indices {
                if left == 0 {
                    ranges.removeSubrange(index...)
                    greedyLines.removeSubrange(index...)
                    break
                }
                if greedyLines[index].count > left {
                    greedyLines[index].removeSubrange(left...)
                    let end = greedyLines[index][left - 1].end
                    ranges[index].end = offset(ranges[index], end)
                    ranges[index].breaks.removeSubrange((end + 1)...)
                }
                left -= greedyLines[index].count
            }
        }
        let total = greedyLines.reduce(0) { $0 + $1.count }
        guard total > 1 else { return nil }
        var starts: [Int] = []
        var constrained = false
        for (index, chunk) in ranges.enumerated() {
            let lines = greedyLines[index]
            if index > 0 { starts.append(offset(chunk, 0)) }
            let chosen: [Int]?
            switch wrap {
            case .greedy:
                chosen = nil
            case .pretty:
                chosen = pretty(chunk, ideal: box - 45, box: box)
            case .balance:
                let ideal = lines.reduce(0) { $0 + $1.width } / Float(lines.count)
                chosen = total <= 12 ? balance(chunk, ideal: ideal, box: box, lines: lines.count) : balance(chunk, ideal: ideal, box: box)
            }
            if let chosen {
                constrained = true
                starts += chosen.map { offset(chunk, $0) }
            } else {
                starts += lines.dropFirst().map { offset(chunk, $0.start) }
            }
        }
        guard constrained else { return nil }
        // Two entries either side of a space start the same line.
        return starts.enumerated().filter { $0.offset == 0 || starts[$0.offset - 1] != $0.element }.map(\.element)
    }

    /// `computeRaggedness`: the cube of the distance from the ideal, in
    /// units of 15 (stretchability and shrinkability are both 15).
    private static func raggedness(_ width: Float, _ ideal: Float) -> Float {
        let difference = width - ideal
        return 100 * abs(powf(difference / 15, 3))
    }

    /// `prettifyRange`, without its hyphenation fallback: where WebKit would
    /// force a line through its line builder, this returns nil and the chunk
    /// wraps greedily.
    private func pretty(_ chunk: Chunk, ideal: Float, box: Float) -> [Int]? {
        guard ideal >= widest else { return nil }
        let count = chunk.breaks.count
        guard count > 2 else { return nil }
        // A line ending before the last five entries must stand within
        // 3 x 15 of the ideal; the last lines only pay their raggedness.
        func cost(_ width: Float, _ entry: Int) -> Float {
            if entry < count - 5, abs(width - ideal) > 45 { return .infinity }
            return Self.raggedness(width, ideal)
        }
        var accumulated = [Float](repeating: .infinity, count: count)
        var previous = [Int](repeating: 0, count: count)
        accumulated[0] = 0
        var lastValid: Int?
        for entry in 1 ..< count {
            let width = candidate(chunk, 0, entry)
            if width > box { break }
            let total = cost(width, entry)
            if total < accumulated[entry] {
                accumulated[entry] = total
                lastValid = entry
            }
        }
        guard var lastValid else { return nil }
        var firstStart = 1
        for entry in 2 ..< count {
            while candidate(chunk, firstStart, entry) > box {
                firstStart += 1
                if firstStart >= entry { break }
            }
            if firstStart > lastValid { return nil }
            guard firstStart < entry else { continue }
            for start in firstStart ..< entry where accumulated[start] != .infinity {
                let total = accumulated[start] + cost(candidate(chunk, start, entry), entry)
                if total < accumulated[entry] {
                    accumulated[entry] = total
                    previous[entry] = start
                    lastValid = entry
                }
            }
        }
        guard accumulated[count - 1] != .infinity else { return nil }
        return walk(previous, from: count - 1)
    }

    /// `balanceRangeWithLineRequirement`: exactly `lines` lines, the least
    /// raggedness against the mean greedy width; on a tie the later start.
    private func balance(_ chunk: Chunk, ideal: Float, box: Float, lines: Int) -> [Int]? {
        let count = chunk.breaks.count
        var accumulated = [[Float]](repeating: [Float](repeating: .infinity, count: lines + 1), count: count)
        var previous = [[Int]](repeating: [Int](repeating: 0, count: lines + 1), count: count)
        accumulated[0][0] = 0
        for entry in 1 ..< count {
            let width = candidate(chunk, 0, entry)
            if width > box { break }
            accumulated[entry][1] = Self.raggedness(width, ideal)
        }
        var firstStart = 1
        for entry in 1 ..< count {
            while candidate(chunk, firstStart, entry) > box {
                firstStart += 1
                if firstStart > entry { break }
            }
            guard firstStart < entry else { continue }
            for start in firstStart ..< entry {
                let line = Self.raggedness(candidate(chunk, start, entry), ideal)
                for index in 1 ... lines {
                    let total = line + accumulated[start][index - 1]
                    let held = accumulated[entry][index]
                    if total < held || Self.essentiallyEqual(total, held) {
                        accumulated[entry][index] = total
                        previous[entry][index] = start
                    }
                }
            }
        }
        guard accumulated[count - 1][lines] != .infinity else { return nil }
        var starts: [Int] = []
        var entry = count - 1
        var index = lines
        while index > 1 {
            entry = previous[entry][index]
            index -= 1
            starts.append(entry)
        }
        return starts.reversed()
    }

    /// `balanceRangeWithNoLineRequirement`, for paragraphs of more than
    /// twelve greedy lines: any number of lines, the earlier start on a tie.
    private func balance(_ chunk: Chunk, ideal: Float, box: Float) -> [Int]? {
        let count = chunk.breaks.count
        guard count > 2 else { return nil }
        var accumulated = [Float](repeating: .infinity, count: count)
        var previous = [Int](repeating: 0, count: count)
        accumulated[0] = 0
        for entry in 1 ..< count {
            let width = candidate(chunk, 0, entry)
            if width > box { break }
            accumulated[entry] = Self.raggedness(width, ideal)
        }
        var firstStart = 1
        for entry in 1 ..< count {
            while candidate(chunk, firstStart, entry) > box {
                firstStart += 1
                if firstStart > entry { break }
            }
            guard firstStart < entry else { continue }
            for start in firstStart ..< entry {
                let total = accumulated[start] + Self.raggedness(candidate(chunk, start, entry), ideal)
                if total < accumulated[entry] {
                    accumulated[entry] = total
                    previous[entry] = start
                }
            }
        }
        guard accumulated[count - 1] != .infinity else { return nil }
        return walk(previous, from: count - 1)
    }

    /// The entries the chosen lines start at, first line left out.
    private func walk(_ previous: [Int], from last: Int) -> [Int] {
        var starts: [Int] = []
        var entry = previous[last]
        while entry != 0 {
            starts.append(entry)
            entry = previous[entry]
        }
        return starts.reversed()
    }

    /// `WTF::areEssentiallyEqual` for floats.
    private static func essentiallyEqual(_ a: Float, _ b: Float) -> Bool {
        if a == b { return true }
        return abs(a - b) <= Float.ulpOfOne * min(abs(a), abs(b))
    }
}
