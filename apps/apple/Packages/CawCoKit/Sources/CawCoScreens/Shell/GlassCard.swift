import CawCoDesign
import OSLog
import UIKit

/// What one of the glass's cards holds (DESIGN.md, "Caw's panel", "The
/// glass's cards"): Caw's notifications (`CawPanel`), the machines
/// (`MachinesCard`) and the Jump palette (`JumpCard`). The shell's one
/// `GlassCard` shows one at a time; a content lays itself out in its own
/// bounds (`measure`, `layContent`), names where the focus lands
/// (`landing`, `opened`), and calls `place(animated:)` when its height changes.
class GlassContent: UIView {
    /// Its name in the log and to the probe ("panel", "machines", "jump").
    let name: String
    /// How wide the card stands at most while it holds this.
    let widest: CGFloat
    let log: Logger
    /// What VoiceOver calls the card while it holds this, and the card's identifier.
    let cardLabel: String
    let cardIdentifier: String
    /// The card it shows in, while it is in one.
    fileprivate(set) weak var host: GlassCard?
    /// The control that opened it: a press on it toggles the card, so the
    /// light dismissal leaves that press alone.
    weak var trigger: UIView?

    init(name: String, widest: CGFloat, log: Logger, label: String, identifier: String) {
        self.name = name
        self.widest = widest
        self.log = log
        cardLabel = label
        cardIdentifier = identifier
        super.init(frame: .zero)
        accessibilityContainerType = .semanticGroup
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("GlassContent is built in code")
    }

    /// The card stands open showing this.
    var open: Bool { host.map { $0.open && $0.showing === self } ?? false }

    /// Its own height at `width`.
    func measure(width _: CGFloat) -> CGFloat { 0 }
    /// Lays itself out at `width`, `fit` tall (taller than the card it scrolls).
    func layContent(width _: CGFloat, fit _: CGFloat) {}
    /// The tallest the card stands in `host` holding this, whatever room the screen leaves.
    func tallest(in _: UIView) -> CGFloat { .greatestFiniteMagnitude }
    /// Where VoiceOver lands as it shows.
    var landing: Any? { nil }
    /// It has come out, or morphed in: what takes the focus takes it.
    func opened() {}
    /// It is going back, or morphing out: what had the focus there lets go of it.
    func closing() {}
    /// A push up on the card's body may begin: this shows its end.
    func pushReady() -> Bool { false }
    /// A press on `view` toggles the card itself (its trigger, by default).
    func toggles(_ view: UIView) -> Bool {
        guard let trigger else { return false }
        return view.isDescendant(of: trigger)
    }

    /// Joined a card for the first time: what of the card it needs, it takes now.
    func joined(_: GlassCard) {}

    /// Its height changed: the card follows, if it is showing this.
    func place(animated: Bool = false, then done: @escaping () -> Void = {}) {
        guard let host, host.showing === self else { return done() }
        host.place(animated: animated, then: done)
    }

    /// The card goes back into the glass, if it is showing this.
    func close(instant: Bool = false, refocus: Bool = true) {
        guard open, let host else { return }
        host.close(instant: instant, refocus: refocus)
    }
}

/// The card on the top bar's glass (DESIGN.md, "A card that hangs from its
/// anchor", "Caw's panel", "The glass's cards"): one `HangCard` hung from
/// the glass, which shows Caw's notifications, the machines or the Jump
/// palette (`GlassContent`), one at a time.
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
/// (`NeedsCawButton.setJoined`). Opened from shut it slides down out of the
/// glass over `durPop`, and the last close takes it back up into it over
/// `durExit`, on `easeOut`, interruptible; opened or closed by the keyboard
/// it stands or goes at once, its join with it; with less motion it fades.
///
/// Opening another content while it hangs morphs it in place (owner: "the
/// panel should morph in place, not collapse and reopen"; motion/morph.svelte.ts):
/// it stays hung, its top on the glass's foot and its trailing edge on the
/// glass's flank, while its width and height tween to the next content's over
/// `durMorph` on `easeDrawer`, the outgoing content fading out over `durExit`
/// and the incoming fading in over `durMorph`, each standing at the card's
/// top-trailing corner, which does not move. A switch mid-morph turns from
/// where it has reached. A key's switch (⌘K) is at once; with less motion the
/// size changes at once and only the contents cross-fade.
///
/// On a finger it is pulled down out of the glass the way a tab's options
/// are pulled off their tab (`pulled`, the `HangPull` rule): it follows the
/// finger 1:1, and let go it settles open or back into the glass on the house
/// spring at the finger's speed. Pushed up from its body once that has
/// nothing further to show (`pushReady`), it goes back in the same way.
final class GlassCard: UIView, UIGestureRecognizerDelegate {
    /// Kept from a wide screen's edges, pt.
    static let edge: CGFloat = 8
    /// A phone's margin on its leading side (DESIGN.md, "Caw's panel": 12px).
    static let phoneMargin: CGFloat = 12
    private static let fallbackLog = Logger(subsystem: "dev.cawco.app", category: "GlassCard")

    /// Opened or closed, or it now shows another content.
    var onChange: () -> Void = {}
    /// A content left it, shut with it or morphed out: the shell may let it go.
    var onLeave: (GlassContent) -> Void = { _ in }

    private(set) var open = false
    /// What it shows now.
    private(set) var showing: GlassContent?
    /// The glass it hangs from, and Caw standing on it, whose lower arcs give way.
    private(set) weak var glass: GlassCapsule?
    private(set) weak var head: NeedsCawButton?
    let card = HangCard()
    /// The keyboard's top in the card's superview, while one is up: the card keeps above it.
    private var keyboardTop: CGFloat?

    /// Its name in the log and to the probe: the content's it shows.
    var name: String { showing?.name ?? "card" }
    private var log: Logger { showing?.log ?? Self.fallbackLog }

    init() {
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
            return open && pan.heading(.up) && (showing?.pushReady() ?? false)
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

    /// The push up on the body: a scroll in a content waits for it to fail.
    private(set) var pushGesture: UIPanGestureRecognizer!

    // MARK: Where it stands

    /// Where it stands holding `content` under `glass`, in its superview's points.
    private struct Placement {
        var frame: CGRect
        var neck: HangNeck
        var fit: CGFloat
        var compact: Bool
        var cap: CGRect
    }

    /// On the glass's foot with no gap, or on a phone past it by its neck, on
    /// the tab row's floor so it covers no tab; flush with the glass's
    /// trailing flank: on a phone the screen's edge, its leading side
    /// `phoneMargin` in; on a wide screen at most the content's `widest`
    /// across, kept `edge` inside the screen. As tall as its content, up to
    /// what the screen (and the keyboard) leaves under the glass or the
    /// content's `tallest`, its content scrolling past that. The neck is the
    /// glass's span along its top edge, flared on the leading side by the
    /// glass's `flare`.
    private func placement(of content: GlassContent, in host: UIView, under glass: GlassCapsule) -> Placement {
        let cap = Self.restingBox(of: glass, under: head, in: host)
        let compact = host.traitCollection.horizontalSizeClass == .compact
        let width = compact
            ? min(content.widest, cap.maxX - Self.phoneMargin)
            : min(content.widest, cap.maxX - Self.edge)
        let x = cap.maxX - width
        let top = cap.maxY + glass.neck
        let floor = min(host.bounds.height - host.safeAreaInsets.bottom, keyboardTop ?? .greatestFiniteMagnitude)
        let room = floor - Self.edge - top
        let fit = ceil(content.measure(width: width))
        let size = CGSize(width: width, height: max(0, min(fit, room, content.tallest(in: host))))
        let neck = HangNeck(start: cap.minX - x, end: cap.maxX - x, flareStart: glass.flare, flareEnd: 0, flush: .end)
        return Placement(frame: CGRect(origin: CGPoint(x: x, y: top), size: size), neck: neck, fit: fit, compact: compact, cap: cap)
    }

    /// Placed for what it shows, at once or following its content's new
    /// height over `durMorph`.
    func place(animated: Bool = false, then done: @escaping () -> Void = {}) {
        guard let host = superview, let glass, glass.window != nil, let showing else { return done() }
        #if DEBUG
        ProbeCounts.panelPlaces += 1
        #endif
        let spot = placement(of: showing, in: host, under: glass)
        logHang(spot, glass: glass)
        let apply = { self.lay(showing, at: spot) }
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

    /// Where it hangs, in the shell's points (the window's): the probes read the join off this.
    private func logHang(_ spot: Placement, glass: GlassCapsule) {
        let box = { (r: CGRect) in String(format: "%.2f %.2f %.2f %.2f", r.minX, r.minY, r.width, r.height) }
        let line = "\(name) hangs: glass \(box(spot.cap)) \(name) \(box(spot.frame)) flare \(glass.flare)"
        log.notice("\(line, privacy: .public)")
    }

    /// `content` laid at its size for `spot`, then the card there.
    private func lay(_ content: GlassContent, at spot: Placement) {
        layContent(content, at: spot)
        layCard(at: spot)
    }

    /// `content` at the size it shows at `spot`, standing at the card's
    /// top-trailing corner as the card stands now: a content keeps that
    /// corner, the one that never moves, and the card's leading edge and foot
    /// move round it (it is pinned there, `adopt`). Measured from the
    /// content area's width as it is now, which the card's next layout
    /// brings to `spot`'s.
    private func layContent(_ content: GlassContent, at spot: Placement) {
        content.frame = CGRect(x: card.content.bounds.width - spot.frame.width, y: 0,
                               width: spot.frame.width, height: spot.frame.height)
        content.layContent(width: spot.frame.width, fit: spot.fit)
    }

    /// The card's box, its neck and its open end at `spot`.
    private func layCard(at spot: Placement) {
        card.openEnd = spot.compact
        card.hang(from: spot.neck)
        frame = spot.frame
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

    // MARK: What it shows

    /// Every content in it now: the one it shows, and any still fading out.
    private var held: [GlassContent] { card.content.subviews.compactMap { $0 as? GlassContent } }
    /// Each content's fade running now, by content.
    private var fades: [ObjectIdentifier: UIViewPropertyAnimator] = [:]
    /// The morph's size tween running now, if one is.
    private var resize: UIViewPropertyAnimator?

    /// `next` becomes what it shows, at once: whatever else it held goes.
    private func mount(_ next: GlassContent) {
        for other in held where other !== next { leave(other) }
        stopFade(next)
        next.alpha = 1
        adopt(next)
    }

    /// `next` is what it shows from now: in the card, named for VoiceOver.
    private func adopt(_ next: GlassContent) {
        showing = next
        if next.host !== self {
            next.host = self
            next.joined(self)
        }
        if next.superview !== card.content {
            next.autoresizingMask = [.flexibleLeftMargin, .flexibleBottomMargin]
            card.content.addSubview(next)
        } else {
            card.content.bringSubviewToFront(next)
        }
        card.accessibilityLabel = next.cardLabel
        card.accessibilityIdentifier = next.cardIdentifier
    }

    /// A content out of the card for good.
    private func leave(_ content: GlassContent) {
        stopFade(content)
        content.removeFromSuperview()
        content.alpha = 1
        onLeave(content)
    }

    private func stopFade(_ content: GlassContent) {
        fades.removeValue(forKey: ObjectIdentifier(content))?.stopAnimation(true)
    }

    /// `content` fades to `alpha` over `duration` on `curve`, from wherever it
    /// stands; `done` once it lands there.
    private func fade(_ content: GlassContent, to alpha: CGFloat, over duration: TimeInterval, curve: TimingCurve, done: @escaping () -> Void = {}) {
        stopFade(content)
        let run = curve.animator(duration) { content.alpha = alpha }
        let key = ObjectIdentifier(content)
        run.addCompletion { [weak self, weak run] position in
            guard let self, let run, fades[key] === run else { return }
            fades[key] = nil
            if position == .end { done() }
        }
        fades[key] = run
        run.startAnimation()
    }

    // MARK: Open, switch and close

    /// Shows `next` hung from `glass`, the glass `head` stands on. Shut (or
    /// folding back), it comes down out of the glass, or stands at once
    /// (`instant`, opened by a key). Already hanging there with another
    /// content, it morphs in place into `next`.
    func show(_ next: GlassContent, from head: NeedsCawButton, glass: GlassCapsule, instant: Bool = false) {
        if open, let current = showing, current !== next, self.glass === glass {
            morph(to: next, instant: instant)
            return
        }
        if open, showing !== next { showing?.closing() }
        mount(next)
        hang(from: head, glass: glass, instant: instant)
        card.grow(instant: instant)
        next.opened()
        UIAccessibility.post(notification: .layoutChanged, argument: next.landing)
    }

    /// Hanging, it becomes `next` in place: the size tween and the cross-fade
    /// (see the type's notes), or at once for a key.
    private func morph(to next: GlassContent, instant: Bool) {
        guard let host = superview, let glass, let old = showing else { return }
        old.closing()
        let wasHeld = next.superview === card.content
        adopt(next)
        let spot = placement(of: next, in: host, under: glass)
        logHang(spot, glass: glass)
        log.notice("\(next.name, privacy: .public) morphs in from \(old.name, privacy: .public)\(instant ? " at once" : "", privacy: .public)")
        // From where the outgoing stands now: a switch mid-morph turns from there.
        resize?.stopAnimation(true)
        resize = nil
        if instant {
            for other in held where other !== next { leave(other) }
            stopFade(next)
            next.alpha = 1
            lay(next, at: spot)
            layoutIfNeeded()
        } else {
            // The incoming stands at the card's top-trailing corner at its own
            // size, laid out whole before the tween so only the card moves.
            if !wasHeld { next.alpha = 0 }
            layContent(next, at: spot)
            next.layoutIfNeeded()
            if UIAccessibility.isReduceMotionEnabled {
                layCard(at: spot)
                layoutIfNeeded()
            } else {
                let tween = Motion.easeDrawer.animator(Motion.durMorph) {
                    self.layCard(at: spot)
                    self.layoutIfNeeded()
                }
                resize = tween
                tween.addCompletion { [weak self, weak tween] _ in
                    guard let self, let tween, resize === tween else { return }
                    resize = nil
                }
                tween.startAnimation()
            }
            for other in held where other !== next {
                fade(other, to: 0, over: Motion.durExit, curve: Motion.easeOut) { [weak self, weak other] in
                    guard let self, let other, other !== showing else { return }
                    leave(other)
                }
            }
            fade(next, to: 1, over: Motion.durMorph, curve: Motion.easeDrawer)
        }
        next.opened()
        UIAccessibility.post(notification: .layoutChanged, argument: next.landing)
        onChange()
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
        // The size it is drawn at is the one it stands at: no tween left over from a morph.
        resize?.stopAnimation(true)
        resize = nil
        place()
        layoutIfNeeded()
        // A mark that draws for a moment after it loads, then pauses: one that
        // loaded while the card was hidden never painted (CawMark `redraw`).
        if let showing { Self.reveal(in: showing) }
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
    /// closed it put the focus elsewhere (`refocus` off: a press outside).
    func close(instant: Bool = false, refocus: Bool = true) {
        guard open else { return }
        showing?.closing()
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

    /// Gone back into the glass: hidden, unless it has opened since; what it
    /// held leaves it.
    private func hideShut() {
        guard !open else { return }
        isHidden = true
        resize?.stopAnimation(true)
        resize = nil
        for content in held { leave(content) }
        showing = nil
        onChange()
    }

    private func setOpen(_ next: Bool) {
        guard next != open else { return }
        open = next
        log.notice("\(self.name, privacy: .public) open: \(next)")
        onChange()
    }

    override func accessibilityPerformEscape() -> Bool {
        close()
        return true
    }

    // MARK: Pulled by a finger

    /// How far out of the glass the card stood when the finger took it.
    private var pullFrom = 0.0

    /// A finger on Caw (`NeedsCawButton.onPull`): down pulls the card out of
    /// his glass under it showing `content`, up pushes the open card back in.
    func pulled(_ pan: UIPanGestureRecognizer, showing content: GlassContent, from head: NeedsCawButton, glass: GlassCapsule) {
        track(pan, content: content, head: head, glass: glass)
    }

    /// A push up on the open card's body.
    @objc private func pushed(_ pan: UIPanGestureRecognizer) {
        track(pan, content: nil, head: nil, glass: nil)
    }

    /// The finger's pull, the card's top edge `dy` from where it took it:
    /// 1:1 along the slide, let go on `HangPull`'s rule (TabOptionsSheet's
    /// `pull` and `release`). With less motion nothing slides: past
    /// `HangPull.opens` down it fades open, up it fades shut.
    private func track(_ pan: UIPanGestureRecognizer, content: GlassContent?, head: NeedsCawButton?, glass: GlassCapsule?) {
        let dy = pan.translation(in: superview).y
        let still = UIAccessibility.isReduceMotionEnabled
        switch pan.state {
        case .began:
            pullFrom = card.revealed
            if !open, !still, let content, let head, let glass {
                mount(content)
                hang(from: head, glass: glass)
            }
            pull(dy, content: content, head: head, glass: glass)
        case .changed:
            pull(dy, content: content, head: head, glass: glass)
        case .ended:
            release(dy, velocity: pan.velocity(in: superview).y)
        case .cancelled, .failed:
            // Back where the finger found it.
            release(0, velocity: 0)
        default:
            break
        }
    }

    private func pull(_ dy: Double, content: GlassContent?, head: NeedsCawButton?, glass: GlassCapsule?) {
        if UIAccessibility.isReduceMotionEnabled {
            if !open, dy >= HangPull.opens, let content, let head, let glass {
                show(content, from: head, glass: glass)
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
                showing?.opened()
                UIAccessibility.post(notification: .layoutChanged, argument: showing?.landing)
            }
        } else {
            if open {
                showing?.closing()
                letGo()
            }
            card.settle(open: false, velocity: velocity) { [weak self] in self?.hideShut() }
            UIAccessibility.post(notification: .layoutChanged, argument: head)
        }
    }

    // MARK: Light dismiss

    private weak var outsideTap: UITapGestureRecognizer?

    /// A press anywhere in `host` outside the card, off the glass it hangs
    /// from and off what it shows' trigger closes it. The press is never
    /// taken from what it landed on (`cancelsTouchesInView` off, recognised
    /// alongside every other recognizer): a press on a transcript row closes
    /// the card and opens the row in the same touch. A press on the glass is
    /// the glass's own: its controls close the card or morph it.
    func dismissal(in host: UIView) {
        let tap = UITapGestureRecognizer(target: self, action: #selector(tappedOutside))
        tap.cancelsTouchesInView = false
        tap.delaysTouchesBegan = false
        tap.delaysTouchesEnded = false
        tap.delegate = self
        host.addGestureRecognizer(tap)
        outsideTap = tap
    }

    /// Closed by a press outside: the focus stays where that press put it.
    @objc private func tappedOutside() { close(refocus: false) }

    func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard gesture === outsideTap else { return true }
        guard open else { return false }
        if point(inside: touch.location(in: self), with: nil) { return false }
        var at = touch.view
        while let view = at {
            if view === glass || view === head || showing?.toggles(view) == true { return false }
            at = view.superview
        }
        return true
    }

    func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer) -> Bool {
        gesture === outsideTap
    }
}
