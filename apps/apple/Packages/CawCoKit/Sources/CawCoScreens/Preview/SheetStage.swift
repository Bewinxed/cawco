import CawCoCore
import CawCoDesign
import UIKit

/// What the pane shows of a stage (PreviewPane.svelte `staged`,
/// `stageWaiting`, `compileErrors`): a sheet's, the project's own dev
/// toolchain (Vite, Astro or Nuxt), or a
/// workspace preview's server (`serve`), each run by the daemon in its
/// workspace. Starting, waking and a sheet's page compiling stand on the
/// loading cover; compile errors on a card over the last render, dimmed; a
/// stage that didn't start, where the page would be, with Try again; and a
/// page still on its way past the time its stage is given, the same place,
/// never an endless cover.
struct SheetStageShown: Equatable {
    /// How long a stage has to answer once started (core stage.ts `STAGE_READY_MS`).
    static let readyTime = 60.0
    /// How long a place's stage clone may take before its stage starts: its
    /// git, then its install (core `STAGE_CLONE_MS`, `STAGE_CLONE_GIT_MS` + `STAGE_CLONE_INSTALL_MS`).
    static let cloneTime = 60.0 + 180.0

    /// The cover's line while the page is on its way; nil when nothing is.
    var waiting: String?
    /// The first compile error standing now, and how many more stand besides.
    var error: StageError?
    var more = 0
    /// The stage didn't start or failed its restarts: what stands where the page would be.
    var down: Down?

    struct Down: Equatable {
        var title: String
        /// The plain words (core sheet.ts `downLine`, `serverDownLine`).
        var line: String
        /// The stage's own words, under Show details; nil when it gave none.
        var details: String?
        /// The canvas can leave the panel from here (a page never drawn): Remove, asked in place.
        var remove = false
    }

    /// How long the cover may stand, in seconds (PreviewPane.svelte
    /// `waitingFor`), counted from when the pane began waiting: a starting
    /// stage its clone and install, then its time to serve; one waking or
    /// live but not yet drawn its time to serve; nil when nothing is on its way.
    static func waitingFor(_ stage: StageState?, connected: Bool, served: Int?) -> Double? {
        switch stage?.value1?.status ?? stage?.value2?.status {
        case .starting: cloneTime + readyTime
        case .waking, .asleep: readyTime
        case .live: connected || served != nil ? nil : readyTime
        default: nil
        }
    }

    /// PreviewPane.svelte's derivations, for `stage` while the page has (or
    /// has not) said it is ready; `served`, the port of a workspace preview's
    /// server, nil for a sheet's stage; `neverDrawn`, the page stood on its
    /// way past `waitingFor` (`waited`, in seconds).
    init(_ stage: StageState?, connected: Bool, served: Int?, neverDrawn: Bool = false, waited: Double? = nil) {
        defer {
            if neverDrawn, down == nil {
                // What the stage last said of it: its own message, else the first compile error's line.
                let said = stage?.value1?.message ?? stage?.value2?.message
                    ?? error?.message.split(separator: "\n", omittingEmptySubsequences: false).first.map(String.init)
                waiting = nil
                down = Down(title: Words.Sheet.neverDrawnTitle,
                            line: Words.Sheet.neverDrawnLine(seconds: Int((waited ?? Self.readyTime).rounded())),
                            details: said, remove: true)
            }
        }
        if let sheet = stage?.value1 {
            switch sheet.status {
            case .starting: waiting = Words.Sheet.starting(dir: sheet.dir)
            case .waking, .asleep: waiting = Words.Sheet.waking
            case .live:
                waiting = connected ? nil : Words.Sheet.compiling
                error = sheet.errors.first
                more = max(0, sheet.errors.count - 1)
            case .error:
                let toolchain = Words.Sheet.Toolchains.byKey[sheet.toolchain.rawValue] ?? sheet.toolchain.rawValue
                down = Down(title: Words.Sheet.downTitle(dir: sheet.dir),
                            line: Words.Sheet.downLine(toolchain: toolchain), details: sheet.message)
            case .unrecognized: break
            }
        } else if let server = stage?.value2, let served {
            switch server.status {
            case .starting: waiting = Words.Sheet.serverStarting
            case .waking, .asleep: waiting = Words.Sheet.waking
            case .live:
                error = server.errors.first
                more = max(0, server.errors.count - 1)
            case .error:
                down = Down(title: Words.Sheet.serverDownTitle(port: served),
                            line: Words.Sheet.serverDownLine, details: server.message)
            case .unrecognized: break
            }
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
/// it is taller than the well, Try again its one action. The stage's own
/// words, when it gave any, fold under Show details beside it, as RowFault
/// folds a machine's (PreviewPane.svelte `stageDetails`): `.down-details`,
/// the figure face in muted ink `space-2` under the actions, a long machine
/// path wrapping anywhere.
final class SheetDownView: UIView {
    private let scroll = UIScrollView()
    private var empty: KitEmptyState?
    private(set) var again: UIButton!
    /// Show details / Hide details, standing while the stage gave its own words.
    private(set) var detailsButton: UIButton!
    /// Remove, on a page never drawn: the canvas leaves the panel, once asked in place.
    private(set) var removeButton: UIButton!
    /// The question Remove asks, under the actions (AskHere, The Open Page Rule).
    let asks = AskHere()
    private let details = KitLabel(TypeScale.typeCode, ink: Palette.inkMuted, lines: 0)
    /// The stage's own words unfolded: the pane's, kept from one down to the next.
    private(set) var detailsShown = false
    var onAgain: () -> Void = {}
    /// The canvas's name, and its removal once the person confirms.
    var onRemove: (() -> (name: String, run: () async throws -> Void)?) = { nil }

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
        detailsButton = KitButton.make("Show details", variant: .ghost, height: .sm) { [weak self] in
            guard let self else { return }
            detailsShown.toggle()
            paintDetails()
        }
        removeButton = KitButton.make(Words.Sheet.remove, glyph: .trash, variant: .ghost, height: .sm) { [weak self] in
            self?.askRemove()
        }
        details.lineBreakMode = .byCharWrapping
        details.isHidden = true
    }

    /// Remove, asked in place under the actions (PreviewPane.svelte `removeShown`): destructive.
    private func askRemove() {
        guard let asked = onRemove() else { return }
        asks.ask(.init(title: Words.Sheet.removeTitle(name: asked.name), body: [Words.Sheet.removeBody],
                       confirmLabel: Words.Sheet.removeConfirm, pendingLabel: Words.Sheet.removing,
                       destructive: true, run: asked.run))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("SheetDownView is built in code") }

    /// What stands where the page would be, as the pane says it.
    func show(_ down: SheetStageShown.Down) {
        empty?.removeFromSuperview()
        // `.down-actions`: Try again, Remove on a page never drawn, and Show details while the stage said why.
        let actions = UIStackView(arrangedSubviews: [again, removeButton, detailsButton])
        actions.spacing = Space.space2
        actions.alignment = .center
        removeButton.isHidden = !down.remove
        detailsButton.isHidden = down.details == nil
        details.text = down.details
        let action = UIStackView(arrangedSubviews: [actions, details, asks])
        action.axis = .vertical
        action.alignment = .leading
        action.spacing = Space.space2
        let made = KitEmptyState(icon: .alert, title: down.title, line: down.line, action: action)
        made.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(made)
        let side = Space.space6
        NSLayoutConstraint.activate([
            made.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            made.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: side),
            made.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -side),
            made.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            made.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -side * 2),
            action.widthAnchor.constraint(lessThanOrEqualTo: made.widthAnchor),
            details.widthAnchor.constraint(lessThanOrEqualTo: action.widthAnchor),
            asks.widthAnchor.constraint(equalTo: action.widthAnchor),
        ])
        empty = made
        paintDetails()
    }

    /// Show details' words and the stage's own words, folded or not.
    private func paintDetails() {
        let shown = detailsShown && details.text != nil
        details.isHidden = !shown
        let words = shown ? "Hide details" : "Show details"
        KitButton.setTitle(words, of: detailsButton, variant: .ghost, height: .sm)
        detailsButton.accessibilityValue = shown ? "Expanded" : "Collapsed"
        #if DEBUG
        PreviewProbe.say("preview stage-down details=\(detailsButton.isHidden ? "none" : shown ? "shown" : "folded") words=\(detailsButton.isHidden ? "-" : words) text=\(shown ? details.text ?? "" : "-")")
        #endif
    }

    /// Try again's pending form (Button `pending`): its spinner and "Starting…", not pressable.
    func pending(_ on: Bool) {
        again.configuration?.showsActivityIndicator = on
        KitButton.setTitle(on ? Words.Sheet.tryingAgain : Words.Sheet.tryAgain, of: again, variant: .outline, height: .sm)
        again.isEnabled = !on
    }
}
