import UIKit

/// A program, read (CodeView.svelte, CodeMirror 6): mono at the label size on
/// the body's line height, wrapped, on the recess inside a hairline at
/// `--radius-sm`, with a gutter of line numbers ending in a hairline. It is
/// monochrome on purpose: structure rides weight and ink, not hue. Keywords
/// are strong ink at the strong weight; strings, numbers, literals, operators
/// and punctuation are muted; comments are muted and slanted. A line the hub
/// flagged is underlined with a wave in the fail ink.
public final class CodeView: UIView {
    private let text = UITextView(usingTextLayoutManager: true)
    private let gutter = GutterView()
    private let underline = WaveView()
    private var source = ""
    private var flagged: Set<Int> = []

    /// CodeMirror's own line padding (`.cm-line { padding: 0 2px 0 6px }`).
    private static let lineLeading = 6.0
    private static let lineTrailing = 2.0
    /// `.cm-lineNumbers .cm-gutterElement`: at least 32pt, 5pt and 3pt in.
    private static let numberMin = 32.0
    private static let role = TypeScale.typeCode.with(points: TypeScale.typeLabel.points, leading: TypeScale.leadingBody)

    public init(label: String) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRecess
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        clipsToBounds = true
        text.translatesAutoresizingMaskIntoConstraints = false
        text.backgroundColor = .clear
        text.isEditable = false
        text.isSelectable = true
        text.alwaysBounceVertical = true
        text.textContainer.lineFragmentPadding = 0
        text.accessibilityLabel = label
        addSubview(text)
        gutter.isUserInteractionEnabled = false
        text.addSubview(underline)
        text.addSubview(gutter)
        NSLayoutConstraint.activate([
            text.topAnchor.constraint(equalTo: topAnchor),
            text.bottomAnchor.constraint(equalTo: bottomAnchor),
            text.leadingAnchor.constraint(equalTo: leadingAnchor),
            text.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: CodeView, _: UITraitCollection) in view.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CodeView is built in code")
    }

    /// The program, and the lines (from 1) the hub flagged.
    public func set(_ program: String, flagged lines: Set<Int> = []) {
        guard program != source || lines != flagged else { return }
        source = program
        flagged = lines
        render()
    }

    private func paint() {
        layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
        render()
    }

    private var gutterWidth: Double {
        let count = max(1, source.reduce(into: 1) { if $1 == "\n" { $0 += 1 } })
        let digits = ("\(count)" as NSString).size(withAttributes: [.font: Self.role.font]).width
        // The numbers' cell, the gutter's 7pt end padding and its 1pt rule.
        return max(Self.numberMin, digits + 8) + Space.space2 + 1
    }

    private func render() {
        let role = Self.role
        var base = role.attributes(color: Palette.inkStrong)
        if let paragraph = (base[.paragraphStyle] as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle {
            paragraph.lineBreakMode = .byWordWrapping
            base[.paragraphStyle] = paragraph
        }
        let styled = NSMutableAttributedString(string: source, attributes: base)
        for token in CodeTokens.scan(source) {
            switch token.kind {
            case .keyword:
                styled.addAttribute(.font, value: role.font(role.points, weight: TypeScale.weightStrong), range: token.range)
            case .muted:
                styled.addAttribute(.foregroundColor, value: Palette.inkMuted, range: token.range)
            case .comment:
                // The mono face has no italic: a browser slants it, 14 degrees.
                styled.addAttributes([.foregroundColor: Palette.inkMuted, .obliqueness: 0.25], range: token.range)
            }
        }
        text.attributedText = styled
        let width = gutterWidth
        text.textContainerInset = UIEdgeInsets(top: Space.space3, left: width + Self.lineLeading, bottom: Space.space3, right: Self.lineTrailing)
        gutter.width = width
        setNeedsLayout()
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        text.layoutIfNeeded()
        guard let layout = text.textLayoutManager else { return }
        layout.ensureLayout(for: layout.documentRange)
        // One number beside each line's first row, at that row's own height;
        // a wave under every row of a flagged line, as wide as its text.
        var rows: [(y: Double, height: Double)] = []
        var waves: [CGRect] = []
        let inset = text.textContainerInset
        layout.enumerateTextLayoutFragments(from: layout.documentRange.location, options: [.ensuresLayout]) { [flagged] fragment in
            let origin = fragment.layoutFragmentFrame.origin
            guard let first = fragment.textLineFragments.first else { return true }
            rows.append((origin.y + first.typographicBounds.minY + inset.top, first.typographicBounds.height))
            if flagged.contains(rows.count) {
                for line in fragment.textLineFragments where line.typographicBounds.width > 0 {
                    waves.append(line.typographicBounds.offsetBy(dx: origin.x + inset.left, dy: origin.y + inset.top))
                }
            }
            return true
        }
        let height = max(text.contentSize.height, text.bounds.height)
        gutter.frame = CGRect(x: 0, y: 0, width: gutter.width, height: height)
        gutter.rows = rows
        gutter.font = Self.role.font
        gutter.setNeedsDisplay()
        underline.frame = CGRect(x: 0, y: 0, width: text.bounds.width, height: height)
        underline.rows = waves
        underline.setNeedsDisplay()
    }

    /// `text-decoration: underline wavy` in the fail ink, 3pt under the text.
    private final class WaveView: UIView {
        var rows: [CGRect] = []

        init() {
            super.init(frame: .zero)
            isOpaque = false
            isUserInteractionEnabled = false
            contentMode = .redraw
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            fatalError("WaveView is built in code")
        }

        override func draw(_ rect: CGRect) {
            let path = UIBezierPath()
            for row in rows where row.intersects(rect.insetBy(dx: 0, dy: -6)) {
                // A browser's wave: a full turn every 4pt, 1pt either side of its line.
                let y = row.maxY - 2
                var x = row.minX
                path.move(to: CGPoint(x: x, y: y))
                var up = true
                while x < row.maxX {
                    let next = min(x + 2, row.maxX)
                    path.addQuadCurve(to: CGPoint(x: next, y: y), controlPoint: CGPoint(x: (x + next) / 2, y: y + (up ? -2 : 2)))
                    x = next
                    up.toggle()
                }
            }
            Palette.statusFailInk.resolvedColor(with: traitCollection).setStroke()
            path.lineWidth = 1
            path.stroke()
        }
    }

    /// The numbers and the gutter's ground: on the recess, muted, right-aligned 3pt from its padding.
    private final class GutterView: UIView {
        var width = 0.0
        var rows: [(y: Double, height: Double)] = []
        var font = UIFont.monospacedSystemFont(ofSize: 13, weight: .regular)

        init() {
            super.init(frame: .zero)
            isOpaque = false
            contentMode = .redraw
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            fatalError("GutterView is built in code")
        }

        override func draw(_ rect: CGRect) {
            let traits = traitCollection
            Palette.surfaceRecess.resolvedColor(with: traits).setFill()
            UIRectFill(bounds)
            Palette.borderHairline.resolvedColor(with: traits).setFill()
            UIRectFill(CGRect(x: bounds.maxX - 1, y: 0, width: 1, height: bounds.height))
            let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: Palette.inkMuted.resolvedColor(with: traits)]
            // The number's cell ends 7pt and the rule before the gutter's edge, its text 3pt before that.
            let right = bounds.maxX - 1 - Space.space2 - 3
            for (index, row) in rows.enumerated() where row.y + row.height >= rect.minY && row.y <= rect.maxY {
                let number = "\(index + 1)" as NSString
                let size = number.size(withAttributes: attributes)
                number.draw(at: CGPoint(x: right - size.width, y: row.y + (row.height - size.height) / 2), withAttributes: attributes)
            }
        }
    }
}

/// The spans of a TypeScript program that are not plain strong ink. A scanner,
/// not a grammar: comments, strings, numbers, the literals, keywords, and
/// operators and punctuation, which is all the web's monochrome style tells apart.
enum CodeTokens {
    enum Kind { case keyword, muted, comment }

    struct Token {
        let kind: Kind
        let range: NSRange
    }

    private static let keywords: Set<String> = [
        "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "debugger", "declare", "default",
        "delete", "do", "else", "enum", "export", "extends", "finally", "for", "from", "function", "get", "if", "implements", "import",
        "in", "instanceof", "interface", "is", "keyof", "let", "namespace", "new", "of", "private", "protected", "public", "readonly",
        "return", "satisfies", "set", "static", "super", "switch", "this", "throw", "try", "type", "typeof", "var", "void", "while",
        "with", "yield",
    ]
    private static let literals: Set<String> = ["true", "false", "null", "undefined", "NaN", "Infinity"]

    static func scan(_ source: String) -> [Token] {
        let units = Array(source.utf16)
        var tokens: [Token] = []
        var index = 0
        func unit(_ at: Int) -> UInt16? { at < units.count ? units[at] : nil }
        func isWord(_ value: UInt16) -> Bool {
            (value >= 48 && value <= 57) || (value >= 65 && value <= 90) || (value >= 97 && value <= 122) || value == 95 || value == 36 || value > 127
        }
        func isDigit(_ value: UInt16) -> Bool { value >= 48 && value <= 57 }
        while index < units.count {
            let here = units[index]
            let start = index
            if here == 47, unit(index + 1) == 47 {
                // A line comment, to the line's end.
                while index < units.count, units[index] != 10 { index += 1 }
                tokens.append(Token(kind: .comment, range: NSRange(location: start, length: index - start)))
            } else if here == 47, unit(index + 1) == 42 {
                index += 2
                while index < units.count, !(units[index] == 42 && unit(index + 1) == 47) { index += 1 }
                index = min(units.count, index + 2)
                tokens.append(Token(kind: .comment, range: NSRange(location: start, length: index - start)))
            } else if here == 34 || here == 39 || here == 96 {
                // A string or a template, to its closing quote; a backslash keeps the next unit.
                index += 1
                while index < units.count, units[index] != here {
                    if units[index] == 92 { index += 1 }
                    if here != 96, index < units.count, units[index] == 10 { break }
                    index += 1
                }
                index = min(units.count, index + 1)
                tokens.append(Token(kind: .muted, range: NSRange(location: start, length: index - start)))
            } else if isDigit(here) {
                while index < units.count, isWord(units[index]) || units[index] == 46 { index += 1 }
                tokens.append(Token(kind: .muted, range: NSRange(location: start, length: index - start)))
            } else if isWord(here) {
                while index < units.count, isWord(units[index]) { index += 1 }
                let word = String(utf16CodeUnits: Array(units[start ..< index]), count: index - start)
                if keywords.contains(word) {
                    tokens.append(Token(kind: .keyword, range: NSRange(location: start, length: index - start)))
                } else if literals.contains(word) {
                    tokens.append(Token(kind: .muted, range: NSRange(location: start, length: index - start)))
                }
            } else if here == 32 || here == 9 || here == 10 || here == 13 {
                index += 1
            } else {
                // An operator, a bracket or punctuation.
                index += 1
                tokens.append(Token(kind: .muted, range: NSRange(location: start, length: 1)))
            }
        }
        return tokens
    }
}
