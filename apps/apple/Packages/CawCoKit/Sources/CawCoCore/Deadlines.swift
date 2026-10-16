import Observation

/// The clock every deadline is read against (client.svelte.ts `ahead`). A
/// status that holds until a moment, a machine reconnecting until its hub
/// stops reading it so, is that moment read here, never a flag a later event
/// has to clear: whoever reads `ahead` while observing is told again when
/// the moment passes, and reads the status the moment says then.
///
/// It wakes once at each deadline asked about that is still ahead, and only
/// then: `tick` moves, and every reader observing it reads again.
@MainActor @Observable
public final class Deadlines {
    public static let shared = Deadlines()

    /// Moves at each deadline as it passes: what a reader observes.
    private var tick = 0
    /// The deadlines asked about that are still ahead.
    @ObservationIgnored private var pending: Set<ContinuousClock.Instant> = []
    /// The wait for the nearest of them.
    @ObservationIgnored private var sleeper: (until: ContinuousClock.Instant, task: Task<Void, Never>)?

    private init() {}

    /// Whether `deadline` is still ahead, read so an observing reader is told when it passes.
    public func ahead(_ deadline: ContinuousClock.Instant) -> Bool {
        _ = tick
        guard ContinuousClock.now < deadline else { return false }
        if pending.insert(deadline).inserted { wake() }
        return true
    }

    /// Waits for the nearest deadline ahead, unless a wait for one no later is already out.
    private func wake() {
        guard let next = pending.min() else { return }
        if let sleeper, sleeper.until <= next { return }
        sleeper?.task.cancel()
        sleeper = (next, Task { [weak self] in
            try? await Task.sleep(until: next, clock: .continuous)
            guard !Task.isCancelled, let self else { return }
            let now = ContinuousClock.now
            pending = pending.filter { $0 > now }
            sleeper = nil
            tick &+= 1
            wake()
        })
    }
}
