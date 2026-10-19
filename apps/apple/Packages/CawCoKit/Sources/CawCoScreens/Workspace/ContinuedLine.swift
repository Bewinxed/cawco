import CawCoDesign
import UIKit

/// Where a continued session's work went, standing in its composer's place
/// (SessionPane.svelte `.continued`): "Continued in" in muted meta, then the
/// new session's title in link ink, which gives way first (DESIGN.md, the
/// Truncate Inside Rule). A tap opens that session; the press dims it, as a
/// text link answers (the Press Rule).
@MainActor
final class ContinuedLine: UIButton {
    private var open: () -> Void = {}

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        var look = UIButton.Configuration.plain()
        look.contentInsets = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space3,
                                                     bottom: Space.space2, trailing: Space.space3)
        look.titleLineBreakMode = .byTruncatingTail
        look.titleAlignment = .center
        configuration = look
        accessibilityTraits = .link
        configurationUpdateHandler = { button in button.alpha = button.isHighlighted ? 0.72 : 1 }
        addAction(UIAction { [weak self] _ in self?.open() }, for: .touchUpInside)
        heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        isHidden = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("ContinuedLine is built in code") }

    func show(_ onward: ContinuedIn) {
        open = onward.open
        let font = TypeScale.typeMeta.font
        var words = AttributedString("\(Self.lead) ")
        words.font = font
        words.foregroundColor = Palette.inkMuted
        var title = AttributedString(onward.title)
        title.font = font
        title.foregroundColor = Palette.linkInk
        words.append(title)
        configuration?.attributedTitle = words
        accessibilityLabel = "\(Self.lead) \(onward.title)"
        accessibilityHint = "Opens that session."
    }

    /// The words before the title (core `CONTINUED_IN`).
    static let lead = "Continued in"
}
