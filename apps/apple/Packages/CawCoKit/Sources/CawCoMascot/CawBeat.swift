import RiveRuntime
import UIKit

/// Caw's head in the top bar (NeedsCaw.svelte): his compacted head, which plays his needs-you beat
/// once when something new needs the operator (`head-beat`: he blinks, stretches up into his alert
/// face, holds it and settles back; his guide: "a gentle beat… never a hello"), and smiles back at
/// the operator's own pointer or press (`head-smile`, his eyes squeezing into ^^, held while the
/// pointer stays, and `head-unsmile` back out). The beat goes first: one that comes while he
/// smiles plays as soon as his eyes are open again. With less motion nothing plays: no beat, and
/// his face is simply the ^^ one while the pointer is on him.
///
/// His two rests, his resting head and his ^^ one, are loaded once and held, drawn until the
/// scheme's rim has settled and then paused, as a mark's rest is. Each move is its file's enter,
/// loaded and played over them: it opens on the drawing the shown rest holds for two frames, the
/// rest goes under it within that hold, and in the frame it says `entered` the rest it landed on
/// shows and the clip's Rive is gone.
///
/// The view's bounds are his still's box; he draws a little past it, unclipped, as `CawMark` does.
@MainActor
public final class CawBeat: UIView {
    private enum Phase { case rest, beat, smilingIn, smiled, smilingOut }

    private let side: Double
    private var phase = Phase.rest
    /// A beat came while he smiled: it plays once he is back at rest.
    private var beatNext = false
    private var hovered = false
    private var pressing = false
    private var resting: CawLayer?
    private var smiling: CawLayer?
    private var clip: CawLayer?
    private var loading: Task<Void, Never>?
    private var playing: Task<Void, Never>?
    /// Each rest's pause, once its rim has settled.
    private var settling: [ObjectIdentifier: Task<Void, Never>] = [:]

    /// How long a rest is drawn before it is paused: the scheme's rim fades over 200 ms.
    private static let settle = Duration.seconds(1)
    /// How long a clip's first drawing shows before the rest under it goes: under its two-frame hold.
    private static let cover = Duration.milliseconds(34)

    public init(side: Double) {
        self.side = side
        super.init(frame: CGRect(x: 0, y: 0, width: side, height: side))
        isUserInteractionEnabled = false
        clipsToBounds = false
        isAccessibilityElement = false
        accessibilityElementsHidden = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (head: CawBeat, _: UITraitCollection) in
            for layer in [head.resting, head.smiling].compactMap(\.self) {
                CawContract.write(to: layer.caw, dark: head.dark, reducedMotion: true, pixel: head.pixel)
            }
            if let clip = head.clip { clip.caw.setValue(of: CawContract.dark, to: head.dark) }
            head.drawShown()
        }
        registerForTraitChanges([UITraitDisplayScale.self]) { (head: CawBeat, _: UITraitCollection) in
            for layer in [head.resting, head.smiling, head.clip].compactMap(\.self) {
                layer.view.rive?.fit = head.fit
                layer.caw.setValue(of: CawContract.pixel, to: head.pixel)
            }
            head.setNeedsLayout()
            head.drawShown()
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("CawBeat is built in code") }

    override public var intrinsicContentSize: CGSize { CGSize(width: side, height: side) }

    private var dark: Bool { traitCollection.userInterfaceStyle == .dark }
    private var pixel: Float { CawContract.pixel(side: side, scale: traitCollection.displayScale) }
    private var fit: Fit {
        .layout(scaleFactor: .explicit(Float(side / CawGeometry.stillBox.width * traitCollection.displayScale)))
    }

    override public func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else {
            // Off screen he plays nothing: whatever was under way is his rest when he is back.
            stopClip()
            beatNext = false
            hovered = false
            pressing = false
            phase = .rest
            show(smiled: false)
            return
        }
        if resting == nil, loading == nil { load() }
    }

    private func load() {
        loading = Task { [weak self] in
            guard let self else { return }
            defer { loading = nil }
            do {
                let rest = try await CawLayer.load(.status(.compacted), dark: dark, reducedMotion: true, pixel: pixel, fit: fit)
                let smile = try await CawLayer.load(.head(.smile), dark: dark, reducedMotion: true, pixel: pixel, fit: fit)
                guard !Task.isCancelled else { return }
                insertSubview(smile.view, at: 0)
                insertSubview(rest.view, at: 0)
                resting = rest
                smiling = smile
                setNeedsLayout()
                show(smiled: phase == .smiled)
                // Each rest is drawn once, so it shows its drawing the moment it is needed.
                draw(rest)
                draw(smile)
            } catch {
                CawContract.log.error("Caw's head did not load: \(String(describing: error), privacy: .public)")
            }
        }
    }

    // MARK: What the bar asks

    /// His needs-you beat, once; nothing with less motion.
    public func beat() {
        guard !UIAccessibility.isReduceMotionEnabled, window != nil else { return }
        switch phase {
        case .rest: play(.beat, .beat)
        case .beat: break
        case .smiled:
            beatNext = true
            smileOut()
        case .smilingIn, .smilingOut:
            beatNext = true
        }
    }

    /// The operator's pointer is on him, or has left.
    public func hover(_ on: Bool) {
        hovered = on
        if on {
            smileIn()
        } else if !pressing {
            smileOut()
        }
    }

    /// A press is down on him, or has lifted.
    public func press(_ down: Bool) {
        pressing = down
        if down {
            smileIn()
        } else if !hovered {
            smileOut()
        }
    }

    private func smileIn() {
        guard phase == .rest, !beatNext else { return }
        guard !UIAccessibility.isReduceMotionEnabled else {
            phase = .smiled
            show(smiled: true)
            return
        }
        play(.smile, .smilingIn)
    }

    /// A smile still coming in goes out once it has landed.
    private func smileOut() {
        guard phase == .smiled else { return }
        guard !UIAccessibility.isReduceMotionEnabled else {
            phase = .rest
            show(smiled: false)
            return
        }
        play(.unsmile, .smilingOut)
    }

    // MARK: Clips

    private func play(_ file: CawHeadFile, _ next: Phase) {
        stopClip()
        phase = next
        playing = Task { [weak self] in
            guard let self else { return }
            do {
                let layer = try await CawLayer.load(.head(file), dark: dark, reducedMotion: false, pixel: pixel, fit: fit)
                guard !Task.isCancelled else { return }
                layer.hearEntered { [weak self] in self?.landed() }
                addSubview(layer.view)
                clip = layer
                setNeedsLayout()
                try await Task.sleep(for: Self.cover)
                guard !Task.isCancelled, clip === layer else { return }
                resting?.view.isHidden = true
                smiling?.view.isHidden = true
            } catch is CancellationError {
                return
            } catch {
                CawContract.log.error("Caw's head did not play \(file.rawValue, privacy: .public): \(String(describing: error), privacy: .public)")
                landed()
            }
        }
    }

    private func stopClip() {
        playing?.cancel()
        playing = nil
        clip?.view.removeFromSuperview()
        clip = nil
    }

    /// The clip landed: the rest it landed on shows, in this frame, and the clip's Rive is gone.
    private func landed() {
        let from = phase
        stopClip()
        if from == .smilingIn {
            phase = .smiled
            show(smiled: true)
            // A tap's smile: in, and out again once it has landed; and out before a waiting beat.
            if beatNext || !(hovered || pressing) { smileOut() }
            return
        }
        phase = .rest
        show(smiled: false)
        if beatNext {
            beatNext = false
            play(.beat, .beat)
        } else if hovered || pressing {
            smileIn()
        }
    }

    // MARK: Rests

    private func show(smiled: Bool) {
        resting?.view.isHidden = smiled
        smiling?.view.isHidden = !smiled
        drawShown()
    }

    private func drawShown() {
        if let shown = [resting, smiling].compactMap(\.self).first(where: { !$0.view.isHidden }) { draw(shown) }
    }

    /// Draws a rest until its rim has settled, then pauses it.
    private func draw(_ layer: CawLayer) {
        let key = ObjectIdentifier(layer)
        settling[key]?.cancel()
        layer.view.isPaused = false
        settling[key] = Task { [weak layer] in
            try? await Task.sleep(for: Self.settle)
            guard !Task.isCancelled else { return }
            layer?.view.isPaused = true
        }
    }

    /// The files draw from their artboard's corner at exactly side / 512, as a mark's do.
    override public func layoutSubviews() {
        super.layoutSubviews()
        let pixel = traitCollection.displayScale
        let unit = side / CawGeometry.stillBox.width
        func whole(_ value: Double) -> Double { (value * pixel).rounded() / pixel }
        let span = (CawGeometry.artboard.width * unit * pixel).rounded(.up) / pixel
        let frame = CGRect(x: whole(-CawGeometry.stillBox.minX * unit), y: whole(-CawGeometry.stillBox.minY * unit), width: span, height: span)
        for view in subviews { view.frame = frame }
    }
}
