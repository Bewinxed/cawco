import CawCoDesign
import UIKit

/// A group's one composer (PaneLeaf.svelte `.dock`): outside the panes, so a
/// tab switch or a swipe moves only the transcript and the box being typed
/// in stays put, focus and keyboard with it. It stands 11pt from each edge
/// and 7pt over the keyboard or the home indicator, on the 96pt recess fade,
/// and draws whichever conversation is the active tab.
///
/// On the Duo it stands clear of the fold, displaced and never hidden.
@MainActor
final class ComposerDock {
    let composer = ComposerView()
    private let fade = RecessFade()
    private unowned let host: UIView
    private let leading: NSLayoutConstraint
    private let trailing: NSLayoutConstraint
    private let bottom: NSLayoutConstraint
    /// The fade's foot on the keyboard's top. With no keyboard that top is
    /// the safe area's foot, so the fade stands that inset lower: Composer.svelte
    /// `.fade` is `bottom: 0` of the pane, under the home indicator too.
    private let footFollow: NSLayoutConstraint

    /// How far up from the host's foot the composer reaches; the panes keep
    /// their last line clear of it.
    private(set) var inset: CGFloat = 0
    var onInset: (CGFloat) -> Void = { _ in }

    /// A swipe is carrying the conversation.
    var held: Bool {
        get { composer.held }
        set { composer.held = newValue }
    }

    /// Installs the dock in `host`, never above `top`.
    init(in host: UIView, below top: NSLayoutYAxisAnchor) {
        self.host = host
        host.addSubview(fade)
        host.addSubview(composer)
        let safe = host.safeAreaLayoutGuide
        leading = composer.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: Space.space3)
        trailing = composer.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -Space.space3)
        bottom = composer.bottomAnchor.constraint(equalTo: host.keyboardLayoutGuide.topAnchor, constant: -Space.space2)
        // The fade stands on the host's foot: the keyboard's top while it is up.
        let foot = UILayoutGuide()
        host.addLayoutGuide(foot)
        footFollow = foot.topAnchor.constraint(equalTo: host.keyboardLayoutGuide.topAnchor)
        footFollow.priority = .defaultHigh
        NSLayoutConstraint.activate([
            footFollow,
            foot.topAnchor.constraint(lessThanOrEqualTo: host.bottomAnchor),
            foot.heightAnchor.constraint(equalToConstant: 0),
            foot.leadingAnchor.constraint(equalTo: host.leadingAnchor),
            foot.trailingAnchor.constraint(equalTo: host.trailingAnchor),
            fade.leadingAnchor.constraint(equalTo: host.leadingAnchor),
            fade.trailingAnchor.constraint(equalTo: host.trailingAnchor),
            fade.bottomAnchor.constraint(equalTo: foot.topAnchor),
            fade.heightAnchor.constraint(equalToConstant: RecessFade.height),
            composer.topAnchor.constraint(greaterThanOrEqualTo: top, constant: Space.space3),
            leading, trailing, bottom,
        ])
        composer.onHeight = { [weak host] in host?.setNeedsLayout() }
        show(false)
    }

    /// Draws the active tab's conversation, or nothing for a tab that can't
    /// be written to (a run) or no tab at all.
    func bind(_ binding: SessionComposerBinding?, direction: Int, landing: TimeInterval) {
        composer.bind(binding, direction: direction, landing: landing)
        show(binding != nil)
    }

    private func show(_ shown: Bool) {
        composer.isHidden = !shown
        fade.isHidden = !shown
        host.setNeedsLayout()
    }

    /// Call from the host's `viewDidLayoutSubviews`.
    func layout() {
        avoidFold()
        let keyboardUp = host.keyboardLayoutGuide.layoutFrame.minY < host.bounds.maxY - host.safeAreaInsets.bottom - 1
        let below = keyboardUp ? 0 : host.safeAreaInsets.bottom
        if footFollow.constant != below { footFollow.constant = below }
        let reach = composer.isHidden ? 0 : max(0, host.bounds.maxY - composer.frame.minY)
        guard abs(reach - inset) > 0.5 else { return }
        inset = reach
        onInset(reach)
    }

    /// Duo: the composer stands clear of the fold, displaced, never hidden.
    private func avoidFold() {
        var lead = Space.space3
        var trail = -Space.space3
        var foot = -Space.space2
        if #available(iOS 27.1, macCatalyst 27.1, *) {
            let safe = host.bounds.inset(by: host.safeAreaInsets)
            let keyboardTop = host.keyboardLayoutGuide.layoutFrame.minY
            let normal = CGRect(x: safe.minX + Space.space3, y: keyboardTop - Space.space2 - composer.bounds.height,
                                width: max(0, safe.width - Space.space3 * 2), height: composer.bounds.height)
            // Test the undisplaced pose, not the previous layout's displaced
            // frame; otherwise avoidance would toggle on and off every pass.
            for region in host.reservedRegions(kind: .division) where region.isActive && normal.intersects(region.frame) {
                let fold = region.frame // Includes the system's interactive-content margins.
                if fold.height > fold.width {
                    let before = fold.minX - safe.minX
                    let after = safe.maxX - fold.maxX
                    if after >= before { lead = max(lead, fold.maxX - safe.minX + Space.space3) }
                    else { trail = min(trail, fold.minX - safe.maxX - Space.space3) }
                } else {
                    foot = min(foot, fold.minY - keyboardTop - Space.space3)
                }
            }
        }
        if leading.constant != lead { leading.constant = lead }
        if trailing.constant != trail { trailing.constant = trail }
        if bottom.constant != foot { bottom.constant = foot }
    }
}
