import CawCoDesign
import UIKit
#if targetEnvironment(macCatalyst)
import AppKit
#endif

/// The handle between a conversation's transcript and the preview beside it
/// (SideSplit.svelte's `.side-divider`): a hairline in a hit area
/// `c-side-divider-hit` wide. A finger or a pointer drags it; a pointer over
/// it shows the column resize cursor on the Mac, iPadOS's beam on an iPad,
/// and the hairline in the control edge.
final class SplitDivider: UIView, UIPointerInteractionDelegate, UIGestureRecognizerDelegate {
    /// The pan, every state of it: SessionViewController moves the split.
    var onDrag: (UIPanGestureRecognizer) -> Void = { _ in }
    /// VoiceOver's increment (+1, a wider preview) and decrement (-1).
    var onStep: (Int) -> Void = { _ in }

    private let line = UIView()
    private var hovering = false
    private var dragging = false
    #if targetEnvironment(macCatalyst)
    private var cursorPushed = false
    #endif

    /// Expanded, the handle stands just inside the session area's edge with
    /// no line to draw: the edge is the line.
    var expanded = false {
        didSet {
            line.isHidden = expanded
            accessibilityValue = expanded ? "Conversation hidden" : nil
        }
    }

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        line.translatesAutoresizingMaskIntoConstraints = false
        line.isUserInteractionEnabled = false
        line.backgroundColor = Palette.borderHairline
        addSubview(line)
        NSLayoutConstraint.activate([
            line.centerXAnchor.constraint(equalTo: centerXAnchor),
            line.topAnchor.constraint(equalTo: topAnchor),
            line.bottomAnchor.constraint(equalTo: bottomAnchor),
            line.widthAnchor.constraint(equalToConstant: 1),
        ])
        let pan = UIPanGestureRecognizer(target: self, action: #selector(dragged(_:)))
        // A second finger mid-drag does not move the split to it.
        pan.maximumNumberOfTouches = 1
        pan.delegate = self
        addGestureRecognizer(pan)
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        #if !targetEnvironment(macCatalyst)
        addInteraction(UIPointerInteraction(delegate: self))
        #endif
        isAccessibilityElement = true
        accessibilityLabel = "Resize preview"
        accessibilityTraits = .adjustable
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("SplitDivider is built in code") }

    /// Where the finger or pointer went down, in the superview's points, as
    /// the pan is handed the touch. A pan's translation starts only once the
    /// pan is recognised, 10pt or so on; the drag holds the handle by this
    /// point instead, so it stays under the finger from the first move.
    private(set) var downX = 0.0

    func gestureRecognizer(_: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        if let superview { downX = touch.location(in: superview).x }
        return true
    }

    @objc private func dragged(_ pan: UIPanGestureRecognizer) {
        switch pan.state {
        case .began: dragging = true
        case .ended, .cancelled, .failed: dragging = false
        default: break
        }
        paint()
        onDrag(pan)
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        hovering = hover.state == .began || hover.state == .changed
        paint()
    }

    /// The line takes the control edge while a pointer is over it or a drag
    /// holds it; on the Mac the column resize cursor stays for the drag even
    /// when the pointer runs ahead of the handle.
    private func paint() {
        let held = hovering || dragging
        line.backgroundColor = held ? Palette.borderControl : Palette.borderHairline
        #if targetEnvironment(macCatalyst)
        if held, !cursorPushed {
            cursorPushed = true
            NSCursor.columnResize.push()
        } else if !held, cursorPushed {
            cursorPushed = false
            NSCursor.pop()
        }
        #endif
    }

    override func willMove(toWindow newWindow: UIWindow?) {
        super.willMove(toWindow: newWindow)
        guard newWindow == nil else { return }
        hovering = false
        dragging = false
        paint()
    }

    override func accessibilityIncrement() { onStep(1) }
    override func accessibilityDecrement() { onStep(-1) }

    func pointerInteraction(_: UIPointerInteraction, styleFor _: UIPointerRegion) -> UIPointerStyle? {
        UIPointerStyle(shape: .verticalBeam(length: bounds.height), constrainedAxes: .vertical)
    }
}
