import UIKit

/// A CSS line box in UIKit text. CSS centres the font's content area
/// (ascent + descent) in each line, half the leading above and half below.
/// UIKit seats the glyphs on the line's foot instead; measured on iOS 18.5
/// and 27.2, Figtree at 13 and 14pt:
///
/// - a label (TextKit 1) raises them by `.baselineOffset` and keeps the
///   line's height, so the offset is the half leading;
/// - a TextKit 2 view takes `.baselineOffset` out of the line's height and
///   does not raise them, so the line is the content plus the leading above
///   it and `lineSpacing` the leading below it, which TextKit leaves off
///   the last line: the view adds `halfLeading` under it as inset.
public enum LineBox {
    /// The leading on each side of the content, for lines `height` tall.
    public static func halfLeading(_ font: UIFont, height: Double) -> Double {
        max(0, (height - font.lineHeight) / 2)
    }

    /// A label's line: its paragraph and the baseline offset to set with it.
    public static func label(_ font: UIFont, height: Double) -> (paragraph: NSMutableParagraphStyle, baselineOffset: Double) {
        let paragraph = NSMutableParagraphStyle()
        paragraph.minimumLineHeight = height
        paragraph.maximumLineHeight = height
        return (paragraph, halfLeading(font, height: height))
    }

    /// A TextKit 2 text view's line, with no baseline offset set.
    public static func textView(_ font: UIFont, height: Double) -> NSMutableParagraphStyle {
        let half = halfLeading(font, height: height)
        let paragraph = NSMutableParagraphStyle()
        paragraph.minimumLineHeight = font.lineHeight + half
        paragraph.maximumLineHeight = font.lineHeight + half
        paragraph.lineSpacing = half
        return paragraph
    }
}
