import CawCoCore
import CawCoDesign
import OSLog
import UIKit
import WebKit

/// One of a project's custom views on its own tab (routes/project/[id]/+page.svelte,
/// the `view:` pane): over the view, a draft's bar (what it is and its two
/// answers, Keep and Discard), or a kept view's head (its glyph, its title,
/// its ⋯, which places it on a page as a block). The view is the dashboard's
/// own route in a web view (ViewWeb).
final class ProjectViewPane: UIView {
    /// A task tapped in the view.
    var onOpenTask: (String) -> Void = { _ in }
    /// A link to a file of the project's folder, by its path.
    var onOpenFile: (String) -> Void = { _ in }
    /// Keep and Discard: the hub's refusal is thrown back, and said under the bar.
    var keep: (String) async throws -> Void = { _ in }
    var discard: (String) async throws -> Void = { _ in }
    /// The kept view placed on a page, as a block there.
    var place: (String, BlockPage) -> Void = { _, _ in }

    private let page: ViewWeb
    private var web: WKWebView { page.web }
    /// The draft's bar (`.draft-bar`): `surface-band`, a hairline inside, `radius-lg`.
    private let bar = UIView()
    private let barLine = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
    private var keepButton: UIButton!
    private var discardButton: UIButton!
    /// A kept view's head (`.view-head`): Block.svelte's head, without the drag.
    private let viewHead = UIStackView()
    private let viewTitle = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private var viewMore: UIButton!
    private let refusal = KitAlert(tone: .destructive)
    private let cover = UIView()
    private let failure: KitAlert
    private var webTop: NSLayoutConstraint!
    private var edges: [NSLayoutConstraint] = []

    /// What the pane shows.
    private(set) var view: ProjectView?
    private var projectId = ""
    private var keeping = false
    private var discarding = false

    init(hub: HubConnection) {
        page = ViewWeb(hub: hub, block: false)
        let retry = KitButton.make(Words.Views.retry, variant: .outline, height: .sm) {}
        retry.setContentHuggingPriority(.required, for: .horizontal)
        failure = KitAlert(tone: .destructive, under: [retry])
        super.init(frame: .zero)
        retry.addAction(UIAction { [weak self] _ in self?.load(again: true) }, for: .primaryActionTriggered)
        translatesAutoresizingMaskIntoConstraints = false
        build()
        page.onOpenTask = { [weak self] id in self?.onOpenTask(id) }
        page.onOpenFile = { [weak self] path in self?.onOpenFile(path) }
        page.onLoaded = { [weak self] in
            guard let self else { return }
            Motion.easeOut.animator(Motion.durControl) { self.cover.alpha = 0 }.startAnimation()
            #if DEBUG
            startReading()
            #endif
        }
        page.onFailed = { [weak self] reason in self?.failed(reason) }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ProjectViewPane is built in code")
    }

    private func build() {
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
        keepButton = KitButton.make(Words.Views.keep, variant: .outline, height: .sm) { [weak self] in self?.answer(keeping: true) }
        discardButton = KitButton.make(Words.Views.discard, variant: .ghost, height: .sm) { [weak self] in self?.answer(keeping: false) }
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

        // `.view-head`: the 16pt glyph in muted ink, the title in label, the ⋯ at its end.
        viewTitle.lineBreakMode = .byTruncatingTail
        viewTitle.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        viewTitle.setContentHuggingPriority(.init(1), for: .horizontal)
        viewTitle.accessibilityTraits = .header
        viewMore = KitButton.make("", glyph: .more, variant: .ghost, height: .sm) {}
        viewMore.showsMenuAsPrimaryAction = true
        // Set once and made as it opens: a refresh that set a new menu while a
        // tap was opening this one cancelled it, and the menu never came.
        // The pages under their heading, each one tap: the web's submenu, as a short list reads on a touch screen.
        viewMore.menu = UIMenu(children: [UIDeferredMenuElement.uncached { [weak self] done in
            guard let self, let name = view?.name else { return done([]) }
            #if DEBUG
            ViewsProbe.say("views menu open view=\(name)")
            #endif
            done([UIMenu(title: Words.Blocks.placeOnPage, options: .displayInline, children: BlockPage.allCases.map { target in
                UIAction(title: target.title, image: Glyph.dataLayers.image) { [weak self] _ in self?.place(name, target) }
            })])
        }])
        viewMore.setContentHuggingPriority(.required, for: .horizontal)
        for part in [GlyphView(.artifactSheet, size: Size.iconMd, tint: Palette.inkMuted), viewTitle, viewMore!] as [UIView] {
            viewHead.addArrangedSubview(part)
        }
        viewHead.spacing = Space.space2
        viewHead.alignment = .center
        viewHead.isLayoutMarginsRelativeArrangement = true
        viewHead.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: Space.space1, bottom: 0, trailing: Space.space1)
        viewHead.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHSm).isActive = true

        refusal.isHidden = true
        failure.isHidden = true
        let head = UIStackView(arrangedSubviews: [bar, viewHead, refusal, failure])
        head.axis = .vertical
        head.spacing = Space.space2
        head.translatesAutoresizingMaskIntoConstraints = false
        addSubview(head)

        // The route pads its top `space-4`: the page's edge stands that much
        // above where the view starts, so the view starts `space-3` under the
        // head (`.view-pane` gap).
        webTop = web.topAnchor.constraint(equalTo: head.bottomAnchor, constant: Space.space3 - Space.space4)
        NSLayoutConstraint.activate([
            head.topAnchor.constraint(equalTo: topAnchor),
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

    /// The page's gutters: the head keeps them; the web view stands `space-4`
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

    /// The view as the hub lists it now: a draft wears its bar, a kept view
    /// its head; another view (or another project's) loads afresh, and the
    /// same one keeps its page.
    func show(_ next: ProjectView, projectId: String) {
        // The same view as it stands: nothing to draw again under a menu a tap is opening.
        if next == view, projectId == self.projectId {
            paintActs()
            return
        }
        let draft = next.draft
        let arriving = view?.name != next.name || self.projectId != projectId
        view = next
        self.projectId = projectId
        let label = TaskWords.stage(next.name)
        barLine.text = Words.Views.drafted(view: label)
        viewTitle.text = label
        viewMore.accessibilityLabel = Words.Blocks.more(title: label)
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
            self.viewHead.isHidden = draft
            self.layoutIfNeeded()
        }
        // Kept, the bar leaves as the web's does (`out:crossOut`), and the head takes its place.
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
        KitButton.setTitle(keeping ? Words.Views.keeping : Words.Views.keep, of: keepButton, variant: .outline, height: .sm)
        KitButton.setTitle(discarding ? Words.Views.discarding : Words.Views.discard, of: discardButton, variant: .ghost, height: .sm)
        keepButton.configuration?.showsActivityIndicator = keeping
        discardButton.configuration?.showsActivityIndicator = discarding
        keepButton.isEnabled = !keeping && !discarding
        discardButton.isEnabled = !keeping && !discarding
    }

    /// The route for the view; the cover stands until it has loaded.
    private func load(again: Bool) {
        guard let view else { return }
        failure.isHidden = true
        cover.alpha = 1
        page.load(projectId: projectId, name: view.name, again: again)
    }

    private func failed(_ reason: String) {
        failure.label.text = Words.Views.didntOpen(reason: reason)
        failure.isHidden = false
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

    #if DEBUG
    // MARK: The simulator probe (scripts/probe-kit/specs/ios-views.ts)

    /// The bar as it stands: whether it shows, its words, and where Keep and
    /// Discard are in the window; a kept view's ⋯.
    private func sayPane() {
        guard ViewsProbe.on, let view else { return }
        layoutIfNeeded()
        let bar = self.bar.isHidden ? "none" : "\(barLine.text ?? "")|keep=\(ViewsProbe.centre(keepButton))|discard=\(ViewsProbe.centre(discardButton))"
        let more = viewHead.isHidden ? "none" : ViewsProbe.centre(viewMore)
        ViewsProbe.say("views pane name=\(view.name) draft=\(view.draft) bar=\(bar) more=\(more)")
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

    /// What a touch at a view's centre lands on: `self` when the view or one
    /// inside it takes it, else the taker and every holder up to the window
    /// by type (a web view with its frame in the window and its address).
    static func hit(_ view: UIView) -> String {
        guard let window = view.window else { return "none" }
        let box = view.convert(view.bounds, to: nil)
        let point = CGPoint(x: box.midX, y: box.midY)
        guard let taker = window.hitTest(point, with: nil) else { return "nothing" }
        if taker.isDescendant(of: view) { return "self" }
        let took = sequence(first: taker, next: \.superview).map { holder in
            let name = String(describing: type(of: holder))
            guard let web = holder as? WKWebView else { return name }
            let at = web.convert(web.bounds, to: nil).integral
            return "\(name)[\(Int(at.minX)),\(Int(at.minY)) \(Int(at.width))x\(Int(at.height)) \(web.url?.absoluteString ?? "no url") hidden=\(web.isHidden)]"
        }.joined(separator: "<")
        // The holders of the view that turn the touch away, and why.
        let refused = sequence(first: view, next: \.superview).compactMap { holder -> String? in
            var why: [String] = []
            if holder.isHidden { why.append("hidden") }
            if holder.alpha < 0.01 { why.append("alpha") }
            if !holder.isUserInteractionEnabled { why.append("touch-off") }
            let inside = holder.convert(point, from: nil)
            if !holder.point(inside: inside, with: nil) {
                let at = holder.convert(holder.bounds, to: nil).integral
                why.append("outside[\(Int(at.minX)),\(Int(at.minY)) \(Int(at.width))x\(Int(at.height))]")
            }
            return why.isEmpty ? nil : "\(type(of: holder)):\(why.joined(separator: ","))"
        }.joined(separator: " ")
        return "\(took) refused-by=\(refused.isEmpty ? "none" : refused)"
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
