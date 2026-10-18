import CawCoDesign
import UIKit

/// A markdown file edited as it reads (MarkdownEditor.svelte, Crepe): the
/// text is the file's own markdown, styled as it is typed. A heading stands
/// in the title's type, strong and emphasis in their weights, code (a span
/// or a fence) in the code face, a quote in muted ink; the marks that make
/// them (`#`, `**`, a fence) recede to the subtle ink, so the words lead and
/// the file stays exactly what is saved. It grows with its text; the page
/// around it scrolls.
final class MarkdownEditingView: UITextView, UITextViewDelegate {
    /// The text changed under a person's hand.
    var onChange: (String) -> Void = { _ in }

    init(label: String) {
        super.init(frame: .zero, textContainer: nil)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = .clear
        isScrollEnabled = false
        textContainerInset = UIEdgeInsets(top: 4, left: 8 - 5, bottom: 4, right: 8 - 5)
        autocorrectionType = .no
        autocapitalizationType = .sentences
        smartQuotesType = .no
        smartDashesType = .no
        accessibilityLabel = label
        typingAttributes = Self.body
        delegate = self
        heightAnchor.constraint(greaterThanOrEqualToConstant: 320 - 8).isActive = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("MarkdownEditingView is built in code")
    }

    /// The file's words, set from outside (a save, a restore): styled whole.
    func show(_ markdown: String) {
        guard markdown != text else { return }
        text = markdown
        restyle()
    }

    func textViewDidChange(_: UITextView) {
        restyle()
        onChange(text)
    }

    // MARK: Styling

    private static let body = TypeScale.typeProse.attributes(color: Palette.inkStrong)
    private static let mark = Palette.inkSubtle
    private static let code = TypeScale.typeCode.with(points: TypeScale.typeProse.points)

    /// Every line styled again for what it is; the selection stays where it was.
    private func restyle() {
        let storage = textStorage
        let whole = NSRange(location: 0, length: storage.length)
        let source = storage.string as NSString
        storage.beginEditing()
        storage.setAttributes(Self.body, range: whole)
        var fenced = false
        source.enumerateSubstrings(in: whole, options: [.byLines, .substringNotRequired]) { _, line, _, _ in
            let words = source.substring(with: line)
            let trimmed = words.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("```") || trimmed.hasPrefix("~~~") {
                storage.addAttributes(Self.code.attributes(color: Self.mark), range: line)
                fenced.toggle()
                return
            }
            if fenced {
                storage.addAttributes(Self.code.attributes(color: Palette.inkRow), range: line)
                return
            }
            self.styleLine(words, at: line, in: storage)
        }
        storage.endEditing()
        typingAttributes = Self.body
    }

    private func styleLine(_ words: String, at line: NSRange, in storage: NSTextStorage) {
        let ns = words as NSString
        // A heading: its words in the title's type, its hashes subtle.
        if let hashes = words.range(of: "^#{1,6} ", options: .regularExpression) {
            let level = words.distance(from: hashes.lowerBound, to: hashes.upperBound) - 1
            let role = level == 1 ? TypeScale.typeTitle : TypeScale.typeProse.withWeight(.semibold)
            storage.addAttributes(role.attributes(color: Palette.inkStrong), range: line)
            storage.addAttribute(.foregroundColor, value: Self.mark, range: NSRange(location: line.location, length: level + 1))
            return
        }
        // A quote: muted, its mark subtle.
        if let quote = words.range(of: "^\\s*> ?", options: .regularExpression) {
            storage.addAttribute(.foregroundColor, value: Palette.inkMuted, range: line)
            storage.addAttribute(.foregroundColor, value: Self.mark, range: NSRange(location: line.location, length: words.distance(from: quote.lowerBound, to: quote.upperBound)))
        }
        // A list item's marker.
        if let marker = words.range(of: "^\\s*([-*+]|\\d+[.)]) ", options: .regularExpression) {
            storage.addAttribute(.foregroundColor, value: Self.mark, range: NSRange(location: line.location, length: words.distance(from: marker.lowerBound, to: marker.upperBound)))
        }
        let span = { (pattern: String, apply: (NSRange, Int) -> Void) in
            let expression = try? NSRegularExpression(pattern: pattern)
            expression?.enumerateMatches(in: words, range: NSRange(location: 0, length: ns.length)) { match, _, _ in
                guard let match else { return }
                apply(NSRange(location: line.location + match.range.location, length: match.range.length), match.numberOfRanges > 1 ? match.range(at: 1).length : 0)
            }
        }
        // Strong, then emphasis, then code, which wins over both.
        span("\\*\\*([^*]+)\\*\\*") { range, _ in
            storage.addAttribute(.font, value: TypeScale.typeProse.withWeight(.semibold).font, range: range)
            self.recede(range, edge: 2, in: storage)
        }
        span("(?<![*\\w])[*_]([^*_]+)[*_](?![*\\w])") { range, _ in
            let font = TypeScale.typeProse.font
            storage.addAttribute(.font, value: UIFont(descriptor: font.fontDescriptor.withSymbolicTraits(.traitItalic) ?? font.fontDescriptor, size: font.pointSize), range: range)
            self.recede(range, edge: 1, in: storage)
        }
        span("`([^`]+)`") { range, _ in
            storage.addAttributes(Self.code.attributes(color: Palette.inkRow), range: range)
            self.recede(range, edge: 1, in: storage)
        }
        // A link's address recedes behind its words.
        span("\\[[^\\]]+\\](\\([^)]*\\))") { range, address in
            storage.addAttribute(.foregroundColor, value: Palette.linkInk, range: range)
            storage.addAttribute(.foregroundColor, value: Self.mark, range: NSRange(location: range.location + range.length - address, length: address))
        }
    }

    /// The marks at a span's two ends in the subtle ink.
    private func recede(_ range: NSRange, edge: Int, in storage: NSTextStorage) {
        guard range.length >= edge * 2 else { return }
        storage.addAttribute(.foregroundColor, value: Self.mark, range: NSRange(location: range.location, length: edge))
        storage.addAttribute(.foregroundColor, value: Self.mark, range: NSRange(location: range.location + range.length - edge, length: edge))
    }
}
