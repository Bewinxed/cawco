// CawCoMascot: Caw, CawCo's mascot, drawn by Rive from one .riv per status.
//
// The files' contract (assets/mascot/README.md): each status file holds that status's loops,
// which take turns on their own, and a view model `Caw` with the booleans `reducedMotion` and
// `dark`, bound to its state machine `CawStates`. This module picks the file for the status and
// sets those two values; Caw himself changes in the .riv files, never in Swift.
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
}

/// Caw at a brand moment: an empty board, first run, loading, reconnecting.
///
/// He follows the trait collection's interface style (`dark`) and the system's Reduce Motion
/// setting (`reducedMotion`) on his own. Decorative, so hidden from VoiceOver: the screen
/// around him carries the words.
///
/// He fades in once his file is drawn (`Motion.durFade` on `Motion.easeOut`), and `onEntered` is
/// called when that first fade has finished, or when his file fails to load, so a place can keep
/// him until then (`CawWaiting` does). A status change loads that status's file and fades the new
/// Caw in over the shown one, which stays fully drawn underneath until the fade ends, so no frame
/// is ever empty. At most two Caws are alive at once.
///
/// The view's bounds hold Caw's still: the largest centred square in them is the files' still
/// box. His acting reaches past that box, so he draws past the bounds there; nothing here clips
/// him, and he never takes touches from what lies under him.
public final class CawView: UIView {
    public var status: CawStatus {
        didSet {
            if status != oldValue {
                show(status)
            }
        }
    }

    public var onEntered: (() -> Void)?

    /// Bottom to top: the Caw on screen, and during a status change the one fading in above it.
    private var layers: [CawLayer] = []
    private var loading: Task<Void, Never>?
    private var fade: UIViewPropertyAnimator?

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
        if window != nil, layers.isEmpty, loading == nil {
            show(status)
        }
    }

    private var dark: Bool { traitCollection.userInterfaceStyle == .dark }

    /// Loads `status`'s Caw and fades it in: over nothing the first time, over the shown Caw
    /// after that. A newer status cancels this one while it loads.
    private func show(_ status: CawStatus) {
        loading?.cancel()
        guard layers.last?.status != status else {
            loading = nil
            return
        }
        let asked = ContinuousClock.now
        loading = Task { [weak self] in
            guard let self else {
                return
            }
            let incoming: CawLayer
            do {
                incoming = try await CawLayer.load(status, dark: dark, reducedMotion: UIAccessibility.isReduceMotionEnabled)
            } catch {
                CawContract.log.error("Caw \(status.rawValue, privacy: .public) did not load: \(String(describing: error), privacy: .public)")
                loading = nil
                if layers.isEmpty {
                    onEntered?()
                }
                return
            }
            guard !Task.isCancelled else {
                return
            }
            loading = nil
            enter(incoming, asked: asked)
        }
    }

    private func enter(_ incoming: CawLayer, asked: ContinuousClock.Instant) {
        let first = layers.isEmpty
        // At most two: whatever was fading in is drawn fully at once and becomes the one below.
        fade?.stopAnimation(true)
        if let shown = layers.last {
            shown.view.alpha = 1
            for old in layers.dropLast() {
                old.view.removeFromSuperview()
            }
            layers = [shown]
        }
        incoming.view.alpha = 0
        addSubview(incoming.view)
        layers.append(incoming)
        setNeedsLayout()
        layoutIfNeeded()
        CawContract.log.info("Caw \(incoming.status.rawValue, privacy: .public) fades in \((ContinuousClock.now - asked).milliseconds, format: .fixed(precision: 1)) ms after it was asked for")
        let animator = Motion.easeOut.animator(Motion.durFade) {
            incoming.view.alpha = 1
        }
        animator.addCompletion { [weak self] _ in
            guard let self else {
                return
            }
            if let at = layers.firstIndex(where: { $0.id == incoming.id }) {
                for below in layers[..<at] {
                    below.view.removeFromSuperview()
                }
                layers.removeFirst(at)
            }
            if first {
                CawContract.log.info("Caw \(incoming.status.rawValue, privacy: .public) entered \((ContinuousClock.now - asked).milliseconds, format: .fixed(precision: 1)) ms after it was asked for")
                onEntered?()
            }
        }
        fade = animator
        animator.startAnimation()
    }

    /// Writes the interface style and the motion setting into every live Caw; their state
    /// machines follow.
    @objc private func apply() {
        for layer in layers {
            CawContract.write(to: layer.caw, dark: dark, reducedMotion: UIAccessibility.isReduceMotionEnabled)
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
        for layer in layers {
            layer.view.frame = frame
        }
    }
}

/// A place's wait with Caw standing in for it. While `waiting`, the place is its plain surface
/// for `Motion.durWaitGrace`; a wait that outlasts it shows Caw at `status` (loading or
/// reconnecting), centred at `side`. Once he shows, `content` waits until his fade in has
/// finished, so he never blinks out mid-fade. A wait shorter than the grace shows no Caw at
/// all: `content` simply appears.
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
    /// Caw is on screen and his first fade in has not finished.
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
            caw?.removeFromSuperview()
            caw = nil
            showContent()
            return
        }
        hideContent()
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
        guard caw == nil else {
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
                graceOver = false
                update()
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
        view.addSubview(content.view)
        content.didMove(toParent: self)
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
private struct CawLayer {
    let id = UUID()
    let status: CawStatus
    let view: RiveUIView
    let caw: ViewModelInstance

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
        return CawLayer(status: status, view: view, caw: caw)
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
    static let log = Logger(subsystem: "dev.cawco.app", category: "Caw")

    static func write(to caw: ViewModelInstance, dark: Bool, reducedMotion: Bool) {
        caw.setValue(of: self.dark, to: dark)
        caw.setValue(of: self.reducedMotion, to: reducedMotion)
        logReadBack(caw)
    }

    /// Logs what the bound instance holds after a set, read back from the runtime.
    private static func logReadBack(_ caw: ViewModelInstance) {
        Task { @MainActor in
            do {
                let dark = try await caw.value(of: dark)
                let reducedMotion = try await caw.value(of: reducedMotion)
                log.info("Caw dark=\(dark) reducedMotion=\(reducedMotion)")
            } catch {
                log.error("Caw read-back failed: \(String(describing: error), privacy: .public)")
            }
        }
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
