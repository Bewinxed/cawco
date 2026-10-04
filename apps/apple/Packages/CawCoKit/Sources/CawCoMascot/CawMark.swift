import RiveRuntime
import UIKit

/// Caw as a mark (CawMark.svelte): his still at a few points, beside a word,
/// on a row of a list. At rest he is his status's file holding its one
/// drawing, drawn until the scheme's rim has settled and then paused, so a
/// row of marks costs nothing. `arrive` is the one time he comes in: the
/// file's enter clip, played once over his hidden rest, which takes its place
/// in the frame the clip lands on his still. With less motion he rests from
/// the start.
///
/// The view's bounds are his still's box, the mark's layout box. He draws a
/// little past it, unclipped: his rim sits outside the box and his coming in
/// acts wider. The file is drawn at exactly `side` to its 512 box, on whole
/// device pixels, never resampled. If the file does not load the box stays empty.
public final class CawMark: UIView {
    private let status: CawStatus
    private let side: Double
    private var rest: CawLayer?
    private var clip: CawLayer?
    private var loading: Task<Void, Never>?
    private var arriving: Task<Void, Never>?
    private var settling: Task<Void, Never>?

    /// How long his rest is drawn before it is paused: the scheme's rim fades in over 200 ms.
    private static let settle = Duration.seconds(1)

    public init(status: CawStatus, side: Double) {
        self.status = status
        self.side = side
        super.init(frame: CGRect(x: 0, y: 0, width: side, height: side))
        isUserInteractionEnabled = false
        clipsToBounds = false
        isAccessibilityElement = false
        accessibilityElementsHidden = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (mark: CawMark, _: UITraitCollection) in
            guard let rest = mark.rest else { return }
            CawContract.write(to: rest.caw, dark: mark.dark, reducedMotion: true)
            mark.draw(rest)
        }
        registerForTraitChanges([UITraitDisplayScale.self]) { (mark: CawMark, _: UITraitCollection) in
            for layer in [mark.rest, mark.clip].compactMap(\.self) { layer.view.rive?.fit = mark.fit }
            mark.setNeedsLayout()
            if let rest = mark.rest { mark.draw(rest) }
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("CawMark is built in code") }

    override public var intrinsicContentSize: CGSize { CGSize(width: side, height: side) }

    /// Reads a status's file ahead of the first mark that will show it: for a
    /// place that knows he is coming before his row is on screen.
    public static func warm(_ status: CawStatus) {
        Task {
            do { try await CawFiles.warm(status) } catch {
                CawContract.log.error("Caw \(status.rawValue, privacy: .public) did not warm: \(String(describing: error), privacy: .public)")
            }
        }
    }

    private var dark: Bool { traitCollection.userInterfaceStyle == .dark }

    /// Device pixels to a unit of the file's artboard: `side` to its 512 box.
    private var fit: Fit {
        .layout(scaleFactor: .explicit(Float(side / CawGeometry.stillBox.width * traitCollection.displayScale)))
    }

    override public func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else {
            // Off screen he plays nothing: an arrival cut short is his rest when he is back.
            arriving?.cancel()
            arriving = nil
            land()
            return
        }
        if rest == nil, loading == nil { load() }
    }

    private func load() {
        loading = Task { [weak self] in
            guard let self else { return }
            defer { loading = nil }
            do {
                let layer = try await CawLayer.load(status, dark: dark, reducedMotion: true, fit: fit)
                guard !Task.isCancelled else { return }
                layer.view.isHidden = arriving != nil || clip != nil
                insertSubview(layer.view, at: 0)
                rest = layer
                setNeedsLayout()
                draw(layer)
            } catch {
                CawContract.log.error("Caw \(self.status.rawValue, privacy: .public) mark did not load: \(String(describing: error), privacy: .public)")
            }
        }
    }

    /// Draws his rest until its rim has settled, then pauses it.
    private func draw(_ layer: CawLayer) {
        settling?.cancel()
        layer.view.isPaused = false
        settling = Task { [weak layer] in
            try? await Task.sleep(for: Self.settle)
            guard !Task.isCancelled else { return }
            layer?.view.isPaused = true
        }
    }

    /// His coming in, once, `delay` from now: the file's enter clip, then his rest.
    public func arrive(after delay: TimeInterval) {
        guard !UIAccessibility.isReduceMotionEnabled, arriving == nil, clip == nil else { return }
        rest?.view.isHidden = true
        arriving = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard let self, !Task.isCancelled else { return }
            do {
                let layer = try await CawLayer.load(status, dark: dark, reducedMotion: false, fit: fit)
                guard !Task.isCancelled else { return }
                layer.hearEntered { [weak self] in self?.land() }
                addSubview(layer.view)
                clip = layer
                setNeedsLayout()
            } catch {
                CawContract.log.error("Caw \(self.status.rawValue, privacy: .public) mark did not arrive: \(String(describing: error), privacy: .public)")
                land()
            }
            arriving = nil
        }
    }

    /// The clip has landed on his still: his rest shows and the clip's Rive is gone.
    private func land() {
        rest?.view.isHidden = false
        if let rest { draw(rest) }
        clip?.view.removeFromSuperview()
        clip = nil
    }

    /// The file draws from its artboard's corner at exactly side / 512, so the
    /// view stands where that puts his still's box on the mark's, moved to the
    /// nearest whole device pixel, and is wide enough for the artboard.
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
