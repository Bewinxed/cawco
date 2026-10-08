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
    /// Beside "Compacted" in a transcript: his head alone, a folded note in his beak (`CawMark`).
    case compacted
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
///
/// With `ledge` he stands behind an edge (Caw.svelte's `ledge`): the view is his box's width and
/// the part of it above peek.riv's ledge line (`ledgeLine` of the width tall), so the line sits
/// on the view's bottom edge. He comes in by peek.riv's own enter, which draws the wing tips that
/// hang in front of the edge, so it is never clipped. Once it has entered he holds its rest while
/// the status is `ready`; any other status's file takes over by the same leave and enter as
/// anywhere else. The status files draw nothing below the line: their body is behind the edge.
/// Under Reduce Motion there is no peek: the status's file, behind the edge, fades in.
///
/// The ledge files are two: `peek` (peer-over, a Caw thread's composer corner) and `climb`
/// (climb-peer, the paywall's poster hero: he climbs up and peeks over the cards). Both rest on
/// the same ledge line.
public final class CawView: UIView {
    /// Which ledge clip brings him in (assets/mascot/scripts/scene.mjs `LEDGES`).
    public enum Ledge: Sendable {
        case peek
        case climb
    }

    /// Where the ledge runs across the ledge files' 512 still box, as a share of its side, from
    /// the top (assets/mascot/loops/rests.json, `peek.ledgeLine` and `climb.ledgeLine`).
    public static let ledgeLine = 0.5684

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

    /// He peeks over an edge at the view's bottom, coming in by this clip; status files are
    /// clipped below it. Nil: no edge.
    public let ledge: Ledge?
    /// His peek is on: his entrance behind the ledge, then its rest for as long as the status is
    /// `ready`. Off under Reduce Motion, and for good once another status is asked for after it
    /// has entered.
    private var peek: Bool
    /// The peek's enter has ended.
    private var peeked = false

    /// The Caw on screen.
    private var shown: CawLayer?
    /// The file being read for a first appearance or a change, and the file it is.
    private var loading: (file: CawFile, task: Task<Void, Never>)?
    private var fade: UIViewPropertyAnimator?
    /// The Caw on screen is fading out: whatever is asked for next comes in once he has gone.
    private var leaving = false
    private var entered = false

    public init(status: CawStatus, ledge: Ledge? = nil) {
        self.status = status
        self.ledge = ledge
        peek = ledge != nil && !UIAccessibility.isReduceMotionEnabled
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = false
        clipsToBounds = false
        isAccessibilityElement = false
        accessibilityElementsHidden = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self, UITraitDisplayScale.self]) { (view: CawView, _: UITraitCollection) in
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
    /// The side his still box is drawn at: the largest centred square, or with `ledge` the width.
    private var boxSide: Double { ledge != nil ? bounds.width : min(bounds.width, bounds.height) }
    private var pixel: Float { CawContract.pixel(side: boxSide, scale: traitCollection.displayScale) }
    /// `pixel` as last written to the Caw on screen.
    private var written: Float?

    /// The file for `status` now: the peek while it holds, else the status's own.
    private var wanted: CawFile {
        if peek, peeked, status != .ready {
            peek = false
        }
        if peek, let ledge { return .ledge(ledge) }
        return .status(status)
    }

    /// Brings the wanted file on. The first Caw is simply that file. A Caw on screen showing
    /// another file fades out, and the new file comes in once he has gone; under Reduce Motion
    /// the new one fades in over him.
    private func ask() {
        guard window != nil else {
            return
        }
        let file = wanted
        guard let shown else {
            load(file)
            return
        }
        if reducedMotion {
            if shown.file == file {
                cancelLoading()
            } else {
                load(file)
            }
            return
        }
        if !leaving, shown.file != file {
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
    /// Motion the fade alone, taking a Caw he was fading across with him. Then the file asked
    /// for comes in afresh, or with `present` off the place is left empty (`gone`).
    private func fadeOut(_ layer: CawLayer) {
        CawContract.log.info("Caw \(layer.file.name, privacy: .public) leaves")
        leaving = true
        fade?.stopAnimation(true)
        layer.view.isPaused = true
        let scale = reducedMotion ? 1 : Motion.leaveScale
        let drawn = cawViews
        let animator = Motion.easeOut.animator(Motion.durFade) {
            for view in drawn {
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

    /// Every Caw drawn here, inside its holder.
    private var cawViews: [UIView] { subviews.flatMap(\.subviews) }

    private func cancelLoading() {
        loading?.task.cancel()
        loading = nil
    }

    /// Reads `file` and starts its Caw. A newer file cancels this one while it loads.
    private func load(_ file: CawFile) {
        if loading?.file == file {
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
                incoming = try await CawLayer.load(file, dark: dark, reducedMotion: reducedMotion, pixel: pixel)
            } catch {
                CawContract.log.error("Caw \(file.name, privacy: .public) did not load: \(String(describing: error), privacy: .public)")
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
        loading = (file, task)
    }

    /// Puts `incoming` on screen, its file begun: his drawn enter is playing, and the file says
    /// `entered` at its end. A file with no drawn enter has him there already, so the view fades
    /// in from `Motion.leaveScale` over `Motion.durPop`; under Reduce Motion every file holds his
    /// still and the view fades in over `Motion.durFade`, across the Caw below.
    private func start(_ incoming: CawLayer, asked: ContinuousClock.Instant) {
        let below = shown
        let peeking = incoming.file.isLedge
        incoming.hearEntered { [weak self] in
            self?.reportEntered()
            if peeking { self?.peekLanded() }
        }
        clip(incoming)
        addSubview(incoming.holder)
        shown = incoming
        // Loaded at the size the view had then (none, before its first layout): laid out below,
        // he is given the rim's pixel at the size he stands at.
        written = nil
        setNeedsLayout()
        layoutIfNeeded()
        CawContract.log.info("Caw \(incoming.file.name, privacy: .public) starts \((ContinuousClock.now - asked).milliseconds, format: .fixed(precision: 1)) ms after it was asked for")
        fade?.stopAnimation(true)
        // A fade across that this one cut short left its own Caw below: that one goes now.
        for holder in subviews where holder !== incoming.holder && holder !== below?.holder {
            holder.removeFromSuperview()
        }
        if incoming.enters, !reducedMotion {
            below?.holder.removeFromSuperview()
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
            below?.holder.removeFromSuperview()
            self?.reportEntered()
        }
        fade = animator
        animator.startAnimation()
    }

    /// The peek has entered: a status other than `ready` takes over now.
    private func peekLanded() {
        peeked = true
        if present {
            ask()
        }
    }

    /// A status file behind the ledge: his acting still reaches past the box above and to the
    /// sides, and nothing of him draws below the view's bottom. The peek draws its own wing tips
    /// in front of the edge, and is not clipped.
    private func clip(_ layer: CawLayer) {
        guard ledge != nil, !layer.file.isLedge else {
            layer.holder.layer.mask = nil
            return
        }
        let mask = CALayer()
        mask.backgroundColor = UIColor.black.cgColor
        layer.holder.layer.mask = mask
    }

    private func reportEntered() {
        guard !entered else {
            return
        }
        entered = true
        CawContract.log.info("Caw \(self.status.rawValue, privacy: .public) entered")
        onEntered?()
    }

    /// `layer` has faded out. With `present` on, the file asked for comes in afresh.
    private func gone(_ layer: CawLayer) {
        guard shown === layer else {
            return
        }
        for holder in subviews {
            holder.removeFromSuperview()
        }
        shown = nil
        leaving = false
        CawContract.log.info("Caw \(layer.file.name, privacy: .public) gone")
        if present {
            ask()
        } else {
            onGone?()
        }
    }

    /// Writes the interface style, the motion setting and the rim's device pixel into the live
    /// Caw; its state machine follows.
    @objc private func apply() {
        if let shown {
            written = pixel
            CawContract.write(to: shown.caw, dark: dark, reducedMotion: reducedMotion, pixel: pixel)
        }
    }

    /// The still box fills the largest centred square of the bounds (with `ledge`, the bounds'
    /// width, its top on theirs, so the ledge line falls on their bottom); the artboard around
    /// the box spills past them. Rive fits the artboard into its view with `.contain`, and that
    /// view has the artboard's aspect, so the artboard scales by exactly side / 512. Each holder
    /// is the view's own box, untransformed; its mask runs far past it on three sides and stops
    /// at its bottom.
    override public func layoutSubviews() {
        super.layoutSubviews()
        let side = boxSide
        // His size is known now, or changed: the rim's device pixel follows it.
        if shown != nil, written != pixel { apply() }
        let scale = side / CawGeometry.stillBox.width
        let boxTop = ledge != nil ? bounds.minY : bounds.midY - side / 2
        let frame = CGRect(
            x: bounds.midX - side / 2 - CawGeometry.stillBox.minX * scale,
            y: boxTop - CawGeometry.stillBox.minY * scale,
            width: CawGeometry.artboard.width * scale,
            height: CawGeometry.artboard.height * scale
        )
        let reach = frame.width
        for holder in subviews {
            holder.frame = bounds
            holder.layer.mask?.frame = CGRect(x: -reach, y: -reach, width: bounds.width + reach * 2, height: bounds.height + reach)
            // By bounds and centre: a Caw fading out is scaled, and a frame is undefined then.
            for view in holder.subviews {
                view.bounds = CGRect(origin: .zero, size: frame.size)
                view.center = CGPoint(x: frame.midX, y: frame.midY)
            }
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

    /// One frame of a 60 Hz screen: long enough for a transaction to be committed.
    private static let frame = 1.0 / 60

    private func update() {
        guard isViewLoaded else {
            return
        }
        if !waiting, !entering {
            grace?.cancel()
            grace = nil
            graceOver = false
            guard let caw else {
                showContent()
                return
            }
            // He fades out over the content and is taken away when he has gone. The content is
            // mounted one frame after his leave, so his fade is committed and the render server
            // runs it while the main thread builds the content: mounted in the same turn, a home
            // list's first layout held him frozen on screen for 670 ms before his fade began.
            caw.present = false
            DispatchQueue.main.asyncAfter(deadline: .now() + CawWaiting.frame) { [weak self] in
                guard let self, !waiting, !entering else {
                    return
                }
                showContent()
            }
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

/// What a Caw is drawn from: a status's file, or a ledge file (peek.riv, climb.riv: his drawn
/// enter peering or climbing over an edge, resting on its landing).
enum CawFile: Hashable, Sendable {
    case status(CawStatus)
    case ledge(CawView.Ledge)

    var name: String {
        switch self {
        case let .status(status): status.rawValue
        case .ledge(.peek): "peek"
        case .ledge(.climb): "climb"
        }
    }

    var isLedge: Bool {
        if case .ledge = self { true } else { false }
    }
}

/// One file's Caw: its Rive view, the `Caw` instance bound to its state machine, and the
/// slot-sized holder it sits in, kept together so the instance lives exactly as long as the view
/// that draws it. The holder is never transformed, so a clip on it holds its line while the Caw
/// fades and scales inside.
@MainActor
final class CawLayer {
    let file: CawFile
    let view: RiveUIView
    let holder = UIView()
    let caw: ViewModelInstance
    /// The file's `enters`: it carries a drawn enter, and says `entered` at its end.
    let enters: Bool
    private var hearing: Task<Void, Never>?

    private init(file: CawFile, view: RiveUIView, caw: ViewModelInstance, enters: Bool) {
        self.file = file
        self.view = view
        self.caw = caw
        self.enters = enters
        holder.isUserInteractionEnabled = false
        holder.addSubview(view)
    }

    isolated deinit {
        hearing?.cancel()
    }

    static func load(_ status: CawStatus, dark: Bool, reducedMotion: Bool, pixel: Float, fit: Fit? = nil) async throws -> CawLayer {
        try await load(.status(status), dark: dark, reducedMotion: reducedMotion, pixel: pixel, fit: fit)
    }

    /// `fit` is how the artboard stands in the view: contained by default; a mark gives its own.
    static func load(_ source: CawFile, dark: Bool, reducedMotion: Bool, pixel: Float, fit: Fit? = nil) async throws -> CawLayer {
        let file = try await CawFiles.file(for: source)
        let artboard = try await file.createArtboard(CawContract.artboard)
        let stateMachine = try await artboard.createStateMachine(CawContract.stateMachine)
        // Retained in the layer and bound explicitly: the view writes to this instance for its lifetime.
        let caw = try await file.createViewModelInstance(.viewModelDefault(from: .name(CawContract.viewModel)))
        CawContract.write(to: caw, dark: dark, reducedMotion: reducedMotion, pixel: pixel)
        try await stateMachine.bindViewModelInstances(main: caw)
        let rive = try await Rive(file: file, artboard: artboard, stateMachine: stateMachine)
        if let fit { rive.fit = fit }
        let view = RiveUIView(rive: rive, delegate: nil, isPaused: false)
        view.isUserInteractionEnabled = false
        view.isAccessibilityElement = false
        view.backgroundColor = .clear
        return try await CawLayer(file: source, view: view, caw: caw, enters: caw.value(of: CawContract.enters))
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
enum CawGeometry {
    static let artboard = CGSize(width: 592, height: 592)
    static let stillBox = CGRect(x: 43, y: 40, width: 512, height: 512)
}

/// The `Caw` view model's names, as the files define them. Main-actor isolated: rive-ios's
/// property descriptors are not Sendable, and every use of them is on the main actor.
@MainActor
enum CawContract {
    static let artboard = "Caw"
    static let stateMachine = "CawStates"
    static let viewModel = "Caw"
    static let reducedMotion = BoolProperty(path: "reducedMotion")
    static let dark = BoolProperty(path: "dark")
    /// Read, never written: on in a file that carries a drawn enter.
    static let enters = BoolProperty(path: "enters")
    static let entered = TriggerProperty(path: "entered")
    /// One device pixel in the 512 still box's units: his dark rim is this wide, or the kit's
    /// where that is wider. 0 (unset) is the kit's rim.
    static let pixel = NumberProperty(path: "pixel")
    static let log = Logger(subsystem: "dev.cawco.app", category: "Caw")

    /// `pixel` for his still box drawn `side` points across on a screen of `scale`.
    static func pixel(side: Double, scale: Double) -> Float {
        side > 0 && scale > 0 ? Float(CawGeometry.stillBox.width / (side * scale)) : 0
    }

    static func write(to caw: ViewModelInstance, dark: Bool, reducedMotion: Bool, pixel: Float) {
        caw.setValue(of: self.dark, to: dark)
        caw.setValue(of: self.reducedMotion, to: reducedMotion)
        caw.setValue(of: self.pixel, to: pixel)
    }
}

/// The one Worker every Caw shares, and each status file's bytes, read from the bundle once.
@MainActor
enum CawFiles {
    private static var worker: Worker?
    private static var bytes: [CawFile: Data] = [:]

    static func file(for source: CawFile) async throws -> File {
        try await File(source: .data(cachedBytes(source)), worker: shared())
    }

    /// Reads `status`'s bytes and starts the Worker ahead of the first Caw that needs them.
    static func warm(_ status: CawStatus) async throws {
        _ = try await cachedBytes(.status(status))
        _ = try await shared()
    }

    private static func cachedBytes(_ source: CawFile) async throws -> Data {
        if let cached = bytes[source] {
            return cached
        }
        let data = try await read(source.name)
        bytes[source] = data
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
    private nonisolated static func read(_ name: String) async throws -> Data {
        guard let url = Bundle.module.url(forResource: name, withExtension: "riv", subdirectory: "caw") else {
            throw CawFileError.missing(name)
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
