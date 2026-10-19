import Foundation
import Observation

/// Waits until `met` holds or `deadline` passes, woken by what `met` reads
/// changing (Observation), never by polling. True when it held.
@MainActor
func observedUntil(_ deadline: ContinuousClock.Instant, _ met: @escaping @MainActor () -> Bool) async -> Bool {
    while !met() {
        guard ContinuousClock.now < deadline else { return false }
        let wake = ObservedWake()
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            wake.continuation = done
            withObservationTracking { _ = met() } onChange: { Task { @MainActor in wake.fire() } }
            wake.timer = Task { @MainActor in
                try? await Task.sleep(until: deadline, clock: .continuous)
                wake.fire()
            }
        }
    }
    return true
}

@MainActor
private final class ObservedWake {
    var continuation: CheckedContinuation<Void, Never>?
    var timer: Task<Void, Never>?

    func fire() {
        timer?.cancel()
        continuation?.resume()
        continuation = nil
    }
}
