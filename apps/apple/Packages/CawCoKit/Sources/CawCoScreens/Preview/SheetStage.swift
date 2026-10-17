import CawCoCore
import CawCoDesign
import UIKit

/// What the pane shows of a stage (PreviewPane.svelte `staged`,
/// `stageWaiting`, `compileErrors`): a sheet's, the project's own Vite, or a
/// workspace preview's server (`serve`), each run by the daemon in its
/// workspace. Starting, waking and a sheet's page compiling stand on the
/// loading cover; compile errors on a card over the last render, dimmed; a
/// stage that didn't start, where the page would be, with Try again.
struct SheetStageShown: Equatable {
    /// The cover's line while the page is on its way; nil when nothing is.
    var waiting: String?
    /// The first compile error standing now, and how many more stand besides.
    var error: StageError?
    var more = 0
    /// The stage didn't start or failed its restarts: what stands where the page would be.
    var down: Down?

    struct Down: Equatable {
        var title: String
        var line: String
    }

    /// PreviewPane.svelte's derivations, for `stage` while the page has (or
    /// has not) said it is ready; `served`, the port of a workspace preview's
    /// server, nil for a sheet's stage.
    init(_ stage: StageState?, connected: Bool, served: Int?) {
        guard let stage else { return }
        switch stage.status {
        case .starting: waiting = served == nil ? Words.Sheet.starting(dir: stage.dir) : Words.Sheet.serverStarting
        case .waking, .asleep: waiting = Words.Sheet.waking
        case .live:
            waiting = connected || served != nil ? nil : Words.Sheet.compiling
            error = stage.errors.first
            more = max(0, stage.errors.count - 1)
        case .error:
            down = if let served {
                Down(title: Words.Sheet.serverDownTitle(port: served), line: Words.Sheet.serverDownLine(message: stage.message))
            } else {
                Down(title: Words.Sheet.downTitle(dir: stage.dir), line: Words.Sheet.downLine(message: stage.message))
            }
        case .unrecognized: break
        }
    }

    /// A compile error's place, `file:line:column` as far as Vite's payload names it (`errorPlace`).
    static func place(_ error: StageError) -> String {
        let line = error.line.map(Int.init).flatMap { $0 > 0 ? ":\($0)" : nil } ?? ""
        let column = error.column.map(Int.init).flatMap { $0 > 0 ? ":\($0)" : nil } ?? ""
        return error.file + line + column
    }
}

/// `.sheet-error`: the first compile error, over the foot of the well, the
/// last render dimmed under it. A card on the raised surface inside a
/// hairline at `--radius-md` with the tile's shadow, `space-3` in and from
/// the well's sides and foot, at most 60% of the well tall, scrolling past
/// that: its title in the fail ink at the strong weight with the place in
/// code, Vite's first line, its code frame, and what happens next.
final class SheetErrorCard: UIView {
    private let scroll = UIScrollView()
    private let column = UIStackView()
    private let title = KitLabel(TypeScale.typeBody.with(weight: TypeScale.weightStrong), ink: Palette.dataBad, lines: 0)
    private let line = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let frameBox = UIScrollView()
    private let frameText = KitLabel(TypeScale.typeCode, ink: Palette.inkStrong, lines: 0)
    /// `.sheet-error-next`: how many more stand besides, and what happens next.
    private let foot = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private var fits: NSLayoutConstraint!

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        boxShadow = Shadow.shadowTile
        isAccessibilityElement = false
        accessibilityTraits = .staticText

        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.layer.cornerRadius = Radius.radiusMd
        scroll.layer.cornerCurve = .continuous
        scroll.clipsToBounds = true
        addSubview(scroll)
        column.axis = .vertical
        column.spacing = Space.space2
        column.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(column)

        // `.sheet-error-frame`: Vite's code frame as written, on the recess at
        // `--radius-sm`, `space-2` in, scrolling sideways rather than wrapping.
        frameBox.translatesAutoresizingMaskIntoConstraints = false
        frameBox.backgroundColor = Palette.surfaceRecess
        frameBox.layer.cornerRadius = Radius.radiusSm
        frameBox.layer.cornerCurve = .continuous
        frameBox.showsVerticalScrollIndicator = false
        frameBox.alwaysBounceVertical = false
        frameText.numberOfLines = 0
        frameText.lineBreakMode = .byClipping
        frameText.translatesAutoresizingMaskIntoConstraints = false
        frameBox.addSubview(frameText)

        for part in [title, line, frameBox, foot] as [UIView] { column.addArrangedSubview(part) }
        let inset = Space.space3
        fits = heightAnchor.constraint(equalTo: column.heightAnchor, constant: inset * 2)
        fits.priority = .defaultHigh
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: topAnchor),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
            column.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: inset),
            column.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: inset),
            column.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -inset),
            column.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -inset),
            column.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -inset * 2),
            fits,
            frameText.topAnchor.constraint(equalTo: frameBox.contentLayoutGuide.topAnchor, constant: Space.space2),
            frameText.leadingAnchor.constraint(equalTo: frameBox.contentLayoutGuide.leadingAnchor, constant: Space.space2),
            frameText.trailingAnchor.constraint(equalTo: frameBox.contentLayoutGuide.trailingAnchor, constant: -Space.space2),
            frameText.bottomAnchor.constraint(equalTo: frameBox.contentLayoutGuide.bottomAnchor, constant: -Space.space2),
            frameBox.heightAnchor.constraint(equalTo: frameText.heightAnchor, constant: Space.space2 * 2),
        ])
        paintEdge()
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (card: SheetErrorCard, _: UITraitCollection) in card.paintEdge() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("SheetErrorCard is built in code") }

    private func paintEdge() {
        layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }

    /// The first error and the count besides it, as the pane writes them.
    func show(_ error: StageError, more: Int) {
        let place = SheetStageShown.place(error)
        let words = NSMutableAttributedString(string: "\(Words.Sheet.errorTitle) ", attributes: [
            .font: title.role.font(title.role.points, weight: TypeScale.weightStrong), .foregroundColor: Palette.dataBad,
        ])
        words.append(NSAttributedString(string: place, attributes: [
            .font: TypeScale.typeCode.font, .foregroundColor: Palette.dataBad,
        ]))
        title.attributedText = words
        line.text = error.message.split(separator: "\n", omittingEmptySubsequences: false).first.map(String.init) ?? ""
        frameText.text = error.frame
        frameBox.isHidden = error.frame?.isEmpty ?? true
        foot.text = Words.Sheet.errorNext(more: more)
        accessibilityLabel = [title.attributedText?.string, line.text, foot.text].compactMap(\.self).joined(separator: ". ")
        #if DEBUG
        PreviewProbe.say("preview stage-card place=\(place) more=\(more)")
        #endif
    }
}

/// `.down` for a stage that didn't start: the well's own surface over the
/// page, the kit's empty state `space-6` in from its sides, scrolling when
/// it is taller than the well, Try again its one action.
final class SheetDownView: UIView {
    private let scroll = UIScrollView()
    private var empty: KitEmptyState?
    private(set) var again: UIButton!
    var onAgain: () -> Void = {}

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceWell
        scroll.translatesAutoresizingMaskIntoConstraints = false
        addSubview(scroll)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: topAnchor),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        again = KitButton.make(Words.Sheet.tryAgain, glyph: .refresh, variant: .outline, height: .sm) { [weak self] in self?.onAgain() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("SheetDownView is built in code") }

    /// What stands where the page would be, as the pane says it.
    func show(_ down: SheetStageShown.Down) {
        empty?.removeFromSuperview()
        again.removeFromSuperview()
        let made = KitEmptyState(icon: .alert, title: down.title, line: down.line, action: again)
        made.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(made)
        let side = Space.space6
        NSLayoutConstraint.activate([
            made.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            made.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: side),
            made.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -side),
            made.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            made.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -side * 2),
        ])
        empty = made
    }

    /// Try again's pending form (Button `pending`): its spinner and "Starting…", not pressable.
    func pending(_ on: Bool) {
        again.configuration?.showsActivityIndicator = on
        KitButton.setTitle(on ? Words.Sheet.tryingAgain : Words.Sheet.tryAgain, of: again, variant: .outline, height: .sm)
        again.isEnabled = !on
    }
}
