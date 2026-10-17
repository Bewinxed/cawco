import CawCoCore
import CawCoDesign
import OSLog
import UIKit
import WebKit

/// One of a project's custom views (routes/project/[id]/+page.svelte, the
/// `view:` pane): a draft's bar, what it is and its two answers, Keep and
/// Discard, over the view itself. The view is drawn by the dashboard's own
/// renderer in a web view (PRD §5.2: OpenUI has no Swift renderer), on its
/// chromeless route `/project/<id>/view/<name>` at the address the hub gives
/// for the dashboard (`/health` `dashboard`); its data are the route's own
/// same-origin reads, which the dashboard hands to the hub, as the hub's API
/// is reached from this app with no credential of its own. A task tapped in
/// the view opens the app's task sheet: the route posts `cawco:open-task`
/// to the `cawco` handler here.
final class ProjectViewPane: UIView, WKNavigationDelegate, WKScriptMessageHandler {
    /// A task tapped in the view.
    var onOpenTask: (String) -> Void = { _ in }
    /// Keep and Discard: the hub's refusal is thrown back, and said under the bar.
    var keep: (String) async throws -> Void = { _ in }
    var discard: (String) async throws -> Void = { _ in }

    private let hub: HubConnection
    private var web: WKWebView!
    /// The draft's bar (`.draft-bar`): `surface-band`, a hairline inside, `radius-lg`.
    private let bar = UIView()
    private let barLine = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
    private var keepButton: UIButton!
    private var discardButton: UIButton!
    private let refusal = KitAlert(tone: .destructive)
    private let cover = UIView()
    private let failure: KitAlert
    private var retry: UIButton!
    private var barTop: NSLayoutConstraint!
    private var webTop: NSLayoutConstraint!
    private var edges: [NSLayoutConstraint] = []

    /// What the pane shows, and what its web view last loaded.
    private(set) var view: ProjectView?
    private var projectId = ""
    private var loaded: URL?
    /// The dashboard's address, once the hub has said it.
    private var dashboard: URL?
    private var keeping = false
    private var discarding = false

    init(hub: HubConnection) {
        self.hub = hub
        let retry = KitButton.make("Retry", variant: .outline, height: .sm) {}
        retry.setContentHuggingPriority(.required, for: .horizontal)
        failure = KitAlert(tone: .destructive, under: [retry])
        super.init(frame: .zero)
        self.retry = retry
        retry.addAction(UIAction { [weak self] _ in self?.load(again: true) }, for: .primaryActionTriggered)
        translatesAutoresizingMaskIntoConstraints = false
        build()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ProjectViewPane is built in code")
    }

    private func build() {
        // The web view: its own data store, so nothing the dashboard keeps in
        // a browser (its theme, its rail) reaches here; its scheme follows the app's.
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(PaneMessages(self), name: "cawco")
        web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.isOpaque = false
        web.backgroundColor = Palette.surfaceRecess
        web.allowsLinkPreview = false
        // The route pads itself by the safe area (`--safe-bottom`).
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.translatesAutoresizingMaskIntoConstraints = false
        web.isInspectable = true
        addSubview(web)

        cover.backgroundColor = Palette.surfaceRecess
        cover.isUserInteractionEnabled = false
        cover.translatesAutoresizingMaskIntoConstraints = false
        let line = SkeletonView(height: 256)
        cover.addSubview(line)
        addSubview(cover)

        // `.draft-bar`: the line, then Keep (outline) and Discard (ghost), `space-2` apart.
        bar.backgroundColor = Palette.surfaceBand
        bar.layer.cornerRadius = Radius.radiusLg
        bar.layer.cornerCurve = .continuous
        bar.layer.borderWidth = 1
        bar.translatesAutoresizingMaskIntoConstraints = false
        keepButton = KitButton.make("Keep", variant: .outline, height: .sm) { [weak self] in self?.answer(keeping: true) }
        discardButton = KitButton.make("Discard", variant: .ghost, height: .sm) { [weak self] in self?.answer(keeping: false) }
        for button in [keepButton!, discardButton!] {
            button.setContentHuggingPriority(.required, for: .horizontal)
            button.setContentCompressionResistancePriority(.required, for: .horizontal)
        }
        barLine.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let acts = UIStackView(arrangedSubviews: [keepButton, discardButton])
        acts.spacing = Space.space2
        let row = UIStackView(arrangedSubviews: [barLine, acts])
        row.spacing = Space.space3
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(row)
        refusal.isHidden = true
        failure.isHidden = true
        let head = UIStackView(arrangedSubviews: [bar, refusal, failure])
        head.axis = .vertical
        head.spacing = Space.space2
        head.translatesAutoresizingMaskIntoConstraints = false
        addSubview(head)

        barTop = head.topAnchor.constraint(equalTo: topAnchor)
        // The route pads its top `space-4`: the page's edge stands that much
        // above where the view starts, so the view starts where the board does,
        // `space-3` under the bar when there is one (`.view-pane` gap).
        webTop = web.topAnchor.constraint(equalTo: head.bottomAnchor)
        NSLayoutConstraint.activate([
            barTop,
            row.topAnchor.constraint(equalTo: bar.topAnchor, constant: Space.space2),
            row.bottomAnchor.constraint(equalTo: bar.bottomAnchor, constant: -Space.space2),
            row.leadingAnchor.constraint(equalTo: bar.leadingAnchor, constant: Space.space3),
            row.trailingAnchor.constraint(equalTo: bar.trailingAnchor, constant: -Space.space3),
            webTop,
            web.bottomAnchor.constraint(equalTo: bottomAnchor),
            cover.topAnchor.constraint(equalTo: web.topAnchor),
            cover.bottomAnchor.constraint(equalTo: web.bottomAnchor),
            cover.leadingAnchor.constraint(equalTo: web.leadingAnchor),
            cover.trailingAnchor.constraint(equalTo: web.trailingAnchor),
            line.topAnchor.constraint(equalTo: cover.topAnchor, constant: Space.space4),
            line.leadingAnchor.constraint(equalTo: cover.leadingAnchor, constant: Space.space4),
            line.trailingAnchor.constraint(equalTo: cover.trailingAnchor, constant: -Space.space4),
        ])
        self.head = head
        paintBar()
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (pane: ProjectViewPane, _: UITraitCollection) in pane.paintBar() }
    }

    private var head: UIStackView!

    private func paintBar() {
        bar.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }

    /// The page's gutters: the bar keeps them; the web view stands `space-4`
    /// outside them, which the route pads back, so the view lines up with the strip.
    func inset(leading: Double, trailing: Double) {
        NSLayoutConstraint.deactivate(edges)
        edges = [
            head.leadingAnchor.constraint(equalTo: leadingAnchor, constant: leading),
            head.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -trailing),
            web.leadingAnchor.constraint(equalTo: leadingAnchor, constant: leading - Space.space4),
            web.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -(trailing - Space.space4)),
        ]
        NSLayoutConstraint.activate(edges)
    }

    // MARK: Showing

    /// The view as the hub lists it now: a draft wears its bar; another view
    /// (or another project's) loads afresh, and the same one keeps its page.
    func show(_ next: ProjectView, projectId: String) {
        let draft = next.draft
        let arriving = view?.name != next.name || self.projectId != projectId
        view = next
        self.projectId = projectId
        barLine.text = "Caw drafted the \(TaskWords.stage(next.name)) view"
        if arriving {
            refusal.isHidden = true
            keeping = false
            discarding = false
        }
        paintActs()
        let barGoes = !bar.isHidden && !draft
        let place: @MainActor @Sendable () -> Void = {
            self.bar.isHidden = !draft
            self.bar.alpha = draft ? 1 : 0
            self.webTop.constant = (draft || !self.refusal.isHidden || !self.failure.isHidden ? Space.space3 : 0) - Space.space4
            self.layoutIfNeeded()
        }
        // Kept, the bar leaves as the web's does (`out:crossOut`), and the view takes its room.
        if barGoes, window != nil, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeOut.animator(Motion.durFade, animations: place).startAnimation()
        } else {
            place()
        }
        if arriving { load(again: false) }
        #if DEBUG
        sayPane()
        #endif
    }

    private func paintActs() {
        KitButton.setTitle(keeping ? "Keeping…" : "Keep", of: keepButton, variant: .outline, height: .sm)
        KitButton.setTitle(discarding ? "Discarding…" : "Discard", of: discardButton, variant: .ghost, height: .sm)
        keepButton.configuration?.showsActivityIndicator = keeping
        discardButton.configuration?.showsActivityIndicator = discarding
        keepButton.isEnabled = !keeping && !discarding
        discardButton.isEnabled = !keeping && !discarding
    }

    /// The route for the view, at the dashboard's address; the cover stands until it has loaded.
    private func load(again: Bool) {
        guard let view else { return }
        let name = view.name
        let project = projectId
        failure.isHidden = true
        cover.alpha = 1
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
                guard self.view?.name == name, self.projectId == project else { return }
                let url = address.appending(path: "project").appending(path: project).appending(path: "view").appending(path: name)
                loaded = url
                #if DEBUG
                ViewsProbe.say("views load \(url.absoluteString)")
                #endif
                // The dashboard reads the person's cookie, as it does a paired browser's.
                if let pass = hub.passCookie(on: url) {
                    await web.configuration.websiteDataStore.httpCookieStore.setCookie(pass)
                }
                guard self.view?.name == name, self.projectId == project else { return }
                web.load(URLRequest(url: url))
            } catch {
                guard self.view?.name == name else { return }
                failed(error.localizedDescription)
            }
        }
    }

    private func failed(_ reason: String) {
        failure.label.text = "The view didn't open: \(reason)"
        failure.isHidden = false
        webTop.constant = Space.space3 - Space.space4
        UIAccessibility.post(notification: .announcement, argument: failure.label.text)
        #if DEBUG
        ViewsProbe.say("views failed \(reason)")
        #endif
    }

    // MARK: Keep and Discard

    /// Keep or Discard, the button saying it runs until the hub answers; a
    /// refusal stands under the bar in the hub's words.
    private func answer(keeping: Bool) {
        guard let view, view.draft, !self.keeping, !discarding else { return }
        let name = view.name
        if keeping { self.keeping = true } else { discarding = true }
        refusal.isHidden = true
        paintActs()
        Task { [weak self] in
            guard let self else { return }
            do {
                try await keeping ? keep(name) : discard(name)
                #if DEBUG
                ViewsProbe.say("views \(keeping ? "keep" : "discard") \(name) ok")
                #endif
            } catch {
                refusal.label.text = error.localizedDescription
                refusal.isHidden = false
                UIAccessibility.post(notification: .announcement, argument: error.localizedDescription)
                #if DEBUG
                ViewsProbe.say("views \(keeping ? "keep" : "discard") \(name) refused: \(error.localizedDescription)")
                #endif
            }
            guard self.view?.name == name else { return }
            self.keeping = false
            discarding = false
            paintActs()
        }
    }

    // MARK: The page

    func webView(_: WKWebView, didFinish _: WKNavigation!) {
        Motion.easeOut.animator(Motion.durControl) { self.cover.alpha = 0 }.startAnimation()
        #if DEBUG
        startReading()
        #endif
    }

    func webView(_: WKWebView, didFail _: WKNavigation!, withError error: any Error) {
        failed(error.localizedDescription)
    }

    func webView(_: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError error: any Error) {
        failed(error.localizedDescription)
    }

    /// The page stays on its view: a link to the project's page on a task
    /// opens the app's sheet, and nothing else leaves the route.
    func webView(_: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // Only the page itself is held to its route; a frame inside it is the page's own business.
        guard action.targetFrame?.isMainFrame != false else { return decisionHandler(.allow) }
        guard let url = action.request.url, let loaded else { return decisionHandler(.cancel) }
        if url.host() == loaded.host(), url.port == loaded.port {
            if url.path() == loaded.path() { return decisionHandler(.allow) }
            if url.path() == "/project/\(projectId)",
               let task = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "task" })?.value {
                onOpenTask(task)
                return decisionHandler(.cancel)
            }
        }
        decisionHandler(.cancel)
    }

    /// What the route posts: a task to open. The page is the dashboard's, and its fields are still checked.
    func userContentController(_: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], body["type"] as? String == "cawco:open-task",
              let task = body["task"] as? String, !task.isEmpty, task.count <= 200 else { return }
        #if DEBUG
        ViewsProbe.say("views open-task \(task)")
        #endif
        onOpenTask(task)
    }

    #if DEBUG
    // MARK: The simulator probe (scripts/probe-kit/specs/ios-views.ts)

    /// The bar as it stands: whether it shows, its words, and where Keep and Discard are in the window.
    private func sayPane() {
        guard ViewsProbe.on, let view else { return }
        layoutIfNeeded()
        let bar = self.bar.isHidden ? "none" : "\(barLine.text ?? "")|keep=\(ViewsProbe.centre(keepButton))|discard=\(ViewsProbe.centre(discardButton))"
        ViewsProbe.say("views pane name=\(view.name) draft=\(view.draft) bar=\(bar)")
    }

    private var reading: Timer?
    private var read = ""

    /// While the probe runs and the pane is on screen, the page's words and
    /// its first task's link, in the window's points, each time they change.
    private func startReading() {
        guard ViewsProbe.on, reading == nil else { return }
        reading = Timer.scheduledTimer(withTimeInterval: 0.7, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.readPage() }
        }
    }

    private func readPage() {
        guard window != nil, !isHidden, let name = view?.name else { return }
        web.evaluateJavaScript(ViewsProbe.pageScript) { [weak self] value, _ in
            guard let self, let text = value as? String, let data = text.data(using: .utf8),
                  let page = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
            var task = "none"
            if let at = page["task"] as? [Double], at.count == 3 {
                let point = web.convert(CGPoint(x: at[1], y: at[2]), to: nil)
                task = "\(Int(at[0]))@\(Int(point.x.rounded())),\(Int(point.y.rounded()))"
            }
            let words = ((page["text"] as? String) ?? "").split(whereSeparator: \.isNewline).joined(separator: " | ")
            let line = "views page name=\(name) href=\(page["href"] as? String ?? "") task=\(task) text=\(words.prefix(600))"
            guard line != read else { return }
            read = line
            ViewsProbe.say(line)
        }
    }
    #endif
}

/// Holds the pane weakly: a content controller retains its handlers.
private final class PaneMessages: NSObject, WKScriptMessageHandler {
    weak var target: (any WKScriptMessageHandler)?
    init(_ target: any WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

#if DEBUG
/// `-views-probe`: the project page's strip, its ⋯ menu's view list, a view's
/// pane and its page, said in the log for scripts/probe-kit/specs/ios-views.ts.
enum ViewsProbe {
    static let on = ProcessInfo.processInfo.arguments.contains("-views-probe")
    static let log = Logger(subsystem: "dev.cawco.app", category: "ViewsProbe")

    static func say(_ line: String) {
        guard on else { return }
        log.notice("\(line, privacy: .public)")
    }

    /// A view's centre in the window's points, where a simulator touch lands.
    static func centre(_ view: UIView) -> String {
        let box = view.convert(view.bounds, to: nil)
        return "\(Int(box.midX.rounded())),\(Int(box.midY.rounded()))"
    }

    /// The route's words, its address, and its first task link's centre in
    /// the page's viewport (with how many task links there are).
    static let pageScript = """
    (() => {
      const main = document.querySelector("main[data-view-alone]");
      const links = main ? [...main.querySelectorAll('a[href*="task="]')] : [];
      const box = links[0]?.getBoundingClientRect();
      return JSON.stringify({
        href: location.pathname,
        text: main ? main.innerText : "",
        task: box ? [links.length, box.x + box.width / 2, box.y + box.height / 2] : null,
      });
    })()
    """
}
#endif
