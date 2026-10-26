import CawCoCore
import CawCoDesign
import CawCoTranscript
import OSLog
import UIKit

// The preview's pins (Projects spec §5.7, §5.10; tsk-3; DESIGN.md
// "Artifact panel, canvas and ink"): the page's overlay draws each pin on
// the page itself; the app draws their list (the Comments panel, floating
// over the page from the head's Comments) and the open pin's card over the page, as the web's PinList.svelte
// and PinCard.svelte do beside the dashboard's pane.

/// tsk-3's numbered pin as the app draws it (PinDisc.svelte): a 20pt disc
/// in `action-solid`, its number in `on-action` in the label role; at 40%
/// once resolved; recessed once its element is gone.
final class PinDisc: UIView {
    private let number = KitLabel(TypeScale.typeLabel, ink: Palette.onAction)

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Size.cPin / 2
        number.tabular = true
        number.textAlignment = .center
        number.translatesAutoresizingMaskIntoConstraints = false
        addSubview(number)
        isAccessibilityElement = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: Size.cPin),
            heightAnchor.constraint(equalToConstant: Size.cPin),
            number.centerXAnchor.constraint(equalTo: centerXAnchor),
            number.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        setContentHuggingPriority(.required, for: .horizontal)
        setContentCompressionResistancePriority(.required, for: .horizontal)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("PinDisc is built in code") }

    func show(_ pin: Pin) {
        number.text = "\(pin.label)"
        backgroundColor = pin.moved ? Palette.surfaceFill : Palette.actionSolid
        number.ink = pin.moved ? Palette.inkMuted : Palette.onAction
        alpha = pin.resolved ? 0.4 : 1
    }
}

/// Two lines at a row's or a card's start: what the pin stands on in the
/// label role, and under it a meta line (its thread's last line, its file:line in mono).
private func pinWords(_ name: KitLabel, _ under: KitLabel) -> UIStackView {
    for line in [name, under] {
        line.lineBreakMode = .byTruncatingTail
        line.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    }
    let words = UIStackView(arrangedSubviews: [name, under])
    words.axis = .vertical
    return words
}

/// The activity dot's Working form (DESIGN.md "Activity dot"; PinList.svelte
/// `.live`): 8pt, `status-live-glyph`, pulsing on the one loop, on a pin the
/// agent is working on.
private func liveDot() -> Dot {
    let dot = Dot(8, color: Palette.statusLiveGlyph)
    dot.working()
    dot.isAccessibilityElement = true
    dot.accessibilityLabel = "The agent is working on it"
    dot.accessibilityTraits = .image
    return dot
}

// MARK: The list

/// The Comments panel's content, floating over the page from the head's
/// Comments (PinList.svelte): its head (Comments, Close), Open and Resolved
/// as a segmented filter over 44pt rows, each the pin's disc, what it stands
/// on and its thread's last line. A pin whose element is gone stays under its
/// own tab, its disc recessed and Place again in its row, which pins it anew
/// with the next tap on the page, so each tab counts every pin the hub holds
/// in it, the count drawn only above 0 (The Earned Count Rule). Until the
/// pins are read nothing is counted or claimed empty (The Claim Of Nothing
/// Rule): its plain surface inside `durWaitGrace` (The Real Wait Rule), then
/// skeleton rows at the rows' size, which the first read replaces in one
/// cross-fade; or the read's fault on the rows' line, with Try again.
final class PinListController: UIViewController {
    /// Whether the pins are read yet (PinList.svelte's `hold`).
    enum Hold: Equatable {
        /// Read under way, inside the wait's grace: nothing drawn.
        case quiet
        /// Read under way past the grace: skeleton rows.
        case reading
        case ready
        /// The read failed, and why, as its own sentence.
        case failed(String)
    }

    var onOpen: (String) -> Void = { _ in }
    var onPlace: (String) -> Void = { _ in }
    /// Try again after the pins couldn't be read.
    var onRetry: () -> Void = {}
    /// Whether the pins are read yet; the first read crosses in over the skeleton.
    var hold: Hold = .quiet {
        didSet {
            guard hold != oldValue, isViewLoaded else { return }
            // One cross-fade, opacity only, so it stands under Reduce Motion too.
            if oldValue == .reading, hold == .ready {
                UIView.transition(with: scroll, duration: Motion.durControl, options: [.transitionCrossDissolve, .allowUserInteraction]) {
                    self.render()
                }
            } else {
                render()
            }
        }
    }
    /// Its head's Close.
    var onClose: () -> Void = {}
    /// Floating on its own (the kit's popover), it names itself beside Close; set before it loads.
    var heading = false
    private(set) var pins: [Pin] = []
    /// The moved pin a tap on the page is placing again.
    var placing: String?
    /// Floating (the kit's popover), the most height it may take: it fits its
    /// content again whenever that changes (the read landing over the
    /// skeleton, a pin added), up to this, past which its rows scroll.
    var fitsWithin: Double?

    private let filter = KitSegmented(["Open", "Resolved"], selected: 0)
    /// What the filter's list says when it holds no pin (PinList.svelte `.empty`).
    private let empty = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    /// The head's Close, while it has a head.
    private var closeControl: UIView?
    private let scroll = UIScrollView()
    private let rows = UIStackView()
    /// Skeleton rows at the rows' size while the pins are read past the grace.
    private let loading = UIStackView()
    /// The read's fault, on the rows' line.
    private let fault = UIStackView()
    private var resolvedShown: Bool { filter.selectedIndex == 1 }
    var scroller: UIScrollView { scroll }

    override func viewDidLoad() {
        super.viewDidLoad()
        filter.accessibilityLabel = "Which pins"
        filter.addAction(UIAction { [weak self] _ in self?.render() }, for: .valueChanged)
        rows.axis = .vertical
        loading.axis = .vertical
        for _ in 0 ..< 3 { loading.addArrangedSubview(SkeletonPinRow()) }
        loading.isAccessibilityElement = true
        loading.accessibilityLabel = Words.Artifacts.readingComments
        loading.accessibilityTraits = .updatesFrequently
        fault.axis = .vertical
        fault.isLayoutMarginsRelativeArrangement = true
        fault.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space2, bottom: Space.space2, trailing: Space.space2)
        let filterRow = UIStackView(arrangedSubviews: [filter, UIView()])
        filterRow.isLayoutMarginsRelativeArrangement = true
        filterRow.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space1, leading: 0, bottom: Space.space1, trailing: 0)
        let emptyRow = UIStackView(arrangedSubviews: [empty])
        emptyRow.isLayoutMarginsRelativeArrangement = true
        emptyRow.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space3, leading: Space.space2, bottom: Space.space3, trailing: Space.space2)
        var parts: [UIView] = [filterRow, loading, fault, rows, emptyRow]
        if heading {
            let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
            title.text = "Comments"
            title.accessibilityTraits = .header
            let close = KitButton.make("", glyph: .close, variant: .ghost, height: .sm) { [weak self] in self?.onClose() }
            close.accessibilityLabel = "Close comments"
            closeControl = close
            let head = UIStackView(arrangedSubviews: [title, UIView(), close])
            head.alignment = .center
            head.isLayoutMarginsRelativeArrangement = true
            head.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: Space.space2, bottom: 0, trailing: 0)
            parts.insert(head, at: 0)
        }
        let column = UIStackView(arrangedSubviews: parts)
        column.axis = .vertical
        column.spacing = Space.space1
        column.translatesAutoresizingMaskIntoConstraints = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = false
        scroll.addSubview(column)
        view.addSubview(scroll)
        // As tall as its rows, up to what the sheet allows; past that it scrolls.
        let fits = scroll.heightAnchor.constraint(equalTo: scroll.contentLayoutGuide.heightAnchor)
        fits.priority = .defaultLow
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.topAnchor, constant: Space.space2),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            fits,
            column.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            column.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            column.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            column.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            column.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
        ])
        render()
    }

    /// The pins as the hub has them now, and those the agent is working on;
    /// the list keeps its filter.
    func show(_ pins: [Pin], live: Set<String>) {
        self.pins = pins
        self.live = live
        guard isViewLoaded else { return }
        render()
    }

    private var live: Set<String> = []

    #if DEBUG
    /// The sheet is in its window and laid out: where its rows stand now.
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        probeLine()
    }

    /// The counts, the filter and each row's number and centre, with the live
    /// ones; only once in a window, where a centre is a place a touch lands.
    private func probeLine() {
        guard view.window != nil else { return }
        view.layoutIfNeeded()
        let shown = rows.arrangedSubviews.compactMap { $0 as? PinRow }
        let away = rows.arrangedSubviews.compactMap { $0 as? MovedRow }.map { "\($0.number)" }.joined(separator: ";")
        // Where a tap puts the panel away: its head's Close.
        let scrim = closeControl.map(PreviewProbe.centre) ?? "none"
        PreviewProbe.say("preview list open=\(pins.count { !$0.resolved }) resolved=\(pins.count(where: \.resolved)) moved=\(pins.count(where: \.moved)) filter=\(resolvedShown ? "resolved" : "open")@\(PreviewProbe.centre(filter)) rows=\(shown.map { "\($0.number)@\(PreviewProbe.centre($0))" }.joined(separator: ";")) live=\(shown.filter(\.live).map { "\($0.number)" }.joined(separator: ";")) scrim=\(scrim) movedRows=\(away) hold=\(holdName)")
    }

    /// The hold's name, for the probe's line.
    private var holdName: String {
        switch hold {
        case .quiet: "quiet"
        case .reading: "reading"
        case .ready: "ready"
        case .failed: "failed"
        }
    }
    #endif

    /// Its height fitted to what it holds now, at the width it was given, up to `fitsWithin`.
    func fit() {
        guard let limit = fitsWithin, preferredContentSize.width > 0 else { return }
        let width = preferredContentSize.width
        let fits = Double(view.systemLayoutSizeFitting(CGSize(width: width, height: 0),
                                                       withHorizontalFittingPriority: .required,
                                                       verticalFittingPriority: .fittingSizeLevel).height)
        let size = CGSize(width: width, height: Swift.min(fits, limit))
        if preferredContentSize != size { preferredContentSize = size }
    }

    /// The filter a focused pin stands in (PinList.svelte: J and K never land on a hidden row).
    func reveal(_ id: String) {
        guard let pin = pins.first(where: { $0.id == id }) else { return }
        filter.select(pin.resolved ? 1 : 0)
        render()
    }

    private func render() {
        let open = pins.filter { !$0.resolved }
        let resolved = pins.filter(\.resolved)
        let ready = hold == .ready
        // Each count only once read, and only above 0 (The Earned Count Rule).
        filter.setTitle(ready && !open.isEmpty ? "Open \(open.count)" : "Open", at: 0)
        filter.setTitle(ready && !resolved.isEmpty ? "Resolved \(resolved.count)" : "Resolved", at: 1)
        for row in rows.arrangedSubviews + fault.arrangedSubviews { row.removeFromSuperview() }
        loading.isHidden = hold != .reading
        if case let .failed(why) = hold {
            fault.addArrangedSubview(RowFault(Words.Artifacts.commentsNotRead(why: why)) { [weak self] in self?.onRetry() })
        }
        fault.isHidden = fault.arrangedSubviews.isEmpty
        let shown = resolvedShown ? resolved : open
        empty.text = resolvedShown
            ? "No resolved comments. A pin you resolve leaves the page and waits here."
            : "No open comments. Choose Comment, then tap the page to pin one."
        // Nothing is claimed empty before the pins are read (The Claim Of Nothing Rule).
        empty.superview?.isHidden = !(ready && shown.isEmpty)
        for pin in ready ? shown : [] {
            if pin.moved {
                rows.addArrangedSubview(MovedRow(pin, placing: placing == pin.id) { [weak self] in self?.onPlace(pin.id) })
            } else {
                let row = PinRow(pin, live: live.contains(pin.id))
                row.addAction(UIAction { [weak self] _ in self?.onOpen(pin.id) }, for: .touchUpInside)
                rows.addArrangedSubview(row)
            }
        }
        fit()
        #if DEBUG
        probeLine()
        #endif
    }
}

/// A pin's row (PinList.svelte `.pin-row`): 44pt, `space-2` in, its disc,
/// what it stands on in the label role and its thread's last line in meta,
/// and the live dot after them while the agent works on it; the press tints it.
private final class PinRow: UIControl {
    let number: Int
    let live: Bool

    init(_ pin: Pin, live: Bool) {
        number = pin.label
        self.live = live
        super.init(frame: .zero)
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        let disc = PinDisc()
        disc.show(pin)
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = pin.name
        let last = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        last.text = pin.lastLine
        var parts: [UIView] = [disc, pinWords(name, last)]
        if live { parts.append(liveDot()) }
        let row = UIStackView(arrangedSubviews: parts)
        row.spacing = Space.space2
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cArtifactRowH),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space2),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space2),
            row.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: Space.space1),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        isAccessibilityElement = true
        accessibilityLabel = "Pin \(pin.label), \(pin.name)\(pin.resolved ? ", resolved" : "")\(live ? ", the agent is working on it" : ""). \(pin.lastLine)"
        accessibilityTraits = .button
        addInteraction(UIPointerInteraction(delegate: nil))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("PinRow is built in code") }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted ? Palette.surfaceFill : .clear }
    }
}

/// A pin whose element is gone, under its own tab (PinList.svelte
/// `.moved-row`): its recessed disc, what it stood on, that its element is
/// gone, and Place again (`sm` outline).
private final class MovedRow: UIView {
    let number: Int

    init(_ pin: Pin, placing: Bool, place: @escaping () -> Void) {
        number = pin.label
        super.init(frame: .zero)
        let disc = PinDisc()
        disc.show(pin)
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = pin.name
        let gone = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        gone.text = Words.Artifacts.pinElementGone
        let again = KitButton.make("Place again", variant: .outline, height: .sm, action: place)
        again.isSelected = placing
        again.accessibilityTraits.insert(placing ? .selected : [])
        let row = UIStackView(arrangedSubviews: [disc, pinWords(name, gone), again])
        row.spacing = Space.space2
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cArtifactRowH),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space2),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space2),
            row.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: Space.space1),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        again.setContentCompressionResistancePriority(.required, for: .horizontal)
        again.setContentHuggingPriority(.required, for: .horizontal)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("MovedRow is built in code") }
}

/// A pin row's skeleton (PinList.svelte `.skeleton-row`), at its size: the
/// disc, the name's line in the label role's height and the last line's in
/// meta's.
private final class SkeletonPinRow: UIView {
    init() {
        super.init(frame: .zero)
        let disc = SkeletonView(height: Size.cPin)
        disc.layer.cornerRadius = Size.cPin / 2
        disc.widthAnchor.constraint(equalToConstant: Size.cPin).isActive = true
        let name = SkeletonView(height: TypeScale.typeLabel.points)
        name.layer.cornerRadius = Radius.radiusXs
        let last = SkeletonView(height: TypeScale.typeMeta.points)
        last.layer.cornerRadius = Radius.radiusXs
        let lines = UIStackView(arrangedSubviews: [name, last])
        lines.axis = .vertical
        lines.alignment = .leading
        lines.spacing = Space.space1
        name.widthAnchor.constraint(equalTo: lines.widthAnchor, multiplier: 0.6).isActive = true
        last.widthAnchor.constraint(equalTo: lines.widthAnchor, multiplier: 0.85).isActive = true
        let row = UIStackView(arrangedSubviews: [disc, lines])
        row.spacing = Space.space2
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cArtifactRowH),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space2),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space2),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        isAccessibilityElement = false
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("SkeletonPinRow is built in code") }
}

// MARK: The card

/// The open pin's card (PinCard.svelte), over the page beside its pin: the
/// raised card recipe (12pt radius, control edge, hairline shadow, 11pt
/// in); on a phone standing at the well's foot in the house drawer's shape.
/// What the pin stands on, in words (`Pin.name`), its file:line in mono
/// under it, cut from its start, and its selector only in the tooltip; no
/// picture: the pin it would show stands beside the card. Its thread in the
/// transcript's two voices (ThreadTurnsView: the person's words in the
/// reader's well, the agent's bare under its mark and the session's name);
/// the 16pt reply field and
/// Reply. Its head carries what acts on the pin, as the web's does: Resolve
/// or Reopen, ⋯ (Copy link, Delete pin) and Close; a resolved pin's field
/// reopens it with its reply. Delete is
/// asked in the card itself before it runs (AskHere under the footer, The
/// Open Page Rule). What goes wrong is said under the field, a refused
/// delete under its question. A tap anywhere outside it closes it, as Esc
/// and its Close do (PreviewController's outside tap, PinCard.svelte's
/// outside press); what the field holds is the pin's draft, which the
/// controller keeps with the pin. A column, as the web's: the head over it,
/// the field and its actions at its foot, always in view, and between them
/// the thread, the only part that scrolls, under the house
/// edge fade.
final class PinCard: UIView, UITextViewDelegate {
    var onClose: () -> Void = {}
    /// The person typed: the pin's unsaid words as they stand.
    var onDraft: (String) -> Void = { _ in }
    var onReply: (String) -> Void = { _ in }
    var onResolve: (Bool) -> Void = { _ in }
    /// Deletes the pin once the person confirmed; throws the refusal's sentence.
    var onDelete: () async throws -> Void = {}
    /// The reply field took the keyboard, or gave it back.
    var onWriting: (Bool) -> Void = { _ in }
    /// The pin's own address, which ⋯'s Copy link copies; nil while the hub's address is unknown.
    var link: URL?
    private var actions: UIStackView!

    private(set) var pinId: String?
    private(set) var number = 0
    private let scroll = Resizing()
    private let column = UIStackView()
    private let disc = PinDisc()
    /// The live dot (PinCard.svelte `.live`), while the agent works on the pin.
    private let liveMark = liveDot()
    private let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let source = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkMuted)
    /// The head's words carry the pin's selector, and only there (PinCard.svelte `.anchor`'s `title`).
    private let selectorTip = UIToolTipInteraction()
    private let thread = ThreadTurnsView()
    /// The thread, the one part of the card that scrolls
    /// (PinCard.svelte `.room`): past the card's cap it gives up height,
    /// never the head over it or the field and actions under it.
    private let room = UIScrollView()
    private let roomColumn = UIStackView()
    /// The house edge fade on the room where more is above or below (`kit-edge-fade-block`).
    private var roomFade: EdgeFade?
    /// The column fits the card, so the room gives up height; off while the
    /// head and foot alone outgrow the card (`fitRoom`).
    private var columnFits: NSLayoutConstraint!
    /// The thread is read at its end: a new entry keeps it there.
    private var roomAtEnd = true
    private let field = PinField()
    private let problem = KitLabel(TypeScale.typeMeta, ink: Palette.dataBad, lines: 0)
    private var resolveButton: UIButton!
    private var replyButton: UIButton!
    private var closeButton: UIButton!
    /// ⋯: Copy link and Delete pin.
    private var moreButton: UIButton!
    /// The card's one question: Delete, asked under its footer.
    private let asks = AskHere()
    private var resolved = false
    /// The pin stands on ink: its delete takes that ink with it.
    private var inked = false
    private var shownThread: [PinEntry] = []
    private var shownAgent = ""
    /// As a phone's drawer: flush with the well's sides and foot, rounded on top.
    var drawer = false { didSet { paint() } }

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        boxShadow = Shadow.shadowHairline
        accessibilityViewIsModal = false
        shouldGroupAccessibilityChildren = true

        // Close stands at the card's corner whatever is scrolled under it (the
        // dialog recipe's close: a ghost icon button by the corner), on the
        // card's own surface; the head keeps its room.
        closeButton = KitButton.make("", glyph: .close, variant: .ghost, height: .sm) { [weak self] in self?.onClose() }
        closeButton.accessibilityLabel = "Close"
        closeButton.backgroundColor = Palette.surfaceRaised
        closeButton.layer.cornerRadius = Radius.radiusMd
        closeButton.layer.cornerCurve = .continuous
        let closeRoom = UIView()
        closeRoom.translatesAutoresizingMaskIntoConstraints = false
        closeRoom.widthAnchor.constraint(equalToConstant: Size.cBtnHSm).isActive = true
        closeRoom.heightAnchor.constraint(equalToConstant: Size.cBtnHSm).isActive = true
        liveMark.isHidden = true
        resolveButton = KitButton.make("", glyph: .passed, variant: .ghost, height: .sm) { [weak self] in
            guard let self else { return }
            onResolve(!resolved)
        }
        resolveButton.accessibilityLabel = "Resolve pin"
        moreButton = KitButton.make("", glyph: .more, variant: .ghost, height: .sm) {}
        moreButton.showsMenuAsPrimaryAction = true
        moreButton.menu = UIMenu(children: [UIDeferredMenuElement.uncached { [weak self] done in done(self?.moreMenu() ?? []) }])
        // While Delete's question stands, ⋯ wears `surface-hover`, as the web's `aria-expanded` ghost does.
        let restingMore = moreButton.configurationUpdateHandler
        moreButton.configurationUpdateHandler = { button in
            restingMore?(button)
            if button.isSelected { button.configuration?.background.backgroundColor = Palette.surfaceHover }
        }
        let words = pinWords(name, source)
        // Cut from its start, so the file's name and line stay.
        source.lineBreakMode = .byTruncatingHead
        words.addInteraction(selectorTip)
        let head = UIStackView(arrangedSubviews: [disc, words, liveMark, resolveButton, moreButton, closeRoom])
        head.spacing = Space.space2
        head.alignment = .center
        for button in [resolveButton!, moreButton!] {
            button.setContentHuggingPriority(.required, for: .horizontal)
            button.setContentCompressionResistancePriority(.required, for: .horizontal)
        }

        roomColumn.addArrangedSubview(thread)
        roomColumn.axis = .vertical
        roomColumn.translatesAutoresizingMaskIntoConstraints = false
        room.translatesAutoresizingMaskIntoConstraints = false
        room.alwaysBounceVertical = false
        room.keyboardDismissMode = .interactive
        room.addSubview(roomColumn)

        field.delegate = self
        problem.isHidden = true
        problem.accessibilityTraits = .staticText

        replyButton = KitButton.make("Reply", variant: .action, height: .sm) { [weak self] in self?.reply() }
        replyButton.isEnabled = false
        asks.onResize = { [weak self] in self?.askMoved() }
        actions = UIStackView(arrangedSubviews: [UIView(), replyButton])
        actions.spacing = Space.space2
        actions.alignment = .center

        for part in [head, room, field, problem, actions, asks] as [UIView] { column.addArrangedSubview(part) }
        column.axis = .vertical
        column.spacing = Space.space2
        column.translatesAutoresizingMaskIntoConstraints = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.resized = { [weak self] in
            self?.fitRoom()
            self?.keepWritingInView()
            self?.keepAskInView()
        }
        room.delegate = self
        // A drag of what the card holds puts the keyboard away with it, as iOS's lists do.
        scroll.keyboardDismissMode = .interactive
        scroll.addSubview(column)
        addSubview(scroll)
        addSubview(closeButton)
        // As tall as what it holds, up to what its place allows. Past that
        // the room gives up height first: it wants all of its thread (just
        // under every label's and button's compression resistance),
        // the column wants to fit the card (just under required), so the
        // thread shrinks and the head, field and actions stay whole. Only
        // when those alone outgrow the card (a keyboard over a short well)
        // does the card itself scroll, keeping the field and its actions in
        // view while the person writes.
        let fits = scroll.heightAnchor.constraint(equalTo: scroll.contentLayoutGuide.heightAnchor)
        fits.priority = .defaultLow
        let pad = 11.0
        // Under every label's and button's compression resistance (750): the room is what gives.
        let roomWhole = room.heightAnchor.constraint(equalTo: room.contentLayoutGuide.heightAnchor)
        roomWhole.priority = .defaultHigh - 1
        columnFits = column.heightAnchor.constraint(lessThanOrEqualTo: scroll.frameLayoutGuide.heightAnchor, constant: -pad * 2)
        columnFits.priority = .required - 1
        NSLayoutConstraint.activate([
            roomColumn.topAnchor.constraint(equalTo: room.contentLayoutGuide.topAnchor),
            roomColumn.bottomAnchor.constraint(equalTo: room.contentLayoutGuide.bottomAnchor),
            roomColumn.leadingAnchor.constraint(equalTo: room.contentLayoutGuide.leadingAnchor),
            roomColumn.trailingAnchor.constraint(equalTo: room.contentLayoutGuide.trailingAnchor),
            roomColumn.widthAnchor.constraint(equalTo: room.frameLayoutGuide.widthAnchor),
            roomWhole,
            columnFits,
            scroll.topAnchor.constraint(equalTo: topAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            fits,
            column.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: pad),
            column.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -pad),
            column.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: pad),
            column.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -pad),
            // Where the head's room for it stands while the card rests at its top.
            closeButton.topAnchor.constraint(equalTo: topAnchor, constant: pad),
            closeButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -pad),
        ])
        roomFade = EdgeFade(room)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (card: PinCard, _: UITraitCollection) in card.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("PinCard is built in code") }

    /// The card's pin as the hub has it now, and what went wrong with the
    /// last reply, resolve or send. The agent answers in its thread as
    /// `agentName`: the session the artifact belongs to. The reply being
    /// written stays as it is; another pin's card starts from that pin's own
    /// `draft`.
    func show(_ pin: Pin, agentName: String, live: Bool, problem said: String?, replying: Bool, draft: String) {
        liveMark.isHidden = !live
        let fresh = pin.id != pinId
        // Another pin in the same card: a question asked of the last one goes.
        if fresh { asks.dismiss() }
        pinId = pin.id
        number = pin.label
        resolved = pin.resolved
        inked = pin.ink != nil
        disc.show(pin)
        name.text = pin.name
        source.text = pin.source
        source.isHidden = pin.source == nil
        selectorTip.defaultToolTip = pin.selector
        accessibilityLabel = "Pin \(pin.label)"
        let threadChanged = fresh || pin.thread != shownThread
        if threadChanged || agentName != shownAgent {
            shownThread = pin.thread
            shownAgent = agentName
            thread.show(pin.thread, agentName: agentName)
        }
        room.isHidden = pin.thread.isEmpty
        // The thread opens at its newest entry, beside the field that answers
        // it, and follows a new one while the person reads at its end
        // (PinCard.svelte); reading further back, they are left where they are.
        if threadChanged, !pin.thread.isEmpty, fresh || roomAtEnd {
            Task { @MainActor [weak self] in self?.roomToEnd() }
        }
        if fresh { field.text = draft }
        field.placeholder = pin.resolved ? "Reply to reopen" : pin.thread.isEmpty ? "Say what to change here" : "Reply"
        field.accessibilityLabel = pin.thread.isEmpty ? "Comment" : "Reply"
        problem.text = said
        problem.isHidden = said == nil
        resolveButton.accessibilityLabel = pin.resolved ? "Reopen pin" : "Resolve pin"
        resolveButton.toolTip = resolveButton.accessibilityLabel
        resolveButton.configuration?.image = (pin.resolved ? Glyph.reopen : Glyph.passed).image.resized(to: Size.iconMd)
        replyButton.configuration?.showsActivityIndicator = replying
        paintReply()
        // A new pin's card takes the keyboard: the person tapped to say something.
        if fresh, pin.thread.isEmpty { field.becomeFirstResponder() }
    }

    /// The room scrolled to its end, once the card has laid out where it stands.
    private func roomToEnd() {
        superview?.layoutIfNeeded()
        layoutIfNeeded()
        room.contentOffset.y = max(0, room.contentSize.height - room.bounds.height)
        roomAtEnd = true
        #if DEBUG
        // Where the room stands once it has reached its end: the card's
        // geometry line is said before this deferred scroll, so it reads the
        // room where it stood a moment before.
        PreviewProbe.say("preview card-room pin=\(number) room=\(Int(room.contentSize.height))/\(Int(room.bounds.height))@\(Int(room.contentOffset.y))")
        #endif
    }

    /// Where the person reads the room: at its end, a new entry keeps it there.
    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        guard scrollView === room else { return }
        roomAtEnd = room.contentOffset.y >= room.contentSize.height - room.bounds.height - 1
    }

    /// When the head and the foot alone outgrow the card (a keyboard over a
    /// short well), the room keeps its whole thread inside the card's own
    /// scroll, the field kept in view while writing (`keepWritingInView`):
    /// the thread stays readable above the field instead of shrinking to
    /// nothing. Otherwise the column fits the card and the room gives.
    private func fitRoom() {
        let width = column.bounds.width
        guard width > 0 else { return }
        let shown = column.arrangedSubviews.filter { !$0.isHidden }
        let fixed = shown.filter { $0 !== room }.reduce(0.0) { sum, part in
            sum + part.systemLayoutSizeFitting(CGSize(width: width, height: 0),
                                               withHorizontalFittingPriority: .required,
                                               verticalFittingPriority: .fittingSizeLevel).height
        }
        let gaps = column.spacing * Double(max(0, shown.count - 1))
        // The column's 11pt in, top and foot.
        let squeezed = fixed + gaps + 22 > scroll.bounds.height + 1
        if columnFits.isActive == squeezed { columnFits.isActive = !squeezed }
    }

    /// Said under the field, in the error formula (PinCard.svelte `.error`).
    func say(_ said: String?) {
        problem.text = said
        problem.isHidden = said == nil
    }

    /// What a delete takes with it, named before it runs (PinCard.svelte
    /// `deleteBody`; WORDS.md, destructive confirm).
    private var deleteBody: String {
        let parts = [shownThread.isEmpty ? nil : "its thread", inked ? "the ink it stands on" : nil].compactMap(\.self)
        let taking = parts.isEmpty ? "It goes from the page. " : "It goes from the page with \(parts.joined(separator: " and ")). "
        return taking + "The other pins keep their numbers. This can't be undone."
    }

    /// Delete, asked under the footer. Cancel takes the focus, so the
    /// keyboard gives the card back to the question.
    private func askDelete() {
        field.resignFirstResponder()
        asks.ask(AskHere.Request(title: "Delete pin \(number)?", body: [deleteBody], confirmLabel: "Delete pin",
                                 pendingLabel: "Deleting…", destructive: true) { [weak self] in
                try await self?.onDelete()
            })
        #if DEBUG
        PreviewProbe.say(probeLine())
        PreviewProbe.say(askLine())
        #endif
    }

    /// Esc: a question standing goes first. False when there was none to put away.
    func escape() -> Bool { asks.escape() }

    /// The card closed: its question goes with it, as the web's card unmounts with its own.
    func closed() { asks.dismiss() }

    /// ⋯'s menu: Copy link (while the pin has an address) and Delete pin, asked in the card.
    private func moreMenu() -> [UIMenuElement] {
        var items: [UIMenuElement] = []
        if let link {
            items.append(UIAction(title: "Copy link", image: Glyph.link.image) { [weak self] _ in
                UIPasteboard.general.url = link
                Toast.success("Link copied", in: self)
            })
        }
        items.append(UIAction(title: "Delete pin", image: Glyph.trash.image, attributes: .destructive) { [weak self] _ in
            self?.askDelete()
        })
        return items
    }

    /// The question unfolded, folded or said a refusal: ⋯ says whether it
    /// stands, the card takes its new height, and the question is in view.
    private func askMoved() {
        moreButton.isSelected = asks.asked != nil
        moreButton.accessibilityValue = asks.asked != nil ? "Asking" : nil
        window?.layoutIfNeeded()
        keepAskInView()
        #if DEBUG
        PreviewProbe.say(askLine())
        #endif
    }

    /// The question in view, at the card's foot (AskHere.svelte `scrollIntoView({ block: "nearest" })`),
    /// unless the person is writing.
    private func keepAskInView() {
        guard asks.asked != nil, !field.isFirstResponder else { return }
        let box = laidOut(asks)
        let room = scroll.bounds.height
        let most = max(0, scroll.contentSize.height - room)
        let offset = scroll.contentOffset.y
        let wanted = box.maxY + 11 > offset + room ? min(most, box.maxY + 11 - room) : offset
        if abs(wanted - offset) > 0.5 { scroll.contentOffset.y = wanted }
    }

    /// The reply went in: the field empties.
    func replied() {
        field.text = ""
        paintReply()
    }

    private func reply() {
        let text = field.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        onReply(text)
    }

    func textViewDidChange(_: UITextView) {
        paintReply()
        onDraft(field.text)
    }

    func textViewDidBeginEditing(_: UITextView) {
        onWriting(true)
        setNeedsLayout()
    }

    func textViewDidEndEditing(_: UITextView) { onWriting(false) }

    /// The card's scroll, which says when its size or its content's size
    /// changes (a keyboard, a new entry), never when it is only scrolled.
    private final class Resizing: UIScrollView {
        var resized: () -> Void = {}
        private var sizes: (CGSize, CGSize) = (.zero, .zero)

        override func layoutSubviews() {
            super.layoutSubviews()
            guard sizes != (bounds.size, contentSize) else { return }
            sizes = (bounds.size, contentSize)
            resized()
        }
    }

    /// Where `part` (one of the column's own) stands in the scroll's content
    /// as laid out now. A resize is heard inside the scroll's own layout pass,
    /// before the column has given its parts their new frames (an entry
    /// arriving above the field while the keyboard shrinks the card), and the
    /// scroll can't be laid out again from within that pass: so the column
    /// is laid out first, and its parts are read where they now stand.
    private func laidOut(_ parts: UIView...) -> CGRect {
        column.layoutIfNeeded()
        return parts.reduce(CGRect.null) { $0.union(column.convert($1.frame, to: scroll)) }
    }

    /// While the person writes, the field and what sends it stay in view
    /// however small the keyboard leaves the card (a phone's drawer with the
    /// keyboard up has room for little more than them): brought in, their
    /// foot on the card's padding, whenever the card or what it holds
    /// changes size; a scroll of the person's own is left alone.
    private func keepWritingInView() {
        guard field.isFirstResponder else { return }
        let writing = laidOut(field, actions)
        let room = scroll.bounds.height
        let most = max(0, scroll.contentSize.height - room)
        let offset = scroll.contentOffset.y
        let wanted: Double = if writing.maxY + 11 > offset + room {
            min(most, writing.maxY + 11 - room)
        } else if writing.minY - Space.space2 < offset {
            max(0, writing.minY - Space.space2)
        } else {
            offset
        }
        if abs(wanted - offset) > 0.5 { scroll.contentOffset.y = wanted }
    }

    private func paintReply() {
        replyButton.isEnabled = !field.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && replyButton.configuration?.showsActivityIndicator != true
    }

    private func paint() {
        layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
        layer.borderWidth = 1
        layer.maskedCorners = drawer ? [.layerMinXMinYCorner, .layerMaxXMinYCorner]
            : [.layerMinXMinYCorner, .layerMaxXMinYCorner, .layerMinXMaxYCorner, .layerMaxXMaxYCorner]
    }

    #if DEBUG
    /// Where the probe taps: the field, Reply, Resolve or Reopen (its word), Close, ⋯ (`delete`, its menu's Delete pin).
    /// Its scroll's offset and content height, and whether the field has the keyboard.
    var probeScroll: String {
        "offset=\(Int(scroll.contentOffset.y)) content=\(Int(scroll.contentSize.height)) height=\(Int(scroll.bounds.height)) writing=\(field.isFirstResponder) room=\(Int(room.contentSize.height))/\(Int(room.bounds.height))@\(Int(room.contentOffset.y))"
    }

    func probeLine() -> String {
        // The head's Resolve is a glyph: its word is what it does.
        let words = resolved ? "Reopen" : "Resolve"
        return "preview card pin=\(number) field=\(PreviewProbe.centre(field)) reply=\(PreviewProbe.centre(replyButton)) resolve=\(words)@\(PreviewProbe.centre(resolveButton)) close=\(PreviewProbe.centre(closeButton)) live=\(liveMark.isHidden ? "no" : "yes") thread=\(shownThread.count) delete=\(PreviewProbe.centre(moreButton)) writing=\(field.isFirstResponder) asking=\(asks.asked != nil) problem=\(problem.isHidden ? "none" : problem.text ?? "")"
    }

    /// The head's Resolve and ⋯ and the footer's Reply as frames in the window's points, `x,y,w,h`, to set against the keyboard's top.
    var probeFooter: String {
        [("more", moreButton!), ("resolve", resolveButton!), ("reply", replyButton!)].map { name, button in
            let box = button.convert(button.bounds, to: nil)
            return "\(name)=\(Int(box.minX)),\(Int(box.minY)),\(Int(box.width)),\(Int(box.height))"
        }.joined(separator: " ")
    }

    /// The card's question as it stands: where Cancel and the confirm are, then its words.
    func askLine() -> String {
        guard asks.asked != nil else { return "preview ask pin=\(number) none" }
        let (cancel, confirm) = asks.probeControls
        return "preview ask pin=\(number) cancel=\(PreviewProbe.centre(cancel)) confirm=\(confirm.map(PreviewProbe.centre) ?? "none") \(asks.probeWords)"
    }
    #endif
}

/// The card's reply field (ui/textarea, the kit's Input recipe on more
/// lines): the raised surface on the control edge at `--radius-md`, 16pt
/// type so iOS never zooms the page into it, two lines tall, growing to
/// five; focused, it takes the focus ring.
private final class PinField: UITextView {
    private let hint = KitLabel(TypeScale.typeBody.with(points: 16), ink: Palette.mutedForeground)
    private var tall: NSLayoutConstraint!

    var placeholder: String {
        get { hint.text ?? "" }
        set { hint.text = newValue }
    }

    override var text: String! {
        // A draft put back grows the field to it, as typing it would.
        didSet { changed() }
    }

    init() {
        super.init(frame: .zero, textContainer: nil)
        translatesAutoresizingMaskIntoConstraints = false
        let role = TypeScale.typeBody.with(points: 16)
        font = role.font
        textColor = Palette.inkStrong
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        boxShadow = Shadow.shadowXs
        textContainerInset = UIEdgeInsets(top: Space.space2, left: 12 - 5, bottom: Space.space2, right: 12 - 5)
        isScrollEnabled = true
        hint.isUserInteractionEnabled = false
        hint.translatesAutoresizingMaskIntoConstraints = false
        addSubview(hint)
        let line = role.font.lineHeight
        tall = heightAnchor.constraint(equalToConstant: line * 2 + Space.space2 * 2)
        NSLayoutConstraint.activate([
            tall,
            hint.topAnchor.constraint(equalTo: topAnchor, constant: Space.space2),
            hint.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            hint.trailingAnchor.constraint(lessThanOrEqualTo: frameLayoutGuide.trailingAnchor, constant: -12),
        ])
        NotificationCenter.default.addObserver(self, selector: #selector(changed), name: UITextView.textDidChangeNotification, object: self)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (field: PinField, _: UITraitCollection) in field.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("PinField is built in code") }

    @objc private func changed() {
        hint.isHidden = !text.isEmpty
        // UIKit may set the text while the field is still being made, before its height is.
        guard tall != nil else { return }
        let line = font?.lineHeight ?? 20
        let fits = sizeThatFits(CGSize(width: bounds.width, height: .greatestFiniteMagnitude)).height
        tall.constant = min(max(fits, line * 2 + Space.space2 * 2), line * 5 + Space.space2 * 2)
    }

    @discardableResult
    override func becomeFirstResponder() -> Bool {
        defer { paint() }
        return super.becomeFirstResponder()
    }

    @discardableResult
    override func resignFirstResponder() -> Bool {
        defer { paint() }
        return super.resignFirstResponder()
    }

    private func paint() {
        layer.borderColor = (isFirstResponder ? Palette.focusRing : Palette.borderControl).resolvedColor(with: traitCollection).cgColor
        layer.borderWidth = isFirstResponder ? Size.focusRingWidth : 1
    }
}

#if DEBUG
/// `-preview-probe`: the preview's
/// state as `Probe` lines, each control as its centre in the window's
/// points, where a simulator touch lands.
enum PreviewProbe {
    static let on = ProcessInfo.processInfo.arguments.contains("-preview-probe")
    /// `-preview-working`: the session counts as mid-turn, for the live dot (the probe's mock session ends its turns at once).
    static let workingAtLaunch = ProcessInfo.processInfo.arguments.contains("-preview-working")
    /// `-inspect-set <prop>=<value>`: once a sheet's page says its sheet, the
    /// inspector opens, the chosen story's `prop` takes the option `value`,
    /// and Save runs, as the person's taps would (scripts/probe-kit/specs/ios-sheet-inspector.ts).
    static let inspectSet: (prop: String, value: String)? = {
        let arguments = ProcessInfo.processInfo.arguments
        guard let flag = arguments.firstIndex(of: "-inspect-set"), arguments.indices.contains(flag + 1) else { return nil }
        let pair = arguments[flag + 1].split(separator: "=", maxSplits: 1).map(String.init)
        return pair.count == 2 ? (pair[0], pair[1]) : nil
    }()
    /// `-open-plan`: the session's plan opens in its sheet the first time its ring shows (scripts/probe-kit/specs/ios-plan.ts).
    static let openPlanAtLaunch = ProcessInfo.processInfo.arguments.contains("-open-plan")
    /// `-side-switch`: the first time the plan and the preview stand beside the conversation together, the switch is pressed to the other.
    static let sideSwitch = ProcessInfo.processInfo.arguments.contains("-side-switch")
    /// `-thread-carry <words>`: a thread's composer takes a pasted picture and file, then sends `words` with them.
    static let threadCarry: String? = {
        let arguments = ProcessInfo.processInfo.arguments
        guard let at = arguments.firstIndex(of: "-thread-carry"), arguments.indices.contains(at + 1) else { return nil }
        return arguments[at + 1]
    }()
    /// `-place-pick <machineId> <path>`: a page's `cawco.pickPlace()` picker is given the machine, then the folder `path`, and Use this place, as the person's would.
    static let placePick: (machineId: String, path: String)? = {
        let arguments = ProcessInfo.processInfo.arguments
        guard let flag = arguments.firstIndex(of: "-place-pick"), arguments.indices.contains(flag + 2) else { return nil }
        return (arguments[flag + 1], arguments[flag + 2])
    }()
    /// `-menu-remove <name>`: once the page is ready, the title menu opens and its row `name` is removed.
    static let menuRemove: String? = {
        let arguments = ProcessInfo.processInfo.arguments
        guard let flag = arguments.firstIndex(of: "-menu-remove"), arguments.indices.contains(flag + 1) else { return nil }
        return arguments[flag + 1]
    }()

    static func say(_ line: String) {
        guard on else { return }
        Logger(subsystem: "dev.cawco.app", category: "Probe").notice("\(line, privacy: .public)")
    }

    /// Where `view` stands in the window; "none" while it or what holds it is hidden (a head control in More).
    static func centre(_ view: UIView) -> String {
        guard view.window != nil, sequence(first: view, next: \.superview).allSatisfy({ !$0.isHidden }) else { return "none" }
        let at = view.convert(CGPoint(x: view.bounds.midX, y: view.bounds.midY), to: nil)
        return "\(Int(at.x.rounded())),\(Int(at.y.rounded()))"
    }
}
#endif
