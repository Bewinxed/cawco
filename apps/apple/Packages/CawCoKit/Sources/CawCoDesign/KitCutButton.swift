import UIKit

/// A button title's tail cut, where the web element it ports ends in an
/// ellipsis (`text-overflow: ellipsis` on the button or on the span inside
/// it): the title is cut where WebKit cuts it (`TextWrap.tailCut`) for the
/// room the button gives it, in place of UIKit's own truncation. The button
/// must take its width from its layout, not from its title.
@MainActor
struct TitleCut {
    /// The whole title, as the caller set it.
    private var full: NSAttributedString?
    /// What the button was last given to draw, and the room it was cut for.
    private var shown: NSAttributedString?
    private var room = 0.0

    /// Cuts `button`'s title for its bounds; call before the button lays out.
    mutating func fit(_ button: UIButton) {
        guard var config = button.configuration, let title = config.attributedTitle,
              let current = try? NSAttributedString(title, including: \.uiKit) else { return }
        // A title that is not the one last drawn is a new one from the caller.
        if shown?.string != current.string {
            full = current
            shown = nil
        }
        guard let full, full.length > 0 else { return }
        var width = button.bounds.width - config.contentInsets.leading - config.contentInsets.trailing
        if let image = config.image { width -= image.size.width + config.imagePadding }
        guard width > 0, shown == nil || abs(width - room) > 0.01 else { return }
        room = width
        // A frame is snapped to whole pixels: a title a fraction of one wider still fits.
        let pixel = 1 / max(button.traitCollection.displayScale, 1)
        var next = full
        if TextWrap.measure(full) > width + pixel, let kept = TextWrap.tailCut(full, width: width) {
            let cut = NSMutableAttributedString(attributedString: full)
            cut.replaceCharacters(in: NSRange(location: kept, length: cut.length - kept), with: "\u{2026}")
            next = cut
            if button.accessibilityLabel == nil { button.accessibilityLabel = full.string }
        }
        shown = next
        guard next.string != current.string, let drawn = try? AttributedString(next, including: \.uiKit) else { return }
        config.attributedTitle = drawn
        config.titleLineBreakMode = .byClipping
        button.configuration = config
    }
}

/// A button whose title ends in an ellipsis on the web when it does not fit.
public final class KitCutButton: UIButton {
    private var cut = TitleCut()

    override public func layoutSubviews() {
        cut.fit(self)
        super.layoutSubviews()
    }
}
