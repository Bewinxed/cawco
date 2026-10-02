// CawCoMascot: Caw, CawCo's mascot, drawn by Rive from caw.riv.
//
// caw.riv's contract (assets/mascot/README.md): view model `Caw` with an enum `status` and the
// booleans `reducedMotion` and `dark`, bound to its state machine `CawStates`. This module only
// sets those three values; Caw himself changes in the .riv, never in Swift.
//
// Resources/caw.riv is written by assets/mascot/scripts/build.mjs, byte for byte the same file as
// assets/mascot/caw.riv.
import OSLog
import RiveRuntime
import SwiftUI

/// What Caw shows: the values of the `Caw` view model's `status` enum, in contract order.
public enum CawStatus: String, CaseIterable, Sendable {
    case ready
    case working
    case needsYou = "needs_you"
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
public struct CawView: View {
    private let status: CawStatus
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var rive: Rive?

    public init(status: CawStatus) {
        self.status = status
    }

    public var body: some View {
        RiveUIViewRepresentable(rive: rive)
            .accessibilityHidden(true)
            .task { await load() }
            .onChange(of: status) { apply() }
            .onChange(of: colorScheme) { apply() }
            .onChange(of: reduceMotion) { apply() }
    }

    private func load() async {
        guard rive == nil else {
            return
        }
        do {
            let file = try await CawFile.shared()
            let artboard = try await file.createArtboard(CawContract.artboard)
            let stateMachine = try await artboard.createStateMachine(CawContract.stateMachine)
            let caw = try await file.createViewModelInstance(.viewModelDefault(from: .name(CawContract.viewModel)))
            rive = try await Rive(file: file, artboard: artboard, stateMachine: stateMachine, dataBind: .instance(caw))
            apply()
        } catch {
            CawContract.log.error("Caw did not load: \(String(describing: error), privacy: .public)")
        }
    }

    /// Writes the view's state into the bound `Caw` instance; the state machine follows it.
    private func apply() {
        guard let caw = rive?.viewModelInstance else {
            return
        }
        caw.setValue(of: CawContract.status, to: status.rawValue)
        caw.setValue(of: CawContract.dark, to: colorScheme == .dark)
        caw.setValue(of: CawContract.reducedMotion, to: reduceMotion)
        CawContract.logReadBack(caw)
    }
}

/// The `Caw` view model's names, as caw.riv defines them. Main-actor isolated: rive-ios's
/// property descriptors are not Sendable, and every use of them is on the main actor.
@MainActor
private enum CawContract {
    static let artboard = "Caw"
    static let stateMachine = "CawStates"
    static let viewModel = "Caw"
    static let status = EnumProperty(path: "status")
    static let reducedMotion = BoolProperty(path: "reducedMotion")
    static let dark = BoolProperty(path: "dark")
    static let log = Logger(subsystem: "dev.cawco.app", category: "Caw")

    /// Logs what the bound instance holds after a set, read back from the runtime.
    static func logReadBack(_ caw: ViewModelInstance) {
        Task { @MainActor in
            do {
                let status = try await caw.value(of: status)
                let dark = try await caw.value(of: dark)
                let reducedMotion = try await caw.value(of: reducedMotion)
                log.info("Caw status=\(status, privacy: .public) dark=\(dark) reducedMotion=\(reducedMotion)")
            } catch {
                log.error("Caw read-back failed: \(String(describing: error), privacy: .public)")
            }
        }
    }
}

/// The one Worker and the one caw.riv every CawView shares, loaded once on first use.
@MainActor
private enum CawFile {
    private static var file: File?
    private static var loading: Task<Void, any Error>?

    static func shared() async throws -> File {
        if let file {
            return file
        }
        let task = loading ?? Task { @MainActor in
            file = try await File(source: .local("caw", .module), worker: Worker())
        }
        loading = task
        do {
            try await task.value
        } catch {
            loading = nil
            throw error
        }
        guard let file else {
            throw CawFileError.notLoaded
        }
        return file
    }
}

private enum CawFileError: Error {
    case notLoaded
}
