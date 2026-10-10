import UIKit

/// A transcript's head dissolving under the tab strip (HeadFade.svelte): rows
/// scrolled up past the transcript's top edge fade out over `Size.cHeadFade`
/// instead of meeting the tab's rim edge-on, so the tab and its pane read as
/// one shape. Laid over the list, not a mask on it, so nothing the transcript
/// stands over its rows fades with them.
///
/// Scrolled to the very top there is nothing under it and it is clear; it
/// comes in over the first `Size.cHeadFade` of scroll, read off the offset
/// past the adjusted inset as `EdgeFade` reads it.
@MainActor
public final class HeadFade: UIView {
    /// The stops follow `Motion.cHeadFadeCurve`, cubic-bezier(0.42, 0, 0.58, 1),
    /// sampled at 13 points from 0 to 1 (alpha = 1 - curve(i / 12)): an eased
    /// gradient (larsenwork.com/easing-gradients) leaves no hard band where a
    /// two-stop one starts and ends. HeadFade.svelte carries the same list.
    static let alphas: [Double] = [
        1, 0.9864, 0.9439, 0.8708, 0.7682, 0.6412, 0.5, 0.3588, 0.2318, 0.1292, 0.0561, 0.0136, 0,
    ]

    override public class var layerClass: AnyClass { CAGradientLayer.self }

    private weak var scroll: UIScrollView?
    private var watching: [NSKeyValueObservation] = []

    public init(_ scroll: UIScrollView) {
        self.scroll = scroll
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = false
        alpha = 0
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (fade: HeadFade, _: UITraitCollection) in fade.paint() }
        paint()
        // The offset and the box each move what sits under the edge.
        watching = [
            scroll.observe(\.contentOffset) { [weak self] _, _ in MainActor.assumeIsolated { self?.follow() } },
            scroll.observe(\.bounds) { [weak self] _, _ in MainActor.assumeIsolated { self?.follow() } },
        ]
        follow()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("HeadFade is built in code") }

    /// Its height, for the host pinning it to the transcript's top edge.
    public static let height = Size.cHeadFade

    private func paint() {
        guard let gradient = layer as? CAGradientLayer else { return }
        let recess = Palette.surfaceRecess.resolvedColor(with: traitCollection)
        let last = Double(Self.alphas.count - 1)
        gradient.colors = Self.alphas.map { recess.withAlphaComponent($0).cgColor }
        gradient.locations = Self.alphas.indices.map { NSNumber(value: Double($0) / last) }
    }

    private func follow() {
        guard let scroll else { return }
        let under = scroll.contentOffset.y + scroll.adjustedContentInset.top
        alpha = min(1, max(0, under / Size.cHeadFade))
    }
}
