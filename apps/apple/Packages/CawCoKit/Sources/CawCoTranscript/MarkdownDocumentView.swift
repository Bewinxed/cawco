import UIKit

/// A repo's markdown read as a document, as the web's `<Markdown>` renders it
/// in `prose prose-sm` (the project page's docs card, MemoryCard): the same
/// blocks the transcript draws (running text, fences in their highlighted
/// well, tables, quotes, rules) on prose-sm's own rhythm. Its height follows
/// its width under Auto Layout; its text is selectable. Read-only.
public final class MarkdownDocumentView: UIView {
    private let body = MessageBody()

    public init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        pin(body)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// The document's markdown; the blocks already drawn are kept where they still fit.
    public func setSource(_ markdown: String) {
        body.configure(markdown, style: .document)
    }
}
