import CawCoCore
import CawCoDesign
import UIKit

/// A group's session details as its tabs host them (PaneTabs.svelte): one
/// card hung under a tab, opened by resting a pointer on the tab for 350ms
/// and let go 250ms after the pointer leaves both the tab and the card, or
/// pinned by a click (the chosen tab, its chevron, the menu's Session
/// details), when it stays until it is closed, a click lands outside it, or
/// the same tab is clicked again. While it is open, another tab takes it
/// rather than reopening it: the card glides there over `durMorph` on the
/// drawer curve and its content is nudged in from the side it moved toward.
/// A pointer on the card holds it; a press in it pins it. The card is not
/// modal, so the tabs under the pointer still answer. On a compact width
/// there is no card: the details are the house sheet on its edge.
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
    private var outside: UITapGestureRecognizer?
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
    private static let offset = 6.0
    private static let edge = 12.0

    init(panes: PaneHost, presenter: UIViewController) {
        self.panes = panes
        self.presenter = presenter
    }

    var isOpen: Bool { openId != nil }

    // MARK: What the tabs say

    /// A pointer rests on a tab.
    func hover(_ id: String, tab: UIView) {
        guard !pinned, !menuOpen, regular else { return }
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

    /// A tab was clicked: the chosen one opens its details pinned, or closes
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

    /// The chevron, or the menu's Session details.
    func pin(_ id: String, tab: UIView?) {
        show(id, from: tab, pin: true)
    }

    // MARK: The card

    private var regular: Bool { presenter?.traitCollection.horizontalSizeClass == .regular }

    private func show(_ id: String, from tab: UIView?, pin: Bool) {
        // A workflow run's tab is its own details: it has no session card.
        guard BoardRun.runId(of: id) == nil, let presenter else { return }
        // The card stands over the whole window, so the controller in it belongs
        // to the one whose view holds it.
        let owner = presenter.view.window?.rootViewController ?? presenter
        let host: UIView = owner.view
        timer?.cancel()
        guard regular, let tab else {
            close()
            panes.showDetails(id, from: presenter)
            return
        }
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
        // The card follows its content's height as it is read.
        sizes = details.observe(\.preferredContentSize) { [weak self] _, _ in
            MainActor.assumeIsolated {
                guard let self, let card = self.card, let host = card.superview else { return }
                self.place(card, in: host, animated: true)
            }
        }
        place(card, in: host, animated: false)
        // `.kit-pop`'s own entrance, from the tab.
        let entrance = KitPopover.Entrance.standard
        card.alpha = 0
        if !UIAccessibility.isReduceMotionEnabled {
            card.transform = CGAffineTransform(translationX: 0, y: -entrance.rise).scaledBy(x: entrance.scale, y: entrance.scale)
        }
        entrance.curve.animator(entrance.duration) {
            card.alpha = 1
            card.transform = .identity
        }.startAnimation()
        // A click anywhere else closes it; one on a tab is the tab's to answer.
        let tap = UITapGestureRecognizer(target: self, action: #selector(tappedOutside(_:)))
        tap.cancelsTouchesInView = false
        tap.delegate = self
        host.addGestureRecognizer(tap)
        outside = tap
    }

    /// Under its tab, starting at the tab's start, kept 12pt inside the window.
    private func place(_ card: Card, in host: UIView, animated: Bool) {
        guard let anchor, anchor.window != nil, let details else { return }
        let from = anchor.convert(anchor.bounds, to: host)
        let size = details.preferredContentSize
        let safe = host.bounds.inset(by: host.safeAreaInsets).insetBy(dx: Self.edge, dy: Self.edge)
        // `.session-details-popover`: 416pt wide, as tall as what it holds up to
        // 760pt; before its content has been measured, a first 240pt.
        let width = min(SessionDetailsController.width, safe.width)
        let y = from.maxY + Self.offset
        let height = min(size.height > 0 ? min(760, size.height) : 240, max(120, safe.maxY - y))
        let frame = CGRect(x: max(safe.minX, min(from.minX, safe.maxX - width)), y: y, width: width, height: height)
        let apply: @MainActor @Sendable () -> Void = {
            // Through bounds and centre: an entrance still in flight keeps its transform.
            card.bounds = CGRect(origin: .zero, size: frame.size)
            card.center = CGPoint(x: frame.midX, y: frame.midY)
            card.layoutIfNeeded()
        }
        guard animated, !UIAccessibility.isReduceMotionEnabled else { return apply() }
        Motion.easeDrawer.animator(Motion.durMorph, animations: apply).startAnimation()
    }

    func close() {
        timer?.cancel()
        sizes = nil
        if let outside { outside.view?.removeGestureRecognizer(outside) }
        outside = nil
        pinned = false
        openId = nil
        guard let card, let details else { return }
        self.card = nil
        self.details = nil
        let fade = Motion.easeOut.animator(Motion.durExit) { card.alpha = 0 }
        fade.addCompletion { _ in
            details.willMove(toParent: nil)
            card.removeFromSuperview()
            details.removeFromParent()
        }
        fade.startAnimation()
    }

    @objc private func tappedOutside(_ tap: UITapGestureRecognizer) {
        close()
    }

    func gestureRecognizer(_ recognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard recognizer === outside, let card else { return true }
        // Not the card's own touches, and not a tab's: the tab answers for itself.
        var view = touch.view
        while let here = view {
            if here === card || here is TabView { return false }
            view = here.superview
        }
        return true
    }

    func gestureRecognizer(_: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer) -> Bool { true }

    /// The card: a floating surface (`.kit-pop`), its content clipped to its corners.
    private final class Card: UIView {
        var onHold: () -> Void = {}
        var onRelease: () -> Void = {}
        var onPress: () -> Void = {}
        private let clip = UIView()

        init() {
            super.init(frame: .zero)
            backgroundColor = Palette.surfaceRaised
            layer.cornerRadius = Radius.radiusLg
            layer.cornerCurve = .continuous
            layer.borderWidth = 1
            boxShadow = Shadow.shadowOverlay
            clip.layer.cornerRadius = Radius.radiusLg
            clip.layer.cornerCurve = .continuous
            clip.clipsToBounds = true
            clip.frame = bounds
            clip.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            addSubview(clip)
            addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
            registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (card: Card, _: UITraitCollection) in card.paint() }
            paint()
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            fatalError("Card is built in code")
        }

        private func paint() {
            layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
        }

        func hold(_ content: UIView) {
            content.frame = clip.bounds
            content.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            content.translatesAutoresizingMaskIntoConstraints = true
            clip.addSubview(content)
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
