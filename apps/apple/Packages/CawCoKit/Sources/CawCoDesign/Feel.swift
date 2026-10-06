import AVFoundation
import OSLog
import UIKit

/// Whether the interface plays its sounds (the Sound switch beside the
/// theme switch). Off until the reader turns it on; kept the way the theme
/// is (theme.svelte.ts `cawco-theme`), in the app's defaults.
@MainActor
public enum SoundPreference {
    private static let key = "cawco-sound"

    public static var enabled: Bool {
        get { UserDefaults.standard.bool(forKey: key) }
        set {
            UserDefaults.standard.set(newValue, forKey: key)
            if !newValue { Cues.shared.stop() }
            NotificationCenter.default.post(name: changed, object: nil)
        }
    }

    /// Posted when the switch is turned.
    public static let changed = Notification.Name("dev.cawco.sound")
}

/// What the composer's motion is felt and heard as (composer-recall
/// `felt`): each entry the wheel lands on is a detent, Cuelume's `select`
/// rising toward older entries and falling toward newer, with a selection
/// haptic; a hold coming up is `open` and a medium impact; a queued message
/// lifted out or given back is a light impact, with `select` or `close`.
/// Every sound plays at the subtle emphasis.
///
/// The haptics are UIKit's feedback generators, prepared ahead so the first
/// detent is not late. On the Mac (Mac Catalyst) the generators exist and do
/// nothing: Catalyst has no route to `NSHapticFeedbackManager` without an
/// AppKit bridge, so the Mac feels nothing and hears the same sounds.
@MainActor
public enum Feel {
    private static let selection = UISelectionFeedbackGenerator()
    private static let medium = UIImpactFeedbackGenerator(style: .medium)
    private static let light = UIImpactFeedbackGenerator(style: .light)

    /// Readies the haptic engine and the sound engine for what is coming.
    public static func prepare() {
        selection.prepare()
        medium.prepare()
        light.prepare()
        Cues.shared.warm()
    }

    /// The wheel landed on another entry; `older` when it rolled back in time.
    public static func detent(older: Bool) {
        Cues.shared.play(.select, direction: older ? 1 : -1)
        selection.selectionChanged()
        selection.prepare()
    }

    /// A hold on the composer brought the wheel up.
    public static func hold() {
        Cues.shared.play(.open)
        medium.impactOccurred()
        selection.prepare()
    }

    /// The wheel came up from a key or the history button.
    public static func opened() {
        Cues.shared.play(.open)
    }

    /// The wheel went back to the draft.
    public static func closed() {
        Cues.shared.play(.close)
    }

    /// A queued message's words lifted into the composer.
    public static func took() {
        Cues.shared.play(.select)
        light.impactOccurred()
    }

    /// The words went back to their bubble.
    public static func gaveBack() {
        Cues.shared.play(.close)
        light.impactOccurred()
    }
}

/// The audio engine the cues play on: built on the first sound after the
/// switch is on, stopped again once nothing has played for a while. Its
/// session is `.ambient`: it mixes with whatever else is playing and the
/// silent switch silences it.
@MainActor
public final class Cues {
    public static let shared = Cues()

    private var engine: AVAudioEngine?
    private var node: AVAudioSourceNode?
    private var synth: CueSynth?
    private var idle: DispatchWorkItem?
    private var watchers: [NSObjectProtocol] = []
    private let log = Logger(subsystem: "dev.cawco.app", category: "Sound")
    /// How long the engine runs on after the last sound, so a burst of
    /// detents starts no engine twice and a quiet app holds none.
    private static let lingerTime: TimeInterval = 8

    private init() {}

    /// Builds the engine ahead of the first sound (engine.js warms its graph
    /// the same way on the first touch), so the first detent costs nothing.
    func warm() {
        guard SoundPreference.enabled else { return }
        _ = running()
        linger()
    }

    func play(_ cue: CueName, direction: Int = 0) {
        guard SoundPreference.enabled, let synth = running() else { return }
        synth.play(cue, emphasis: .subtle, direction: direction)
        linger()
    }

    func stop() {
        idle?.cancel()
        idle = nil
        for watcher in watchers { NotificationCenter.default.removeObserver(watcher) }
        watchers = []
        if let engine {
            engine.stop()
            if let node { engine.detach(node) }
        }
        engine = nil
        node = nil
        // Released only once the engine no longer pulls from it.
        synth = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func linger() {
        idle?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.stop() }
        idle = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.lingerTime, execute: work)
    }

    private func running() -> CueSynth? {
        if let engine, engine.isRunning, let synth { return synth }
        stop()
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.ambient, mode: .default, options: [])
            try session.setActive(true)
        } catch {
            log.error("audio session refused: \(error.localizedDescription, privacy: .public)")
            return nil
        }
        let engine = AVAudioEngine()
        let rate = engine.outputNode.outputFormat(forBus: 0).sampleRate
        let synth = CueSynth(sampleRate: rate > 0 ? rate : 48000)
        guard let node = synth.makeNode() else { return nil }
        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: node.outputFormat(forBus: 0))
        engine.prepare()
        do {
            try engine.start()
        } catch {
            log.error("audio engine did not start: \(error.localizedDescription, privacy: .public)")
            engine.detach(node)
            return nil
        }
        self.engine = engine
        self.node = node
        self.synth = synth
        // A route or format change stops the engine; the next sound builds it again.
        let center = NotificationCenter.default
        watchers = [
            center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { _ in
                MainActor.assumeIsolated { Cues.shared.stop() }
            },
            center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated { Cues.shared.stop() }
            },
        ]
        return synth
    }
}
