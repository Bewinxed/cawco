import UIKit

/// A short run of text that morphs to its next value (the web's TextMorph):
/// a character the two share slides to its new place, one that is new fades
/// in where it lands and one that is gone fades where it stood, over
/// `durMorph` on the out curve. Counts, a time on a step, a tool's name. With
/// Reduce Motion the characters only fade. One line, never truncated.
public final class MorphLabel: UIView {
    public var role: TypeRole { didSet { rebuild() } }
    public var ink: UIColor { didSet { for label in shown.values { label.textColor = ink } } }
    /// Tabular figures, so a count's digits keep their columns.
    public var tabular = false { didSet { rebuild() } }

    public var text: String {
        get { content }
        set {
            guard newValue != content else { return }
            content = newValue
            lay(animated: window != nil)
        }
    }

    private var content = ""
    /// Each character on screen, keyed by itself and which of its kind it is.
    private var shown: [String: UILabel] = [:]
    private var size = CGSize.zero

    public init(_ role: TypeRole, ink: UIColor = Palette.inkStrong) {
        self.role = role
        self.ink = ink
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = false
        setContentHuggingPriority(.required, for: .horizontal)
        setContentCompressionResistancePriority(.required, for: .horizontal)
        registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) { (label: MorphLabel, _: UITraitCollection) in label.rebuild() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("MorphLabel is built in code")
    }

    override public var intrinsicContentSize: CGSize { size }

    private var font: UIFont {
        guard tabular else { return role.font }
        let features: [[UIFontDescriptor.FeatureKey: Int]] = [[.type: kNumberSpacingType, .selector: kMonospacedNumbersSelector]]
        return UIFont(descriptor: role.font.fontDescriptor.addingAttributes([.featureSettings: features]), size: 0)
    }

    private func rebuild() {
        for label in shown.values { label.removeFromSuperview() }
        shown = [:]
        lay(animated: false)
    }

    private func lay(animated: Bool) {
        let font = font
        let attributes: [NSAttributedString.Key: Any] = [.font: font]
        let height = (font.pointSize * role.leading).rounded(.up)
        var seen: [Character: Int] = [:]
        var next: [String: UILabel] = [:]
        var prefix = ""
        var places: [(UILabel, CGRect, Bool)] = []
        for character in content {
            let nth = seen[character, default: 0]
            seen[character] = nth + 1
            let key = "\(character)#\(nth)"
            let x = (prefix as NSString).size(withAttributes: attributes).width
            let width = (String(character) as NSString).size(withAttributes: attributes).width
            prefix.append(character)
            let frame = CGRect(x: x, y: 0, width: ceil(width), height: height)
            if let kept = shown.removeValue(forKey: key) {
                next[key] = kept
                places.append((kept, frame, false))
            } else {
                let label = UILabel(frame: frame)
                label.font = font
                label.textColor = ink
                label.text = String(character)
                addSubview(label)
                next[key] = label
                places.append((label, frame, true))
            }
        }
        let leaving = Array(shown.values)
        shown = next
        size = CGSize(width: ceil((content as NSString).size(withAttributes: attributes).width), height: height)
        invalidateIntrinsicContentSize()
        accessibilityLabel = content
        guard animated else {
            for label in leaving { label.removeFromSuperview() }
            for (label, frame, _) in places { label.frame = frame; label.alpha = 1 }
            return
        }
        let still = UIAccessibility.isReduceMotionEnabled
        for (label, frame, arriving) in places where arriving || still {
            if arriving { label.alpha = 0 }
            label.frame = frame
        }
        let morph = Motion.easeOut.animator(Motion.durMorph) {
            for (label, frame, _) in places {
                label.frame = frame
                label.alpha = 1
            }
            for label in leaving { label.alpha = 0 }
            self.superview?.layoutIfNeeded()
        }
        morph.addCompletion { _ in for label in leaving { label.removeFromSuperview() } }
        morph.startAnimation()
    }
}
