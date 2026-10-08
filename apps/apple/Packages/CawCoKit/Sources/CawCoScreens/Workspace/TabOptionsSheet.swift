import CawCoDesign
import UIKit

/// A tab's options pulled down off the tab by a finger (PaneTabs.svelte
/// `pullMenu`): the same sections its long press's context menu shows
/// (`TabAction`), Close among them, on the kit's floating surface. It hangs
/// from the tab's foot, cut there, and comes down under the finger 1:1;
/// past fully out a third of the travel shows, no more than a fifth of it.
/// Let go past `opens` (carried along its speed) and it settles open on the
/// house spring (`durSettle`, no bounce); short of it, it goes back up under
/// the tab and is gone. A tap outside, Escape, or an option closes it. With
/// less motion it simply opens once the pull passes `opens`.
final class TabOptionsSheet: UIView {
    /// How far a finger pulls before the sheet stays out, pt.
    static let opens = 24.0
    /// How far a release is carried along its speed, s (as the Caw drawer's).
    static let project = 0.099
    static let resist = 0.35
    static let resistMax = 0.2

    /// The sheet has gone, by an option, a tap outside, or a pull let go short.
    var onGone: () -> Void = {}

    /// Cut at the tab's foot: the card slides out from under it.
    private let holder = UIView()
    private let card = UIView()
    private let list = UIStackView()
    private var height = 0.0
    private var progress = 0.0
    private var settling: UIViewPropertyAnimator?
    private var gone = false

    init(sections: [[TabAction]], under tab: UIView, in host: UIView) {
        super.init(frame: host.bounds)
        autoresizingMask = [.flexibleWidth, .flexibleHeight]
        let foot = tab.convert(tab.bounds, to: host)
        holder.frame = CGRect(x: 0, y: foot.maxY, width: host.bounds.width, height: max(0, host.bounds.height - foot.maxY))
        holder.clipsToBounds = true
        addSubview(holder)
        card.backgroundColor = Palette.surfaceRaised
        card.layer.cornerRadius = Radius.radiusLg
        card.layer.cornerCurve = .continuous
        card.layer.borderWidth = 1
        card.boxShadow = Shadow.shadowOverlay
        holder.addSubview(card)
        list.axis = .vertical
        list.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(list)
        NSLayoutConstraint.activate([
            list.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 6),
            list.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -6),
            list.topAnchor.constraint(equalTo: card.topAnchor, constant: 6),
            list.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -6),
        ])
        for (index, section) in sections.enumerated() {
            if index > 0 { list.addArrangedSubview(separator()) }
            for action in section { list.addArrangedSubview(row(action)) }
        }
        let size = list.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
        let width = min(280, max(200, size.width + 12))
        height = size.height + 12
        let x = min(max(8, foot.minX), host.bounds.width - width - 8)
        card.frame = CGRect(x: x, y: 0, width: width, height: height)
        card.layer.borderColor = Palette.borderControl.resolvedColor(with: host.traitCollection).cgColor
        card.accessibilityViewIsModal = true
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(outside(_:))))
        host.addSubview(self)
        draw(0)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TabOptionsSheet is built in code")
    }

    private func separator() -> UIView {
        let line = UIView()
        line.backgroundColor = Palette.borderHairline
        line.translatesAutoresizingMaskIntoConstraints = false
        let wrap = UIView()
        wrap.addSubview(line)
        NSLayoutConstraint.activate([
            wrap.heightAnchor.constraint(equalToConstant: 13),
            line.heightAnchor.constraint(equalToConstant: 1),
            line.centerYAnchor.constraint(equalTo: wrap.centerYAnchor),
            line.leadingAnchor.constraint(equalTo: wrap.leadingAnchor, constant: 6),
            line.trailingAnchor.constraint(equalTo: wrap.trailingAnchor, constant: -6),
        ])
        return wrap
    }

    /// An option, a kit menu item: 44pt, the label role in strong ink.
    private func row(_ action: TabAction) -> UIView {
        var config = UIButton.Configuration.plain()
        config.title = action.title
        config.image = action.glyph?.image.resized(to: Size.iconMd)
        config.imagePadding = Space.space2
        config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.inkMuted }
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var out = attributes
            out.font = TypeScale.typeLabel.font
            out.foregroundColor = action.disabled ? Palette.inkMuted : Palette.inkStrong
            return out
        }
        config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: Space.space3, bottom: 0, trailing: Space.space3)
        config.background.cornerRadius = Radius.radiusSm
        let button = UIButton(configuration: config)
        button.contentHorizontalAlignment = .leading
        button.isEnabled = !action.disabled
        button.heightAnchor.constraint(equalToConstant: 44).isActive = true
        button.addAction(UIAction { [weak self] _ in
            self?.dismiss()
            action.run()
        }, for: .primaryActionTriggered)
        return button
    }

    /// Draws the card `at` of the way out of the tab's foot: 0 under it, 1 out.
    private func draw(_ at: Double) {
        progress = at
        let hidden = (1 - min(max(at, 0), 1)) * height
        let stretch = min(max(0, at - 1) * height * Self.resist, height * Self.resistMax)
        card.transform = CGAffineTransform(translationX: 0, y: stretch - hidden)
    }

    /// The finger's travel down from where it pressed.
    func pull(_ dy: Double) {
        settling?.stopAnimation(true)
        settling = nil
        guard !UIAccessibility.isReduceMotionEnabled else {
            if dy >= Self.opens, progress < 1 { open() }
            return
        }
        draw(dy / max(1, height))
    }

    /// Let go, at `velocity` pt/s down: open if it was heading past `opens`.
    func release(_ dy: Double, velocity: Double) {
        if UIAccessibility.isReduceMotionEnabled {
            if progress < 1 { dismiss() }
            return
        }
        if dy + velocity * Self.project >= Self.opens {
            settle(to: 1, velocity: velocity)
            UIAccessibility.post(notification: .screenChanged, argument: list.arrangedSubviews.first)
        } else {
            settle(to: 0, velocity: velocity)
        }
    }

    private func open() {
        draw(1)
        UIAccessibility.post(notification: .screenChanged, argument: list.arrangedSubviews.first)
    }

    /// Back up under the tab, then gone; with less motion, gone at once.
    func dismiss() {
        guard !gone else { return }
        if UIAccessibility.isReduceMotionEnabled || window == nil {
            finish()
        } else {
            settle(to: 0, velocity: 0)
        }
    }

    /// On the house spring from where it is drawn to `target`, leaving at `velocity` pt/s.
    private func settle(to target: Double, velocity: Double) {
        settling?.stopAnimation(true)
        let distance = (target - progress) * height
        let initial = abs(distance) > 0.5 ? velocity / distance : 0
        let spring = UISpringTimingParameters(duration: Motion.durSettle, bounce: 0, initialVelocity: CGVector(dx: 0, dy: initial))
        let animator = UIViewPropertyAnimator(duration: Motion.durSettle, timingParameters: spring)
        animator.addAnimations { self.draw(target) }
        animator.addCompletion { [weak self] _ in
            guard let self else { return }
            settling = nil
            if target == 0 { finish() }
        }
        settling = animator
        animator.startAnimation()
    }

    private func finish() {
        guard !gone else { return }
        gone = true
        removeFromSuperview()
        onGone()
    }

    @objc private func outside(_ tap: UITapGestureRecognizer) {
        let onCard = card.convert(card.bounds, to: self).contains(tap.location(in: self))
        if !onCard { dismiss() }
    }

    override func accessibilityPerformEscape() -> Bool {
        dismiss()
        return true
    }
}
