// CawCoMascot: Caw, CawCo's mascot, drawn by Rive from one .riv per status.
//
// The files' contract (assets/mascot/README.md): each status file holds that status's loops,
// which take turns on their own, and a view model `Caw` with the booleans `reducedMotion` and
// `dark`, bound to its state machine `CawStates`. This module picks the file for the status and
// sets those two values; Caw himself changes in the .riv files, never in Swift.
//
// Resources/caw/<status>.riv are written by assets/mascot/scripts/build.mjs, byte for byte the
// same files as assets/mascot/caw/<status>.riv.
import CawCoDesign
import OSLog
import RiveRuntime
import SwiftUI

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
/// He follows the colour scheme (`dark`) and the system's Reduce Motion setting (`reducedMotion`)
/// on his own. Decorative, so hidden from VoiceOver: the screen around him carries the words.
///
/// He fades in once his file is drawn (`Motion.durFade` on `Motion.easeOut`), and `onEntered` is
/// called when that first fade has finished, or when his file fails to load, so a place can keep
/// him until then (`CawWaiting` does). A status change loads that status's file and fades the new
/// Caw in over the shown one, which stays fully drawn underneath until the fade ends, so no frame
/// is ever empty. At most two Caws are alive at once.
///
/// The view's frame holds Caw's still: the largest centred square in it is the files' still box.
/// His acting reaches past that box, so he draws past the frame there; nothing here clips him, and
/// he never takes taps from what lies under him.
public struct CawView: View {
    private let status: CawStatus
    private let onEntered: (() -> Void)?
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Bottom to top: the Caw on screen, and during a status change the one fading in above it.
    @State private var layers: [CawLayer] = []

    public init(status: CawStatus, onEntered: (() -> Void)? = nil) {
        self.status = status
        self.onEntered = onEntered
    }

    public var body: some View {
        StillBoxLayout {
            ZStack {
                ForEach(layers) { layer in
                    RiveUIViewRepresentable(rive: layer.rive)
                        .opacity(layer.shown ? 1 : 0)
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task(id: status) { await show(status) }
        .onChange(of: colorScheme) { apply() }
        .onChange(of: reduceMotion) { apply() }
    }

    /// Loads `status`'s Caw and fades it in: over nothing the first time, over the shown Caw after
    /// that. A newer status cancels this one while it loads.
    private func show(_ status: CawStatus) async {
        guard layers.last?.status != status else {
            return
        }
        let asked = ContinuousClock.now
        let incoming: CawLayer
        do {
            incoming = try await CawLayer.load(status, dark: colorScheme == .dark, reducedMotion: reduceMotion)
        } catch {
            CawContract.log.error("Caw \(status.rawValue, privacy: .public) did not load: \(String(describing: error), privacy: .public)")
            if layers.isEmpty {
                onEntered?()
            }
            return
        }
        guard !Task.isCancelled else {
            return
        }
        let waited = (ContinuousClock.now - asked).milliseconds
        let first = layers.isEmpty
        // At most two: whatever was fading in is drawn fully at once and becomes the one below.
        layers = (layers.last.map { [$0.showing()] } ?? []) + [incoming]
        CawContract.log.info("Caw \(status.rawValue, privacy: .public) fades in \(waited, format: .fixed(precision: 1)) ms after it was asked for")
        withAnimation(.timingCurve(Motion.easeOut, duration: Motion.durFade)) {
            layers[layers.count - 1] = incoming.showing()
        } completion: {
            if let top = layers.firstIndex(where: { $0.id == incoming.id }) {
                layers.removeFirst(top)
            }
            if first {
                CawContract.log.info("Caw \(status.rawValue, privacy: .public) entered \((ContinuousClock.now - asked).milliseconds, format: .fixed(precision: 1)) ms after it was asked for")
                onEntered?()
            }
        }
    }

    /// Writes the view's scheme and motion setting into every live Caw; their state machines follow.
    private func apply() {
        for layer in layers {
            CawContract.write(to: layer.caw, dark: colorScheme == .dark, reducedMotion: reduceMotion)
        }
    }
}

/// A place's wait with Caw standing in for it. While `waiting`, the place is its plain surface for
/// `Motion.durWaitGrace`; a wait that outlasts it shows Caw at `status` (loading or reconnecting).
/// Once he shows, `content` waits until his fade in has finished, so he never blinks out mid-fade.
/// A wait shorter than the grace shows no Caw at all: `content` simply appears.
public struct CawWaiting<Content: View>: View {
    private let waiting: Bool
    private let status: CawStatus
    private let content: Content
    /// The wait outlasted its grace and Caw stands in for it.
    @State private var graceOver = false
    /// Caw is on screen and his first fade in has not finished.
    @State private var entering = false

    public init(waiting: Bool, status: CawStatus, @ViewBuilder content: () -> Content) {
        self.waiting = waiting
        self.status = status
        self.content = content()
    }

    public var body: some View {
        ZStack {
            if !waiting, !entering {
                content
            } else if graceOver {
                CawView(status: status) {
                    entering = false
                    if !waiting {
                        graceOver = false
                    }
                }
                .onAppear { entering = true }
            }
        }
        .task(id: waiting) {
            guard waiting, !graceOver else {
                if !waiting, !entering {
                    graceOver = false
                }
                return
            }
            try? await Task.sleep(for: .seconds(Motion.durWaitGrace))
            if !Task.isCancelled {
                graceOver = true
            }
        }
    }
}

/// One status's Caw: its Rive view configuration and the `Caw` instance bound to its state machine,
/// kept together so the instance lives exactly as long as the view that writes to it.
private struct CawLayer: Identifiable {
    let id = UUID()
    let status: CawStatus
    let rive: Rive
    let caw: ViewModelInstance
    var shown = false

    func showing() -> CawLayer {
        var layer = self
        layer.shown = true
        return layer
    }

    @MainActor
    static func load(_ status: CawStatus, dark: Bool, reducedMotion: Bool) async throws -> CawLayer {
        let file = try await CawFiles.file(for: status)
        let artboard = try await file.createArtboard(CawContract.artboard)
        let stateMachine = try await artboard.createStateMachine(CawContract.stateMachine)
        // Retained in the layer and bound explicitly: the view writes to this instance for its lifetime.
        let caw = try await file.createViewModelInstance(.viewModelDefault(from: .name(CawContract.viewModel)))
        CawContract.write(to: caw, dark: dark, reducedMotion: reducedMotion)
        try await stateMachine.bindViewModelInstances(main: caw)
        let rive = try await Rive(file: file, artboard: artboard, stateMachine: stateMachine)
        return CawLayer(status: status, rive: rive, caw: caw)
    }
}

/// Where the files draw Caw's still: a 512 × 512 box at (43, 40) in their 592 × 592 artboard. The
/// room around the box is for his acting (assets/mascot/README.md, Contract).
private enum CawGeometry {
    static let artboard = CGSize(width: 592, height: 592)
    static let stillBox = CGRect(x: 43, y: 40, width: 512, height: 512)
}

/// Sizes and places the Rive views so the still box fills the largest centred square of the
/// frame. The view reports the size it is offered; the artboard around the box spills past it.
/// Rive fits the artboard into the Rive view with its default, `.contain(alignment: .center)`, and
/// that view has the artboard's aspect, so the artboard scales by exactly side / 512.
private struct StillBoxLayout: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        proposal.replacingUnspecifiedDimensions()
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let side = min(bounds.width, bounds.height)
        let scale = side / CawGeometry.stillBox.width
        let origin = CGPoint(
            x: bounds.midX - side / 2 - CawGeometry.stillBox.minX * scale,
            y: bounds.midY - side / 2 - CawGeometry.stillBox.minY * scale
        )
        let size = ProposedViewSize(
            width: CawGeometry.artboard.width * scale,
            height: CawGeometry.artboard.height * scale
        )
        for subview in subviews {
            subview.place(at: origin, anchor: .topLeading, proposal: size)
        }
    }
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
