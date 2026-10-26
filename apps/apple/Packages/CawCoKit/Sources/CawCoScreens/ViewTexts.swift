#if DEBUG
import UIKit

/// The words a view draws, for a DEBUG read of a screen's state
/// (the `probeState`-style lines a simulator pass logs).
@MainActor
enum ViewTexts {
    /// Every visible text under `view`, depth first: labels, field text and
    /// placeholders, and button titles in brackets.
    static func texts(in view: UIView) -> [String] {
        var out: [String] = []
        func walk(_ node: UIView) {
            guard !node.isHidden, node.alpha > 0.01 else { return }
            if let button = node as? UIButton {
                let title = button.configuration?.attributedTitle.map { String($0.characters) } ?? button.currentTitle ?? ""
                if !title.isEmpty { out.append("[\(title)\(button.isEnabled ? "" : " (disabled)")]") }
                return
            }
            if let label = node as? UILabel, let text = label.text ?? label.attributedText?.string, !text.isEmpty {
                out.append(text)
                return
            }
            if let field = node as? UITextField {
                out.append("field '\(field.isSecureTextEntry && !(field.text ?? "").isEmpty ? "••••" : field.text ?? "")'\(field.isEnabled ? "" : " (disabled)")")
                return
            }
            node.subviews.forEach(walk)
        }
        walk(view)
        return out
    }
}
#endif
