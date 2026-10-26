import CawCoCore
import CawCoDesign
import CawCoTranscript
import UIKit
import UIKit.UIGestureRecognizerSubclass
import WebKit

/// A session's preview (preview/PreviewPane.svelte): its header (the
/// artifact's name as the title menu (ArtifactMenu.swift) and its path, a
/// component canvas's view and Inspect, the mode, Comments, Reload, Close) over the
/// page, which a web view loads from the session's own preview origin (a
/// port of the hub's, or a host name of its own). The page carries the agent's
/// overlay, which talks to its host as an iframe talks to the dashboard: the
/// script injected here stands in for that parent window, so the overlay
/// runs unchanged. The page keeps its own state in its artifact's document,
/// which the overlay joins itself on the path the hello names (Projects spec
/// §5.10); the overlay draws the person's pins on the page, and the app
/// reads them through the hub (§5.7) for their list and the open pin's card.
final class PreviewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, UIPencilInteractionDelegate, SideCard {
    private let hub: HubConnection
    let instanceId: String

    private var web: WKWebView!
    /// The head's first control: the shown artifact's name, which opens the session's artifacts.
    private let titleButton = ArtifactTitleButton()
    private weak var menu: ArtifactMenuController?
    /// A sheet's Inspect (PreviewPane.svelte `.inspect`), pressed while its inspector stands.
    private var inspectButton: UIButton!
    /// A component canvas's view: its frames' scheme, widths, motion and zoom, kept per session.
    private var canvasView: CanvasViewControl!
    /// The shown sheet's inspector state, one per sheet: another sheet starts with nothing unsaved.
    private var inspection: SheetInspection?
    private var inspector: SheetInspectorView?
    /// Whether the person keeps the inspector open, for the session (`cawco-preview-inspect:<session>`).
    private var inspectOpen = false
    private var inspectKey: String { "cawco-preview-inspect:\(instanceId)" }
    /// The web view's trailing edge: in from the well's by the inspector's width while it stands as a panel.
    private var webTrailing: NSLayoutConstraint!
    /// A page's `cawco.pickPlace()` waiting on the person: the request it answers (PreviewPane.svelte `picking`).
    fileprivate var picking: PickAsk?
    /// Its picker: over the well in a pane, or the house sheet in the phone's drawer.
    fileprivate var placePick: PlacePickView?
    fileprivate weak var placePickSheet: UIViewController?
    private let pathLabel = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkMuted)
    /// Comments: the open pins' list, floating over the page's top-right (PinList.svelte).
    private var pinsButton: UIButton!
    /// Comments' open count (PreviewPane.svelte `.count`): tabular figures in the muted ink, after its word.
    private let pinsBadge = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
    /// The mode, the kit's segmented control: Interact, Comment, Draw (PreviewPane.svelte `.modes`).
    private var modes: KitSegmented!
    private var reloadButton: UIButton!
    /// Expand / Back to conversation (SideSurface.svelte): beside a
    /// transcript only, never in the phone's drawer.
    private var expandButton: UIButton!
    private var closeButton: UIButton!
    /// Expand or Back pressed: the session's split moves to the edge or back.
    var onExpand: () -> Void = {}
    /// Esc with neither a card nor Comment mode left to close
    /// (PreviewPane.svelte `pressKey`): the session's split gives the conversation back.
    var onEscapeLeft: () -> Void = {}
    /// The preview has the whole session area: the card meets its edges.
    private var expanded = false
    private var headLeading: NSLayoutConstraint!
    private var headTrailing: NSLayoutConstraint!
    private var wellLeading: NSLayoutConstraint!
    private var wellTrailing: NSLayoutConstraint!
    private var wellBottom: NSLayoutConstraint!
    /// Expanded, the well keeps only its top edge (SideSurface.svelte `border-width: 1px 0 0`).
    private let wellEdge = UIView()
    private var wellEdgeHeight: NSLayoutConstraint!
    /// The header: on a phone, a handle of the drawer (SessionViewController drags it).
    private(set) var dragArea: UIView!
    /// The drawer's grabber and its 44pt hit area (SideSheet.svelte `.preview-grab`):
    /// the drawer's other handle, which a tap moves between its heights.
    let grabArea = GrabArea()
    private let grabber = UIView()
    private var headTop: NSLayoutConstraint!
    /// The well under the head, or, inset, at the view's top.
    private var wellTop: NSLayoutConstraint!
    private var wellTopInset: NSLayoutConstraint!
    private let well = UIView()
    private let cover = UIView()
    /// The cover's loading line, hidden once the cover has faded so its sweep stops.
    private let coverLine = SkeletonView(height: 11)
    /// `.cover-state`: what a sheet's stage is doing while its page is on its way, under the line.
    private let coverState = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    /// The current document finished loading: the cover may go, unless a sheet's stage still has a word for it.
    private var pageLoaded = false

    // A sheet's stage (live components), or a workspace preview's server, as its frame carries it (SheetStage.swift).
    private var stage: StageState?
    /// The port of the workspace preview's server the stage is; nil for a sheet's.
    private var served: Int?
    private var stageShown = SheetStageShown(nil, connected: false, served: nil)
    /// `.sheet-dim`: the last good render, under the scrim, while it doesn't compile.
    private let dim = UIView()
    private let errorCard = SheetErrorCard()
    private let down = SheetDownView()
    /// Try again was pressed: pending until the page loads again, or fails to.
    private var retrying = false
    private let failure = KitAlert(tone: .destructive)
    /// What the band's failure is of (PreviewPane.svelte `failure.again`):
    /// "field" clears when the page keeps the field after all, "pins" when the
    /// pins are read again; nil, anything else, goes again from Reload.
    private var failureOf: String?
    private var revision: String?
    /// The line under the name, standing only while it has words to say.
    private let pathRow = UIView()
    /// What is on show is an artifact's page, which has no path of its own to say.
    private var showsPage = false
    /// The revision the overlay was asked to draw the card's thumbnail of.
    private var capturedFor: String?

    private func paintPath() {
        pathRow.isHidden = pathLabel.text?.isEmpty ?? true
    }
    private var artifactId: String?
    private var origin: URL?
    /// The pane's modes (core comments.ts `PreviewMode`): Interact, the page
    /// takes every touch and its pins stay pressable; Comment, a tap pins a
    /// comment; Draw, a finger inks. A pencil inks in every mode.
    private enum Mode: String, CaseIterable {
        case interact, comment, draw

        var name: String {
            switch self {
            case .interact: "Interact"
            case .comment: "Comment"
            case .draw: "Draw"
            }
        }

        var glyph: Glyph {
            switch self {
            case .interact: .toolScreen
            case .comment: .comment
            case .draw: .pen
            }
        }
    }

    /// The mode, which the person chooses and nothing else does: kept for
    /// the session across documents, revisions, Reload and the app's
    /// launches, as the web pane keeps it (`cawco-preview-mode:<session>`).
    private var mode: Mode = .interact
    private var modeKey: String { "cawco-preview-mode:\(instanceId)" }
    /// ⇧C: every pin hidden from the page, or shown (Figma's key).
    private var pinsShown = true
    /// The moved pin the next tap places again, and the mode the pane goes back to once it is placed.
    private var placing: String?
    private var placingFrom: Mode?
    private var connected = false
    private var closing = false
    /// As the phone's drawer: the card stands at the well's foot.
    private var drawer = false

    // The pins (Projects spec §5.7; tsk-3).
    private var comments: ArtifactComments = .empty
    /// The open pins the head counts (Comments' badge, More's and its menu)
    /// and its fit makes room for: 0 until they are read, so a count not
    /// read yet is never drawn.
    private var openPins: Int {
        #if DEBUG
        if let probeOpen { return probeOpen }
        #endif
        return pinsHold == .ready ? comments.open : 0
    }
    /// Whether this artifact's pins are read yet: until they are, nothing is counted or claimed empty.
    private var pinsHold: PinListController.Hold = .quiet
    /// Turns a read still under way past `durWaitGrace` into the list's skeleton (The Real Wait Rule).
    private var pinsGrace: Task<Void, Never>?
    private var reading = false
    private var readAgain = false
    private let card = PinCard()
    private var cardPlace: [NSLayoutConstraint] = []
    private var cardDrawerPlace: [NSLayoutConstraint] = []
    private var cardLeft: NSLayoutConstraint!
    private var cardTop: NSLayoutConstraint!
    private var cardWidth: NSLayoutConstraint!
    private var cardShort: NSLayoutConstraint!
    /// The card's reply field has the keyboard.
    private var writing = false
    /// The pin whose card is open, and its disc in the page's viewport as the page tells it.
    private var openPin: String?
    private var pinAt: (x: Double, y: Double, r: Double)?
    /// The pin J and K stand on.
    private var focusedPin: String?
    /// Each pin's unsaid words, by its id: kept with the pin while its card
    /// is shut and while the page reloads, as the composer keeps its draft
    /// for as long as its screen lives.
    private var drafts: [String: String] = [:]
    /// The pin the open card was opened for as it was made (a tap in Comment
    /// mode, the radial's Comment), until it is said something: dismissed
    /// with nothing said or written, it is taken back.
    private var madePin: String?
    /// What went wrong with the open card's reply or resolve.
    private var cardError: String?
    private var replying = false
    private var resolving = false
    private weak var list: PinListController?
    /// The overlay's answers waited on, by what was asked and of which pin
    /// ("reply:<id>", "resolve:<id>", "delete:<id>"): nil when it was kept, else why not.
    private var answers: [String: CheckedContinuation<String?, Never>] = [:]
    /// How long the page has to answer a reply or a resolve. Our call: the overlay writes its doc at once.
    private static let answerWithin = Duration.seconds(10)
    /// The longest message the page may post, in UTF-16 units: the overlay's
    /// are a few hundred, and a longer one would be parsed on the main thread
    /// for nothing. Our call.
    private static let messageMost = 64 * 1024
    /// Whether the session's turn runs now (its activity pulse), and the pins the agent works on.
    private var sessionWorking = false
    private var live: Set<String> = []

    // This view's word to the hub that the artifact is on screen (`shown`).
    /// The revision the hub has heard about, and what this view has to say of the current one.
    private var shownFor: String?
    private var shownWord: (revision: String, failure: ShownFailure?)?
    private var silence: Task<Void, Never>?
    /// How long a loaded page has for its overlay to answer the hello (PreviewPane.svelte `PAGE_SILENT_MS`).
    private static let silentAfter = Duration.seconds(3)

    /// `ownTab`: the artifact in a tab of its own (routes/artifact/[id], PreviewPane
    /// `ownTab`), at the tab's width: no + or Open in new tab, and Close goes back to its session.
    init(hub: HubConnection, instanceId: String, ownTab: Bool = false) {
        self.hub = hub
        self.instanceId = instanceId
        self.ownTab = ownTab
        super.init(nibName: nil, bundle: nil)
    }

    let ownTab: Bool
    /// Open in new tab: the artifact `id` in a tab of its own.
    var onOpenTab: (_ artifactId: String) -> Void = { _ in }
    /// The panel gives its canvas back to the composer (its Undock, the canvas's own rail's): `folded`, as its chip.
    var onGiveBack: (_ id: String, _ name: String, _ folded: Bool) -> Void = { _, _, _ in }
    /// Close in its own tab: back to the session it belongs to.
    var onBackToSession: () -> Void = {}
    private var newCanvasButton: UIButton!
    private var openTabButton: UIButton!
    private var undockButton: UIButton!
    /// The head's + is making a canvas.
    private var making = false

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("PreviewController is built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRaised

        // The header: `height: 44px`, the identity then the actions, `gap-1`.
        // The identity gives way to the actions: its title is one line cut at
        // its tail, its path one line cut in its middle, and both stop 8pt
        // short of the first action.
        pathLabel.lineBreakMode = .byTruncatingMiddle
        titleButton.addAction(UIAction { [weak self] _ in self?.openMenu() }, for: .touchUpInside)
        // The title control keeps its own width up to the head's room; the path under it gives way first.
        let title = UIStackView(arrangedSubviews: [titleButton, UIView()])
        // The path starts where the title control's glyph does.
        let path = pathRow
        path.hold(pathLabel, insets: UIEdgeInsets(top: 0, left: Space.space2, bottom: 0, right: 0))
        path.isHidden = true
        let identity = UIStackView(arrangedSubviews: [title, path])
        identity.axis = .vertical
        identity.isLayoutMarginsRelativeArrangement = true
        identity.directionalLayoutMargins.leading = 0
        identity.directionalLayoutMargins.trailing = 8 - Space.space1
        for part in [identity, title, titleButton, path, pathLabel] as [UIView] {
            part.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            part.setContentHuggingPriority(.defaultLow, for: .horizontal)
        }
        inspectButton = KitButton.make("", glyph: .tuning, variant: .ghost, height: .sm) { [weak self] in
            guard let self else { return }
            showInspector(!inspectOpen)
        }
        inspectButton.accessibilityLabel = Words.Artifacts.inspect
        inspectButton.toolTip = Words.Artifacts.inspectTitle
        // Pressed while the inspector stands (PreviewPane.svelte `.inspect[aria-pressed="true"]`: `--surface-fill`).
        let restingInspect = inspectButton.configurationUpdateHandler
        inspectButton.configurationUpdateHandler = { [weak self] button in
            restingInspect?(button)
            guard let self, inspectOpen, inspection != nil else { return }
            button.configuration?.background.backgroundColor = Palette.surfaceFill
        }
        inspectOpen = UserDefaults.standard.string(forKey: inspectKey) == "open"
        pinsButton = KitButton.make("Comments", glyph: .chat, variant: .ghost, height: .sm) { [weak self] in self?.openList() }
        // The head's one control recipe (SideSurface `.side-head` buttons: `padding: 0 space-2`), so the name keeps its room.
        pinsButton.configuration?.contentInsets.leading = Space.space2
        pinsButton.configuration?.contentInsets.trailing = Space.space2
        pinsBadge.isUserInteractionEnabled = false
        pinsBadge.isAccessibilityElement = false
        pinsButton.addSubview(pinsBadge)
        // The mode as the person left it for this session; Interact the first time.
        mode = UserDefaults.standard.string(forKey: modeKey).flatMap(Mode.init(rawValue:)) ?? .interact
        modes = KitSegmented(Mode.allCases.map(\.name), glyphs: Mode.allCases.map(\.glyph),
                             selected: Mode.allCases.firstIndex(of: mode))
        modes.accessibilityLabel = "Preview mode"
        modes.addAction(UIAction { [weak self] _ in
            guard let self, let index = modes.selectedIndex, Mode.allCases.indices.contains(index) else { return }
            setMode(Mode.allCases[index])
        }, for: .valueChanged)
        let reload = KitButton.make("", glyph: .refresh, variant: .ghost, height: .sm) { [weak self] in self?.reload() }
        reload.accessibilityLabel = "Reload"
        // In Comment and Draw, what would leave the page waits at half ink
        // (PreviewPane.svelte `.mode-comment .other`, `.mode-draw .other`).
        let restingReload = reload.configurationUpdateHandler
        reload.configurationUpdateHandler = { [weak self] button in
            restingReload?(button)
            if let self, mode != .interact { button.alpha = 0.5 }
        }
        reloadButton = reload
        expandButton = KitButton.make("", glyph: .maximize, variant: .ghost, height: .sm) { [weak self] in self?.onExpand() }
        expandButton.accessibilityLabel = "Expand"
        expandButton.toolTip = "Expand"
        closeButton = KitButton.make("", glyph: .close, variant: .ghost, height: .sm) { [weak self] in
            guard let self else { return }
            if ownTab { onBackToSession() } else { close() }
        }
        closeButton.accessibilityLabel = "Close"
        // The head's +: a new canvas, standing here at once (PreviewPane.svelte `newCanvas`).
        newCanvasButton = KitButton.make("", glyph: .plus, variant: .ghost, height: .sm) { [weak self] in self?.newCanvas() }
        newCanvasButton.accessibilityLabel = "New canvas"
        newCanvasButton.toolTip = "New canvas"
        // The same artifact, its doc and its tools, in a tab of its own.
        openTabButton = KitButton.make("", glyph: .external, variant: .ghost, height: .sm) { [weak self] in
            guard let self, let id = artifactId else { return }
            onOpenTab(id)
        }
        openTabButton.accessibilityLabel = "Open in new tab"
        openTabButton.toolTip = "Open in new tab"
        // A canvas here goes back to the composer (`giveBack(false)`).
        undockButton = KitButton.make("", glyph: .undock, variant: .ghost, height: .sm) { [weak self] in self?.giveBack(folded: false) }
        undockButton.accessibilityLabel = "Undock"
        undockButton.toolTip = "Undock"
        // Glyph-only segments, each a touch target's width.
        modes.segmentMinWidth = Self.target
        // More: what the head has no room for, in the head's order (HIG Toolbars, "Add a More menu").
        moreButton = KitButton.make("", glyph: .more, variant: .ghost, height: .sm) {}
        moreButton.accessibilityLabel = "More"
        moreButton.toolTip = "More"
        moreButton.showsMenuAsPrimaryAction = true
        moreButton.menu = UIMenu(children: [UIDeferredMenuElement.uncached { [weak self] done in
            MainActor.assumeIsolated { done(self?.overflowMenu() ?? []) }
        }])
        // What More holds of Comments, its open count, stays on More (the pins' badge recipe).
        moreBadge.isUserInteractionEnabled = false
        moreBadge.isAccessibilityElement = false
        moreBadge.tabular = true
        moreBadge.translatesAutoresizingMaskIntoConstraints = false
        moreButton.addSubview(moreBadge)
        NSLayoutConstraint.activate([
            moreBadge.centerYAnchor.constraint(equalTo: moreButton.topAnchor, constant: Space.space1),
            moreBadge.leadingAnchor.constraint(equalTo: moreButton.centerXAnchor, constant: Space.space1),
        ])
        // The mode where its three segments have no room: the chosen one's glyph, a pick of three.
        modePick = KitButton.make("", glyph: mode.glyph, variant: .ghost, height: .sm) {}
        modePick.showsMenuAsPrimaryAction = true
        modePick.menu = UIMenu(children: [UIDeferredMenuElement.uncached { [weak self] done in
            MainActor.assumeIsolated { done(self.map { [$0.modeMenu()] } ?? []) }
        }])
        // A component canvas's view (CanvasView.svelte), between Open in new tab and Inspect.
        canvasView = CanvasViewControl(instanceId: instanceId) { [weak self] message in self?.deliver(message) }
        let controls: [(HeadItem, UIView)] = [
            (.newCanvas, newCanvasButton), (.undock, undockButton), (.openTab, openTabButton),
            (.view, canvasView.button), (.inspect, inspectButton), (.mode, modes), (.modePick, modePick), (.comments, pinsButton), (.reload, reload),
            (.expand, expandButton),
        ]
        for (item, control) in controls { slots[item] = HeadSlot(control) }
        moreSlot = HeadSlot(moreButton)
        moreSlot.isHidden = true
        let closeSlot = HeadSlot(closeButton)
        let head = HeadRow(arrangedSubviews: [identity] + controls.compactMap { slots[$0.0] } + [moreSlot, closeSlot])
        head.name = titleButton
        head.alignment = .center
        head.translatesAutoresizingMaskIntoConstraints = false
        dragArea = head
        for slot in slots.values { slot.isHidden = true }
        pinsBadge.tabular = true
        pinsBadge.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            pinsBadge.centerYAnchor.constraint(equalTo: pinsButton.centerYAnchor),
            pinsBadge.trailingAnchor.constraint(equalTo: pinsButton.trailingAnchor, constant: -Space.space2),
        ])

        web = makeWeb()

        // `.well`: a hairline at `--radius-sm` on the recess; Comment and Draw
        // turn its edge the accent. The page keeps the well's whole height in
        // every mode: the head's chosen segment says the mode.
        well.translatesAutoresizingMaskIntoConstraints = false
        well.layer.cornerRadius = Radius.radiusSm
        well.layer.cornerCurve = .continuous
        well.layer.borderWidth = 1
        well.clipsToBounds = true
        well.backgroundColor = Palette.surfaceRecess
        cover.translatesAutoresizingMaskIntoConstraints = false
        cover.backgroundColor = Palette.surfaceRecess
        cover.isUserInteractionEnabled = false
        let line = coverLine
        cover.addSubview(line)
        coverState.translatesAutoresizingMaskIntoConstraints = false
        coverState.isHidden = true
        cover.addSubview(coverState)
        dim.translatesAutoresizingMaskIntoConstraints = false
        dim.backgroundColor = Palette.scrim
        dim.isUserInteractionEnabled = false
        dim.isAccessibilityElement = false
        for part in [dim, errorCard, down] as [UIView] {
            part.alpha = 0
            part.isHidden = true
        }
        down.onAgain = { [weak self] in self?.tryStageAgain() }
        failure.isHidden = true
        card.isHidden = true
        wellEdge.translatesAutoresizingMaskIntoConstraints = false
        wellEdge.isUserInteractionEnabled = false
        wellEdge.isHidden = true
        let stoppedState = KitEmptyState(icon: .alert, title: Words.Preview.stoppedTitle, line: Words.Preview.stoppedLine, action: tryAgain)
        stoppedState.translatesAutoresizingMaskIntoConstraints = false
        stopped.addSubview(stoppedState)
        stopped.translatesAutoresizingMaskIntoConstraints = false
        stopped.backgroundColor = Palette.surfaceWell
        stopped.isHidden = true
        // A page that stopped stands over a sheet's stage states: they were the page's.
        for part in [web!, cover, dim, errorCard, down, stopped, wellEdge, card, failure] as [UIView] { well.addSubview(part) }
        placeWeb()
        NSLayoutConstraint.activate([
            stopped.topAnchor.constraint(equalTo: well.topAnchor),
            stopped.leadingAnchor.constraint(equalTo: well.leadingAnchor),
            stopped.trailingAnchor.constraint(equalTo: well.trailingAnchor),
            stopped.bottomAnchor.constraint(equalTo: well.bottomAnchor),
            // `.down`: `padding-inline: space-6` on the well, scrolled when it runs past it.
            stoppedState.topAnchor.constraint(equalTo: stopped.contentLayoutGuide.topAnchor),
            stoppedState.bottomAnchor.constraint(equalTo: stopped.contentLayoutGuide.bottomAnchor),
            stoppedState.leadingAnchor.constraint(equalTo: stopped.contentLayoutGuide.leadingAnchor, constant: Space.space6),
            stoppedState.trailingAnchor.constraint(equalTo: stopped.contentLayoutGuide.trailingAnchor, constant: -Space.space6),
            stoppedState.widthAnchor.constraint(equalTo: stopped.frameLayoutGuide.widthAnchor, constant: -Space.space6 * 2),
        ])

        // The grabber, `space-1` from the top, centred, 100×6 in the control
        // edge; its hit area is 44pt tall about it (vaul's handle hit area),
        // over the header, which yields to the header's actions.
        grabArea.yields = [titleButton] + head.arrangedSubviews.dropFirst()
        grabber.translatesAutoresizingMaskIntoConstraints = false
        grabber.backgroundColor = Palette.borderControl
        grabber.layer.cornerRadius = 3
        grabber.isUserInteractionEnabled = false
        grabArea.translatesAutoresizingMaskIntoConstraints = false
        grabArea.addSubview(grabber)
        grabArea.isAccessibilityElement = true
        grabArea.accessibilityLabel = "Drawer height"
        grabArea.accessibilityHint = "Moves the preview between its heights."
        grabArea.accessibilityTraits = .button
        grabArea.isHidden = true
        view.addSubview(head)
        view.addSubview(well)
        view.addSubview(grabArea)
        headTop = head.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor)
        headLeading = head.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Space.space2)
        headTrailing = head.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Space.space2)
        wellLeading = well.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Space.space2)
        wellTrailing = well.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Space.space2)
        wellBottom = well.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -Space.space2)
        wellEdgeHeight = wellEdge.heightAnchor.constraint(equalToConstant: 1)
        wellTop = well.topAnchor.constraint(equalTo: head.bottomAnchor)
        wellTopInset = well.topAnchor.constraint(equalTo: view.topAnchor)
        NSLayoutConstraint.activate([
            wellEdge.topAnchor.constraint(equalTo: well.topAnchor),
            wellEdge.leadingAnchor.constraint(equalTo: well.leadingAnchor),
            wellEdge.trailingAnchor.constraint(equalTo: well.trailingAnchor),
            wellEdgeHeight,
            grabArea.topAnchor.constraint(equalTo: view.topAnchor),
            grabArea.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            grabArea.widthAnchor.constraint(equalToConstant: 100 + 44),
            grabArea.heightAnchor.constraint(equalToConstant: 44),
            grabber.topAnchor.constraint(equalTo: grabArea.topAnchor, constant: Space.space1),
            grabber.centerXAnchor.constraint(equalTo: grabArea.centerXAnchor),
            grabber.widthAnchor.constraint(equalToConstant: 100),
            grabber.heightAnchor.constraint(equalToConstant: 6),
            headTop,
            headLeading,
            headTrailing,
            head.heightAnchor.constraint(equalToConstant: 44),
            wellTop,
            wellLeading,
            wellTrailing,
            wellBottom,
            cover.topAnchor.constraint(equalTo: well.topAnchor),
            cover.leadingAnchor.constraint(equalTo: well.leadingAnchor),
            cover.trailingAnchor.constraint(equalTo: well.trailingAnchor),
            cover.bottomAnchor.constraint(equalTo: well.bottomAnchor),
            line.topAnchor.constraint(equalTo: cover.topAnchor, constant: Space.space5),
            line.leadingAnchor.constraint(equalTo: cover.leadingAnchor, constant: Space.space5),
            line.widthAnchor.constraint(equalTo: cover.widthAnchor, multiplier: 0.42),
            // `.cover-state`: `space-3` under the line, the cover's own padding at its sides.
            coverState.topAnchor.constraint(equalTo: line.bottomAnchor, constant: Space.space3),
            coverState.leadingAnchor.constraint(equalTo: cover.leadingAnchor, constant: Space.space5),
            coverState.trailingAnchor.constraint(lessThanOrEqualTo: cover.trailingAnchor, constant: -Space.space5),
            dim.topAnchor.constraint(equalTo: well.topAnchor),
            dim.leadingAnchor.constraint(equalTo: well.leadingAnchor),
            dim.trailingAnchor.constraint(equalTo: well.trailingAnchor),
            dim.bottomAnchor.constraint(equalTo: well.bottomAnchor),
            // `.sheet-error`: `space-3` from the well's sides and foot, at most 60% of it tall.
            errorCard.leadingAnchor.constraint(equalTo: well.leadingAnchor, constant: Space.space3),
            errorCard.trailingAnchor.constraint(equalTo: well.trailingAnchor, constant: -Space.space3),
            errorCard.bottomAnchor.constraint(equalTo: well.bottomAnchor, constant: -Space.space3),
            errorCard.heightAnchor.constraint(lessThanOrEqualTo: well.heightAnchor, multiplier: 0.6),
            down.topAnchor.constraint(equalTo: well.topAnchor),
            down.leadingAnchor.constraint(equalTo: well.leadingAnchor),
            down.trailingAnchor.constraint(equalTo: well.trailingAnchor),
            down.bottomAnchor.constraint(equalTo: well.bottomAnchor),
            failure.leadingAnchor.constraint(equalTo: well.leadingAnchor),
            failure.trailingAnchor.constraint(equalTo: well.trailingAnchor),
            failure.bottomAnchor.constraint(equalTo: well.bottomAnchor),
        ])
        placeCardConstraints()
        card.onClose = { [weak self] in self?.closeCard() }
        card.onDraft = { [weak self] text in
            guard let self, let openPin else { return }
            drafts[openPin] = text
        }
        card.onReply = { [weak self] text in self?.reply(text) }
        card.onResolve = { [weak self] resolved in self?.resolve(resolved) }
        card.onDelete = { [weak self] in try await self?.delete() }
        card.onWriting = { [weak self] on in
            guard let self else { return }
            writing = on
            roomForCard()
        }
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (controller: PreviewController, _: UITraitCollection) in
            controller.paintWell()
            controller.deliver(["type": "cawco:theme", "theme": controller.theme])
        }
        NotificationCenter.default.addObserver(self, selector: #selector(cameForward), name: UIApplication.didBecomeActiveNotification, object: nil)
        paintWell()
        paintPins()
        watchWorking()
        show()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // What changed while it was away; from here the page says (`cawco:doc`).
        refresh()
        sayShown()
        #if DEBUG
        startHeartbeat()
        #endif
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        appeared = true
        wake()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        appeared = false
        wake()
        #if DEBUG
        heartbeat?.invalidate()
        heartbeat = nil
        #endif
    }

    // MARK: The page's process

    /// The page runs only where it can be seen: the preview on screen
    /// (appeared) and its conversation the tab in front of its group. A tab
    /// behind, or parked a swipe aside, and a preview a screen covers, let
    /// their page go: its web view is released and WebKit ends its content
    /// process, so only pages on screen hold memory and draw. It loads again
    /// when it comes forward.
    private var appeared = false
    private var inFront = true
    private var pageShown: Bool { appeared && inFront }
    /// No page is loaded: never yet, or let go while it could not be seen.
    private var asleep = true

    /// Whether its conversation is the tab in front of its group (PaneGroupController).
    func standsInFront(_ front: Bool) {
        guard inFront != front else { return }
        inFront = front
        wake()
    }

    /// The page loaded where it can be seen, and let go where it cannot.
    private func wake() {
        guard isViewLoaded else { return }
        if pageShown {
            if asleep { show() }
        } else if !asleep {
            letGo()
        }
    }

    /// The page goes: a fresh web view with nothing loaded takes the old
    /// one's place, and the next show loads the page again.
    private func letGo() {
        #if DEBUG
        PreviewProbe.say("preview let go appeared=\(appeared) front=\(inFront)")
        #endif
        asleep = true
        revision = nil
        entering?.cancel()
        silence?.cancel()
        connected = false
        replaceWeb()
        pageLoaded = false
        paintCover(animated: false)
    }

    /// A web view for the page: its own cookie store, never shared with
    /// another session's preview, nor with this one's page before it.
    private func makeWeb() -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.addUserScript(WKUserScript(source: Self.host, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.addUserScript(WKUserScript(source: Self.viewport, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.add(WeakHandler(self), name: "cawco")
        configuration.allowsInlineMediaPlayback = true
        let web = PreviewPage(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.isOpaque = false
        web.backgroundColor = Palette.surfaceRecess
        web.translatesAutoresizingMaskIntoConstraints = false
        web.isInspectable = true
        #if DEBUG
        PreviewMeter.watch(web)
        #endif
        // The pencil's double-tap goes to the page, as the person set it (slice 5b).
        let pencil = UIPencilInteraction()
        pencil.delegate = self
        web.addInteraction(pencil)
        return web
    }

    /// The web view fills the well, less the inspector's width while it stands beside the page as a panel.
    private func placeWeb() {
        webTrailing = web.trailingAnchor.constraint(equalTo: well.trailingAnchor, constant: inspector?.layout == .panel ? -Size.cSheetInspectorW : 0)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: well.topAnchor),
            web.leadingAnchor.constraint(equalTo: well.leadingAnchor),
            webTrailing,
            web.bottomAnchor.constraint(equalTo: well.bottomAnchor),
        ])
    }

    /// The web view and its page released, an empty one in its place.
    private func replaceWeb() {
        let old: WKWebView = web
        old.navigationDelegate = nil
        old.stopLoading()
        old.configuration.userContentController.removeAllScriptMessageHandlers()
        web = makeWeb()
        well.insertSubview(web, aboveSubview: old)
        old.removeFromSuperview()
        placeWeb()
    }

    /// The revision whose page has already been loaded again after its
    /// content process ended: a second end stands as the stopped state.
    private var endedOnce: String?
    /// The stopped state over the well (PreviewPane.svelte `.down`, the kit's empty state).
    private let stopped = UIScrollView()
    private lazy var tryAgain: UIButton = KitButton.make(Words.Preview.tryAgain, glyph: .refresh, variant: .outline, height: .sm) { [weak self] in
        self?.again()
    }

    /// WebKit ended the page's content process (the system over its
    /// memory, or a crash): the web view draws nothing and its page is gone.
    /// The first end of a revision loads it again by itself; the second
    /// stands as the stopped state, with Try again.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard webView === web, let frame = hub.previews.byInstance[instanceId], frame.state == .open else { return }
        let first = endedOnce != frame.revision
        #if DEBUG
        PreviewProbe.say("preview content ended revision=\(frame.revision) first=\(first)")
        #endif
        connected = false
        silence?.cancel()
        endedOnce = frame.revision
        if first {
            revision = nil
            show()
        } else {
            showStopped(true)
        }
    }

    /// Try again: the page loads afresh, the state standing until a load serves it.
    private func again() {
        paintTryAgain(pending: true)
        revision = nil
        show()
    }

    private func showStopped(_ shown: Bool) {
        if shown {
            cover.alpha = 0
            coverLine.isHidden = true
            clearFailure()
            UIAccessibility.post(notification: .screenChanged, argument: stopped)
        }
        stopped.isHidden = !shown
        paintTryAgain(pending: false)
        #if DEBUG
        PreviewProbe.say("preview stopped shown=\(shown) tryAgain=\(PreviewProbe.centre(tryAgain))")
        if shown { PreviewMeter.stopped(stopped, tryAgain: tryAgain) }
        #endif
    }

    private func paintTryAgain(pending: Bool) {
        tryAgain.configuration?.showsActivityIndicator = pending
        KitButton.setTitle(pending ? Words.Preview.reloading : Words.Preview.tryAgain, of: tryAgain, variant: .outline, height: .sm)
        tryAgain.isEnabled = !pending
    }

    /// A load failed because the content process ended under it: the end's own handler says so.
    private static func endedUnder(_ error: any Error) -> Bool {
        let error = error as NSError
        return error.domain == WKErrorDomain && error.code == WKError.Code.webContentProcessTerminated.rawValue
    }

    @objc private func cameForward() { sayShown() }

    /// Narrow (PreviewPane.svelte's container under 640px), Comments says
    /// itself by glyph and count alone.
    private var narrow: Bool { view.bounds.width < 640 }
    private var laidNarrow: Bool?

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if laidNarrow != narrow {
            laidNarrow = narrow
            paintMode()
            paintPins()
        }
        placeHeadItems()
        placeCard()
        #if DEBUG
        probeLayout()
        #endif
    }

    // MARK: The head's room (HIG Toolbars: "Prioritize only the most important items", the rest in a More menu)

    /// The head's controls after the name, in DESIGN.md §5.10's order;
    /// `view` is a component canvas's view, `modePick` the mode where its
    /// three segments have no room.
    private enum HeadItem: String, CaseIterable {
        case newCanvas, undock, openTab, view, inspect, mode, modePick, comments, reload, expand
    }

    /// Who keeps a place in the head when it is short of room, first to last:
    /// what a person reaches for on every page (its mode, its Comments), then the panel's own (Expand, Reload), then what is
    /// done now and then. The web's head stands by the same order and the
    /// same rule (side/head.ts `standing()`).
    private static let priority: [HeadItem] = [.mode, .comments, .expand, .reload, .inspect, .view, .undock, .openTab, .newCanvas]
    /// A touch target's side (HIG Layout: "44x44 pt").
    private static let target = 44.0
    /// The narrowest the artifact's name stands while controls go to More: its glyph and a dozen letters.
    private static let nameFloor = 120.0

    private var slots: [HeadItem: HeadSlot] = [:]
    private var moreButton: UIButton!
    private var moreSlot: HeadSlot!
    private let moreBadge = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
    private var modePick: UIButton!
    /// What is on show is a canvas: its own tools, no mode or Comments, and Undock.
    private var canvasShown = false
    /// The controls the head has no room for, in its order: More holds them.
    private var overflowed: [HeadItem] = []
    /// The width the name keeps while controls go to More: its own, up to `nameFloor`.
    private var nameKept = 0.0
    /// The name at `nameKept` or wider: the room the head's placing kept for it, held over the controls' own widths.
    private lazy var nameWidth: NSLayoutConstraint = {
        let floor = titleButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 0)
        floor.priority = UILayoutPriority(900)
        floor.isActive = true
        return floor
    }()

    /// Whether `item` belongs in this head at all, as the panel stands.
    private func wants(_ item: HeadItem) -> Bool {
        switch item {
        case .newCanvas, .openTab: !ownTab
        case .undock: canvasShown && !ownTab
        case .inspect, .view: inspection != nil
        case .mode, .comments: !canvasShown
        case .modePick: false
        case .reload: true
        case .expand: !ownTab && !drawer
        }
    }

    /// Each control the panel wants stands whole while they all fit beside
    /// the name's floor. Otherwise More's room is kept, and each control by
    /// `priority`, in its narrowest form (the mode as its pick), stands where
    /// it fits and is passed over where it doesn't; then the mode takes its
    /// segments back if the room left holds them, so they never cost another
    /// control its place. What has no room goes to More, before Close. Close
    /// and the name always stand. More's room is More as it will be drawn:
    /// a fit that leaves Comments in More is fitted again with More holding
    /// Comments' count, and that one stands. Both read only the controls'
    /// own widths, the name's, the head's and the count, none of which what
    /// stands changes, so a layout lays out the same again. A count is drawn
    /// only above 0, so at 0 More keeps its plain width.
    private func placeHeadItems() {
        guard isViewLoaded, let head = dragArea as? UIStackView else { return }
        let width = head.bounds.width
        guard width > 0 else { return }
        let wanted = HeadItem.allCases.filter(wants)
        let room = { (item: HeadItem) in self.slots[item]?.fittingWidth ?? 0 }
        nameKept = min(Self.nameFloor, titleButton.wholeWidth)
        if nameWidth.constant != nameKept { nameWidth.constant = nameKept }
        // The count's figures before More's room is read.
        let count = "\(openPins)"
        if moreBadge.text != count { moreBadge.text = count }
        // The identity's own trailing margin stands with the name.
        let name = nameKept + 8 - Space.space1
        let close = Self.target
        let all = wanted.reduce(0) { $0 + room($1) }
        var shown = Set(wanted)
        var left = width - name - all - close
        #if DEBUG
        laidFirst = nil
        #endif
        if left < 0 {
            let beside = width - name - close
            (shown, left) = Self.fit(beside - moreRoom(counted: false), wanted, room)
            // A count is drawn only above 0: at 0 More keeps its plain width.
            if wanted.contains(.comments), !shown.contains(.comments), openPins > 0 {
                #if DEBUG
                laidFirst = shown
                #endif
                (shown, left) = Self.fit(beside - moreRoom(counted: true), wanted, room)
            }
        }
        #if DEBUG
        laidLeft = left
        #endif
        overflowed = wanted.filter { !shown.contains($0) && !($0 == .mode && shown.contains(.modePick)) }
        for item in HeadItem.allCases {
            let hidden = !shown.contains(item)
            if slots[item]?.isHidden != hidden { slots[item]?.isHidden = hidden }
        }
        let moreHidden = overflowed.isEmpty
        if moreSlot.isHidden != moreHidden { moreSlot.isHidden = moreHidden }
        paintMore()
    }

    /// The web's `standing()` past its first case, in `room` (the head's,
    /// less the name, Close and More): each wanted control by priority, in
    /// its narrowest form (the mode as its pick), where it fits, one with no
    /// room passed over; then the mode's segments where the room left holds
    /// them. What stands, and the room left.
    private static func fit(_ room: Double, _ wanted: [HeadItem], _ width: (HeadItem) -> Double) -> (shown: Set<HeadItem>, left: Double) {
        var left = room
        var shown: Set<HeadItem> = []
        for item in priority where wanted.contains(item) {
            let stands = item == .mode ? HeadItem.modePick : item
            guard width(stands) <= left else { continue }
            shown.insert(stands)
            left -= width(stands)
        }
        let segments = width(.mode) - width(.modePick)
        if shown.contains(.modePick), segments <= left {
            shown.remove(.modePick)
            shown.insert(.mode)
            left -= segments
        }
        return (shown, left)
    }

    /// More's room in the head as it will be drawn: its slot, and, while it
    /// holds Comments with pins open, Comments' count after its dots,
    /// `space-1` before it.
    private func moreRoom(counted: Bool) -> Double {
        moreSlot.fittingWidth + (counted ? Double(moreBadge.intrinsicContentSize.width) + Space.space1 : 0)
    }

    /// More's own words, and Comments' open count on it while it holds Comments.
    private func paintMore() {
        // As on Comments: the count only once read and above 0 (The Earned Count Rule).
        // Run on every layout: each is written only when it changed, as a label's words lay the head out again.
        let holds = overflowed.contains(.comments) && openPins > 0
        let count = "\(openPins)"
        if moreBadge.text != count { moreBadge.text = count }
        if moreBadge.isHidden == holds { moreBadge.isHidden = !holds }
        let words = holds ? "More, Comments \(count) open" : "More"
        if moreButton.accessibilityLabel != words { moreButton.accessibilityLabel = words }
    }

    /// The three modes, the chosen one checked: the mode's pick, and More's when it holds the mode.
    private func modeMenu() -> UIMenu {
        let choices = Mode.allCases.map { choice in
            UIAction(title: choice.name, image: choice.glyph.image, state: mode == choice ? .on : .off) { [weak self] _ in
                self?.setMode(choice)
            }
        }
        return UIMenu(title: "Preview mode", options: .displayInline, children: choices)
    }

    /// More's menu: the controls the head has no room for, in its order, each
    /// doing what its button does; the mode as a choice of three with the
    /// current one checked, Comments with its open count.
    private func overflowMenu() -> [UIMenuElement] {
        overflowed.compactMap { item -> UIMenuElement? in
            switch item {
            case .newCanvas:
                let action = UIAction(title: "New canvas", image: Glyph.plus.image) { [weak self] _ in self?.newCanvas() }
                if making { action.attributes = .disabled }
                return action
            case .undock:
                return UIAction(title: "Undock", image: Glyph.undock.image) { [weak self] _ in self?.giveBack(folded: false) }
            case .openTab:
                return UIAction(title: "Open in new tab", image: Glyph.external.image) { [weak self] _ in
                    guard let self, let id = artifactId else { return }
                    onOpenTab(id)
                }
            case .view:
                return canvasView.submenu()
            case .inspect:
                return UIAction(title: Words.Artifacts.inspect, image: Glyph.tuning.image, state: inspectOpen ? .on : .off) { [weak self] _ in
                    guard let self else { return }
                    showInspector(!inspectOpen)
                }
            case .mode:
                return modeMenu()
            case .modePick:
                return nil
            case .comments:
                let action = UIAction(title: "Comments", image: Glyph.chat.image) { [weak self] _ in self?.openList() }
                if openPins > 0 { action.subtitle = "\(openPins) open" }
                return action
            case .reload:
                let action = UIAction(title: "Reload", image: Glyph.refresh.image) { [weak self] _ in self?.reload() }
                // In Comment and Draw what would leave the page waits (`.mode-comment .other`).
                if mode != .interact { action.attributes = .disabled }
                return action
            case .expand:
                let back = expanded
                return UIAction(title: back ? "Back to conversation" : "Expand", image: (back ? Glyph.minimize : Glyph.maximize).image) { [weak self] _ in
                    self?.onExpand()
                }
            }
        }
    }

    /// As the phone's drawer it wears the grabber, and its header stands
    /// `space-3` under the drawer's top (SideSheet.svelte `.sheet`); beside
    /// the transcript it has neither. The open pin's card stands at the
    /// drawer's foot, in the house drawer's shape.
    func standsAsDrawer(_ drawer: Bool) {
        loadViewIfNeeded()
        self.drawer = drawer
        grabArea.isHidden = !drawer
        // The drawer has no Expand: it is the phone's sheet (SideSplit.svelte's `available` is a desk's).
        placeHeadItems()
        if drawer { expanded = false }
        placeHead()
        placeCardConstraints()
        // The inspector as the drawer has it, a sheet; beside the transcript, a panel.
        placeInspector()
    }

    /// Drawn inside another surface (a task's review stage, PreviewPane.svelte
    /// `inset`): the page in its well and what stands over it, with no head
    /// of its own; the surface around it names it and holds its controls.
    func standsInset() {
        loadViewIfNeeded()
        dragArea.isHidden = true
        grabArea.isHidden = true
        view.backgroundColor = .clear
        wellTop.isActive = false
        wellTopInset.isActive = true
        wellLeading.constant = 0
        wellTrailing.constant = 0
        wellBottom.isActive = false
        well.bottomAnchor.constraint(equalTo: view.bottomAnchor).isActive = true
    }

    /// Expanded over the whole session area (SideSurface.svelte `.expanded`):
    /// the card meets the area's edges and the well its sides, so a page is
    /// drawn at the full width. The head stands where it stood, so the
    /// control just pressed is still under the finger to press back. The
    /// session lays it out on its slide's clock.
    func standsExpanded(_ expanded: Bool) {
        loadViewIfNeeded()
        self.expanded = expanded
        let glyph: Glyph = expanded ? .minimize : .maximize
        expandButton.configuration?.image = glyph.image.resized(to: Size.iconMd)
        expandButton.accessibilityLabel = expanded ? "Back to conversation" : "Expand"
        expandButton.toolTip = expanded ? "Back to conversation (Esc)" : "Expand"
        placeHead()
        well.layer.cornerRadius = expanded ? 0 : Radius.radiusSm
        paintWell()
    }

    /// The head's and the well's insets: a drawer's head stands `space-3`
    /// under its top; beside the transcript the card's own insets; expanded,
    /// the card's inset moves onto the head so it holds still while the well
    /// meets the edges.
    private func placeHead() {
        let card = Space.space2
        headTop.constant = drawer ? Space.space3 : expanded ? card : 0
        headLeading.constant = expanded ? card * 2 : card
        headTrailing.constant = expanded ? -card * 2 : -card
        wellLeading.constant = expanded ? 0 : card
        wellTrailing.constant = expanded ? 0 : -card
        wellBottom.constant = expanded ? 0 : -card
    }

    /// The Plan | Preview switch at the head's start while the plan is open too (SideSurface.svelte `switcher`).
    private weak var switcher: UIView?

    func showSwitcher(_ next: UIView?) {
        loadViewIfNeeded()
        guard let head = dragArea as? UIStackView, next !== switcher || next?.superview !== head else { return }
        // The one switch moves between the cards' heads: only its place in this head is taken down here.
        if let switcher, switcher.superview === head { switcher.removeFromSuperview() }
        switcher = next
        if let next {
            next.setContentHuggingPriority(.required, for: .horizontal)
            next.setContentCompressionResistancePriority(.required, for: .horizontal)
            head.insertArrangedSubview(next, at: 0)
        }
    }

    /// Something in the preview has the keyboard: the page, or the card's reply field.
    var holdsKeys: Bool {
        guard isViewLoaded else { return false }
        var views: [UIView] = [view]
        while let next = views.popLast() {
            if next.isFirstResponder { return true }
            views += next.subviews
        }
        return false
    }

    /// Esc on the pane (PreviewPane.svelte `pressKey`): a question standing
    /// in the card goes first, then the card closes, then Comment or Draw
    /// goes back to Interact. False when none was there.
    func escape() -> Bool {
        // The picker over the page goes first: Escape answers nothing (PlacePick.svelte).
        if picking != nil {
            cancelPick()
            return true
        }
        if openPin != nil, card.escape() {
            #if DEBUG
            PreviewProbe.say("preview escape ask")
            #endif
            return true
        }
        if openPin != nil {
            closeCard(by: "escape")
            #if DEBUG
            PreviewProbe.say("preview escape card")
            #endif
            return true
        }
        if mode != .interact {
            setMode(.interact)
            return true
        }
        return false
    }

    /// The preview as the hub says it now: a new revision (another page, or
    /// the same rebuilt) loads afresh, named by its artifact until the page
    /// says its own title and path. The same revision keeps what the page said.
    func show() {
        guard isViewLoaded, let frame = hub.previews.byInstance[instanceId], frame.state == .open,
              let route = hub.previewRoute(frame) else { return }
        // Every frame, the same revision's too: the title and its menu's list move on their own.
        let artifact = frame.artifact
        titleButton.show(kind: artifact.kind, name: artifact.name)
        menu?.follow(held: frame.artifacts, shown: (artifact.id, artifact.kind, artifact.name))
        // Out of sight, the page waits to be seen.
        guard pageShown else { return }
        let origin = route.origin
        // A sheet's stage or a workspace preview's server rides its frame,
        // published again at the same revision on each change (core
        // `PreviewFrame.stage`; PreviewPane.svelte `served`, `staged`).
        let port = frame.source?.value1
        let servedPort = port.flatMap { $0.serve != nil ? Int($0.port) : nil }
        let shownStage = frame.artifact.kind == .component || servedPort != nil ? frame.stage : nil
        if shownStage != stage || servedPort != served {
            stage = shownStage
            served = servedPort
            paintStage()
        }
        guard frame.revision != revision else { return }
        revision = frame.revision
        asleep = false
        // Another page: the stopped state was the last one's.
        if frame.revision != endedOnce, !stopped.isHidden { showStopped(false) }
        // A moved pin waiting to be placed again belongs to the page that showed it.
        if placing != nil { setMode(placingFrom ?? mode) }
        placingFrom = nil
        if frame.artifact.id != artifactId {
            // Another artifact: its pins are its own.
            artifactId = frame.artifact.id
            comments = .empty
            closeCard()
            list?.dismiss(animated: true)
            readPins()
            paintPins()
            refresh()
            adoptSheet(frame)
        }
        pathLabel.text = Self.place(frame)
        showsPage = frame.source?.value3 != nil
        paintPath()
        self.origin = origin
        connected = false
        // A canvas draws with its own tools: no modes or Comments over it, and
        // it can go back to the composer (`canUndock`).
        canvasShown = frame.artifact.kind == .canvas
        placeHeadItems()
        pageLoaded = false
        paintCover(animated: false)
        owner = PreviewOwner.of(frame)
        reentered = false
        enter(hub.previewStart(frame) ?? origin)
    }

    /// Whose origin the current show loads from: the project's for a project's page, else the session's.
    private var owner: PreviewOwner?
    /// The page the current show opens at.
    private var start: URL?
    /// The entry being asked for, replaced by the next.
    private var entering: Task<Void, Never>?
    /// The page turned its pass away (401) and the preview entered again; a second refusal in a row before the page says it is ready stands.
    private var reentered = false
    /// The navigation cancelled to enter again: WebKit's word that it was interrupted is not a failure.
    private var reentering = false

    /// Loads `place` on the preview's origin through the entry with a new
    /// ticket (`previewLoad`): the origin is locked to the hub's pass, which
    /// this web view's own store holds only once it has entered. The origin
    /// names the session: nothing else rides with the load.
    private func enter(_ place: URL) {
        start = place
        entering?.cancel()
        entering = Task { [weak self] in
            guard let self else { return }
            do {
                let url = try await hub.previewLoad(place, for: owner ?? .instance(instanceId))
                guard !Task.isCancelled else { return }
                #if DEBUG
                web.load(URLRequest(url: PreviewProbe.loading(url)))
                #else
                web.load(URLRequest(url: url))
                #endif
            } catch {
                guard !Task.isCancelled else { return }
                failed("The hub didn't give this preview a pass: \(error.localizedDescription)", of: nil)
                loaded(revision)
            }
        }
    }

    /// The origin turned the page's pass away (401: it lapsed,
    /// hub preview-access.ts), so the preview enters again where it was, once
    /// in a row. Every other answer is the page's own.
    func webView(_: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void) {
        let status = (navigationResponse.response as? HTTPURLResponse)?.statusCode ?? 0
        #if DEBUG
        if navigationResponse.isForMainFrame {
            PreviewProbe.say("preview answered \(status) for \(navigationResponse.response.url?.absoluteString ?? "?")")
        }
        #endif
        guard navigationResponse.isForMainFrame, status == 401, !reentered,
              let at = navigationResponse.response.url ?? start else { return decisionHandler(.allow) }
        reentered = true
        reentering = true
        decisionHandler(.cancel)
        enter(at)
    }

    private var theme: String { traitCollection.userInterfaceStyle == .dark ? "dark" : "light" }

    // MARK: The page

    /// A new document (a load, the page's own reload or a link to another
    /// page) starts its overlay in Interact: the pane's mode stands, and the
    /// overlay hears it again once it says it is ready (`ready`), so the
    /// head and the page never disagree.
    func webView(_: WKWebView, didCommit _: WKNavigation!) {
        #if DEBUG
        PreviewProbe.say("preview document")
        PreviewProbe.documents += 1
        #endif
        // A pick the old page asked for has no page left to answer.
        dropPick()
    }

    func webView(_: WKWebView, didFinish _: WKNavigation!) {
        pageLoaded = true
        endRetry()
        paintCover(animated: true)
        // A load served the page again: the stopped state goes.
        if !stopped.isHidden { showStopped(false) }
        guard let frame = hub.previews.byInstance[instanceId], frame.state == .open else { return }
        loaded(frame.revision)
    }

    /// `.cover` and `.cover.ready`: it stands until the page has loaded and a
    /// sheet's stage has nothing more to say on it, then fades over
    /// `--dur-control`, and comes back as the stage gets a word again (a
    /// restart under an open page). Faded out, its line stops sweeping.
    private func paintCover(animated: Bool) {
        let word = stageShown.waiting
        coverState.text = word
        coverState.isHidden = word == nil
        cover.accessibilityElementsHidden = word == nil
        let shown = !pageLoaded || word != nil
        if shown { coverLine.isHidden = false }
        let target: CGFloat = shown ? 1 : 0
        guard cover.alpha != target else { return }
        guard animated else {
            cover.alpha = target
            coverLine.isHidden = !shown
            return
        }
        let fade = Motion.easeOut.animator(Motion.durControl) { self.cover.alpha = target }
        fade.addCompletion { [weak self] position in
            guard position == .end, let self, cover.alpha < 0.01 else { return }
            coverLine.isHidden = true
        }
        fade.startAnimation()
    }

    /// PreviewPane.svelte `announce`, at the page's own `load` (the host
    /// script's `cawco:loaded`), as the pane announces at its iframe's: WebKit's
    /// didFinish can come while the document is still interactive, before a
    /// module script (a canvas's host) listens, and a module that never hears
    /// the hello never learns its host's origin, so nothing it posts goes. The
    /// overlay answers with `cawco:ready` and joins the artifact's doc on the
    /// listener's own origin.
    private func hello() {
        guard let frame = hub.previews.byInstance[instanceId], frame.state == .open else { return }
        let artifact = frame.artifact
        connected = false
        deliver([
            "type": "cawco:hello",
            "artifact": ["id": artifact.id, "kind": artifact.kind.rawValue, "name": artifact.name],
            "sync": "/__cawco/artifact/\(artifact.id)",
            "theme": theme,
            // What of the page's edges the panel's chrome takes: none. A canvas's rail
            // stands unseen until its host says this (canvas.css `data-canvas-inset`).
            "inset": ["top": 0, "side": 0],
        ])
        // A canvas here stands docked in the panel (stage.svelte.ts `tellPlace`, `at === "panel"`):
        // its rail stays at its top, and its rail's Dock reads Undock.
        if artifact.kind == .canvas {
            deliver(["type": "cawco:place", "docked": true, "inset": ["top": 0, "side": 0]])
        }
        #if DEBUG
        PreviewProbe.say("preview hello theme=\(theme)\(artifact.kind == .canvas ? " place=docked" : "")")
        #endif
    }

    /// The head's +: a new canvas in the session, shown here at once (PreviewPane.svelte `newCanvas`).
    private func newCanvas() {
        guard !making else { return }
        making = true
        newCanvasButton.isEnabled = false
        Task { [weak self, hub, instanceId] in
            do {
                let made = try await hub.createDraftCanvas(in: instanceId)
                hub.openArtifact(made.id, in: instanceId)
            } catch {
                self?.failed("The canvas couldn't be made: \(error.localizedDescription). Try + again.", of: nil)
            }
            self?.making = false
            self?.newCanvasButton.isEnabled = true
        }
    }

    /// The canvas on show goes back to the composer (PreviewPane.svelte `giveBack`): Undock, or Done while it is docked.
    private func giveBack(folded: Bool) {
        guard !ownTab, let frame = hub.previews.byInstance[instanceId], frame.state == .open, frame.artifact.kind == .canvas else { return }
        #if DEBUG
        PreviewProbe.say("preview give back \(frame.artifact.id) folded=\(folded)")
        #endif
        onGiveBack(frame.artifact.id, frame.artifact.name, folded)
    }

    func webView(_: WKWebView, didFail _: WKNavigation!, withError error: any Error) {
        guard !enteredAgain(error), !Self.endedUnder(error) else { return }
        failed(error.localizedDescription, of: nil)
        endRetry()
        loaded(revision)
    }

    func webView(_: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError error: any Error) {
        guard !enteredAgain(error), !Self.endedUnder(error) else { return }
        failed(error.localizedDescription, of: nil)
        endRetry()
        loaded(revision)
    }

    /// Whether `error` is the interruption of the load the preview cancelled to enter again.
    private func enteredAgain(_ error: any Error) -> Bool {
        guard reentering, HubConnection.interruptedByPolicy(error) else { return false }
        reentering = false
        return true
    }

    /// What the page posted to its host: the overlay's messages (wire.ts
    /// reads them the same way). The page is code an agent wrote: every
    /// field is checked and bounded.
    func userContentController(_: WKUserContentController, didReceive message: WKScriptMessage) {
        // Read on the main thread: a message past `messageMost` is not the overlay's, and goes unread;
        // its capture alone carries a picture, up to wire.ts `PNG_MAX` of base64.
        guard let said = message.body as? NSString,
              said.length <= (said.hasPrefix(#"{"type":"cawco:captured""#) ? Self.captureMost : Self.messageMost) else { return }
        guard let data = (said as String).data(using: .utf8),
              let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if let ask = Self.pickPlaceAsk(body) {
            // A second ask replaces one still open: the page asked again.
            cancelPick()
            openPick(ask)
            return
        }
        switch body["type"] as? String {
        case "cawco:loaded":
            hello()
        case "cawco:ready", "cawco:navigated":
            // A page's place is its artifact's own: no path stands under its name (PreviewPane.svelte `subtitle={page ? "" : …}`).
            if !showsPage, let at = (body["url"] as? String).flatMap(URL.init(string:)), at.host() == origin?.host(), at.port == origin?.port {
                pathLabel.text = at.path() + (at.query().map { "?\($0)" } ?? "")
                paintPath()
            }
            // Its title, for the transcript's card (`preview.title`, wire.ts `previewTitle`).
            if let revision, let title = Self.text(body["title"], 300) {
                hub.previews.titled(instanceId, revision: revision, title: title)
            }
            if body["type"] as? String == "cawco:ready" {
                ready()
                // Once per revision the overlay draws the page for the card's thumbnail (PreviewPane.svelte `captured`).
                if let revision, capturedFor != revision {
                    capturedFor = revision
                    deliver(["type": "cawco:capture"])
                }
            }
        case "cawco:captured":
            // Both schemes in one answer, the other drawn off screen (overlay schemes.ts).
            if let revision, let thumbnail = Self.thumbnail(body) {
                hub.previews.captured(instanceId, revision: revision, thumbnail: thumbnail)
                #if DEBUG
                PreviewProbe.say("preview captured revision=\(revision) bytes=\(thumbnail.light?.count ?? 0)+\(thumbnail.dark?.count ?? 0) single=\(thumbnail.single) title=\(hub.previews.pages[instanceId]?.title ?? "")")
                #endif
            }
        case "cawco:undock":
            // The docked canvas's own rail (CanvasStages.svelte `actions.undock`).
            giveBack(folded: false)
        case "cawco:done":
            giveBack(folded: true)
        case "cawco:sheet":
            // A sheet's page said its stories and props: the inspector's controls.
            if let said = SheetOnPage(body["sheet"]) {
                #if DEBUG
                PreviewProbe.say("inspector heard file=\(said.file) stories=\(said.stories.map(\.name).joined(separator: ",")) components=\(said.components.map { "\($0.name):\($0.props.map(\.name).joined(separator: "+"))" }.joined(separator: ","))")
                #endif
                inspection?.heard(said)
                #if DEBUG
                inspectAtLaunch()
                #endif
            }
        case "cawco:doc":
            // A pick, a note, a pin, the agent's patch or a Send's stamp: the pins read again now.
            refresh()
        case "cawco:pin-open":
            guard let id = Self.pinId(body["id"]) else { return }
            if id == placing || (placing != nil && body["made"] as? Bool != true) {
                // Placed again: the mode goes back to how it was before.
                if let from = placingFrom, from != .comment { setMode(from) } else { placing = nil }
                placingFrom = nil
            }
            openCard(id, made: body["made"] as? Bool == true)
            refresh()
        case "cawco:press":
            // A press on the page outside the card: the outside-press rule,
            // heard from the page as its finger goes down. The card closes as
            // that finger lifts (`pageLifted`), as every outside press does:
            // closing ends the field's editing, the keyboard leaves and the
            // drawer drops under a finger still down, and the page never took
            // the tap (the probe: "dismissed by=page" and no new document).
            guard openPin != nil else { return }
            if pressOnPage { pagePressed = true } else { closeCard(by: "page") }
        case "cawco:pin-at":
            guard Self.pinId(body["id"]) == openPin else { return }
            pinAt = Self.pinAt(body)
            placeCard()
        case "cawco:key":
            if let key = Self.text(body["key"], 10) { press(key) }
        case "cawco:shortcut":
            // One of the shell's combos the page left alone (overlay page.ts
            // `leftToShell`): the shell runs it as from its own key command.
            if let command = Self.shellCommand(body["name"]) {
                #if DEBUG
                PreviewProbe.say("preview shortcut \(Self.text(body["name"], 40) ?? "")")
                #endif
                (view.window?.rootViewController as? RootViewController)?.run(command)
            }
        case "cawco:escape":
            // The page left Comment or Draw on its own Esc: the pane follows, and keeps it.
            setMode(.interact)
        case "cawco:error":
            // wire.ts `previewErrorOf`: a field carries its own way back; a send goes again from the page's own Send.
            let of = Self.text(body["of"], 20).flatMap { $0 == "field" ? $0 : nil }
            failed(Self.text(body["message"], 300) ?? "The preview reported an error.", of: of)
        case "cawco:resolved":
            // The page kept the field it refused: its word leaves the band.
            if failureOf == "field" { clearFailure() }
        case "cawco:reply-result":
            answered("reply", body)
        case "cawco:resolve-result":
            answered("resolve", body)
        case "cawco:delete-result":
            answered("delete", body)
        #if DEBUG
        case "cawco:probe":
            probePage(body)
        #endif
        default:
            break
        }
    }

    /// The overlay answered the hello: the page is on screen and joined.
    private func ready() {
        connected = true
        // In: a later lapse of its pass may enter again.
        reentered = false
        // Compiled: the cover's "Compiling…" goes.
        paintStage()
        #if DEBUG
        PreviewProbe.say("preview ready")
        // The artifact's own tab: its page's overlay answered there, for this artifact.
        if ownTab { PreviewProbe.say("artifact tab ready \(artifactId ?? "-") revision=\(revision ?? "-")") }
        PreviewMeter.ready(web)
        PreviewProbe.lapse(web)
        if PreviewProbe.menuRemove != nil, !menuAtLaunch {
            menuAtLaunch = true
            openMenu()
        }
        #endif
        // The page's mode as the person left it, its pins shown or hidden, and the open card's pin tracked again.
        setMode(mode, place: placing)
        if !pinsShown { deliver(["type": "cawco:pins-shown", "shown": false]) }
        if let openPin { deliver(["type": "cawco:track-pin", "id": openPin]) }
        // A component canvas's page takes the view kept for this session (CanvasView.svelte's `ready`).
        if inspection != nil { canvasView.tell() }
        if let revision { word(revision, failure: nil) }
    }

    // MARK: A sheet's stage

    /// The stage on the pane: its word on the cover, its first compile error
    /// on a card over the dimmed last render, or the stage that didn't start
    /// where the page would be. Each appears and leaves as the web's
    /// `appear` does: its opacity over `--dur-fade`, the same with or without
    /// Reduce Motion, since nothing travels.
    private func paintStage() {
        guard isViewLoaded else { return }
        let next = SheetStageShown(stage, connected: connected, served: served)
        let before = stageShown
        stageShown = next
        paintCover(animated: true)
        if let error = next.error { errorCard.show(error, more: next.more) }
        if let down = next.down { self.down.show(down) }
        appear(dim, next.error != nil)
        appear(errorCard, next.error != nil)
        appear(self.down, next.down != nil)
        if next.waiting != before.waiting, let word = next.waiting {
            // `role="status"`: the cover says what the stage is doing.
            UIAccessibility.post(notification: .announcement, argument: word)
        }
        if (next.error != nil && before.error == nil) || (next.down != nil && before.down == nil) {
            // `role="alert"`: what went wrong is read out as it stands.
            UIAccessibility.post(notification: .layoutChanged, argument: next.error != nil ? errorCard : self.down)
        }
        #if DEBUG
        if next != before {
            let card = next.error.map(SheetStageShown.place) ?? "-"
            PreviewProbe.say("preview stage status=\((stage?.value1?.status ?? stage?.value2?.status)?.rawValue ?? "-") cover=\(next.waiting ?? "-") card=\(card) down=\(next.down == nil ? "no" : "yes")")
        }
        if next.down != nil {
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                view.layoutIfNeeded()
                PreviewProbe.say("preview stage-down again=\(PreviewProbe.centre(self.down.again))")
            }
        }
        #endif
    }

    /// The web's `transition:appear`, in and out: opacity alone over `--dur-fade`.
    private func appear(_ part: UIView, _ shown: Bool) {
        let target: CGFloat = shown ? 1 : 0
        guard part.alpha != target || part.isHidden == shown else { return }
        if shown { part.isHidden = false }
        let fade = Motion.easeOut.animator(Motion.durFade) { part.alpha = target }
        fade.addCompletion { position in
            if position == .end, !shown { part.isHidden = true }
        }
        fade.startAnimation()
    }

    /// Try again on a stage that didn't start (PreviewPane.svelte `retry`):
    /// the page loads again, which asks the stage to start again; pending
    /// until that load ends.
    private func tryStageAgain() {
        retrying = true
        down.pending(true)
        reload()
    }

    private func endRetry() {
        guard retrying else { return }
        retrying = false
        down.pending(false)
    }

    /// A shortcut's name as core's `SHELL_SHORTCUTS` names it, as the shell's command it runs.
    private static func shellCommand(_ value: Any?) -> RootViewController.ShellCommand? {
        switch value as? String {
        case "new-session": .startSession
        case "jump": .jump
        case "split-right": .splitRight
        case "split-down": .splitDown
        default: nil
        }
    }

    /// Whether the keyboard is in a preview's page: the page then has the
    /// first claim on every key, as the dashboard's iframe has (overlay
    /// page.ts `leftToShell`), so the app's own key commands stand down and
    /// the page hands back, as `cawco:shortcut`, the shell's combos it left.
    static var pageHoldsKeys: Bool {
        var at = UIResponder.current as? UIView
        while let view = at {
            if view is PreviewPage { return true }
            at = view.superview
        }
        return false
    }

    // MARK: The mode

    /// The pane's mode, kept for the session and told to the page; the head's
    /// segment chosen and, in Comment and Draw, the well's accent edge.
    /// `place` is the moved pin the next tap in Comment places again.
    private func setMode(_ next: Mode, place: String? = nil) {
        #if DEBUG
        let was = mode
        #endif
        mode = next
        placing = next == .comment ? place : nil
        UserDefaults.standard.set(next.rawValue, forKey: modeKey)
        paintMode()
        deliver(["type": "cawco:mode", "mode": next.rawValue, "place": placing.map { $0 as Any } ?? NSNull()])
        #if DEBUG
        PreviewProbe.say("preview mode \(next.rawValue)")
        // The probe's own words for entering and leaving Comment.
        if next == .comment { PreviewProbe.say("preview comment on") }
        if was == .comment, next != .comment { PreviewProbe.say("preview comment off") }
        #endif
    }

    /// The segments' glyphs alone, as the web's modes are (their names stay
    /// VoiceOver's), so the head keeps its room at every width.
    private func paintMode() {
        guard isViewLoaded else { return }
        modes.namesShown = false
        modes.select(Mode.allCases.firstIndex(of: mode))
        modePick.configuration?.image = mode.glyph.image.resized(to: Size.iconMd)
        modePick.accessibilityLabel = "Preview mode"
        modePick.accessibilityValue = mode.name
        modePick.toolTip = "Preview mode: \(mode.name)"
        reloadButton.setNeedsUpdateConfiguration()
        paintWell()
    }

    private func reload() {
        clearFailure()
        revision = nil
        show()
    }

    private func failed(_ message: String, of: String?) {
        #if DEBUG
        PreviewProbe.say("preview failed: \(message)")
        #endif
        failureOf = of
        failure.label.text = message
        failure.isHidden = false
        #if DEBUG
        // Where the band stands once it is laid out, over the well and the page it covers.
        DispatchQueue.main.async { [weak self] in
            guard let self, PreviewProbe.on else { return }
            view.layoutIfNeeded()
            let box = { (part: UIView) -> String in
                let frame = part.convert(part.bounds, to: nil)
                return "\(Double(frame.minX)),\(Double(frame.minY)),\(Double(frame.width)),\(Double(frame.height))"
            }
            PreviewProbe.say("preview geometry band=\(box(failure)) web=\(box(web)) well=\(box(well)) shown=\(!failure.isHidden)")
        }
        #endif
    }

    private func clearFailure() {
        failureOf = nil
        failure.isHidden = true
    }

    private func paintWell() {
        let marking = mode != .interact
        let edge = (marking ? Palette.accent : Palette.borderHairline).resolvedColor(with: traitCollection)
        let width = marking ? Size.focusRingWidth : 1
        // Expanded, only the top edge is drawn: the sides are the session area's own.
        well.layer.borderColor = edge.cgColor
        well.layer.borderWidth = expanded ? 0 : width
        wellEdge.isHidden = !expanded
        wellEdge.backgroundColor = edge
        wellEdgeHeight.constant = width
    }

    /// Hands the page a message from its host, as the dashboard's pane posts to its iframe.
    private func deliver(_ message: [String: Any]) {
        guard isViewLoaded, let data = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: data, encoding: .utf8) else { return }
        #if DEBUG
        probeDelivered?(message)
        #endif
        web.evaluateJavaScript("window.__cawcoDeliver && window.__cawcoDeliver(\(json))")
    }

    /// The pane's keys, heard while the page has the keyboard (PreviewPane.svelte
    /// `pressKey`): V, C and D the modes, ⇧C (`C`) every pin hidden or shown,
    /// J and K a step through the pins, Enter opens one, Esc closes.
    private func press(_ key: String) {
        switch key {
        case "v" where !canvasShown: setMode(.interact)
        case "c" where !canvasShown: setMode(.comment)
        case "d" where !canvasShown: setMode(.draw)
        case "C" where !canvasShown:
            pinsShown.toggle()
            deliver(["type": "cawco:pins-shown", "shown": pinsShown])
            paintPins()
        case "j": step(1)
        case "k": step(-1)
        case "Enter": if let focusedPin { openCard(focusedPin) }
        case "Escape":
            if !escape() { onEscapeLeft() }
        default: break
        }
    }

    /// The next or the previous pin on the page, outlined and scrolled to (a resolved one has left it).
    private func step(_ by: Int) {
        let stepping = comments.pins.filter { !$0.moved && !$0.resolved }
        guard !stepping.isEmpty else { return }
        let at = stepping.firstIndex { $0.id == focusedPin } ?? -1
        let next = stepping[((at + by) % stepping.count + stepping.count) % stepping.count]
        focusedPin = next.id
        deliver(["type": "cawco:focus-pin", "id": next.id, "scroll": true])
        if openPin != nil { openCard(next.id) }
    }

    // MARK: The pencil

    /// The pencil's double-tap, as the person set it in Settings: only
    /// switching to the eraser or to the tool before act; the page's canvas
    /// toggles its eraser on it.
    func pencilInteraction(_: UIPencilInteraction, didReceiveTap _: UIPencilInteraction.Tap) {
        let action: String
        switch UIPencilInteraction.preferredTapAction {
        case .switchEraser: action = "eraser"
        case .switchPrevious: action = "previous"
        default: return
        }
        deliver(["type": "cawco:pencil-double-tap", "action": action])
    }

    // MARK: The pins

    /// The artifact's pins and unsent picks as the hub has them now, read
    /// when the page says its doc changed (`cawco:doc`), when the pane
    /// appears and after the app's own acts; one read at a time, and one
    /// more after it when asked meanwhile, so a read under way when the doc
    /// changed is never the last.
    private func refresh() {
        guard let artifact = artifactId else { return }
        guard !reading else {
            readAgain = true
            return
        }
        reading = true
        Task { [weak self] in
            guard let self else { return }
            #if DEBUG
            let began = ContinuousClock.now
            defer { PreviewProbe.say("preview refresh took=\((ContinuousClock.now - began).components.seconds)s") }
            #endif
            do {
                let read = try await hub.comments(on: artifact, in: instanceId)
                if artifact == artifactId {
                    held(.ready)
                    adopt(read)
                }
                if failureOf == "pins" { clearFailure() }
            } catch {
                #if DEBUG
                PreviewProbe.say("preview refresh failed: \(error.localizedDescription)")
                #endif
                if artifact == artifactId {
                    if pinsHold == .ready {
                        failed("Couldn't read the pins: \(error.localizedDescription)", of: "pins")
                    } else {
                        // Never read: said once, in the list, with Try again (WORDS.md).
                        held(.failed(Self.sentence(error.localizedDescription)))
                    }
                }
            }
            reading = false
            if readAgain {
                readAgain = false
                refresh()
            }
        }
    }

    /// A read of this artifact's pins begins: nothing drawn inside the wait's
    /// grace, then the list's skeleton (The Real Wait Rule).
    private func readPins() {
        pinsGrace?.cancel()
        held(.quiet)
        pinsGrace = Task { [weak self] in
            try? await Task.sleep(for: .seconds(Motion.durWaitGrace))
            guard !Task.isCancelled, let self, pinsHold == .quiet else { return }
            held(.reading)
        }
    }

    /// Where the pins' read stands, told to the list and the head.
    private func held(_ hold: PinListController.Hold) {
        if hold != .quiet, hold != .reading { pinsGrace?.cancel() }
        guard hold != pinsHold else { return }
        pinsHold = hold
        list?.hold = hold
        paintPins()
    }

    /// `text` as a sentence of its own, ending in its mark.
    private static func sentence(_ text: String) -> String {
        let said = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let last = said.last else { return "The hub didn't answer." }
        return ".!?".contains(last) ? said : "\(said)."
    }

    private func adopt(_ read: ArtifactComments) {
        #if DEBUG
        // Every read, changed or not, with the card as it stands when it lands.
        defer {
            let card = openPin == nil ? "closed" : self.card.isHidden ? "waiting" : "open:\(self.card.number) writing=\(writing)"
            PreviewProbe.say("preview read pins=\(read.pins.map { "\($0.label)" }.joined(separator: ",")) card=\(card)")
        }
        #endif
        guard read != comments else { return }
        // A pin just made reaches the hub after its card opened: a read that
        // does not hold it yet leaves the card open; only a pin the last read
        // held and this one does not (deleted, erased) closes it.
        let held = openPin.map { open in comments.pins.contains { $0.id == open } } ?? false
        comments = read
        live = read.live(working: sessionWorking)
        paintPins()
        list?.show(read.pins, live: live)
        if held, let openPin, !read.pins.contains(where: { $0.id == openPin }) { closeCard() }
        paintCard()
        #if DEBUG
        PreviewProbe.say("preview pins n=\(read.pins.count) open=\(read.open) picks=\(read.unsentPicks) sent=\(read.sentAt ?? "-") " + read.pins.map {
            "\($0.label)=\($0.moved ? "moved" : $0.resolved ? "resolved" : "open"):\($0.thread.count)\($0.unsent ? ":unsent" : "")"
        }.joined(separator: " "))
        #endif
    }

    /// Whether the session's turn runs, read from its activity pulse (as the
    /// web's `activityOf` prefers it) and read again when the pulse changes.
    private func watchWorking() {
        var working = withObservationTracking {
            hub.fleet.activityPulse(instanceId)?.activity == .working
        } onChange: { [weak self] in
            Task { @MainActor in self?.watchWorking() }
        }
        #if DEBUG
        // `-preview-working`: the probe's mock session ends its turns at once.
        if PreviewProbe.workingAtLaunch { working = true }
        #endif
        guard working != sessionWorking else { return }
        sessionWorking = working
        let next = comments.live(working: working)
        guard next != live else { return }
        live = next
        list?.show(comments.pins, live: live)
        paintCard()
    }

    /// The head's Comments, its badge the open pins (PreviewPane.svelte `.comments`).
    private func paintPins() {
        guard isViewLoaded else { return }
        // The open count only once read and above 0 (The Earned Count Rule), one
        // `--btn-gap` after the word (or the glyph alone on a narrow pane).
        let counted = openPins > 0
        pinsBadge.text = "\(openPins)"
        pinsBadge.isHidden = !counted
        KitButton.setTitle(narrow ? "" : "Comments", of: pinsButton, variant: .ghost, height: .sm)
        pinsButton.accessibilityLabel = "Comments\(counted ? ", \(openPins) open" : "")\(pinsShown ? "" : ", pins hidden")"
        let badge = counted ? pinsBadge.intrinsicContentSize.width + Space.space1 : 0
        pinsButton.configuration?.contentInsets.trailing = Space.space2 + badge
        placeHeadItems()
    }

    /// The Comments panel (PinList.svelte), the kit's floating surface hung
    /// off the well's top-right corner under the head, as the web's panel
    /// is: about a fifth of the pane wide (`c-pin-list-*`), no taller than
    /// the well less its gutters, its rows scrolling inside. It stands over
    /// the page and never pushes it; the page keeps taking touches under it
    /// (passthrough), and a tap anywhere else puts it away.
    private func openList() {
        let content = PinListController()
        content.heading = true
        content.placing = placing
        content.hold = pinsHold
        content.show(comments.pins, live: live)
        content.onRetry = { [weak self] in
            self?.readPins()
            self?.refresh()
        }
        content.onOpen = { [weak self, weak content] id in
            content?.dismiss(animated: true)
            self?.openCard(id)
        }
        content.onPlace = { [weak self, weak content] id in
            content?.dismiss(animated: true)
            self?.placeAgain(id)
        }
        content.onClose = { [weak content] in content?.dismiss(animated: true) }
        list = content
        let gutter: Double = Space.space2
        let roomWidth = Double(well.bounds.width)
        let roomHeight = Double(well.bounds.height)
        let share: Double = roomWidth * Size.cPinListShare
        let width: Double = Swift.min(Swift.max(share, Size.cPinListMin), Size.cPinListMax, roomWidth - gutter * 2)
        content.loadViewIfNeeded()
        content.preferredContentSize = CGSize(width: width, height: 0)
        content.fitsWithin = roomHeight - gutter * 2
        content.fit()
        KitPopover.present(content, from: well, rect: CGRect(x: roomWidth - gutter, y: 0, width: 0, height: 0), in: self,
                           align: .end, side: .bottom, offset: gutter, passthrough: [web!])
        if let focusedPin { content.reveal(focusedPin) }
    }

    /// Place again: Comment mode until the next tap pins the moved pin anew.
    private func placeAgain(_ id: String) {
        placingFrom = mode
        closeCard()
        setMode(.comment, place: id)
    }

    // MARK: The card

    /// Pin `id`'s card opens; `made`, for the pin the person just made.
    /// Another pin's card is dismissed first (PreviewPane.svelte `openCard`).
    private func openCard(_ id: String, made: Bool = false) {
        if let open = openPin, open != id { closeCard(by: "another") }
        // The card never stands under the Comments panel: it goes, as a row's
        // own press puts it away, whichever way the card opens (J, K, Enter,
        // a pin's disc on the page).
        if let list, list.presentingViewController != nil, !list.isBeingDismissed {
            list.dismiss(animated: true)
        }
        if made { madePin = id }
        openPin = id
        focusedPin = id
        cardError = nil
        pinAt = nil
        deliver(["type": "cawco:track-pin", "id": id])
        deliver(["type": "cawco:focus-pin", "id": id, "scroll": true])
        paintCard()
    }

    /// The card is dismissed (PreviewPane.svelte `closeCard`): a tap outside
    /// it, in the app or on the page, Esc, its Close, another pin opened, a
    /// delete; `by` names which, for the probe. Its words stay with its pin;
    /// a pin just made that holds neither words nor a thread is taken back
    /// by the page's overlay (`cawco:withdraw`, core `withdrawPin`), its ink
    /// left as it was.
    private func closeCard(by: String = "close") {
        guard let id = openPin else { return }
        openPin = nil
        pinAt = nil
        cardError = nil
        card.isHidden = true
        card.endEditing(true)
        card.closed()
        outsidePress.view?.removeGestureRecognizer(outsidePress)
        pressOnPage = false
        pagePressed = false
        deliver(["type": "cawco:track-pin", "id": NSNull()])
        var withdrawn = false
        if id == madePin {
            madePin = nil
            if (drafts[id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                drafts[id] = nil
                deliver(["type": "cawco:withdraw", "pin": id])
                withdrawn = true
            }
        }
        #if DEBUG
        PreviewProbe.say("preview card closed")
        PreviewProbe.say("preview card dismissed by=\(by) draft=\(drafts[id]?.count ?? 0) withdrawn=\(withdrawn)")
        #else
        _ = withdrawn
        #endif
    }

    /// A tap outside the open card, anywhere in the window, closes it: the
    /// house's outside-press rule (press-outside.ts), as iOS's own popovers
    /// close on a tap outside them. Touches on the card are its own, those
    /// in a layer the preview presented (the pins' sheet) are that layer's,
    /// and the page says its own
    /// (`cawco:press`), where a tap on a pin's disc opens that pin instead.
    /// It only watches, and closes once the tap has lifted and what it
    /// landed on has taken it. Closing the card ends its editing and sends
    /// the keyboard away, which moves what the keyboard had moved; a close
    /// made while the finger was still down (as the touch began, or as a
    /// tap recognizer's, ahead of the button's own touch end) left Done's
    /// own action unrun (the Mac's probe, both ways: "dismissed by=outside"
    /// and no "comment off" within 15s after it).
    private lazy var outsidePress: PressWatcher = {
        let watcher = PressWatcher(target: nil, action: nil)
        watcher.cancelsTouchesInView = false
        watcher.delaysTouchesBegan = false
        watcher.delaysTouchesEnded = false
        watcher.delegate = self
        watcher.pressed = { [weak self] in
            // After the touch's own delivery: the watcher leaves the window as the card closes.
            Task { @MainActor in self?.pressEnded() }
        }
        watcher.cancelled = { [weak self] in
            // A touch the page's scroll took: its press still closes the card, as on the web.
            Task { @MainActor in self?.pressEnded(onlyPage: true) }
        }
        return watcher
    }()

    /// The watched touch is on the page: the page says whether it pressed
    /// outside the card (`cawco:press`), and the card closes as it lifts.
    private var pressOnPage = false
    /// The page said its press while the finger was still down.
    private var pagePressed = false

    /// The watched touch has ended. Off the page it closes the card; on it,
    /// only once the page has said its press (or as that word arrives, if it
    /// comes after the lift), so a tap on a pin's disc or in Comment mode
    /// closes nothing.
    private func pressEnded(onlyPage: Bool = false) {
        let onPage = pressOnPage
        pressOnPage = false
        if onPage {
            if pagePressed { closeCard(by: "page") }
        } else if !onlyPage {
            closeCard(by: "outside")
        }
    }

    /// A pin's own address (its card's Copy link, PreviewPane.svelte
    /// `pinLink`): its artifact's tab on the dashboard, opening the pin's
    /// card; the hub's address, as a session's link is (PaneHost `link`).
    private func pinLink(_ number: Int) -> URL? {
        guard let artifactId, let tab = hub.address?.appendingPathComponent("artifact").appendingPathComponent(artifactId) else { return nil }
        var parts = URLComponents(url: tab, resolvingAgainstBaseURL: false)
        parts?.queryItems = [URLQueryItem(name: "pin", value: "\(number)")]
        return parts?.url
    }

    /// The open card as its pin stands in the hub's last read.
    private func paintCard() {
        guard let openPin else { return }
        guard let pin = comments.pins.first(where: { $0.id == openPin }) else {
            // A pin just made: the hub's next read brings it.
            card.isHidden = true
            return
        }
        let arriving = card.isHidden
        card.isHidden = false
        card.link = pinLink(pin.label)
        // The agent answers as the session the artifact belongs to (PreviewPane.svelte `ownerName`).
        let agentName = hub.fleet.byId[instanceId].map { hub.fleet.title($0) } ?? "The session"
        card.show(pin, agentName: agentName, live: live.contains(openPin), problem: cardError, replying: replying,
                  draft: drafts[openPin] ?? "")
        if outsidePress.view == nil, let window = view.window { window.addGestureRecognizer(outsidePress) }
        placeCard()
        if arriving {
            // It arrives as a floating card does: rising `popRise` from 0.96 over `durPop`.
            if !UIAccessibility.isReduceMotionEnabled {
                view.layoutIfNeeded()
                card.alpha = 0
                card.transform = CGAffineTransform(translationX: 0, y: Motion.popRise).scaledBy(x: 0.96, y: 0.96)
                Motion.easeOut.animator(Motion.durPop) {
                    self.card.alpha = 1
                    self.card.transform = .identity
                }.startAnimation()
            }
            UIAccessibility.post(notification: .screenChanged, argument: card)
        }
        #if DEBUG
        view.layoutIfNeeded()
        PreviewProbe.say(card.probeLine())
        PreviewProbe.say("preview card-draft pin=\(card.number) chars=\((drafts[openPin] ?? "").count)")
        let frame = { (box: CGRect) in "\(Int(box.minX)),\(Int(box.minY)),\(Int(box.width)),\(Int(box.height))" }
        PreviewProbe.say("preview card-geometry card=\(frame(card.convert(card.bounds, to: nil))) well=\(frame(well.convert(well.bounds, to: nil))) keyboard=\(frame(view.keyboardLayoutGuide.layoutFrame)) view=\(frame(view.convert(view.bounds, to: nil))) \(card.probeScroll)")
        #endif
    }

    private func placeCardConstraints() {
        guard isViewLoaded else { return }
        if cardLeft == nil {
            cardLeft = card.leadingAnchor.constraint(equalTo: well.leadingAnchor, constant: Space.space2)
            cardTop = card.topAnchor.constraint(equalTo: well.topAnchor, constant: Space.space2)
            cardTop.priority = .required - 1
            cardWidth = card.widthAnchor.constraint(equalToConstant: Size.cPinCardW)
            let keyboard = card.bottomAnchor.constraint(lessThanOrEqualTo: view.keyboardLayoutGuide.topAnchor, constant: -Space.space2)
            let foot = card.bottomAnchor.constraint(equalTo: well.bottomAnchor)
            foot.priority = .required - 1
            cardPlace = [cardLeft, cardTop, cardWidth,
                         card.heightAnchor.constraint(lessThanOrEqualTo: well.heightAnchor, constant: -Space.space2 * 2)]
            cardDrawerPlace = [
                card.leadingAnchor.constraint(equalTo: well.leadingAnchor),
                card.trailingAnchor.constraint(equalTo: well.trailingAnchor),
                foot,
            ]
            cardShort = card.heightAnchor.constraint(lessThanOrEqualTo: well.heightAnchor, multiplier: 0.7)
            NSLayoutConstraint.activate([
                keyboard,
                card.topAnchor.constraint(greaterThanOrEqualTo: well.topAnchor),
            ])
        }
        NSLayoutConstraint.deactivate(drawer ? cardPlace : cardDrawerPlace)
        NSLayoutConstraint.activate(drawer ? cardDrawerPlace : cardPlace)
        card.drawer = drawer
        roomForCard()
    }

    /// On a phone the card stands at most 70% of the well tall (PinCard.svelte
    /// `.sheet`), the page showing above it; while the person writes, the
    /// keyboard has taken the room, and the card takes the whole well.
    private func roomForCard() {
        cardShort.isActive = drawer && !writing
    }

    /// Beside its pin, on the side with room, inside the well
    /// (PinCard.svelte `place`): `space-3` from the pin, 8pt from the well's
    /// edge; at the well's top-right while the pin is off screen. The phone's
    /// card stands at the well's foot.
    private func placeCard() {
        guard openPin != nil, !drawer, cardLeft != nil else { return }
        let room = well.bounds.size
        guard room.width > 0 else { return }
        let gap = Space.space3
        let edge = 8.0
        let width = min(Size.cPinCardW, room.width - edge * 2)
        let height = min(card.systemLayoutSizeFitting(CGSize(width: width, height: 0),
                                                      withHorizontalFittingPriority: .required,
                                                      verticalFittingPriority: .fittingSizeLevel).height,
                         room.height - edge * 2)
        var left = room.width - width - edge
        var top = edge
        if let at = pinAt {
            let x = web.frame.minX + at.x
            let y = web.frame.minY + at.y
            left = x + at.r + gap
            if left + width > room.width - edge { left = x - at.r - gap - width }
            left = max(edge, min(left, room.width - width - edge))
            top = max(edge, min(y - at.r, room.height - height - edge))
        }
        if cardWidth.constant != width { cardWidth.constant = width }
        if cardLeft.constant != left { cardLeft.constant = left }
        if cardTop.constant != top { cardTop.constant = top }
    }

    /// The person's words in the open pin's thread: the page's overlay writes
    /// them into the artifact's doc, as every person's reply is written
    /// (`cawco:reply`). A refusal stays under the field with the words still
    /// in it. A resolved pin's reply reopens it ("Reply to reopen").
    private func reply(_ text: String) {
        guard let pin = openPin, !replying else { return }
        let reopens = comments.pins.first { $0.id == pin }?.resolved == true
        replying = true
        cardError = nil
        paintCard()
        Task { [weak self] in
            guard let self else { return }
            let refused = await ask("reply", pin: pin, ["type": "cawco:reply", "pin": pin, "text": text],
                                    silent: "The page didn't answer, so the reply wasn't kept. Try again.")
            if refused == nil {
                // Said: the words are in the thread, so no draft is left, and the pin stays.
                drafts[pin] = nil
                if madePin == pin { madePin = nil }
                if openPin == pin { card.replied() }
            }
            cardError = refused
            replying = false
            paintCard()
            if refused == nil, reopens, openPin == pin {
                resolve(false)
                return
            }
            // The thread as the hub has it now, at once.
            if refused == nil { refresh() }
        }
    }

    /// Resolve or Reopen, written by the page's overlay (`cawco:resolve`).
    private func resolve(_ resolved: Bool) {
        guard let pin = openPin, !resolving else { return }
        resolving = true
        cardError = nil
        Task { [weak self] in
            guard let self else { return }
            let refused = await ask("resolve", pin: pin, ["type": "cawco:resolve", "pin": pin, "resolved": resolved],
                                    silent: "The page didn't answer, so the pin wasn't \(resolved ? "resolved" : "reopened"). Try again.")
            cardError = refused
            resolving = false
            paintCard()
            if refused == nil { refresh() }
        }
    }

    /// Delete, once the person confirmed it in the card (`cawco:delete`): the
    /// page's overlay takes the pin, and the ink only it stands on, from the
    /// artifact's doc; the other pins keep their numbers. Gone, the card
    /// closes and the pins are read again at once; a refusal is thrown, and
    /// stays under the card's question in the page's words.
    private func delete() async throws {
        guard let pin = openPin else { return }
        if let refused = await ask("delete", pin: pin, ["type": "cawco:delete", "pin": pin],
                                   silent: "The page didn't answer, so the pin wasn't deleted. Try again.") {
            throw Refused(sentence: refused)
        }
        drafts[pin] = nil
        if openPin == pin { closeCard(by: "delete") }
        refresh()
    }

    /// The page's refusal, as the card's question says it.
    private struct Refused: LocalizedError {
        let sentence: String
        var errorDescription: String? { sentence }
    }

    /// Hands the page `message` and waits for its overlay's answer
    /// (`cawco:<what>-result` for `pin`): nil when it was kept, else the
    /// page's own sentence; `silent` when no answer came within `answerWithin`.
    private func ask(_ what: String, pin: String, _ message: [String: Any], silent: String) async -> String? {
        guard connected else { return silent }
        let key = "\(what):\(pin)"
        // An ask still out for the same pin hears that a newer one took its place.
        answers.removeValue(forKey: key)?.resume(returning: silent)
        return await withCheckedContinuation { (answer: CheckedContinuation<String?, Never>) in
            answers[key] = answer
            deliver(message)
            Task { [self] in
                try? await Task.sleep(for: Self.answerWithin)
                guard let unanswered = answers.removeValue(forKey: key) else { return }
                #if DEBUG
                PreviewProbe.say("preview \(what)-result none")
                #endif
                unanswered.resume(returning: silent)
            }
        }
    }

    /// The overlay's answer to an ask (`cawco:reply-result`, `cawco:resolve-result`, `cawco:delete-result`).
    private func answered(_ what: String, _ body: [String: Any]) {
        guard let pin = Self.pinId(body["pin"]), let answer = answers.removeValue(forKey: "\(what):\(pin)") else { return }
        let kept = body["ok"] as? Bool == true
        let refused = kept ? nil : Self.text(body["error"], 300) ?? "The page didn't keep it. Try again."
        #if DEBUG
        let number = comments.pins.first { $0.id == pin }?.label ?? 0
        PreviewProbe.say("preview \(what)-result pin=\(number) \(refused.map { "refused: \($0)" } ?? "ok")")
        #endif
        answer.resume(returning: refused)
    }

    // MARK: Shown

    /// A load ended: the proxy's own page names the hop that did not answer
    /// (core `PREVIEW_DOWN_META`); otherwise the overlay has `silentAfter` to
    /// answer the hello before the page counts as not loaded.
    private func loaded(_ revision: String?) {
        guard let revision else { return }
        silence?.cancel()
        web.evaluateJavaScript("document.querySelector('meta[name=\"cawco-preview-down\"]')?.getAttribute('content') ?? null") { [weak self] value, _ in
            guard let self, let said = value as? String, let down = ShownFailure(rawValue: said), down != .page else { return }
            word(revision, failure: down)
        }
        silence = Task { [weak self] in
            try? await Task.sleep(for: Self.silentAfter)
            guard !Task.isCancelled, let self, self.revision == revision, !connected else { return }
            word(revision, failure: .page)
        }
    }

    /// What this view has to say of `revision`: the first word, or a ready that came after a silence it had not said yet.
    private func word(_ revision: String, failure: ShownFailure?) {
        let first = shownWord?.revision != revision
        let readyAfterAll = shownWord?.failure != nil && failure == nil
        guard first || readyAfterAll else { return }
        shownWord = (revision, failure)
        sayShown()
    }

    /// This view's word on the current revision, once, while the preview is
    /// on screen and the app in front (PreviewPane.svelte's `artifactShown`).
    private func sayShown() {
        guard let word = shownWord, word.revision == revision, shownFor != word.revision, let artifact = artifactId,
              isViewLoaded, view.window?.windowScene?.activationState == .foregroundActive else { return }
        shownFor = word.revision
        Task { [weak self] in
            guard let self else { return }
            do {
                try await hub.artifactShown(artifact, in: instanceId, revision: word.revision, failure: word.failure)
                #if DEBUG
                PreviewProbe.say("preview shown \(word.failure.map { "failed \($0.rawValue)" } ?? "ok") revision=\(word.revision)")
                #endif
            } catch {
                // Unheard: the next appearance says it again.
                if shownFor == word.revision { shownFor = nil }
            }
        }
    }

    // MARK: Closing

    /// Close: the hub closes the preview, and the session's screen takes it
    /// away. `refused` hears when the hub keeps it open (the reason is said
    /// over the page), so a drawer swiped away can come back.
    func close(refused: @escaping () -> Void = {}) {
        guard !closing else { return }
        closing = true
        #if DEBUG
        PreviewProbe.say("preview close")
        #endif
        // The mode is the person's and stands; a moved pin waiting to be placed again does not.
        if placing != nil { setMode(placingFrom ?? .interact) }
        placingFrom = nil
        closeCard()
        closeButton.isEnabled = false
        Task { [weak self] in
            guard let self else { return }
            do {
                try await hub.closePreview(instanceId)
            } catch {
                failed(error.localizedDescription, of: nil)
                refused()
            }
            closing = false
            closeButton.isEnabled = true
        }
    }

    #if DEBUG
    // MARK: The simulator probe

    /// The header as the probe reads it: what toggles Comment and its centre
    /// ("Comment" at Comment's segment, or while commenting "Interact" at
    /// Interact's, the way out), the mode, Draw's centre, the open pins and
    /// Comments' centre, Reload's, the grabber's, and the web view's frame.
    private func headLine() -> String {
        let centre = PreviewProbe.centre
        let words = mode == .comment ? "Interact" : "Comment"
        let toggle = segmentCentre(mode == .comment ? 0 : 1)
        let grab = grabArea.isHidden ? "none" : centre(grabber)
        let page = web.convert(web.bounds, to: nil)
        return "preview head comment=\(words)@\(toggle) mode=\(mode.rawValue) draw=\(segmentCentre(2)) pins=\(openPins)@\(centre(pinsButton)) reload=\(centre(reloadButton)) grabber=\(grab) web=\(Int(page.minX.rounded())),\(Int(page.minY.rounded())),\(Int(page.width.rounded())),\(Int(page.height.rounded()))"
    }

    /// The centre of the mode's segment at `index` in the window: the segmented's width in three.
    private func segmentCentre(_ index: Int) -> String {
        guard PreviewProbe.centre(modes) != "none" else { return "none" }
        let box = modes.convert(modes.bounds, to: nil)
        let third = Double(box.width) / 3
        let x = Double(box.minX) + third * (Double(index) + 0.5)
        return "\(Int(x.rounded())),\(Int(Double(box.midY).rounded()))"
    }

    /// `-menu-remove` and `-inspect-set` act once a launch.
    private static var menuDone = false
    private static var inspectDone = false
    private var menuAtLaunch: Bool {
        get { Self.menuDone }
        set { Self.menuDone = newValue }
    }

    /// `-inspect-set`: the inspector opened, the prop set to the option named, Save, once.
    private func inspectAtLaunch() {
        guard let (name, value) = PreviewProbe.inspectSet, !Self.inspectDone, let inspection,
              let prop = inspection.component?.props.first(where: { $0.name == name }),
              let option = prop.options?.first(where: { $0.shown == value }) else { return }
        Self.inspectDone = true
        showInspector(true)
        inspection.set(prop, option)
        PreviewProbe.say("inspector set \(name)=\(value) story=\(inspection.chosen ?? "-")")
        Task { await inspection.save() }
    }

    /// Expand's words and centre and Close's centre, for the session's `split` line.
    var probeExpand: String {
        "expand=\(expandButton.accessibilityLabel ?? "?")@\(PreviewProbe.centre(expandButton)) close=\(PreviewProbe.centre(closeButton))"
    }

    // MARK: The probe's reads of the head

    /// Every message `deliver` hands the page, as it hands it.
    var probeDelivered: (([String: Any]) -> Void)?
    /// The room `placeHeadItems` left once it placed the controls, pt.
    private var laidLeft = 0.0
    /// What the first fit stood, when More held Comments' count and the second one was taken; nil otherwise.
    private var laidFirst: Set<HeadItem>?
    /// The open pins the head is counted and laid out for, in place of the hub's read.
    var probeOpen: Int? {
        // Comments' badge takes the count, and its paint lays the head out again.
        didSet { paintPins() }
    }

    /// The panel as a component canvas's: the inspection `adoptSheet` makes
    /// for a `.component` frame, so the head wants what it wants for one.
    func probeAsComponent(name: String) {
        titleButton.show(kind: .component, name: name)
        inspection = SheetInspection(post: { [weak self] message in self?.deliver(message) }, write: { _ in })
        placeHeadItems()
    }

    var probeCanvasView: CanvasViewControl { canvasView }

    /// The controls standing now, the mode's pick named as the mode.
    var probeStood: Set<String> {
        Set(slots.filter { !$0.value.isHidden }.map { $0.key == .modePick ? HeadItem.mode.rawValue : $0.key.rawValue })
    }

    /// Whether More's count changed what stands: the second fit stood otherwise than the first.
    var probeRecounted: Bool {
        laidFirst.map { $0 != Set(slots.filter { !$0.value.isHidden }.map(\.key)) } ?? false
    }
    /// More's menu as it would open now.
    var probeOverflow: [UIMenuElement] { overflowMenu() }

    /// The page said it is ready (`cawco:ready`).
    func probeReady() { ready() }

    /// The head as it stands: its width, the name's, the room left after
    /// placing and what the mode's segments cost over its pick, then each
    /// control standing after the name (its key, its form, its frame in the
    /// head) and what More holds.
    func probeStanding() -> String {
        guard let head = dragArea as? UIStackView else { return "no head" }
        let room = { (item: HeadItem) in self.slots[item]?.fittingWidth ?? 0 }
        let shown = head.arrangedSubviews.dropFirst().filter { !$0.isHidden }.map { slot -> String in
            let key = slots.first { $0.value === slot }?.key
            let name = key?.rawValue ?? (slot === moreSlot ? "more" : "close")
            let form = switch key {
            case .mode: "segments"
            case .modePick: "pick"
            case .comments: narrow ? "glyph" : "words"
            default: "glyph"
            }
            let box = slot.frame
            return "\(name):\(form)@\(Int(box.minX.rounded())),\(Int(box.minY.rounded())),\(Int(box.width.rounded()))x\(Int(box.height.rounded()))"
        }
        let more = overflowed.isEmpty ? "-" : overflowed.map(\.rawValue).joined(separator: ",")
        let first = laidFirst.map { set in HeadItem.allCases.filter(set.contains).map(\.rawValue).joined(separator: ",") } ?? "-"
        return "width=\(Int(head.bounds.width.rounded())) name=\(Int(titleButton.bounds.width.rounded())) left=\(Int(laidLeft.rounded(.down))) segments=\(Int((room(.mode) - room(.modePick)).rounded(.up))) open=\(openPins) first=\(first.isEmpty ? "none" : first) shown=\(shown.joined(separator: " ")) more=\(more)"
    }

    /// The header as last logged on a layout: logged again only when it moved.
    private var laidHead = ""
    private var laidRoom = ""

    /// The card and its question as last logged on a layout.
    private var laidCard: [String] = []

    /// A layout that moved the header (a drawer drag, a mode) says so at once,
    /// whatever the page's own posts do; so does the open card, once the pass
    /// has laid it out (a keyboard leaving, a sheet put away).
    private func probeLayout() {
        guard PreviewProbe.on, view.window != nil else { return }
        let line = headLine()
        if line != laidHead {
            laidHead = line
            PreviewProbe.say(line)
        }
        probeRoom()
        DispatchQueue.main.async { [weak self] in
            guard let self, openPin != nil, !card.isHidden else { return }
            view.layoutIfNeeded()
            let now = cardLines()
            guard now != laidCard else { return }
            laidCard = now
            now.forEach(PreviewProbe.say)
        }
    }

    /// What of the head the name keeps, against the controls standing after
    /// it (each by its slot's width, More and Close last) and what More holds,
    /// as laid out: read on each layout and on the page's heartbeat, so a
    /// head that settled after its first layout is read as it stands.
    private func probeRoom() {
        guard PreviewProbe.on, view.window != nil, let head = dragArea as? UIStackView, head.bounds.width > 0 else { return }
        let shown = head.arrangedSubviews.dropFirst().filter { !$0.isHidden }.map { slot in
            let name = slots.first { $0.value === slot }?.key.rawValue ?? (slot === moreSlot ? "more" : "close")
            return "\(name):\(Int(slot.bounds.width.rounded()))x\(Int(slot.bounds.height.rounded()))"
        }
        let more = overflowed.isEmpty ? "-" : overflowed.map(\.rawValue).joined(separator: ",")
        let badge = moreBadge.isHidden || moreSlot.isHidden ? "-" : moreBadge.text ?? "-"
        let room = "preview head room width=\(Int(head.bounds.width)) title=\(Int(titleButton.bounds.width)) floor=\(Int(nameKept)) shown=\(shown.joined(separator: ",")) more=\(more) badge=\(badge)"
        if room != laidRoom {
            laidRoom = room
            PreviewProbe.say(room)
        }
        // Where Open in new tab and More stand in the window, where a simulator touch lands.
        let at = "preview head open-tab=\(PreviewProbe.centre(openTabButton)) more=\(PreviewProbe.centre(moreButton))"
        if at != laidOpenTab {
            laidOpenTab = at
            PreviewProbe.say(at)
        }
    }

    private var laidOpenTab = ""

    /// The open card's lines: its controls, its question, and its footer's
    /// buttons against the keyboard's top, all in the window's points.
    private func cardLines() -> [String] {
        let keyboard = view.convert(view.keyboardLayoutGuide.layoutFrame, to: nil)
        return [card.probeLine(), card.askLine(), "preview card-keys \(card.probeFooter) keyboardTop=\(Int(keyboard.minY))"]
    }

    /// The probe's page reports where its parts stand (its `report`) on the
    /// app's own clock: the page's timers can stop in WebKit while the app
    /// runs on, and every post is read where the views stand when it lands.
    private var heartbeat: Timer?

    private func startHeartbeat() {
        guard PreviewProbe.on, heartbeat == nil else { return }
        heartbeat = Timer.scheduledTimer(withTimeInterval: 0.7, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.web.evaluateJavaScript(Self.docRead) { value, _ in
                    MainActor.assumeIsolated { self?.sayDoc(value as? String) }
                }
                self?.probeRoom()
            }
        }
    }

    /// The probe page's `report`, then the document as it stands: its clock's
    /// origin (`performance.timeOrigin`, new with every load, so a reload is
    /// seen even where no navigation is), and its artifact doc's elements,
    /// drawn and not deleted (a canvas's; 0 on a page, -1 before the overlay joins).
    private static let docRead = """
    (() => {
      if (typeof report === "function") report();
      const doc = window.cawcoArtifact?.doc;
      const elements = doc ? doc.getArray("elements").toArray().filter((entry) => entry.get("el")?.isDeleted !== true).length : -1;
      return `origin=${Math.round(performance.timeOrigin)} elements=${elements} width=${innerWidth} scale=${(visualViewport?.scale ?? 1).toFixed(2)}`;
    })()
    """

    private var saidDoc = ""

    /// `preview doc …`, logged when it changed.
    private func sayDoc(_ read: String?) {
        guard let read, read != saidDoc else { return }
        saidDoc = read
        PreviewProbe.say("preview doc \(read)")
    }

    /// The probe's page posts `cawco:probe` with its state and the viewport
    /// rects of what the probe taps: logged with each rect's centre in the
    /// window's points, where a simulator touch lands, after the header's own
    /// line (`headLine`: the mode's places, Comments', Reload's, the
    /// grabber's, and the web view's frame in the window), so every post
    /// says where everything is now.
    private func probePage(_ body: [String: Any]) {
        guard PreviewProbe.on, let web else { return }
        PreviewProbe.say(headLine())
        if openPin != nil, !card.isHidden { cardLines().forEach(PreviewProbe.say) }
        var parts = [Self.text(body["state"], 200) ?? ""]
        let rects = body["rects"] as? [String: Any] ?? [:]
        for name in rects.keys.sorted() {
            guard let rect = rects[name] as? [String: Any], let x = rect["x"] as? Double, let y = rect["y"] as? Double,
                  let width = rect["width"] as? Double, let height = rect["height"] as? Double else { continue }
            let at = web.convert(CGPoint(x: x + width / 2, y: y + height / 2), to: nil)
            parts.append("\(Self.text(name, 40) ?? "")=\(Int(at.x.rounded())),\(Int(at.y.rounded()))")
        }
        PreviewProbe.say("preview page \(parts.joined(separator: " "))")
    }
    #endif

    // MARK: What the page says (wire.ts)

    private static func text(_ value: Any?, _ max: Int) -> String? {
        (value as? String).map { String($0.prefix(max)) }
    }

    /// The longest capture the page may post, in UTF-16 units: two pictures (each scheme) of wire.ts `PNG_MAX` of base64 and their envelope.
    private static let captureMost = 2 * 4_000_000 + 1024

    /// wire.ts `previewPng`: a base64 PNG of at most `PNG_MAX`, its bytes.
    private static func png(_ value: Any?) -> Data? {
        guard let text = value as? String, !text.isEmpty, text.count <= 4_000_000,
              text.wholeMatch(of: /[A-Za-z0-9+\/]+={0,2}/) != nil else { return nil }
        return Data(base64Encoded: text)
    }

    /// The overlay's `cawco:captured` (wire.ts `previewThumbnail`): `png` drawn
    /// in `scheme`, `other` in the other scheme, or `single` when the page
    /// draws the same in both; nil when it carries no picture.
    private static func thumbnail(_ body: [String: Any]) -> PreviewStore.PageThumbnail? {
        guard let shown = Self.png(body["png"]) else { return nil }
        if body["single"] as? Bool == true {
            return .init(light: shown, dark: shown, single: true)
        }
        let other = Self.png(body["other"])
        return body["scheme"] as? String == "dark"
            ? .init(light: other, dark: shown, single: false)
            : .init(light: shown, dark: other, single: false)
    }

    /// A pin's id (wire.ts `previewPinId`).
    private static func pinId(_ value: Any?) -> String? {
        guard let id = value as? String, id.wholeMatch(of: /[0-9a-f-]{36}/) != nil else { return nil }
        return id
    }

    /// Where a pin's disc stands in the page's viewport (wire.ts `previewPinAt`); nil when it is not on the page.
    private static func pinAt(_ body: [String: Any]) -> (x: Double, y: Double, r: Double)? {
        guard let x = body["x"] as? Double, let y = body["y"] as? Double, let r = body["r"] as? Double,
              x.isFinite, y.isFinite, r.isFinite else { return nil }
        return (x, y, r)
    }

    /// source.ts `previewPlace`: a page by its name, a folder by its leaf, a dev server by its port.
    /// The line under the name (PreviewPane.svelte `subtitle`): a page has none, a
    /// folder its leaf, a dev server its port.
    private static func place(_ frame: PreviewFrame) -> String {
        if frame.source?.value3 != nil { return "" }
        if let dir = frame.source?.value2?.dir { return (dir as NSString).lastPathComponent }
        if let port = frame.source?.value1?.port { return "localhost:\(Int(port))" }
        return ""
    }

    /// The page lays out at the panel's width, scale 1, as the web's iframe
    /// lays it out: a page naming no viewport would otherwise stand at
    /// Safari's default 980px and be drawn shrunk to the panel (Apple's
    /// "Configuring the Viewport": "The default width is 980 pixels"). A
    /// viewport the page names itself is parsed after this one and wins; a
    /// re-publish's morph keeps this one (preview-overlay page.ts `kept`).
    /// A decision page opened in its tab (DecisionPageFrame) lays out the same way.
    static let viewport = """
    (() => {
      const meta = document.createElement("meta");
      meta.setAttribute("data-cawco-host", "");
      meta.name = "viewport";
      meta.content = "width=device-width, initial-scale=1";
      (document.head ?? document.documentElement)?.prepend(meta);
    })();
    """

    /// Stands in for the dashboard's window, the overlay's `window.parent`:
    /// what the page posts goes to the app, and what the app hands the page
    /// arrives at its message listeners from that same parent, on its own
    /// origin, as the overlay checks. A decision page opened in its tab
    /// (DecisionPageFrame) stands in the same host.
    static let host = """
    (() => {
      const listeners = new Set();
      const host = {
        // Only the overlay's own words reach the app: whatever else the
        // page posts to its parent stays in the page, never crossing to
        // the app's main thread.
        postMessage(data) {
          // The one request the page makes of its host (`cawco.pickPlace`, a JSON-RPC ask) goes too.
          const asks = !!data && data.jsonrpc === "2.0" && data.method === "cawco/pick-place";
          if (!asks && (!data || typeof data.type !== "string" || !data.type.startsWith("cawco:"))) return;
          window.webkit.messageHandlers.cawco.postMessage(JSON.stringify(data));
        },
      };
      const add = window.addEventListener;
      window.addEventListener = function (type, listener, options) {
        if (type === "message" && listener) listeners.add(listener);
        return add.call(this, type, listener, options);
      };
      const remove = window.removeEventListener;
      window.removeEventListener = function (type, listener, options) {
        if (type === "message") listeners.delete(listener);
        return remove.call(this, type, listener, options);
      };
      window.parent = host;
      // The page's load, its module scripts run: when the app says hello (the pane's iframe `load`).
      add.call(window, "load", () => window.webkit.messageHandlers.cawco.postMessage(JSON.stringify({ type: "cawco:loaded" })));
      window.__cawcoDeliver = (data) => {
        const event = { data, origin: location.origin, source: host };
        for (const listener of listeners) {
          try {
            if (typeof listener === "function") listener.call(window, event);
            else listener.handleEvent(event);
          } catch (error) { console.error(error); }
        }
      };
    })();
    """
}

/// A page's JSON-RPC id, as wire.ts `previewPickPlace` takes it: a safe integer, or a string of at most 100.
enum PickAsk {
    case number(Int)
    case text(String)

    var json: Any {
        switch self {
        case let .number(id): id
        case let .text(id): id
        }
    }
}

// MARK: A page's cawco.pickPlace()

extension PreviewController {
    /// The page's `cawco/pick-place` ask (wire.ts `previewPickPlace`), or nil when the message is not one.
    fileprivate static func pickPlaceAsk(_ body: [String: Any]) -> PickAsk? {
        guard body["jsonrpc"] as? String == "2.0", body["method"] as? String == "cawco/pick-place" else { return nil }
        if let number = body["id"] as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() {
            let value = number.doubleValue
            guard value.rounded() == value, abs(value) <= 9_007_199_254_740_991 else { return nil }
            return .number(Int(value))
        }
        if let text = body["id"] as? String, text.count <= 100 { return .text(text) }
        return nil
    }

    /// The picker for the page's ask (PlacePick.svelte): over the whole of
    /// the well in a pane, as the web draws it there, opaque, above the page
    /// and the inspector; in the phone's drawer, the house sheet
    /// (HouseSheetController), the drawer's own sheet idiom.
    fileprivate func openPick(_ ask: PickAsk) {
        picking = ask
        let pick = PlacePickView(hub: hub, titled: !drawer)
        pick.onPick = { [weak self] place in
            self?.answerPick(["machineId": place.machineId, "label": place.label, "path": place.path])
        }
        pick.onCancel = { [weak self] in self?.cancelPick() }
        placePick = pick
        if drawer {
            let content = PlacePickSheetController(pick)
            content.onGone = { [weak self] in self?.cancelPick() }
            let sheet = HouseSheetController(content, title: Words.PlacePick.title, scroller: pick.scroll)
            placePickSheet = sheet
            present(sheet, animated: true) { [weak content] in
                #if DEBUG
                // The sheet stood: the form whole under its head, not the title alone.
                guard let content else { return }
                let box = content.view.convert(content.view.bounds, to: nil)
                PreviewProbe.say("place pick sheet content=\(Int(box.minY)),\(Int(box.height)) form=\(Int(content.pick.scroll.contentSize.height))")
                #endif
            }
        } else {
            pick.alpha = 0
            well.insertSubview(pick, belowSubview: card)
            NSLayoutConstraint.activate([
                pick.topAnchor.constraint(equalTo: well.topAnchor),
                pick.leadingAnchor.constraint(equalTo: well.leadingAnchor),
                pick.trailingAnchor.constraint(equalTo: well.trailingAnchor),
                pick.bottomAnchor.constraint(equalTo: well.bottomAnchor),
            ])
            // `transition:appear`: its opacity over `--dur-fade`.
            Motion.easeOut.animator(Motion.durFade) { pick.alpha = 1 }.startAnimation()
            UIAccessibility.post(notification: .screenChanged, argument: pick)
        }
        #if DEBUG
        PreviewProbe.say("place pick opened \(ask.json) as=\(drawer ? "sheet" : "well")")
        if let placed = PreviewProbe.placePick {
            Task { @MainActor [weak pick] in
                try? await Task.sleep(for: .seconds(1))
                pick?.pickForProbe(machineId: placed.machineId, path: placed.path)
            }
        }
        #endif
    }

    /// The person's answer to the page, as a JSON-RPC result: the place, or null.
    private func answerPick(_ result: [String: Any]?) {
        guard let ask = picking else { return }
        dropPick()
        deliver(["jsonrpc": "2.0", "id": ask.json, "result": result.map { $0 as Any } ?? NSNull()])
        #if DEBUG
        let said = result.flatMap { try? JSONSerialization.data(withJSONObject: $0, options: [.sortedKeys, .withoutEscapingSlashes]) }
            .map { String(decoding: $0, as: UTF8.self) } ?? "null"
        PreviewProbe.say("place pick answered \(said)")
        #endif
    }

    /// Cancel or Escape: the page hears null.
    fileprivate func cancelPick() {
        guard picking != nil else { return }
        answerPick(nil)
    }

    /// The picker goes with no answer: a new document has no ask left to answer.
    fileprivate func dropPick() {
        picking = nil
        if let sheet = placePickSheet {
            placePickSheet = nil
            sheet.dismiss(animated: true)
        }
        if let pick = placePick {
            placePick = nil
            guard pick.superview === well else { return }
            let fade = Motion.easeOut.animator(Motion.durExit) { pick.alpha = 0 }
            fade.addCompletion { _ in pick.removeFromSuperview() }
            fade.startAnimation()
        }
    }
}

// MARK: A sheet's inspector, the artifacts' menu

extension PreviewController {
    /// The panel shows another artifact: a sheet gets its own inspector,
    /// with nothing unsaved; anything else has none.
    fileprivate func adoptSheet(_ frame: PreviewFrame) {
        inspector?.removeFromSuperview()
        inspector = nil
        let id = frame.artifact.id
        if frame.artifact.kind == .component {
            inspection = SheetInspection(post: { [weak self] message in self?.deliver(message) },
                                         write: { [weak self] change in
                                             guard let self else { return }
                                             try await hub.writeSheet(id, in: instanceId, change: change)
                                             #if DEBUG
                                             PreviewProbe.say("inspector wrote \(change)")
                                             #endif
                                         })
        } else {
            inspection = nil
        }
        placeHeadItems()
        placeInspector()
    }

    /// Inspect (PreviewPane.svelte `showInspector`): kept for the session, as Comments is.
    fileprivate func showInspector(_ open: Bool) {
        inspectOpen = open
        UserDefaults.standard.set(open ? "open" : "shut", forKey: inspectKey)
        placeInspector()
    }

    /// The inspector as the panel stands: a right panel beside the page in a
    /// pane, the page narrowed by its width; a sheet over the page's foot in
    /// the phone's drawer, the page live above it. It slides in from its
    /// edge over `--dur-panel` on the drawer curve and out over `--dur-exit`;
    /// with less motion a fade.
    fileprivate func placeInspector() {
        guard isViewLoaded else { return }
        inspectButton.setNeedsUpdateConfiguration()
        inspectButton.accessibilityTraits = inspectOpen ? [.button, .selected] : .button
        let layout: SheetInspectorView.Layout = drawer ? .sheet : .panel
        let wanted = inspectOpen ? inspection : nil
        if let inspector, inspector.inspection === wanted, inspector.layout == layout { return }
        if let leaving = inspector {
            inspector = nil
            slide(leaving, in: false)
        }
        guard let wanted else {
            webTrailing.constant = 0
            return
        }
        let view = SheetInspectorView(inspection: wanted, layout: layout)
        view.onClose = { [weak self] in self?.showInspector(false) }
        well.insertSubview(view, belowSubview: card)
        if layout == .panel {
            NSLayoutConstraint.activate([
                view.topAnchor.constraint(equalTo: well.topAnchor),
                view.bottomAnchor.constraint(equalTo: well.bottomAnchor),
                view.trailingAnchor.constraint(equalTo: well.trailingAnchor),
                view.widthAnchor.constraint(equalToConstant: Size.cSheetInspectorW),
                view.widthAnchor.constraint(lessThanOrEqualTo: well.widthAnchor),
            ])
            webTrailing.constant = -Size.cSheetInspectorW
        } else {
            NSLayoutConstraint.activate([
                view.leadingAnchor.constraint(equalTo: well.leadingAnchor),
                view.trailingAnchor.constraint(equalTo: well.trailingAnchor),
                view.bottomAnchor.constraint(equalTo: well.bottomAnchor),
                view.heightAnchor.constraint(lessThanOrEqualTo: well.heightAnchor, multiplier: 0.6),
            ])
            webTrailing.constant = 0
        }
        inspector = view
        slide(view, in: true)
        #if DEBUG
        DispatchQueue.main.async { [weak self, weak view] in
            guard let self, let view else { return }
            self.view.layoutIfNeeded()
            let box = view.convert(view.bounds, to: nil)
            let page = web.convert(web.bounds, to: nil)
            PreviewProbe.say("inspector layout=\(layout) frame=\(Int(box.minX)),\(Int(box.minY)),\(Int(box.width)),\(Int(box.height)) web=\(Int(page.minX)),\(Int(page.minY)),\(Int(page.width)),\(Int(page.height))")
        }
        #endif
    }

    private func slide(_ part: SheetInspectorView, in arriving: Bool) {
        view.layoutIfNeeded()
        let away: CGAffineTransform = part.layout == .panel
            ? CGAffineTransform(translationX: part.bounds.width, y: 0)
            : CGAffineTransform(translationX: 0, y: part.bounds.height)
        let calm = UIAccessibility.isReduceMotionEnabled
        if arriving {
            if calm { part.alpha = 0 } else { part.transform = away }
            Motion.easeDrawer.animator(calm ? Motion.durFade : Motion.durPanel) {
                part.alpha = 1
                part.transform = .identity
                self.view.layoutIfNeeded()
            }.startAnimation()
            UIAccessibility.post(notification: .screenChanged, argument: part)
        } else {
            let out = Motion.easeOut.animator(Motion.durExit) {
                if calm { part.alpha = 0 } else { part.transform = away }
                self.view.layoutIfNeeded()
            }
            out.addCompletion { _ in part.removeFromSuperview() }
            out.startAnimation()
        }
    }

    /// The title control's menu: the session's artifacts, newest first (ArtifactMenu.swift).
    fileprivate func openMenu() {
        guard let frame = hub.previews.byInstance[instanceId], frame.state == .open else { return }
        let artifact = frame.artifact
        let content = ArtifactMenuController(hub: hub, instanceId: instanceId, shown: (artifact.id, artifact.kind, artifact.name),
                                             held: frame.artifacts)
        menu = content
        content.loadViewIfNeeded()
        KitPopover.present(content, from: titleButton, in: self, align: .start, side: .bottom, offset: Space.space1)
        #if DEBUG
        PreviewProbe.say("artifact menu open")
        #endif
    }
}

extension PreviewController: UIGestureRecognizerDelegate {
    /// The outside press hears a touch only while the card is open, and only
    /// one outside the card, the page, and any layer the preview presented.
    func gestureRecognizer(_ recognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard recognizer === outsidePress else { return true }
        guard openPin != nil, !card.isHidden, let touched = touch.view else { return false }
        if touched.isDescendant(of: card) { return false }
        if let presented = presentedViewController, touched.isDescendant(of: presented.view) { return false }
        // The page's touches are heard for their lift alone: the page says its own press.
        pressOnPage = touched.isDescendant(of: web)
        pagePressed = false
        return true
    }

    /// Whatever the touch lands on keeps it: the outside press only listens.
    func gestureRecognizer(_ recognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer) -> Bool {
        recognizer === outsidePress
    }
}

/// A press heard as it lifts, and nothing more: it calls `pressed` when a
/// touch its delegate let it hear ends, then fails, so it never recognizes,
/// never delays or cancels a touch, and never stands in the way of a
/// control's own action (UIKit gives a single tap over a button to the
/// button or to a tap recognizer, not to both). A touch cancelled (taken by
/// a scroll, the system) presses nothing. Recognizers hear a touch end
/// before its view does: `pressed` runs its close on the next main turn.
private final class PressWatcher: UIGestureRecognizer {
    var pressed: () -> Void = {}
    /// A touch taken from it (by a scroll, the system).
    var cancelled: () -> Void = {}

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesEnded(touches, with: event)
        if state == .possible {
            pressed()
            state = .failed
        }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesCancelled(touches, with: event)
        if state == .possible { cancelled() }
        state = .failed
    }
}

/// The grabber's hit area: 44pt about the grabber, except where one of the
/// header's actions stands, which keeps its own touches. A tap on it, or
/// VoiceOver's activate, is its primary action (a plain control sends none).
final class GrabArea: UIControl {
    var yields: [UIView] = []

    override func endTracking(_ touch: UITouch?, with event: UIEvent?) {
        super.endTracking(touch, with: event)
        // Where UIKit's touch-up-inside would fire: a touch the window's reach handed over counts.
        guard touch != nil, isTouchInside else { return }
        sendActions(for: .primaryActionTriggered)
    }

    override func accessibilityActivate() -> Bool {
        sendActions(for: .primaryActionTriggered)
        return true
    }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        guard super.point(inside: point, with: event) else { return false }
        return !yields.contains { action in
            action.window != nil && !action.isHidden && action.bounds.contains(action.convert(point, from: self))
        }
    }
}

/// One head control in a touch target's room (HIG Layout: "44x44 pt"): at
/// least 44pt square, `space-1` either side of the control, and a touch
/// anywhere in it lands on the control's nearest point.
final class HeadSlot: UIView {
    let control: UIView

    init(_ control: UIView) {
        self.control = control
        super.init(frame: .zero)
        control.translatesAutoresizingMaskIntoConstraints = false
        addSubview(control)
        let snug = widthAnchor.constraint(equalTo: control.widthAnchor, constant: Space.space1 * 2)
        snug.priority = .defaultHigh
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 44),
            widthAnchor.constraint(greaterThanOrEqualToConstant: 44),
            widthAnchor.constraint(greaterThanOrEqualTo: control.widthAnchor, constant: Space.space1 * 2),
            snug,
            control.centerXAnchor.constraint(equalTo: centerXAnchor),
            control.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        // The control keeps its own width, so the head's room goes to the name and nowhere else.
        control.setContentHuggingPriority(.required, for: .horizontal)
        control.setContentCompressionResistancePriority(.required, for: .horizontal)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("HeadSlot is built in code") }

    /// The room the slot takes in the head, as its control stands now.
    var fittingWidth: Double {
        max(44, control.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize).width + Space.space1 * 2)
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard !isHidden, alpha > 0.01, isUserInteractionEnabled, bounds.contains(point) else { return nil }
        let box = control.frame.insetBy(dx: 1, dy: 1)
        let near = CGPoint(x: min(max(point.x, box.minX), box.maxX), y: min(max(point.y, box.minY), box.maxY))
        return control.hitTest(convert(near, to: control), with: event) ?? control
    }
}

/// The head's row: a touch above or below the artifact's name, in the
/// head's 44pt, is the name's (HIG Layout: "44x44 pt"), as each control's slot is.
final class HeadRow: UIStackView {
    weak var name: UIView?

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        guard let name, name.window != nil, hit == nil || !(hit is UIControl) else { return hit }
        let at = convert(point, to: name)
        guard bounds.contains(point), at.x >= 0, at.x <= name.bounds.width else { return hit }
        return name
    }
}

/// The preview's page: a web view of its own class, so whether the keyboard
/// is in it (`PreviewKeys.pageHolds`) is told from any other web view's.
final class PreviewPage: WKWebView {}

/// The app's key commands ask this before they act (AppDelegate
/// `canPerformAction`): while a preview's page has the keyboard, every key is
/// the page's first, as on the web, and the page hands back the shell's own
/// combos it leaves alone (`cawco:shortcut`).
@MainActor
public enum PreviewKeys {
    public static var pageHolds: Bool { PreviewController.pageHoldsKeys }
}

/// Holds the preview (or a decision page's frame) weakly: a content controller retains its handlers.
final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: (any WKScriptMessageHandler)?
    init(_ target: any WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

#if DEBUG
/// `-preview-lapse` (scripts/probe-kit/specs/ios-preview-enter.ts): host
/// mode's pass taken away twice. Once the page is first ready its web view's
/// cookies go and it reloads, so the origin turns it away (401) and the
/// preview enters again; once ready again the same, with the next ticket
/// spoiled, so the entry turns it away too: a second 401 in a row, which
/// stands. Each step is a `preview lapse` line.
extension PreviewProbe {
    static let lapseAtLaunch = ProcessInfo.processInfo.arguments.contains("-preview-lapse")
    /// Documents the web view has committed this launch.
    static var documents = 0
    /// The document the last lapse was taken on: the overlay can say it is ready more than once a document.
    private static var lapsedOn = 0
    /// How many lapses this launch has taken.
    private static var readies = 0
    /// The next entry's ticket is spoiled, so the hub refuses it as forged.
    private static var spoilNext = false

    /// The address a load goes to, said as `preview loads`: the ticket spoiled when the lapse asked.
    static func loading(_ url: URL) -> URL {
        var url = url
        if spoilNext, url.path() == "/__cawco/enter",
           let spoiled = URL(string: url.absoluteString.replacingOccurrences(of: "ticket=", with: "ticket=spoiled")) {
            spoilNext = false
            url = spoiled
        }
        say("preview loads \(url.absoluteString)")
        return url
    }

    /// The page is ready: on the first and second time, its pass goes and it reloads.
    static func lapse(_ web: WKWebView) {
        guard lapseAtLaunch, documents != lapsedOn else { return }
        lapsedOn = documents
        readies += 1
        guard readies <= 2 else { return }
        let lapse = readies
        let spoil = lapse == 2
        Task {
            try? await Task.sleep(for: .seconds(2))
            let store = web.configuration.websiteDataStore.httpCookieStore
            let cookies = await store.allCookies()
            for cookie in cookies { await store.deleteCookie(cookie) }
            say("preview lapse \(lapse) deleted \(cookies.map(\.name).joined(separator: ",")) spoil=\(spoil)")
            spoilNext = spoil
            web.reload()
        }
    }
}
#endif
