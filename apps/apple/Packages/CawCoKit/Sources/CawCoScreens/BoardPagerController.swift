import CawCoCore
import CawCoDesign
import UIKit

/// Both board panes stay mounted. Horizontal paging belongs to this scroll
/// view; each pane's collection view owns its vertical scroll and disclosure.
final class BoardPagerController: UIViewController, UIScrollViewDelegate {
    private let home: HomeModel
    private let scroll = UIScrollView()
    private let panes: [HomeViewController]
    var onOpen: (String) -> Void = { _ in }
    var onSelection: (HomeModel.Tab) -> Void = { _ in }
    private var width = 0.0
    private var backPriority: BackGesturePriority?

    init(hub: HubConnection, home: HomeModel) {
        self.home = home
        panes = HomeModel.Tab.allCases.map { HomeViewController(hub: hub, home: home, tab: $0) }
        super.init(nibName: nil, bundle: nil)
        for pane in panes {
            pane.onOpen = { [weak self] id in self?.onOpen(id) }
            pane.onSelectTab = { [weak self] tab in self?.select(tab, animated: true) }
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("BoardPagerController is built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        scroll.isPagingEnabled = true
        scroll.alwaysBounceHorizontal = true
        scroll.showsHorizontalScrollIndicator = false
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.isDirectionalLockEnabled = true
        scroll.delegate = self
        scroll.accessibilityIdentifier = "board-pager"
        scroll.frame = view.bounds
        scroll.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(scroll)
        for pane in panes {
            addChild(pane)
            scroll.addSubview(pane.view)
            pane.didMove(toParent: self)
        }
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        navigationController?.setToolbarHidden(true, animated: animated)
        if #available(iOS 26.0, macCatalyst 26.0, *),
           let recognizer = navigationController?.interactiveContentPopGestureRecognizer {
            if backPriority == nil || recognizer.delegate !== backPriority {
                let priority = BackGesturePriority(pager: scroll, original: recognizer.delegate)
                recognizer.delegate = priority
                backPriority = priority
            }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let next = scroll.bounds.width
        guard next > 0 else { return }
        for (i, pane) in panes.enumerated() {
            pane.view.frame = CGRect(x: Double(i) * next, y: 0, width: next, height: scroll.bounds.height)
        }
        scroll.contentSize = CGSize(width: next * Double(panes.count), height: scroll.bounds.height)
        if width != next {
            width = next
            scroll.setContentOffset(CGPoint(x: Double(index(home.tab)) * next, y: 0), animated: false)
        }
    }

    func select(_ tab: HomeModel.Tab, animated: Bool) {
        home.tab = tab
        loadViewIfNeeded()
        view.layoutIfNeeded()
        let target = CGPoint(x: Double(index(tab)) * scroll.bounds.width, y: 0)
        scroll.setContentOffset(target, animated: animated && !UIAccessibility.isReduceMotionEnabled)
        if !animated || UIAccessibility.isReduceMotionEnabled { onSelection(tab) }
    }

    private func index(_ tab: HomeModel.Tab) -> Int { tab == .working ? 0 : 1 }

    private func settled() {
        guard scroll.bounds.width > 0 else { return }
        let index = min(panes.count - 1, max(0, Int((scroll.contentOffset.x / scroll.bounds.width).rounded())))
        home.tab = HomeModel.Tab.allCases[index]
        home.holding = false
        onSelection(home.tab)
    }

    func scrollViewWillBeginDragging(_ scrollView: UIScrollView) { home.holding = true }
    func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) { settled() }
    func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) { settled() }
    func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
        if !decelerate { settled() }
    }

    /// The navigation controller keeps its own begin rule. On the first
    /// board tab, its content-pop gesture is a dynamic failure requirement
    /// for the pager; no system edge is deferred and no recognizer is replaced.
    private final class BackGesturePriority: NSObject, UIGestureRecognizerDelegate {
        private weak var pager: UIScrollView?
        private weak var original: (any UIGestureRecognizerDelegate)?
        init(pager: UIScrollView, original: (any UIGestureRecognizerDelegate)?) {
            self.pager = pager
            self.original = original
        }
        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            original?.gestureRecognizerShouldBegin?(gestureRecognizer) ?? true
        }
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
            if other === pager?.panGestureRecognizer, (pager?.contentOffset.x ?? 0) <= 0 { return true }
            return original?.gestureRecognizer?(gestureRecognizer, shouldBeRequiredToFailBy: other) ?? false
        }
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            original?.gestureRecognizer?(gestureRecognizer, shouldRecognizeSimultaneouslyWith: other) ?? false
        }
    }
}
