import ObjectiveC
import UIKit

/// The kit tooltip on one control (ui/tooltip/tip.svelte, app.css `.kit-tip`):
/// a plain label and, where there is one, the keys that do the same thing,
/// in meta type on `--ink-solid` at `--radius-sm`, with the arrow pointing at
/// the control. A pointer resting on the control for 400ms opens it; within
/// 300ms of another tip closing it opens at once. It fades in over `durFade`
/// with a 2pt slide from the control's side and leaves at once, when the
/// pointer does or the control is pressed. A pointer only: touch has no hover.
@MainActor
public final class KitTip: NSObject {
    public enum Side { case top, bottom }

    public var label: String
    public var keys: String?
    private let side: Side
    private weak var anchor: UIView?
    private var bubble: UIView?
    private var dwell: Task<Void, Never>?

    /// tooltip-provider.svelte: `delayDuration` 400, `skipDelayDuration` 300.
    private static let openAfter = 0.4
    private static let skipWithin = 0.3
    private static var lastClosed = Date.distantPast
    private nonisolated(unsafe) static var key: UInt8 = 0

    /// Puts a tip on `view`, replacing the one it had.
    @discardableResult
    public static func attach(to view: UIView, label: String, keys: String? = nil, side: Side = .bottom) -> KitTip {
        if let kept = objc_getAssociatedObject(view, &key) as? KitTip {
            kept.label = label
            kept.keys = keys
            return kept
        }
        let tip = KitTip(anchor: view, label: label, keys: keys, side: side)
        objc_setAssociatedObject(view, &key, tip, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        return tip
    }

    private init(anchor: UIView, label: String, keys: String?, side: Side) {
        self.anchor = anchor
        self.label = label
        self.keys = keys
        self.side = side
        super.init()
        let hover = UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:)))
        hover.cancelsTouchesInView = false
        anchor.addGestureRecognizer(hover)
        (anchor as? UIControl)?.addTarget(self, action: #selector(pressed), for: [.touchDown, .primaryActionTriggered, .menuActionTriggered])
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        switch hover.state {
        case .began:
            dwell?.cancel()
            let wait = Date().timeIntervalSince(Self.lastClosed) < Self.skipWithin ? 0 : Self.openAfter
            dwell = Task { @MainActor [weak self] in
                if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
                guard !Task.isCancelled else { return }
                self?.show()
            }
        case .ended, .cancelled, .failed:
            hide()
        default:
            break
        }
    }

    @objc private func pressed() {
        dwell?.cancel()
        guard let bubble else { return }
        self.bubble = nil
        bubble.removeFromSuperview()
    }

    private func hide() {
        dwell?.cancel()
        guard let bubble else { return }
        self.bubble = nil
        bubble.removeFromSuperview()
        Self.lastClosed = Date()
    }

    private func show() {
        guard bubble == nil, let anchor, let window = anchor.window, !anchor.isHidden else { return }
        let text = UILabel()
        text.numberOfLines = 0
        text.attributedText = NSAttributedString(string: label, attributes: TypeScale.typeMeta.attributes(color: Palette.onInk))
        let row = UIStackView(arrangedSubviews: [text])
        if let keys {
            let kbd = UILabel()
            kbd.attributedText = NSAttributedString(string: keys, attributes: TypeScale.typeMeta.attributes(color: Palette.onInk))
            kbd.alpha = 0.7
            kbd.setContentCompressionResistancePriority(.required, for: .horizontal)
            row.addArrangedSubview(kbd)
        }
        row.spacing = 6
        row.alignment = .center
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 6, leading: 10, bottom: 6, trailing: 10)
        row.backgroundColor = Palette.inkSolid
        row.layer.cornerRadius = Radius.radiusSm
        row.layer.cornerCurve = .continuous

        // `max-w-xs`.
        let size = row.systemLayoutSizeFitting(CGSize(width: 320, height: UIView.layoutFittingCompressedSize.height),
                                               withHorizontalFittingPriority: .fittingSizeLevel, verticalFittingPriority: .fittingSizeLevel)
        let width = min(320, size.width.rounded(.up))
        let height = row.systemLayoutSizeFitting(CGSize(width: width, height: UIView.layoutFittingCompressedSize.height),
                                                 withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height.rounded(.up)
        let target = anchor.convert(anchor.bounds, to: window)
        // The arrow's 10pt stands between the two (`sideOffset` 0 plus the arrow).
        let gap = 10.0
        var below = side == .bottom
        let safe = window.bounds.inset(by: window.safeAreaInsets)
        if below, target.maxY + gap + height > safe.maxY { below = false }
        if !below, target.minY - gap - height < safe.minY { below = true }
        let x = min(max(safe.minX, target.midX - width / 2), max(safe.minX, safe.maxX - width))
        let y = below ? target.maxY + gap : target.minY - gap - height

        let holder = UIView(frame: CGRect(x: x, y: y, width: width, height: height))
        holder.isUserInteractionEnabled = false
        // The arrow: a 10pt square turned 45°, its centre a point outside the
        // edge under the control and two inside it over one.
        let arrow = UIView(frame: CGRect(x: 0, y: 0, width: 10, height: 10))
        arrow.backgroundColor = Palette.inkSolid
        arrow.layer.cornerRadius = Radius.radiusHair
        arrow.center = CGPoint(x: min(max(Radius.radiusSm + 7, target.midX - x), width - Radius.radiusSm - 7), y: below ? -1 : height - 2)
        arrow.transform = CGAffineTransform(rotationAngle: .pi / 4)
        holder.addSubview(arrow)
        row.frame = holder.bounds
        holder.addSubview(row)
        window.addSubview(holder)
        bubble = holder

        // `kit-tip-in`: from clear, 2pt back toward the control.
        holder.alpha = 0
        if !UIAccessibility.isReduceMotionEnabled { holder.transform = CGAffineTransform(translationX: 0, y: below ? -2 : 2) }
        Motion.easeOut.animator(Motion.durFade) {
            holder.alpha = 1
            holder.transform = .identity
        }.startAnimation()
    }
}
