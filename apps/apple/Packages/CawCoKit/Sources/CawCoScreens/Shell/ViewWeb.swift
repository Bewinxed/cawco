import CawCoCore
import CawCoDesign
import UIKit
import WebKit

/// A project's custom view as the dashboard draws it (PRD §5.2: OpenUI has
/// no Swift renderer): its chromeless route `/project/<id>/view/<name>` in
/// a web view, at the address the hub gives for the dashboard (`/health`
/// `dashboard`), with the person's pass, as a paired browser has it; its
/// data are the route's own same-origin reads, which the dashboard hands to
/// the hub. A task tapped in it opens the app's task sheet: the route posts
/// `cawco:open-task` to the `cawco` handler here, and a link to the
/// project's page on a task is taken the same way; a link to a file of the
/// project's folder (the page's `?file=`) opens the app's file sheet;
/// nothing else leaves the route. Its own data store, so nothing the dashboard keeps in a browser
/// (its theme, its rail) reaches here. The view's tab (ProjectViewPane) and
/// a view placed on a page as a block (ViewBlockView) both draw it so.
///
/// As a block the route stands at its content's height: the page around it
/// scrolls, its own padding and full-height floor give way to the block's
/// frame (`viewBody` in routes/project/[id] draws ViewOpenUi bare), and it
/// says its height as it changes.
@MainActor
final class ViewWeb: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    var onOpenTask: (String) -> Void = { _ in }
    /// A link to a file of the project's folder, by its path.
    var onOpenFile: (String) -> Void = { _ in }
    /// The route has loaded.
    var onLoaded: () -> Void = {}
    /// It didn't open: the reason, in words.
    var onFailed: (String) -> Void = { _ in }
    /// As a block, the route's height as it changes.
    var onHeight: (Double) -> Void = { _ in }

    let web: WKWebView
    private let hub: HubConnection
    private(set) var loaded: URL?
    private var projectId = ""
    private var name = ""
    /// The dashboard's address, once the hub has said it.
    private var dashboard: URL?

    /// It draws a block on a page, at its content's height, not a tab's pane.
    private let block: Bool

    init(hub: HubConnection, block: Bool) {
        self.hub = hub
        self.block = block
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        if block {
            configuration.userContentController.addUserScript(WKUserScript(source: Self.blockScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        web = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        configuration.userContentController.add(WeakMessages(self), name: "cawco")
        web.navigationDelegate = self
        web.isOpaque = false
        web.backgroundColor = Palette.surfaceRecess
        web.allowsLinkPreview = false
        // The route pads itself by the safe area (`--safe-bottom`).
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.translatesAutoresizingMaskIntoConstraints = false
        web.isInspectable = true
        if block {
            // The page scrolls; the block stands at the route's height.
            web.scrollView.isScrollEnabled = false
            web.backgroundColor = .clear
        }
    }

    /// The route for the view; `again` asks the hub for the dashboard's address afresh.
    func load(projectId: String, name: String, again: Bool) {
        self.projectId = projectId
        self.name = name
        Task { [weak self] in
            guard let self else { return }
            do {
                let address: URL
                if let dashboard, !again {
                    address = dashboard
                } else {
                    address = try await hub.dashboardAddress()
                    dashboard = address
                }
                guard self.name == name, self.projectId == projectId else { return }
                let url = address.appending(path: "project").appending(path: projectId).appending(path: "view").appending(path: name)
                loaded = url
                #if DEBUG
                // A block's page and a tab's are told apart: each says its own page afterwards.
                ViewsProbe.say("views load \(block ? "block" : "tab") \(url.absoluteString)")
                #endif
                // The dashboard reads the person's cookie, as it does a paired browser's.
                if let pass = hub.passCookie(on: url) {
                    await web.configuration.websiteDataStore.httpCookieStore.setCookie(pass)
                }
                guard self.name == name, self.projectId == projectId else { return }
                web.load(URLRequest(url: url))
            } catch {
                guard self.name == name else { return }
                onFailed(error.localizedDescription)
            }
        }
    }

    func webView(_: WKWebView, didFinish _: WKNavigation!) {
        onLoaded()
    }

    func webView(_: WKWebView, didFail _: WKNavigation!, withError error: any Error) {
        onFailed(error.localizedDescription)
    }

    func webView(_: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError error: any Error) {
        onFailed(error.localizedDescription)
    }

    /// The page stays on its view: a link to the project's page on a task or
    /// a file of its folder (`?file=`) opens the app's sheet, and nothing
    /// else leaves the route.
    func webView(_: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        // Only the page itself is held to its route; a frame inside it is the page's own business.
        guard action.targetFrame?.isMainFrame != false else { return decisionHandler(.allow) }
        guard let url = action.request.url, let loaded else { return decisionHandler(.cancel) }
        if url.host() == loaded.host(), url.port == loaded.port {
            if url.path() == loaded.path() { return decisionHandler(.allow) }
            if url.path() == "/project/\(projectId)" {
                let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
                if let file = query.first(where: { $0.name == "file" })?.value, !file.isEmpty {
                    onOpenFile(file)
                } else if let task = query.first(where: { $0.name == "task" })?.value {
                    onOpenTask(task)
                }
            }
        }
        decisionHandler(.cancel)
    }

    /// What the route posts: a task to open, or (as a block) its height. The page is the dashboard's, and its fields are still checked.
    func userContentController(_: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        switch body["type"] as? String {
        case "cawco:open-task":
            guard let task = body["task"] as? String, !task.isEmpty, task.count <= 200 else { return }
            onOpenTask(task)
        case "cawco:height":
            guard let height = body["height"] as? Double, height.isFinite, height >= 0 else { return }
            onHeight(height)
        default:
            return
        }
    }

    /// As a block: the route's own padding and full-height floor give way to
    /// the block's frame, and its height is said each time it changes.
    private static let blockScript = """
    (() => {
      const css = document.createElement("style");
      css.textContent = "main[data-view-alone]{min-block-size:0!important;padding:0!important;background:none!important}html,body{background:none!important}";
      document.documentElement.append(css);
      let watched = null;
      let said = -1;
      const sizes = new ResizeObserver(() => say());
      const say = () => {
        const main = document.querySelector("main[data-view-alone]");
        if (!main) return;
        if (main !== watched) {
          watched = main;
          sizes.observe(main);
        }
        const height = Math.ceil(main.getBoundingClientRect().height);
        if (height !== said) {
          said = height;
          window.webkit.messageHandlers.cawco.postMessage({ type: "cawco:height", height });
        }
      };
      new MutationObserver(say).observe(document.documentElement, { childList: true, subtree: true });
    })()
    """
}

/// Holds its target weakly: a content controller retains its handlers.
private final class WeakMessages: NSObject, WKScriptMessageHandler {
    weak var target: (any WKScriptMessageHandler)?
    init(_ target: any WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

/// A kept view placed on a page, as a block's body (`viewBody`): its route
/// at its content's height, a skeleton until it has loaded, the reason in an
/// alert with Retry when it didn't open.
final class ViewBlockView: UIView {
    var onOpenTask: (String) -> Void {
        get { page.onOpenTask }
        set { page.onOpenTask = newValue }
    }

    var onOpenFile: (String) -> Void {
        get { page.onOpenFile }
        set { page.onOpenFile = newValue }
    }

    let name: String
    private let page: ViewWeb
    private let cover = SkeletonView(height: 256)
    private let failure: KitAlert
    private var height: NSLayoutConstraint!
    private let projectId: String

    init(hub: HubConnection, projectId: String, name: String) {
        self.name = name
        self.projectId = projectId
        page = ViewWeb(hub: hub, block: true)
        let retry = KitButton.make(Words.Views.retry, variant: .outline, height: .sm) {}
        retry.setContentHuggingPriority(.required, for: .horizontal)
        failure = KitAlert(tone: .destructive, under: [retry])
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        retry.addAction(UIAction { [weak self] _ in self?.load(again: true) }, for: .primaryActionTriggered)
        let web = page.web
        addSubview(web)
        cover.translatesAutoresizingMaskIntoConstraints = false
        addSubview(cover)
        failure.isHidden = true
        failure.translatesAutoresizingMaskIntoConstraints = false
        addSubview(failure)
        // Until the route says its height, the skeleton's.
        height = web.heightAnchor.constraint(equalToConstant: 256)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: topAnchor),
            web.bottomAnchor.constraint(equalTo: bottomAnchor),
            web.leadingAnchor.constraint(equalTo: leadingAnchor),
            web.trailingAnchor.constraint(equalTo: trailingAnchor),
            height,
            cover.topAnchor.constraint(equalTo: topAnchor),
            cover.leadingAnchor.constraint(equalTo: leadingAnchor),
            cover.trailingAnchor.constraint(equalTo: trailingAnchor),
            failure.topAnchor.constraint(equalTo: topAnchor),
            failure.leadingAnchor.constraint(equalTo: leadingAnchor),
            failure.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        cover.layer.cornerRadius = Radius.radiusLg
        page.onLoaded = { [weak self] in
            guard let self else { return }
            Motion.easeOut.animator(Motion.durControl) { self.cover.alpha = 0 }.startAnimation()
        }
        page.onFailed = { [weak self] reason in self?.failed(reason) }
        page.onHeight = { [weak self] value in
            guard let self, abs(height.constant - value) >= 0.5 else { return }
            height.constant = value
            #if DEBUG
            ViewsProbe.say("views block name=\(name) height=\(Int(value.rounded()))")
            #endif
            // The page reflows around the block's new height.
            superview?.setNeedsLayout()
            window?.setNeedsLayout()
        }
        load(again: false)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ViewBlockView is built in code")
    }

    private func load(again: Bool) {
        failure.isHidden = true
        cover.alpha = 1
        page.load(projectId: projectId, name: name, again: again)
    }

    private func failed(_ reason: String) {
        failure.label.text = Words.Views.didntOpen(reason: reason)
        failure.isHidden = false
        cover.alpha = 0
        height.constant = max(height.constant, failure.systemLayoutSizeFitting(CGSize(width: bounds.width, height: 0),
            withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height)
        UIAccessibility.post(notification: .announcement, argument: failure.label.text)
    }
}
