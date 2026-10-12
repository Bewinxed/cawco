import CawCoDesign
import OSLog
import UIKit

/// A card on the top bar's glass (DESIGN.md, "A card that hangs from its
/// anchor", "Caw's panel", "The glass's cards"): Caw's notifications, the
/// machines and the Jump palette are each one of these, a `HangCard` hung
/// from the glass the same way, and differ only in what they hold.
///
/// It is not a sheet and not a popover presentation: the shell owns it as a
/// view over its columns, with nothing under it, so the rest of the app keeps
/// working while it is open. A press anywhere outside it closes it and still
/// lands on whatever it fell on (`dismissal`); Escape closes it.
///
/// It hangs right-aligned under the glass as one shape with it: its top edge
/// is the glass's foot, its trailing side runs straight on down from the
/// glass's trailing flank, square there, and the glass's leading foot flares
/// out by `radiusLg` into its top edge. On a phone the glass is Caw's tab
/// tucked into the screen's trailing edge and the card is too: its trailing
/// side is the screen's edge, square at top and foot with no edge drawn
/// there, and its leading side keeps the phone's 12pt margin; it hangs from
/// the tab row's floor, past the glass's foot by the glass's `neck`, covering
/// no tab. While it hangs the glass takes its material and edge
/// (`GlassCapsule.setJoined`) and the lower half of Caw's rim fades out
/// (`NeedsCawButton.setJoined`). It slides down out of the glass over
/// `durPop` and back up into it over `durExit` on `easeOut`, interruptible;
/// opened or closed by the keyboard it stands or goes at once, its join with
/// it; with less motion it fades.
///
/// On a finger it is pulled down out of the glass the way a tab's options
/// are pulled off their tab (`pulled`, the `HangPull` rule): it follows the
/// finger 1:1, and let go it settles open or back into the glass on the house
/// spring at the finger's speed. Pushed up from its body once that has
/// nothing further to show (`pushReady`), it goes back in the same way.
///
/// What it holds is a subclass's: it lays its content in `card.content`
/// (`measure`, `layContent`), names where the focus lands (`landing`,
/// `opened`), and calls `place(animated:)` when its content's height changes.
class GlassCard: UIView, UIGestureRecognizerDelegate {
    /// Kept from a wide screen's edges, pt.
    static let edge: CGFloat = 8
    /// A phone's margin on its leading side (DESIGN.md, "Caw's panel": 12px).
    static let phoneMargin: CGFloat = 12

    /// Its name in the log and to the probe ("panel", "machines", "jump").
    let name: String
    /// How wide it stands at most.
    let widest: CGFloat
    let log: Logger

    /// Opened or closed.
    var onOpenChange: (Bool) -> Void = { _ in }
    /// Gone back into the glass and hidden.
    var onShut: () -> Void = {}

    private(set) var open = false
    /// The glass it hangs from, and Caw standing on it, whose lower arcs give way.
    private(set) weak var glass: GlassCapsule?
    private(set) weak var head: NeedsCawButton?
    /// The control that opened it: a press on it toggles the card itself, so
    /// the light dismissal leaves that press alone.
    weak var trigger: UIView?
    let card = HangCard()
    /// The keyboard's top in the card's superview, while one is up: the card keeps above it.
    private var keyboardTop: CGFloat?

    init(name: String, widest: CGFloat, log: Logger) {
        self.name = name
        self.widest = widest
        self.log = log
        super.init(frame: .zero)
        isHidden = true
        card.frame = bounds
        card.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        card.accessibilityContainerType = .semanticGroup
        addSubview(card)
        // A push up on the body begins only on the open card, heading mostly
        // up, with its content showing its end: until then the finger scrolls it.
        let push = GatedPan(target: self, action: #selector(pushed(_:))) { [weak self] pan in
            guard let self else { return false }
            return open && pan.heading(.up) && pushReady()
        }
        push.maximumNumberOfTouches = 1
        card.addGestureRecognizer(push)
        pushGesture = push
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardMoved(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("GlassCard is built in code")
    }

    /// The push up on the body: a scroll in the content waits for it to fail.
    private(set) var pushGesture: UIPanGestureRecognizer!

    // MARK: What a card holds

    /// Its content's own height at `width`.
    func measure(width _: CGFloat) -> CGFloat { 0 }
    /// Lays its content at `width`, `fit` tall (taller than the card it scrolls).
    func layContent(width _: CGFloat, fit _: CGFloat) {}
    /// The tallest it stands in `host`, whatever room the screen leaves.
    func tallest(in _: UIView) -> CGFloat { .greatestFiniteMagnitude }
    /// Where VoiceOver lands as it opens.
    var landing: Any? { nil }
    /// It has come out: what takes the focus takes it.
    func opened() {}
    /// It is going back: what had the focus there lets go of it.
    func closing() {}
    /// A push up on its body may begin: its content shows its end.
    func pushReady() -> Bool { false }
    /// A press on `view` toggles the card itself (its trigger, by default).
    func toggles(_ view: UIView) -> Bool {
        guard let trigger else { return false }
        return view.isDescendant(of: trigger)
    }

    // MARK: Where it stands

    /// On the glass's foot with no gap, or on a phone past it by its neck, on
    /// the tab row's floor so it covers no tab; flush with the glass's
    /// trailing flank: on a phone the screen's edge, its leading side
    /// `phoneMargin` in; on a wide screen at most `widest` across, kept `edge`
    /// inside the screen. As tall as its content, up to what the screen (and
    /// the keyboard) leaves under the glass or `tallest`, its content
    /// scrolling past that. The neck is the glass's span along its top edge,
    /// flared on the leading side by the glass's `flare`.
    func place(animated: Bool = false, then done: @escaping () -> Void = {}) {
        guard let host = superview, let glass, glass.window != nil else { return done() }
        #if DEBUG
        ProbeCounts.panelPlaces += 1
        #endif
        let cap = Self.restingBox(of: glass, under: head, in: host)
        let compact = host.traitCollection.horizontalSizeClass == .compact
        let width = compact
            ? min(widest, cap.maxX - Self.phoneMargin)
            : min(widest, cap.maxX - Self.edge)
        let x = cap.maxX - width
        // On the glass's foot, or past it by its neck: on a phone, the tab row's floor.
        let top = cap.maxY + glass.neck
        let floor = min(host.bounds.height - host.safeAreaInsets.bottom, keyboardTop ?? .greatestFiniteMagnitude)
        let room = floor - Self.edge - top
        let fit = ceil(measure(width: width))
        let size = CGSize(width: width, height: max(0, min(fit, room, tallest(in: host))))
        card.openEnd = compact
        card.hang(from: HangNeck(start: cap.minX - x, end: cap.maxX - x, flareStart: glass.flare, flareEnd: 0, flush: .end))
        // Where it hangs, in the shell's points (the window's): the probes read the join off this.
        let box = { (r: CGRect) in String(format: "%.2f %.2f %.2f %.2f", r.minX, r.minY, r.width, r.height) }
        let line = "\(name) hangs: glass \(box(cap)) \(name) \(box(CGRect(origin: CGPoint(x: x, y: top), size: size))) flare \(glass.flare)"
        log.notice("\(line, privacy: .public)")
        let apply = {
            self.frame = CGRect(origin: CGPoint(x: x, y: top), size: size)
            self.layContent(width: width, fit: fit)
        }
        if animated, !isHidden, !UIAccessibility.isReduceMotionEnabled {
            let move = Motion.easeOut.animator(Motion.durMorph) { apply(); self.layoutIfNeeded() }
            move.addCompletion { _ in done() }
            move.startAnimation()
        } else {
            apply()
            layoutIfNeeded()
            done()
        }
    }

    /// The glass's box in `host` as it stands at rest. The press that opens
    /// the card is still scaling Caw (`head`) as it lifts, and on a phone his
    /// glass stands inside him: from the glass up to him the box is walked by
    /// each view's centre and bounds, which his scale never moves, so the neck
    /// stays put. From there up (on a wide screen from the glass itself, which
    /// he stands on) UIKit converts it, through every ancestor's transform and
    /// anchor point. The iPad's glass is a bar item's view, and the navigation
    /// bar places its items' views in containers of its own; a walk by centre
    /// and bounds through those put the glass 2000pt off the screen, its
    /// trailing edge at x -1073.
    static func restingBox(of glass: UIView, under head: UIView?, in host: UIView) -> CGRect {
        var box = CGRect(x: glass.center.x - glass.bounds.width / 2, y: glass.center.y - glass.bounds.height / 2,
                         width: glass.bounds.width, height: glass.bounds.height)
        var at = glass
        if let head, glass.isDescendant(of: head) {
            while at !== head, let parent = at.superview {
                box = box.offsetBy(dx: parent.center.x - parent.bounds.width / 2 - parent.bounds.minX,
                                   dy: parent.center.y - parent.bounds.height / 2 - parent.bounds.minY)
                at = parent
            }
        }
        guard let holder = at.superview else { return box }
        return holder.convert(box, to: host)
    }

    /// The glass moved under it (a rotation, the rail stepping aside): it follows.
    func follow() {
        guard open else { return }
        place()
    }

    @objc private func keyboardMoved(_ note: Notification) {
        guard let host = superview, let end = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
        let frame = host.convert(end, from: nil)
        keyboardTop = frame.minY < host.bounds.maxY ? frame.minY : nil
        if open { place(animated: true) }
    }

    // MARK: Open and close

    /// Comes down out of `glass`, the glass `head` stands on; `instant`
    /// (opened by the keyboard) stands open at once, its join with it.
    func show(from head: NeedsCawButton, glass: GlassCapsule, instant: Bool = false) {
        hang(from: head, glass: glass, instant: instant)
        card.grow(instant: instant)
        opened()
        UIAccessibility.post(notification: .layoutChanged, argument: landing)
    }

    /// Placed under `glass`, open and joined to it, its card wherever its
    /// slide stands: the press's growth or the finger's pull takes it from there.
    private func hang(from head: NeedsCawButton, glass: GlassCapsule, instant: Bool = false) {
        if let previous = self.glass, previous !== glass { previous.setJoined(false) }
        if let previous = self.head, previous !== head { previous.setJoined(false) }
        self.head = head
        self.glass = glass
        superview?.bringSubviewToFront(self)
        isHidden = false
        place()
        layoutIfNeeded()
        // A mark that draws for a moment after it loads, then pauses: one that
        // loaded while the card was hidden never painted (CawMark `redraw`).
        Self.reveal(in: card.content)
        setOpen(true)
        glass.setJoined(true, instant: instant)
        head.setJoined(true, instant: instant)
    }

    /// Draws again every mark under `view` that paints only while drawn (`RedrawsOnReveal`).
    private static func reveal(in view: UIView) {
        for sub in view.subviews {
            if let mark = sub as? RedrawsOnReveal { mark.redraw() }
            reveal(in: sub)
        }
    }

    /// Goes back up into the glass; `instant` (closed by the keyboard) goes
    /// at once, its join with it. VoiceOver goes back to Caw, unless what
    /// closed it put the focus elsewhere (`refocus` off: a press outside,
    /// another card of the glass opening).
    func close(instant: Bool = false, refocus: Bool = true) {
        guard open else { return }
        closing()
        letGo(instant: instant)
        card.fold(instant: instant) { [weak self] in self?.hideShut() }
        if refocus { UIAccessibility.post(notification: .layoutChanged, argument: head) }
    }

    /// Closed: the glass and Caw part from it on the way back in.
    private func letGo(instant: Bool = false) {
        setOpen(false)
        glass?.setJoined(false, instant: instant)
        head?.setJoined(false, instant: instant)
    }

    /// Gone back into the glass: hidden, unless it has opened since.
    private func hideShut() {
        guard !open else { return }
        isHidden = true
        onShut()
    }

    private func setOpen(_ next: Bool) {
        guard next != open else { return }
        open = next
        log.notice("\(self.name, privacy: .public) open: \(next)")
        onOpenChange(next)
    }

    override func accessibilityPerformEscape() -> Bool {
        close()
        return true
    }

    // MARK: Pulled by a finger

    /// How far out of the glass the card stood when the finger took it.
    private var pullFrom = 0.0

    /// A finger on Caw (`NeedsCawButton.onPull`): down pulls the card out of
    /// his glass under it, up pushes the open card back in.
    func pulled(_ pan: UIPanGestureRecognizer, from head: NeedsCawButton, glass: GlassCapsule) {
        track(pan, head: head, glass: glass)
    }

    /// A push up on the open card's body.
    @objc private func pushed(_ pan: UIPanGestureRecognizer) {
        track(pan, head: nil, glass: nil)
    }

    /// The finger's pull, the card's top edge `dy` from where it took it:
    /// 1:1 along the slide, let go on `HangPull`'s rule (TabOptionsSheet's
    /// `pull` and `release`). With less motion nothing slides: past
    /// `HangPull.opens` down it fades open, up it fades shut.
    private func track(_ pan: UIPanGestureRecognizer, head: NeedsCawButton?, glass: GlassCapsule?) {
        let dy = pan.translation(in: superview).y
        let still = UIAccessibility.isReduceMotionEnabled
        switch pan.state {
        case .began:
            pullFrom = card.revealed
            if !open, !still, let head, let glass {
                hang(from: head, glass: glass)
            }
            pull(dy, head: head, glass: glass)
        case .changed:
            pull(dy, head: head, glass: glass)
        case .ended:
            release(dy, velocity: pan.velocity(in: superview).y)
        case .cancelled, .failed:
            // Back where the finger found it.
            release(0, velocity: 0)
        default:
            break
        }
    }

    private func pull(_ dy: Double, head: NeedsCawButton?, glass: GlassCapsule?) {
        if UIAccessibility.isReduceMotionEnabled {
            if !open, dy >= HangPull.opens, let head, let glass {
                show(from: head, glass: glass)
            } else if open, dy <= -HangPull.opens {
                close()
            }
            return
        }
        let height = bounds.height
        guard height > 0 else { return }
        card.reveal(pullFrom + dy / height)
        #if DEBUG
        // A simulator probe's 1:1 read: the finger's travel against the card's drawn foot.
        let line = String(format: "\(name) pull: finger %.1f foot %.1f from %.1f height %.1f", dy, card.revealed * height, pullFrom * height, height)
        log.notice("\(line, privacy: .public)")
        #endif
    }

    private func release(_ dy: Double, velocity: Double) {
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        let height = bounds.height
        let travel = min(height, max(0, pullFrom * height + dy))
        #if DEBUG
        let line = String(format: "\(name) release: travel %.1f velocity %.0f height %.1f opens %@", travel, velocity, height,
                          HangPull.opens(travel: travel, velocity: velocity, height: height) ? "yes" : "no")
        log.notice("\(line, privacy: .public)")
        #endif
        if HangPull.opens(travel: travel, velocity: velocity, height: height) {
            card.settle(open: true, velocity: velocity)
            if pullFrom < 0.5 {
                opened()
                UIAccessibility.post(notification: .layoutChanged, argument: landing)
            }
        } else {
            if open {
                closing()
                letGo()
            }
            card.settle(open: false, velocity: velocity) { [weak self] in self?.hideShut() }
            UIAccessibility.post(notification: .layoutChanged, argument: head)
        }
    }

    // MARK: Light dismiss

    private weak var outsideTap: UITapGestureRecognizer?

    /// A press anywhere in `host` outside the card and off its trigger closes
    /// it. The press is never taken from what it landed on
    /// (`cancelsTouchesInView` off, recognised alongside every other
    /// recognizer): a press on a transcript row closes the card and opens the
    /// row in the same touch.
    func dismissal(in host: UIView) {
        let tap = UITapGestureRecognizer(target: self, action: #selector(tappedOutside))
        tap.cancelsTouchesInView = false
        tap.delaysTouchesBegan = false
        tap.delaysTouchesEnded = false
        tap.delegate = self
        host.addGestureRecognizer(tap)
        outsideTap = tap
    }

    /// Leaves the shell for good: its press outside with it.
    func detach() {
        if let outsideTap { outsideTap.view?.removeGestureRecognizer(outsideTap) }
        removeFromSuperview()
    }

    /// Closed by a press outside: the focus stays where that press put it.
    @objc private func tappedOutside() { close(refocus: false) }

    func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard gesture === outsideTap else { return true }
        guard open else { return false }
        if point(inside: touch.location(in: self), with: nil) { return false }
        var at = touch.view
        while let view = at {
            if toggles(view) { return false }
            at = view.superview
        }
        return true
    }

    func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer) -> Bool {
        gesture === outsideTap
    }
}
