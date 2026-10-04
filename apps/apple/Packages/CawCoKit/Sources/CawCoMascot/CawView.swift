// CawCoMascot: Caw, CawCo's mascot, drawn by Rive from one .riv per status.
//
// The files' contract (assets/mascot/README.md): each status file holds that status's loops (or
// its one resting drawing) and the clips that bring him in, take him out and join him to the
// other statuses, and a view model `Caw` bound to its state machine `CawStates`. This module
// picks the file for the status, sets `dark`, `reducedMotion`, `from`, `leave` and `exit`, and
// hears `entered`, `still` and `gone`; Caw himself changes in the .riv files, never in Swift.
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
/// He comes in by his enter clip, and `onEntered` is called when it has ended, or when his file
/// fails to load, so a place can keep him until then (`CawWaiting` does). On a status change the
/// shown file is told to `leave`; once it says he is back on his `still`, the new status's file
/// takes over with `from` naming the old one and plays his arrival from that very drawing, so no
/// frame is ever empty and at most two files are alive. With `present` off he is gone within
/// `Motion.durFade` and `onGone` is called: on his still he plays his exit clip; anywhere else he
/// holds the drawing he is on and fades out, so what he stood in for is never under a looping
/// Caw. Under Reduce Motion there are no clips: he fades (`Motion.durFade` on `Motion.easeOut`)
/// in, across and out.
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

    /// Off once the place is done with him: he leaves at once, by his exit clip from his still or
    /// a fade from anywhere else, and `onGone` is called. The place keeps him in its hierarchy
    /// until then.
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
    /// him where he was on `container`, and lets him play his exit there over whatever comes.
    /// He removes himself once he is gone.
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

    /// Brings `status` on. The first Caw is simply the file for it, coming in by its enter. A
    /// Caw on screen is told to leave and the new file takes over from his still (`settle`);
    /// under Reduce Motion the new one fades in over him.
    private func ask() {
        guard window != nil else {
            return
        }
        guard let shown else {
            load(status, from: nil)
            return
        }
        if reducedMotion {
            if shown.status == status {
                cancelLoading()
            } else {
                load(status, from: shown.status)
            }
            return
        }
        settle()
    }

    /// Moves the Caw on screen towards `status`, one step at a time.
    private func settle() {
        guard let shown, present else {
            return
        }
        shown.set(CawContract.exit, false)
        if shown.status == status {
            // Asked back before the change happened: he carries on.
            cancelLoading()
            shown.still = false
            shown.set(CawContract.leave, false)
            return
        }
        guard shown.still else {
            shown.set(CawContract.leave, true)
            return
        }
        load(status, from: shown.status)
    }

    /// `present` went off. On his still (a rest, or held there by a change) he plays his exit
    /// clip. Anywhere else, mid-loop or mid-clip, he holds the drawing he is on and fades out over
    /// `Motion.durFade`, shrinking to `Motion.leaveScale`: no exit clip can start from a pose it
    /// was not drawn from, and what has arrived is never left under him. Under Reduce Motion the
    /// fade alone. With no Caw yet, he is gone at once.
    private func leave() {
        cancelLoading()
        guard let shown else {
            onGone?()
            return
        }
        CawContract.log.info("Caw \(shown.status.rawValue, privacy: .public) leaves")
        if !reducedMotion, shown.still || (shown.landed && shown.rests) {
            shown.set(CawContract.leave, true)
            shown.set(CawContract.exit, true)
            return
        }
        fade?.stopAnimation(true)
        shown.view.isPaused = true
        let scale = reducedMotion ? 1 : Motion.leaveScale
        let animator = Motion.easeOut.animator(Motion.durFade) {
            shown.view.alpha = 0
            shown.view.transform = CGAffineTransform(scaleX: scale, y: scale)
        }
        animator.addCompletion { [weak self] _ in
            self?.gone(shown)
        }
        fade = animator
        animator.startAnimation()
    }

    private func cancelLoading() {
        loading?.task.cancel()
        loading = nil
    }

    /// Reads `status`'s file and starts its Caw: `from` is nil on a first appearance, else the
    /// status he is leaving. A newer status cancels this one while it loads.
    private func load(_ status: CawStatus, from: CawStatus?) {
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
                incoming = try await CawLayer.load(status, from: from, dark: dark, reducedMotion: reducedMotion)
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
            await start(incoming, asked: asked)
        }
        loading = (status, task)
    }

    /// Puts `incoming` on screen. His clip begins on the drawing the Caw below holds, so that
    /// one goes once this one has drawn. Under Reduce Motion the file holds his still and the
    /// view fades in.
    private func start(_ incoming: CawLayer, asked: ContinuousClock.Instant) async {
        let below = shown
        incoming.hear(
            entered: { [weak self, weak incoming] in
                incoming?.landed = true
                self?.reportEntered()
            },
            still: { [weak self, weak incoming] in
                incoming?.still = true
                self?.settle()
            },
            gone: { [weak self, weak incoming] in
                if let incoming {
                    self?.gone(incoming)
                }
            }
        )
        addSubview(incoming.view)
        shown = incoming
        setNeedsLayout()
        layoutIfNeeded()
        CawContract.log.info("Caw \(incoming.status.rawValue, privacy: .public) starts \((ContinuousClock.now - asked).milliseconds, format: .fixed(precision: 1)) ms after it was asked for")
        if reducedMotion {
            fade?.stopAnimation(true)
            incoming.view.alpha = 0
            let animator = Motion.easeOut.animator(Motion.durFade) {
                incoming.view.alpha = 1
            }
            animator.addCompletion { [weak self] _ in
                below?.view.removeFromSuperview()
                self?.reportEntered()
            }
            fade = animator
            animator.startAnimation()
            return
        }
        if let below {
            // His arrival's first drawing is the one below, held for two frames of the clip
            // (83 ms): the file below goes once this one has had time to draw it.
            try? await Task.sleep(for: CawContract.handover)
            below.view.removeFromSuperview()
        }
        // The status may have moved on while this file was loading.
        settle()
    }

    private func reportEntered() {
        guard !entered else {
            return
        }
        entered = true
        CawContract.log.info("Caw \(self.status.rawValue, privacy: .public) entered")
        onEntered?()
    }

    /// `layer` has left an empty page. Asked back meanwhile, he comes in afresh.
    private func gone(_ layer: CawLayer) {
        guard shown === layer else {
            return
        }
        layer.view.removeFromSuperview()
        shown = nil
        if present {
            ask()
        } else {
            CawContract.log.info("Caw \(layer.status.rawValue, privacy: .public) gone")
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
/// so he is never cut off mid-entrance; after that `content` lands at once and he plays his
/// exit over it. A wait shorter than the grace shows no Caw at all: `content` simply appears.
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
            // He plays his exit over the content and is taken away when it has ended.
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
    /// Told to leave and back on his still: the next file may take over.
    var still = false
    /// His coming in has ended (`entered`): he is in his loops, or at rest.
    var landed = false
    /// The file's `rests`: its status is one held drawing, his still.
    let rests: Bool
    private var hearing: [Task<Void, Never>] = []

    private init(status: CawStatus, view: RiveUIView, caw: ViewModelInstance, rests: Bool) {
        self.status = status
        self.view = view
        self.caw = caw
        self.rests = rests
    }

    isolated deinit {
        for task in hearing {
            task.cancel()
        }
    }

    static func load(_ status: CawStatus, from: CawStatus?, dark: Bool, reducedMotion: Bool) async throws -> CawLayer {
        let file = try await CawFiles.file(for: status)
        let artboard = try await file.createArtboard(CawContract.artboard)
        let stateMachine = try await artboard.createStateMachine(CawContract.stateMachine)
        // Retained in the layer and bound explicitly: the view writes to this instance for its lifetime.
        let caw = try await file.createViewModelInstance(.viewModelDefault(from: .name(CawContract.viewModel)))
        CawContract.write(to: caw, dark: dark, reducedMotion: reducedMotion)
        // `from` starts him: his enter on a first appearance, else his arrival from that status.
        caw.setValue(of: CawContract.from, to: from?.rawValue ?? CawContract.fromNone)
        try await stateMachine.bindViewModelInstances(main: caw)
        let rive = try await Rive(file: file, artboard: artboard, stateMachine: stateMachine)
        let view = RiveUIView(rive: rive, delegate: nil, isPaused: false)
        view.isUserInteractionEnabled = false
        view.isAccessibilityElement = false
        view.backgroundColor = .clear
        return try await CawLayer(status: status, view: view, caw: caw, rests: caw.value(of: CawContract.rests))
    }

    func set(_ property: BoolProperty, _ value: Bool) {
        caw.setValue(of: property, to: value)
    }

    /// Hears the file's triggers: the end of his coming in, his still while leaving, his exit's end.
    func hear(entered: @escaping @MainActor () -> Void, still: @escaping @MainActor () -> Void, gone: @escaping @MainActor () -> Void) {
        for (trigger, action) in [(CawContract.entered, entered), (CawContract.still, still), (CawContract.gone, gone)] {
            let fired = caw.stream(of: trigger)
            hearing.append(Task {
                do {
                    for try await _ in fired {
                        action()
                    }
                } catch {
                    CawContract.log.error("Caw trigger \(trigger.path, privacy: .public) failed: \(String(describing: error), privacy: .public)")
                }
            })
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
    static let from = EnumProperty(path: "from")
    /// `from` on a first appearance; otherwise it is the status he was showing.
    static let fromNone = "none"
    static let leave = BoolProperty(path: "leave")
    static let exit = BoolProperty(path: "exit")
    /// Read, never written: on in a file whose status rests on one drawing.
    static let rests = BoolProperty(path: "rests")
    static let entered = TriggerProperty(path: "entered")
    static let still = TriggerProperty(path: "still")
    static let gone = TriggerProperty(path: "gone")
    /// How long the file below stays once the next one has started: under the 83 ms its first
    /// drawing, the same picture, is held.
    static let handover = Duration.milliseconds(50)
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
