import UIKit

/// The kit's edge fade for a vertical scroller (app.css `.kit-edge-fade-block`):
/// at an edge the content goes on past, it fades out over `--fade-len` (16pt
/// on a screen under 640pt, 40 wider), never further than it goes on; at an
/// edge it ends on, it stands sharp. A row cut by the scroller's edge reads
/// as more to scroll to, not as clipped. An alpha mask: the content itself
/// goes out toward the edge, and nothing is painted over it.
@MainActor
public final class EdgeFade {
    /// The scroller's edges a fade stands at.
    public struct Edges: OptionSet, Sendable {
        public let rawValue: Int
        public init(rawValue: Int) { self.rawValue = rawValue }
        public static let top = Edges(rawValue: 1)
        public static let bottom = Edges(rawValue: 2)
        public static let both: Edges = [.top, .bottom]
    }

    private weak var scroll: UIScrollView?
    private let mask = CAGradientLayer()
    private var watching: [NSKeyValueObservation] = []
    /// A length set by the place (`--fade-len` on the element); nil: the kit's by width.
    private let length: Double?
    private let edges: Edges

    /// `length`: a fixed fade length, for a place whose foot must read as
    /// "more below" on every width (Caw's panel, 40pt). `edges`: where it
    /// fades; a transcript's head fades at its top alone, its foot standing
    /// sharp over the composer.
    public init(_ scroll: UIScrollView, length: Double? = nil, edges: Edges = .both) {
        self.scroll = scroll
        self.length = length
        self.edges = edges
        mask.startPoint = CGPoint(x: 0.5, y: 0)
        mask.endPoint = CGPoint(x: 0.5, y: 1)
        mask.colors = [UIColor.clear.cgColor, UIColor.black.cgColor, UIColor.black.cgColor, UIColor.clear.cgColor]
        scroll.layer.mask = mask
        // The offset, the box and the content each move an edge.
        watching = [
            scroll.observe(\.contentOffset) { [weak self] _, _ in MainActor.assumeIsolated { self?.place() } },
            scroll.observe(\.bounds) { [weak self] _, _ in MainActor.assumeIsolated { self?.place() } },
            scroll.observe(\.contentSize) { [weak self] _, _ in MainActor.assumeIsolated { self?.place() } },
        ]
        place()
    }

    private func place() {
        guard let scroll else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        // The mask stands in the scroller's own space, which scrolls: it follows the bounds.
        mask.frame = scroll.bounds
        let height = scroll.bounds.height
        if height > 0 {
            let screen = scroll.window?.bounds.width ?? scroll.bounds.width
            let length = self.length ?? (screen < 640 ? 16.0 : 40.0)
            let inset = scroll.adjustedContentInset
            let above = edges.contains(.top) ? max(0, scroll.contentOffset.y + inset.top) : 0
            let below = edges.contains(.bottom) ? max(0, scroll.contentSize.height + inset.bottom - scroll.contentOffset.y - height) : 0
            let top = min(length, above) / height
            let bottom = min(length, below) / height
            mask.locations = [0, NSNumber(value: top), NSNumber(value: 1 - bottom), 1]
        }
        CATransaction.commit()
    }
}
