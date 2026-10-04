// CawCoMascot: Caw, CawCo's mascot, drawn by Rive from one .riv per status.
//
// The files' contract (assets/mascot/README.md): each status file holds that status's loops (or
// its one resting drawing) and, where one was drawn, its enter, and a view model `Caw` bound to
// its state machine `CawStates`. This module picks the file for the status, sets `dark` and
// `reducedMotion`, reads `enters` and hears `entered`; Caw himself changes in the .riv files,
// never in Swift.
//
// Resources/caw/<status>.riv are written by assets/mascot/scripts/build.mjs, byte for byte the
// same files as assets/mascot/caw/<status>.riv.
//
// Drawn by rive-ios 6.28's UIKit view for its current API (`RiveUIView` over a `Rive` built
// from a `File`, a `Worker` and a bound view-model instance), which the files' view-model
// contract needs; `RiveViewModel.createRiveView()` is the older API's view.
import CawCoDesign
import OSLog
import RiveRuntime
import UIKit

/// What Caw shows. Each status is its own file, `caw/<rawValue>.riv`.
public enum CawStatus: String, CaseIterable, Sendable {
    case ready
    case working
    case needsYou = "needs-you"
    case idle
    case done
    case trying
    case loading
    case reconnecting
    /// Nothing is going on: no session working anywhere and nothing needing the operator.
    case sleeping
}

/// Caw at a brand moment: an empty board, first run, loading, reconnecting.
///
/// He follows the trait collection's interface style (`dark`) and the system's Reduce Motion
/// setting (`reducedMotion`) on his own. Decorative, so hidden from VoiceOver: the screen
/// around him carries the words.
///
/// He comes in by his status's drawn enter, or where it has none by a fade up from
/// `Motion.leaveScale` over `Motion.durPop`, and `onEntered` is called when that has ended, or
/// when his file fails to load, so a place can keep him until then (`CawWaiting` does). He goes
/// the same way from any drawing: he holds the one he is on and fades out to `Motion.leaveScale`
/// over `Motion.durFade`, so what he stood in for is never under a looping Caw. With `present`
/// off `onGone` is called once he has gone; on a status change the new status's file comes in
/// once the old one has, so one file is alive at a time. Under Reduce Motion there is no enter
/// and no scale: he fades (`Motion.durFade` on `Motion.easeOut`) in, across and out.
///
/// The view's bounds hold Caw's still: the largest centred square in them is the files' still
/// box. His acting reaches past that box, so he draws past the bounds there; nothing here clips
/// him, and he never takes touches from what lies under him.
public final class CawView: UIView {
    public var status: CawStatus {
        didSet {
            if status != oldValue, present {
                ask()
            }
        }
    }

    /// Off once the place is done with him: he fades out at once and `onGone` is called. The
    /// place keeps him in its hierarchy until then.
    public var present = true {
        didSet {
            guard present != oldValue else {
                return
            }
            if present {
                ask()
            } else {
                leave()
            }
        }
    }

    public var onEntered: (() -> Void)?
    public var onGone: (() -> Void)?

    /// The Caw on screen.
    private var shown: CawLayer?
    /// The file being read for a first appearance or a change, and the status it is for.
    private var loading: (status: CawStatus, task: Task<Void, Never>)?
    private var fade: UIViewPropertyAnimator?
    /// The Caw on screen is fading out: whatever is asked for next comes in once he has gone.
    private var leaving = false
    private var entered = false

    public init(status: CawStatus) {
        self.status = status
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = false
        clipsToBounds = false
        isAccessibilityElement = false
        accessibilityElementsHidden = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: CawView, _: UITraitCollection) in
            view.apply()
        }
        NotificationCenter.default.addObserver(self, selector: #selector(apply), name: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CawView is built in code")
    }

    override public func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil, shown == nil, loading == nil, present {
            ask()
        }
    }

    /// For a place that is going away itself (a cell, a screen): takes him out of it, stands
    /// him where he was on `container`, and lets him fade out there over whatever comes. He
    /// removes himself once he is gone.
    public func leave(over container: UIView) {
        let place = convert(bounds, to: container)
        removeFromSuperview()
        translatesAutoresizingMaskIntoConstraints = true
        frame = place
        container.addSubview(self)
        let then = onGone
        onGone = { [weak self] in
            self?.removeFromSuperview()
            then?()
        }
        if present {
            present = false
        } else if shown == nil {
            removeFromSuperview()
        }
    }

    private var dark: Bool { traitCollection.userInterfaceStyle == .dark }
    private var reducedMotion: Bool { UIAccessibility.isReduceMotionEnabled }

    /// Brings `status` on. The first Caw is simply the file for it. A Caw on screen showing
    /// another status fades out, and the new status's file comes in once he has gone; under
    /// Reduce Motion the new one fades in over him.
    private func ask() {
        guard window != nil else {
            return
        }
        guard let shown else {
            load(status)
            return
        }
        if reducedMotion {
            if shown.status == status {
                cancelLoading()
            } else {
                load(status)
            }
            return
        }
        if !leaving, shown.status != status {
            fadeOut(shown)
        }
    }

    /// `present` went off: he fades out from the drawing he is on. With no Caw yet, he is gone
    /// at once.
    private func leave() {
        cancelLoading()
        guard let shown else {
            onGone?()
            return
        }
        if !leaving {
            fadeOut(shown)
        }
    }

    /// `layer`'s Caw goes: he holds the drawing he is on and fades out over `Motion.durFade`,
    /// shrinking to `Motion.leaveScale`, from wherever a fade in had brought him; under Reduce
    /// Motion the fade alone, taking a Caw he was fading across with him. Then the status asked
    /// for comes in afresh, or with `present` off the place is left empty (`gone`).
    private func fadeOut(_ layer: CawLayer) {
        CawContract.log.info("Caw \(layer.status.rawValue, privacy: .public) leaves")
        leaving = true
        fade?.stopAnimation(true)
        layer.view.isPaused = true
        let scale = reducedMotion ? 1 : Motion.leaveScale
        let animator = Motion.easeOut.animator(Motion.durFade) { [self] in
            for view in subviews {
                view.alpha = 0
                view.transform = CGAffineTransform(scaleX: scale, y: scale)
            }
        }
        animator.addCompletion { [weak self] _ in
            self?.gone(layer)
        }
        fade = animator
        animator.startAnimation()
    }

    private func cancelLoading() {
        loading?.task.cancel()
        loading = nil
    }

    /// Reads `status`'s file and starts its Caw. A newer status cancels this one while it loads.
    private func load(_ status: CawStatus) {
        if loading?.status == status {
            return
        }
        cancelLoading()
        let asked = ContinuousClock.now
        let task = Task { [weak self] in
            guard let self else {
                return
            }
            let incoming: CawLayer
            do {
                incoming = try await CawLayer.load(status, dark: dark, reducedMotion: reducedMotion)
            } catch {
                CawContract.log.error("Caw \(status.rawValue, privacy: .public) did not load: \(String(describing: error), privacy: .public)")
                loading = nil
                if shown == nil {
                    reportEntered()
                }
                return
            }
            guard !Task.isCancelled else {
                return
            }
            loading = nil
            start(incoming, asked: asked)
        }
        loading = (status, task)
    }

    /// Puts `incoming` on screen, its file begun: his drawn enter is playing, and the file says
    /// `entered` at its end. A file with no drawn enter has him there already, so the view fades
    /// in from `Motion.leaveScale` over `Motion.durPop`; under Reduce Motion every file holds his
    /// still and the view fades in over `Motion.durFade`, across the Caw below.
    private func start(_ incoming: CawLayer, asked: ContinuousClock.Instant) {
        let below = shown
        incoming.hearEntered { [weak self] in
            self?.reportEntered()
        }
        addSubview(incoming.view)
        shown = incoming
        setNeedsLayout()
        layoutIfNeeded()
        CawContract.log.info("Caw \(incoming.status.rawValue, privacy: .public) starts \((ContinuousClock.now - asked).milliseconds, format: .fixed(precision: 1)) ms after it was asked for")
        fade?.stopAnimation(true)
        // A fade across that this one cut short left its own Caw below: that one goes now.
        for view in subviews where view !== incoming.view && view !== below?.view {
            view.removeFromSuperview()
        }
        if incoming.enters, !reducedMotion {
            below?.view.removeFromSuperview()
            return
        }
        let scale = reducedMotion ? 1 : Motion.leaveScale
        incoming.view.alpha = 0
        incoming.view.transform = CGAffineTransform(scaleX: scale, y: scale)
        let animator = Motion.easeOut.animator(reducedMotion ? Motion.durFade : Motion.durPop) {
            incoming.view.alpha = 1
            incoming.view.transform = .identity
        }
        animator.addCompletion { [weak self] _ in
            below?.view.removeFromSuperview()
            self?.reportEntered()
        }
        fade = animator
        animator.startAnimation()
    }

    private func reportEntered() {
        guard !entered else {
            return
        }
        entered = true
        CawContract.log.info("Caw \(self.status.rawValue, privacy: .public) entered")
        onEntered?()
    }

    /// `layer` has faded out. With `present` on, the status asked for comes in afresh.
    private func gone(_ layer: CawLayer) {
        guard shown === layer else {
            return
        }
        for view in subviews {
            view.removeFromSuperview()
        }
        shown = nil
        leaving = false
        CawContract.log.info("Caw \(layer.status.rawValue, privacy: .public) gone")
        if present {
            ask()
        } else {
            onGone?()
        }
    }

    /// Writes the interface style and the motion setting into the live Caw; its state machine
    /// follows.
    @objc private func apply() {
        if let shown {
            CawContract.write(to: shown.caw, dark: dark, reducedMotion: reducedMotion)
        }
    }

    /// The still box fills the largest centred square of the bounds; the artboard around the
    /// box spills past them. Rive fits the artboard into its view with `.contain`, and that view
    /// has the artboard's aspect, so the artboard scales by exactly side / 512.
    override public func layoutSubviews() {
        super.layoutSubviews()
        let side = min(bounds.width, bounds.height)
        let scale = side / CawGeometry.stillBox.width
        let frame = CGRect(
            x: bounds.midX - side / 2 - CawGeometry.stillBox.minX * scale,
            y: bounds.midY - side / 2 - CawGeometry.stillBox.minY * scale,
            width: CawGeometry.artboard.width * scale,
            height: CawGeometry.artboard.height * scale
        )
        // By bounds and centre: a Caw fading out is scaled, and a frame is undefined then.
        for view in subviews {
            view.bounds = CGRect(origin: .zero, size: frame.size)
            view.center = CGPoint(x: frame.midX, y: frame.midY)
        }
    }
}

/// A place's wait with Caw standing in for it. While `waiting`, the place is its plain surface
/// for `Motion.durWaitGrace`; a wait that outlasts it shows Caw at `status` (loading or
/// reconnecting), centred at `side`. Once he shows, `content` waits until his enter has played,
/// so he is never cut off mid-entrance; after that `content` lands at once and he fades out
/// over it. A wait shorter than the grace shows no Caw at all: `content` simply appears.
public final class CawWaiting: UIViewController {
    public var waiting: Bool {
        didSet {
            if waiting != oldValue {
                update()
            }
        }
    }

    public var status: CawStatus {
        didSet { caw?.status = status }
    }

    /// What the wait stands in for; shown whenever nothing is waited for.
    public var content: UIViewController? {
        didSet {
            if content !== oldValue {
                oldValue?.willMove(toParent: nil)
                oldValue?.view.removeFromSuperview()
                oldValue?.removeFromParent()
                update()
            }
        }
    }

    private let side: Double
    private var caw: CawView?
    private var grace: Task<Void, Never>?
    /// The wait outlasted its grace and Caw stands in for it.
    private var graceOver = false
    /// Caw is on screen and his enter has not ended.
    private var entering = false

    public init(waiting: Bool, status: CawStatus, side: Double) {
        self.waiting = waiting
        self.status = status
        self.side = side
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CawWaiting is built in code")
    }

    override public func viewDidLoad() {
        super.viewDidLoad()
        update()
    }

    private func update() {
        guard isViewLoaded else {
            return
        }
        if !waiting, !entering {
            grace?.cancel()
            grace = nil
            graceOver = false
            showContent()
            // He fades out over the content and is taken away when he has gone.
            caw?.present = false
            return
        }
        hideContent()
        if waiting, graceOver {
            caw?.present = true
        }
        if waiting, !graceOver, grace == nil {
            CawContract.log.info("Caw \(self.status.rawValue, privacy: .public) wait began")
            grace = Task { [weak self] in
                try? await Task.sleep(for: .seconds(Motion.durWaitGrace))
                guard !Task.isCancelled, let self else {
                    return
                }
                CawContract.log.info("Caw \(self.status.rawValue, privacy: .public) wait outlasted its grace")
                graceOver = true
                grace = nil
                showCaw()
            }
        }
    }

    private func showCaw() {
        if let caw {
            caw.present = true
            return
        }
        let caw = CawView(status: status)
        entering = true
        caw.onEntered = { [weak self] in
            guard let self else {
                return
            }
            entering = false
            if !waiting {
                update()
            }
        }
        caw.onGone = { [weak self, weak caw] in
            caw?.removeFromSuperview()
            if self?.caw === caw {
                self?.caw = nil
            }
        }
        view.addSubview(caw)
        NSLayoutConstraint.activate([
            caw.widthAnchor.constraint(equalToConstant: side),
            caw.heightAnchor.constraint(equalToConstant: side),
            caw.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            caw.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
        self.caw = caw
    }

    private func showContent() {
        guard let content, content.parent !== self else {
            return
        }
        addChild(content)
        content.view.frame = view.bounds
        content.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        if let caw {
            view.insertSubview(content.view, belowSubview: caw)
        } else {
            view.addSubview(content.view)
        }
        content.didMove(toParent: self)
        // The content lands under its own cross-fade, never waiting on Caw.
        content.view.alpha = 0
        Motion.easeOut.animator(Motion.durFade) {
            content.view.alpha = 1
        }.startAnimation()
    }

    private func hideContent() {
        guard let content, content.parent === self else {
            return
        }
        content.willMove(toParent: nil)
        content.view.removeFromSuperview()
        content.removeFromParent()
    }
}

/// One status's Caw: its Rive view and the `Caw` instance bound to its state machine, kept
/// together so the instance lives exactly as long as the view that draws it.
@MainActor
private final class CawLayer {
    let status: CawStatus
    let view: RiveUIView
    let caw: ViewModelInstance
    /// The file's `enters`: it carries a drawn enter, and says `entered` at its end.
    let enters: Bool
    private var hearing: Task<Void, Never>?

    private init(status: CawStatus, view: RiveUIView, caw: ViewModelInstance, enters: Bool) {
        self.status = status
        self.view = view
        self.caw = caw
        self.enters = enters
    }

    isolated deinit {
        hearing?.cancel()
    }

    static func load(_ status: CawStatus, dark: Bool, reducedMotion: Bool) async throws -> CawLayer {
        let file = try await CawFiles.file(for: status)
        let artboard = try await file.createArtboard(CawContract.artboard)
        let stateMachine = try await artboard.createStateMachine(CawContract.stateMachine)
        // Retained in the layer and bound explicitly: the view writes to this instance for its lifetime.
        let caw = try await file.createViewModelInstance(.viewModelDefault(from: .name(CawContract.viewModel)))
        CawContract.write(to: caw, dark: dark, reducedMotion: reducedMotion)
        try await stateMachine.bindViewModelInstances(main: caw)
        let rive = try await Rive(file: file, artboard: artboard, stateMachine: stateMachine)
        let view = RiveUIView(rive: rive, delegate: nil, isPaused: false)
        view.isUserInteractionEnabled = false
        view.isAccessibilityElement = false
        view.backgroundColor = .clear
        return try await CawLayer(status: status, view: view, caw: caw, enters: caw.value(of: CawContract.enters))
    }

    /// Hears the file's `entered`: the end of his drawn enter.
    func hearEntered(_ action: @escaping @MainActor () -> Void) {
        let fired = caw.stream(of: CawContract.entered)
        hearing = Task {
            do {
                for try await _ in fired {
                    action()
                }
            } catch {
                CawContract.log.error("Caw trigger entered failed: \(String(describing: error), privacy: .public)")
            }
        }
    }
}

/// Where the files draw Caw's still: a 512 × 512 box at (43, 40) in their 592 × 592 artboard. The
/// room around the box is for his acting (assets/mascot/README.md, Contract).
private enum CawGeometry {
    static let artboard = CGSize(width: 592, height: 592)
    static let stillBox = CGRect(x: 43, y: 40, width: 512, height: 512)
}

/// The `Caw` view model's names, as the files define them. Main-actor isolated: rive-ios's
/// property descriptors are not Sendable, and every use of them is on the main actor.
@MainActor
private enum CawContract {
    static let artboard = "Caw"
    static let stateMachine = "CawStates"
    static let viewModel = "Caw"
    static let reducedMotion = BoolProperty(path: "reducedMotion")
    static let dark = BoolProperty(path: "dark")
    /// Read, never written: on in a file that carries a drawn enter.
    static let enters = BoolProperty(path: "enters")
    static let entered = TriggerProperty(path: "entered")
    static let log = Logger(subsystem: "dev.cawco.app", category: "Caw")

    static func write(to caw: ViewModelInstance, dark: Bool, reducedMotion: Bool) {
        caw.setValue(of: self.dark, to: dark)
        caw.setValue(of: self.reducedMotion, to: reducedMotion)
    }
}

/// The one Worker every Caw shares, and each status file's bytes, read from the bundle once.
@MainActor
private enum CawFiles {
    private static var worker: Worker?
    private static var bytes: [CawStatus: Data] = [:]

    static func file(for status: CawStatus) async throws -> File {
        try await File(source: .data(cachedBytes(status)), worker: shared())
    }

    private static func cachedBytes(_ status: CawStatus) async throws -> Data {
        if let cached = bytes[status] {
            return cached
        }
        let data = try await read(status)
        bytes[status] = data
        return data
    }

    /// The Worker, made on first use; two Caws loading at once both get the first one made.
    private static func shared() async throws -> Worker {
        if let worker {
            return worker
        }
        let made = try await Worker()
        if let worker {
            return worker
        }
        worker = made
        return made
    }

    @concurrent
    private nonisolated static func read(_ status: CawStatus) async throws -> Data {
        guard let url = Bundle.module.url(forResource: status.rawValue, withExtension: "riv", subdirectory: "caw") else {
            throw CawFileError.missing(status.rawValue)
        }
        return try Data(contentsOf: url)
    }
}

private enum CawFileError: Error {
    case missing(String)
}

private extension Duration {
    var milliseconds: Double {
        let (seconds, attoseconds) = components
        return Double(seconds) * 1000 + Double(attoseconds) / 1e15
    }
}
