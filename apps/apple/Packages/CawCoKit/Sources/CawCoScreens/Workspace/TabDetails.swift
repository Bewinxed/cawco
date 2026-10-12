import CawCoCore
import CawCoDesign
import OSLog
import UIKit

/// A group's session details as its tabs host them (PaneTabs.svelte;
/// DESIGN.md, "Session card."): one card hung from a tab, at every width,
/// opened by resting a pointer on the tab for 350ms and let go 250ms after
/// the pointer leaves both the tab and the card, or pinned by a press (the
/// chosen tab, its chevron, the menu's Session details), when it stays until
/// it is closed, a press or a drag lands outside it, or the same tab is
/// pressed again. While it is open, another tab takes it rather than
/// reopening it: the card, its height and the cut glide there over
/// `durMorph` on the drawer curve and its content is nudged in from the side
/// it moved toward. A pointer on the card holds it; a press in it pins it.
/// The card is not modal, so the tabs under the pointer still answer.
///
/// It hangs from its tab's whole box as one shape with it (`HangCard`): "its
/// top edge is the tab's foot, with no gap, and on the desk its leading edge
/// stands one flare, one card corner and 4px before the tab, so the outline
/// runs corner, short run, the chosen sheet's flared foot, up the tab's flank
/// as one folder. Where that leading edge would cross its pane's own … the
/// card stands flush with the tab instead". "On the phone the same card
/// stands under its tab at the 12px margins, and a swipe up on its head folds
/// it back into the tab under the finger on the house spring." It comes down
/// out of the tab's foot over `durPop` and goes back up into it over
/// `durExit` on `easeOut`; with less motion it fades.
@MainActor
final class TabDetails: NSObject, UIGestureRecognizerDelegate {
    private let panes: PaneHost
    private weak var presenter: UIViewController?
    private var card: Card?
    private var details: SessionDetailsController?
    private weak var anchor: UIView?
    private(set) var openId: String?
    private(set) var pinned = false
    private var timer: Task<Void, Never>?
    private var sizes: NSKeyValueObservation?
    /// The card's light dismiss: a tap and a drag outside it.
    private var outside: [UIGestureRecognizer] = []
    /// A tab's context menu is open: hovering must not open the card under it.
    var menuOpen = false {
        didSet {
            guard menuOpen else { return }
            timer?.cancel()
            if openId != nil, !pinned { close() }
        }
    }

    /// The order of the group's tabs, for the side the card moves toward.
    var order: () -> [String] = { [] }

    private static let openAfter = 0.35
    private static let closeAfter = 0.25
    /// The card's margin to the window (PaneTabs.svelte `CARD_MARGIN`), and a phone's to the screen.
    private static let margin = 12.0
    /// The card's round corner and the run before the tab's flare begins (`CARD_CORNER`, `CARD_RUN`).
    private static let corner = Radius.radiusLg
    private static let run = 4.0
    static let log = Logger(subsystem: "dev.cawco.app", category: "TabDetails")

    init(panes: PaneHost, presenter: UIViewController) {
        self.panes = panes
        self.presenter = presenter
    }

    var isOpen: Bool { openId != nil }

    // MARK: What the tabs say

    /// A pointer rests on a tab.
    func hover(_ id: String, tab: UIView) {
        guard !pinned, !menuOpen else { return }
        timer?.cancel()
        if isOpen {
            show(id, from: tab, pin: false)
            return
        }
        timer = Task { @MainActor [weak self, weak tab] in
            try? await Task.sleep(for: .seconds(Self.openAfter))
            guard !Task.isCancelled, let self, let tab, tab.window != nil else { return }
            show(id, from: tab, pin: false)
        }
    }

    /// The pointer left the tab, or the card.
    func leave() {
        timer?.cancel()
        guard !pinned else { return }
        timer = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(Self.closeAfter))
            guard !Task.isCancelled else { return }
            self?.close()
        }
    }

    /// A tab was pressed: the chosen one opens its details pinned, or closes
    /// them if they were; another takes an open card with it; otherwise the
    /// card goes.
    func click(_ id: String, tab: UIView, chosen: Bool) {
        if chosen {
            if isOpen, pinned, openId == id { close() } else { show(id, from: tab, pin: true) }
        } else if isOpen {
            show(id, from: tab, pin: pinned)
        } else {
            close()
        }
    }

    /// The chevron, or the menu's Session details: a tab not on screen has nothing to hang from.
    func pin(_ id: String, tab: UIView?) {
        guard let tab else { return }
        show(id, from: tab, pin: true)
    }

    // MARK: The card

    private func show(_ id: String, from tab: UIView, pin: Bool) {
        // A workflow run's tab is its own details: it has no session card.
        guard BoardRun.runId(of: id) == nil, let presenter else { return }
        // The card stands over the whole window, so the controller in it belongs
        // to the one whose view holds it.
        let owner = presenter.view.window?.rootViewController ?? presenter
        let host: UIView = owner.view
        timer?.cancel()
        pinned = pin
        anchor = tab
        if let card, let details, openId != nil {
            guard openId != id else {
                place(card, in: host, animated: false)
                return
            }
            let tabs = order()
            let dir = (tabs.firstIndex(of: id) ?? 0) > (tabs.firstIndex(of: openId ?? "") ?? 0) ? 1 : -1
            openId = id
            details.show(sessionId: id, title: panes.detailsTitle(id), link: panes.link(id), dir: dir)
            place(card, in: host, animated: true)
            return
        }
        let details = panes.details(for: id)
        details.onClose = { [weak self] in self?.close() }
        let card = Card()
        card.onHold = { [weak self] in self?.timer?.cancel() }
        card.onRelease = { [weak self] in self?.leave() }
        card.onPress = { [weak self] in
            self?.timer?.cancel()
            self?.pinned = true
        }
        owner.addChild(details)
        card.hold(details.view)
        host.addSubview(card)
        details.didMove(toParent: owner)
        self.card = card
        self.details = details
        openId = id
        // A finger's swipe up on the head folds the card back into its tab under it.
        let fold = GatedPan(target: self, action: #selector(folded(_:))) { [weak details] pan in
            guard let details, pan.heading(.up) else { return false }
            return details.head.bounds.contains(pan.location(in: details.head))
        }
        fold.maximumNumberOfTouches = 1
        card.addGestureRecognizer(fold)
        details.yieldScroll(to: fold)
        // The card follows its content's height as it is read: on the next
        // turn, never inside the layout pass that measured it. Placed from
        // there, under the glide's animator, the details laid themselves out
        // again inside their own `viewDidLayoutSubviews`, and every pass
        // added UIKit's additive animations until the main thread stalled in
        // `UniqueAnimationKeyForLayer`.
        sizes = details.observe(\.preferredContentSize) { [weak self] _, _ in
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard let self, let card = self.card, let host = card.superview else { return }
                    self.place(card, in: host, animated: true)
                }
            }
        }
        place(card, in: host, animated: false)
        card.layoutIfNeeded()
        // Out of the tab's foot, behind the cut that never moves.
        card.hang.grow()
        // A tap anywhere else closes it, and so does a drag as it begins.
        // Neither is taken from what it lands on (CawPanel `dismissal`):
        // the drag goes on as the drag it is, the transcript scrolling by it,
        // where a tap alone left the card up over the scroll. One on a tab is
        // the tab's to answer; the card's own drags stay inside it.
        let tap = UITapGestureRecognizer(target: self, action: #selector(touchedOutside))
        let drag = UIPanGestureRecognizer(target: self, action: #selector(touchedOutside))
        for recognizer in [tap, drag] as [UIGestureRecognizer] {
            recognizer.cancelsTouchesInView = false
            recognizer.delaysTouchesBegan = false
            recognizer.delaysTouchesEnded = false
            recognizer.delegate = self
            host.addGestureRecognizer(recognizer)
        }
        outside = [tap, drag]
    }

    /// The strip the tab stands in: its pane's own edge, and the flare of its chosen sheet's foot.
    private static func strip(of tab: UIView) -> PaneTabsView? {
        var at = tab.superview
        while let view = at, !(view is PaneTabsView) { at = view.superview }
        return at as? PaneTabsView
    }

    /// Where the card hangs from `tab` in `host` (PaneTabs.svelte `alignFor`,
    /// `flushAt`): its top on the tab's foot; on the desk its leading edge one
    /// flare, one card corner and 4pt before the tab, or flush with the tab
    /// where that would cross the strip's own leading edge; on a phone at the
    /// screen's 12pt margins. Kept `margin` inside the window. Its edge is cut
    /// across the tab's span and its flared foot each side.
    private struct Spot {
        var frame: CGRect
        var neck: HangNeck
        var compact: Bool
        var tab: CGRect
    }

    private func spot(in host: UIView, for tab: UIView, height wanted: CGFloat) -> Spot {
        let box = tab.convert(tab.bounds, to: host)
        let strip = Self.strip(of: tab)
        let flare = strip?.flare ?? Radius.radiusSm
        let compact = host.traitCollection.horizontalSizeClass == .compact
        let safe = host.bounds.inset(by: host.safeAreaInsets)
        let width = compact
            ? safe.width - 2 * Self.margin
            : min(SessionDetailsController.width, safe.width - 2 * Self.margin)
        var x: CGFloat
        var flush = false
        if compact {
            x = safe.minX + Self.margin
        } else {
            let lead = box.minX - (flare + Self.corner + Self.run)
            let pane = strip.map { $0.convert($0.bounds, to: host).minX } ?? safe.minX
            flush = lead < pane
            x = flush ? box.minX : lead
            // Collision: kept inside the window by its margin.
            x = max(safe.minX + Self.margin, min(x, safe.maxX - Self.margin - width))
        }
        let top = box.maxY
        let height = min(wanted, max(120, safe.maxY - Self.margin - top))
        // The tab's span on the card's top edge, kept on it: a tab the strip
        // stands partly past the card's end (scrolled to it) gave a span that
        // ended before it began.
        let neck = HangNeck(start: min(width, max(0, box.minX - x)), end: min(width, max(0, box.maxX - x)),
                            flareStart: flush ? 0 : flare, flareEnd: flare, flush: flush ? .start : nil)
        return Spot(frame: CGRect(x: x, y: top, width: width, height: height), neck: neck, compact: compact, tab: box)
    }

    private func place(_ card: Card, in host: UIView, animated: Bool) {
        guard let anchor, anchor.window != nil, let details else { return }
        let size = details.preferredContentSize
        // As tall as what it holds up to 760pt; before its content has been measured, a first 240pt.
        let spot = spot(in: host, for: anchor, height: size.height > 0 ? min(760, size.height) : 240)
        // Standing there already: nothing to move.
        if card.frame == spot.frame, card.hang.neck == spot.neck { return }
        let box = { (r: CGRect) in String(format: "%.2f %.2f %.2f %.2f", r.minX, r.minY, r.width, r.height) }
        let line = "details hangs: tab \(box(spot.tab)) card \(box(spot.frame)) neck \(String(format: "%.2f %.2f", spot.neck.start, spot.neck.end)) flare \(spot.neck.flareStart) \(spot.neck.flareEnd) flush \(spot.neck.flush == .start ? "start" : "none") compact \(spot.compact)"
        Self.log.notice("\(line, privacy: .public)")
        let apply: @MainActor @Sendable () -> Void = {
            card.hang.openEnd = false
            card.hang.hang(from: spot.neck)
            card.frame = spot.frame
            card.layoutIfNeeded()
        }
        guard animated, !UIAccessibility.isReduceMotionEnabled else { return apply() }
        // The card, its height and the cut glide together (HangCard follows its own size).
        Motion.easeDrawer.animator(Motion.durMorph, animations: apply).startAnimation()
    }

    func close() {
        timer?.cancel()
        sizes = nil
        for recognizer in outside { recognizer.view?.removeGestureRecognizer(recognizer) }
        outside = []
        pinned = false
        openId = nil
        guard let card, let details else { return }
        self.card = nil
        self.details = nil
        // Back up into the tab's foot, then gone.
        card.hang.fold {
            details.willMove(toParent: nil)
            card.removeFromSuperview()
            details.removeFromParent()
        }
    }

    // MARK: Folded by a finger

    /// How far out of the tab the card stood when the finger took it.
    private var pullFrom = 0.0

    /// A swipe up on the head: the card goes back into the tab 1:1 under the
    /// finger; let go, it folds away or settles open on `HangPull`'s rule, on
    /// the house spring at the finger's speed. With less motion, a swipe past
    /// `HangPull.opens` closes it.
    @objc private func folded(_ pan: UIPanGestureRecognizer) {
        guard let card else { return }
        let dy = pan.translation(in: card.superview).y
        let height = card.bounds.height
        if UIAccessibility.isReduceMotionEnabled {
            if pan.state == .ended, dy <= -HangPull.opens { close() }
            return
        }
        switch pan.state {
        case .began:
            timer?.cancel()
            pullFrom = card.hang.revealed
            card.hang.reveal(pullFrom + dy / max(height, 1))
        case .changed:
            card.hang.reveal(pullFrom + dy / max(height, 1))
            #if DEBUG
            let line = String(format: "details fold: finger %.1f foot %.1f height %.1f", dy, card.hang.revealed * height, height)
            Self.log.notice("\(line, privacy: .public)")
            #endif
        case .ended, .cancelled, .failed:
            let velocity = pan.state == .ended ? pan.velocity(in: card.superview).y : 0
            let travel = min(height, max(0, pullFrom * height + (pan.state == .ended ? dy : 0)))
            let stays = HangPull.opens(travel: travel, velocity: velocity, height: height)
            #if DEBUG
            let line = String(format: "details fold release: travel %.1f velocity %.0f height %.1f stays %@", travel, velocity, height, stays ? "yes" : "no")
            Self.log.notice("\(line, privacy: .public)")
            #endif
            if stays {
                card.hang.settle(open: true, velocity: velocity)
            } else {
                finishFold(velocity: velocity)
            }
        default:
            break
        }
    }

    /// Let go short: on the house spring back into the tab, then gone.
    private func finishFold(velocity: Double) {
        guard let card, let details else { return }
        timer?.cancel()
        sizes = nil
        for recognizer in outside { recognizer.view?.removeGestureRecognizer(recognizer) }
        outside = []
        pinned = false
        openId = nil
        self.card = nil
        self.details = nil
        card.hang.settle(open: false, velocity: velocity) {
            details.willMove(toParent: nil)
            card.removeFromSuperview()
            details.removeFromParent()
        }
    }

    /// The tap once it is recognised, the drag as it begins: either closes the card.
    @objc private func touchedOutside() {
        close()
    }

    func gestureRecognizer(_ recognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard outside.contains(where: { $0 === recognizer }), let card else { return true }
        // Not the card's own touches, and not a tab's: the tab answers for itself.
        var view = touch.view
        while let here = view {
            if here === card || here is TabView { return false }
            view = here.superview
        }
        return true
    }

    func gestureRecognizer(_: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer) -> Bool { true }

    #if DEBUG
    /// A probe's reading of the open card: where it hangs against its tab
    /// (window points), how far out of the tab it is drawn, and its surfaces.
    func probeReading() -> String {
        guard let card, let anchor, let details, let window = card.window else { return "details not open" }
        let tab = anchor.convert(anchor.bounds, to: window)
        let drawn = card.convert(card.bounds, to: window)
        let neck = card.hang.neck
        let flare = Self.strip(of: anchor)?.flare ?? Radius.radiusSm
        let expected = neck.flush == .start ? tab.minX : tab.minX - (flare + Self.corner + Self.run)
        let compact = window.traitCollection.horizontalSizeClass == .compact
        let lead = compact ? drawn.minX - window.safeAreaInsets.left : drawn.minX
        let want = compact ? Self.margin : expected
        return String(format: "details tab x %.1f y %.1f w %.1f foot %.1f card x %.1f y %.1f w %.1f h %.1f; top on the tab's foot %@ (gap %.2f); leading (%@) %.2f want %.2f %@; trailing margin %.2f; neck span %.1f tab span %.1f; revealed %.2f; ",
                      tab.minX, tab.minY, tab.width, tab.maxY, drawn.minX, drawn.minY, drawn.width, drawn.height,
                      abs(drawn.minY - tab.maxY) < 0.5 ? "true" : "false", drawn.minY - tab.maxY,
                      compact ? "phone margin" : (neck.flush == .start ? "flush with the tab" : "flare+corner+4 before the tab"),
                      lead, want, abs(lead - want) < 0.5 ? "true" : "false",
                      window.bounds.maxX - window.safeAreaInsets.right - drawn.maxX,
                      neck.end - neck.start, tab.width, card.hang.revealed)
            + details.surfacesReading()
    }
    #endif

    /// The card: a `HangCard` hung from its tab, its content on the card's surface clipped to its corners.
    private final class Card: UIView {
        var onHold: () -> Void = {}
        var onRelease: () -> Void = {}
        var onPress: () -> Void = {}
        let hang = HangCard()

        init() {
            super.init(frame: .zero)
            hang.frame = bounds
            hang.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            hang.accessibilityContainerType = .semanticGroup
            hang.accessibilityLabel = "Session details"
            addSubview(hang)
            addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            fatalError("Card is built in code")
        }

        func hold(_ content: UIView) {
            content.frame = hang.content.bounds
            content.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            content.translatesAutoresizingMaskIntoConstraints = true
            hang.content.addSubview(content)
        }

        @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
            switch hover.state {
            case .began: onHold()
            case .ended, .cancelled, .failed: onRelease()
            default: break
            }
        }

        override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
            let hit = super.hitTest(point, with: event)
            if hit != nil, event?.type == .touches { onPress() }
            return hit
        }
    }
}
