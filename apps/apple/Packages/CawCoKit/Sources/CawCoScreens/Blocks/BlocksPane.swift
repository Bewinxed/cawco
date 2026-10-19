import CawCoDesign
import UIKit

/// A task view's page once a view is placed beside its view (routes/project/[id]
/// `framed`): its page of blocks, scrolling in the pane, inside the page's
/// gutters; the board's block fills the pane's height less its head, the
/// views placed after it below.
final class BlocksPane: UIView {
    private let scroll = UIScrollView()
    private let holder = UIView()
    private var shown: BlockPageView?
    private var edges: [NSLayoutConstraint] = []

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = true
        scroll.translatesAutoresizingMaskIntoConstraints = false
        addSubview(scroll)
        holder.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(holder)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: topAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            holder.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            holder.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space6),
        ])
        #if DEBUG
        // Under the probe, who moves the page and to where: the frames that asked.
        if ViewsProbe.on {
            scrolled = scroll.observe(\.contentOffset, options: [.old, .new]) { _, change in
                guard let was = change.oldValue?.y, let now = change.newValue?.y, abs(now - was) > 40 else { return }
                let asked = Thread.callStackSymbols.dropFirst(2).prefix(14).map { $0.split(separator: " ", omittingEmptySubsequences: true).dropFirst(3).prefix(1).joined() }
                MainActor.assumeIsolated { ViewsProbe.say("blocks scrolled \(Int(was))->\(Int(now)) by \(asked.joined(separator: "<"))") }
            }
        }
        #endif
    }

    #if DEBUG
    private var scrolled: NSKeyValueObservation?
    #endif

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("BlocksPane is built in code")
    }

    /// The page's gutters.
    func inset(leading: Double, trailing: Double) {
        NSLayoutConstraint.deactivate(edges)
        edges = [
            holder.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: leading),
            holder.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -trailing),
        ]
        NSLayoutConstraint.activate(edges)
    }

    /// The page, with every block it can draw now.
    func show(_ page: BlockPageView, items: [String: BlockItem]) {
        if shown !== page {
            shown?.removeFromSuperview()
            holder.addSubview(page)
            NSLayoutConstraint.activate([
                page.topAnchor.constraint(equalTo: holder.topAnchor),
                page.bottomAnchor.constraint(equalTo: holder.bottomAnchor),
                page.leadingAnchor.constraint(equalTo: holder.leadingAnchor),
                page.trailingAnchor.constraint(equalTo: holder.trailingAnchor),
            ])
            shown = page
        }
        page.fill = fill
        page.show(items)
    }

    /// The pane's height less the page's foot: what the board's block fills (`--block-fill`).
    private var fill: Double { max(0, scroll.bounds.height - Space.space6) }

    override func layoutSubviews() {
        super.layoutSubviews()
        shown?.fill = fill
    }
}
