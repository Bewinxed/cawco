import UIKit

/// A repo's markdown read as a document, as the web's `<Markdown>` renders it
/// in `prose prose-sm` (the project page's docs card, MemoryCard): the same
/// blocks the transcript draws (running text, fences in their highlighted
/// well, tables, quotes, rules) on prose-sm's own rhythm. Its height follows
/// its width under Auto Layout; its text is selectable. Read-only.
public final class MarkdownDocumentView: UIView {
    private let body = MessageBody()
    private let style: ProseStyle

    /// `message`: set as the transcript sets a message's words (MessageBody.svelte),
    /// as a pin's thread shows the agent's replies (PinCard.svelte); else a document.
    public init(message: Bool = false) {
        style = message ? .body : .document
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        pin(body)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// The markdown; the blocks already drawn are kept where they still fit.
    public func setSource(_ markdown: String) {
        body.configure(markdown, style: style)
    }
}
