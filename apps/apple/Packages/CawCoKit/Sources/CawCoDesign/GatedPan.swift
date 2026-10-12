import UIKit

/// A pan that begins only when `mayBegin` says so: the way a pull down off a
/// tab, a swipe up on its options, a pull on Caw or a notice's sideways
/// swipe takes the finger only heading its own way.
///
/// The gate is the recognizer's own delegate, which UIKit asks for this
/// recognizer wherever its touch landed. A view's `gestureRecognizerShouldBegin`
/// is not that: it is the touched view's veto over every recognizer the
/// touch reaches, asked of the hit-tested view (UIView docs: "the UISlider
/// class uses this method to prevent swipes parallel to the slider's travel
/// direction and that start in the thumb"; a UIButton refuses its ancestors'
/// taps the same way). Overridden on the view a pan is attached to, it gates
/// the pan only for touches that land on that view and not on any subview:
/// a vertical drag begun on a notice row's label began its sideways swipe,
/// and a drag on a tab option's button began the options' swipe up whatever
/// its way. A scroll view is the one exception: UIKit makes it its own pan's
/// delegate, so its subclass's override is asked as that delegate.
///
/// Its delegate is its gate, and stays so: setting another trips an assert.
@MainActor
public final class GatedPan: UIPanGestureRecognizer {
    private let gate: Gate

    /// A pan on `target`'s `action` that begins only when `mayBegin` is true,
    /// asked as it leaves `.possible` (its velocity and translation are its
    /// first movement's then).
    public init(target: Any?, action: Selector?, mayBegin: @escaping @MainActor (GatedPan) -> Bool) {
        gate = Gate(mayBegin)
        super.init(target: target, action: action)
        delegate = gate
    }

    override public var delegate: (any UIGestureRecognizerDelegate)? {
        didSet { assert(delegate === gate, "a GatedPan's delegate is its gate") }
    }

    /// Mostly along `way`, heading it: its first movement's speed that way
    /// is more than across.
    public func heading(_ way: Way) -> Bool {
        let v = velocity(in: view)
        switch way {
        case .down: return v.y > 0 && v.y > abs(v.x)
        case .up: return v.y < 0 && -v.y > abs(v.x)
        case .across: return abs(v.x) > abs(v.y)
        }
    }

    public enum Way: Sendable { case down, up, across }

    private final class Gate: NSObject, UIGestureRecognizerDelegate {
        let mayBegin: @MainActor (GatedPan) -> Bool

        init(_ mayBegin: @escaping @MainActor (GatedPan) -> Bool) {
            self.mayBegin = mayBegin
        }

        func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
            guard let pan = gesture as? GatedPan else { return true }
            return mayBegin(pan)
        }
    }
}
