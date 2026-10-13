import CawCoCore
import CawCoDesign
import CawCoTranscript
import OSLog
import UIKit

// The preview's pins (Projects spec §5.7, §5.10; tsk-3; DESIGN.md
// "Artifact panel, canvas and ink"): the page's overlay draws each pin on
// the page itself; the app draws their list (a house sheet from the head's
// Pins) and the open pin's card over the page, as the web's PinList.svelte
// and PinCard.svelte do beside the dashboard's pane.

/// tsk-3's numbered pin as the app draws it (PinDisc.svelte): a 20pt disc
/// in `action-solid`, its number in `on-action` in the label role; at 40%
/// once resolved; recessed in the moved tray.
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
        alpha = pin.resolved && !pin.moved ? 0.4 : 1
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

// MARK: The list

/// The pins' list, the content of the house sheet the head's Pins opens
/// (PinList.svelte): Open and Resolved as a segmented filter over 44pt rows,
/// each the pin's disc, what it stands on and its thread's last line; the
/// pins whose element is gone wait in the moved tray at the end, each with
/// Place again, which pins it anew with the next tap on the page.
final class PinListController: UIViewController {
    var onOpen: (String) -> Void = { _ in }
    var onPlace: (String) -> Void = { _ in }
    private(set) var pins: [Pin] = []
    /// The moved pin a tap on the page is placing again.
    var placing: String?

    private let filter = KitSegmented(["Open 0", "Resolved 0"], selected: 0)
    private let scroll = UIScrollView()
    private let rows = UIStackView()
    private let movedRows = UIStackView()
    private let moved = UIStackView()
    private var resolvedShown: Bool { filter.selectedIndex == 1 }
    var scroller: UIScrollView { scroll }

    override func viewDidLoad() {
        super.viewDidLoad()
        filter.accessibilityLabel = "Which pins"
        filter.addAction(UIAction { [weak self] _ in self?.render() }, for: .valueChanged)
        rows.axis = .vertical
        movedRows.axis = .vertical
        let head = UIStackView(arrangedSubviews: [GlyphView(.mapPoint, size: Size.iconMd, tint: Palette.inkMuted), {
            let word = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
            word.text = "Moved"
            word.accessibilityTraits = .header
            return word
        }()])
        head.spacing = Space.space1
        head.alignment = .center
        head.isLayoutMarginsRelativeArrangement = true
        head.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space1, leading: Space.space2, bottom: Space.space1, trailing: Space.space2)
        moved.axis = .vertical
        moved.addArrangedSubview(head)
        moved.addArrangedSubview(movedRows)
        let filterRow = UIStackView(arrangedSubviews: [filter, UIView()])
        filterRow.isLayoutMarginsRelativeArrangement = true
        filterRow.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space1, leading: 0, bottom: Space.space1, trailing: 0)
        let column = UIStackView(arrangedSubviews: [filterRow, rows, moved])
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

    /// The pins as the hub has them now; the list keeps its filter.
    func show(_ pins: [Pin]) {
        self.pins = pins
        guard isViewLoaded else { return }
        render()
    }

    /// The filter a focused pin stands in (PinList.svelte: J and K never land on a hidden row).
    func reveal(_ id: String) {
        guard let pin = pins.first(where: { $0.id == id }), !pin.moved else { return }
        filter.select(pin.resolved ? 1 : 0)
        render()
    }

    private func render() {
        let placed = pins.filter { !$0.moved }
        let open = placed.filter { !$0.resolved }
        let resolved = placed.filter(\.resolved)
        let away = pins.filter(\.moved)
        filter.setTitle("Open \(open.count)", at: 0)
        filter.setTitle("Resolved \(resolved.count)", at: 1)
        filter.superview?.isHidden = placed.isEmpty
        for row in rows.arrangedSubviews + movedRows.arrangedSubviews { row.removeFromSuperview() }
        for pin in resolvedShown ? resolved : open {
            let row = PinRow(pin)
            row.addAction(UIAction { [weak self] _ in self?.onOpen(pin.id) }, for: .touchUpInside)
            rows.addArrangedSubview(row)
        }
        for pin in away {
            movedRows.addArrangedSubview(MovedRow(pin, placing: placing == pin.id) { [weak self] in self?.onPlace(pin.id) })
        }
        moved.isHidden = away.isEmpty
        #if DEBUG
        view.layoutIfNeeded()
        PreviewProbe.say("preview list open=\(open.count) resolved=\(resolved.count) moved=\(away.count) filter=\(resolvedShown ? "resolved" : "open")@\(PreviewProbe.centre(filter)) rows=\(rows.arrangedSubviews.compactMap { ($0 as? PinRow).map { "\($0.number)@\(PreviewProbe.centre($0))" } }.joined(separator: ";"))")
        #endif
    }
}

/// A pin's row (PinList.svelte `.pin-row`): 44pt, `space-2` in, its disc,
/// what it stands on in the label role and its thread's last line in meta;
/// the press tints it.
private final class PinRow: UIControl {
    let number: Int

    init(_ pin: Pin) {
        number = pin.label
        super.init(frame: .zero)
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        let disc = PinDisc()
        disc.show(pin)
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = pin.name
        let last = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        last.text = pin.lastLine
        let row = UIStackView(arrangedSubviews: [disc, pinWords(name, last)])
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
        accessibilityLabel = "Pin \(pin.label), \(pin.name)\(pin.resolved ? ", resolved" : ""). \(pin.lastLine)"
        accessibilityTraits = .button
        addInteraction(UIPointerInteraction(delegate: nil))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("PinRow is built in code") }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted ? Palette.surfaceFill : .clear }
    }
}

/// A pin in the moved tray (PinList.svelte `.moved-row`): its recessed disc,
/// what it stood on, that its element is gone, and Place again (`sm` outline).
private final class MovedRow: UIView {
    init(_ pin: Pin, placing: Bool, place: @escaping () -> Void) {
        super.init(frame: .zero)
        let disc = PinDisc()
        disc.show(pin)
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = pin.name
        let gone = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        gone.text = "Its element is gone from the page"
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

// MARK: The card

/// The open pin's card (PinCard.svelte), over the page beside its pin: the
/// raised card recipe (12pt radius, control edge, hairline shadow, 11pt
/// in); on a phone standing at the well's foot in the house drawer's shape.
/// What the pin stands on (its text, its file:line in mono) with its
/// picture as a 56pt thumbnail that opens the lightbox; its thread, the
/// agent's replies as the transcript sets markdown; the 16pt reply field,
/// then Resolve or Reopen and Reply. What goes wrong is said under the field.
final class PinCard: UIView, UITextViewDelegate {
    var onClose: () -> Void = {}
    var onReply: (String) -> Void = { _ in }
    var onResolve: (Bool) -> Void = { _ in }
    var onPicture: () -> Void = {}
    /// The reply field took the keyboard, or gave it back.
    var onWriting: (Bool) -> Void = { _ in }
    private var actions: UIStackView!

    private(set) var pinId: String?
    private(set) var number = 0
    private let scroll = Resizing()
    private let column = UIStackView()
    private let disc = PinDisc()
    private let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let source = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkMuted)
    private let thumb = UIButton(type: .custom)
    private let thread = UIStackView()
    private let field = PinField()
    private let problem = KitLabel(TypeScale.typeMeta, ink: Palette.dataBad, lines: 0)
    private var resolveButton: UIButton!
    private var replyButton: UIButton!
    private var closeButton: UIButton!
    private var resolved = false
    private var shownThread: [PinEntry] = []
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
        let head = UIStackView(arrangedSubviews: [disc, pinWords(name, source), closeRoom])
        head.spacing = Space.space2
        head.alignment = .center

        thumb.translatesAutoresizingMaskIntoConstraints = false
        thumb.layer.cornerRadius = Radius.radiusSm
        thumb.layer.cornerCurve = .continuous
        thumb.layer.borderWidth = 1
        thumb.clipsToBounds = true
        thumb.backgroundColor = Palette.surfaceRecess
        thumb.imageView?.contentMode = .scaleAspectFill
        thumb.addAction(UIAction { [weak self] _ in self?.onPicture() }, for: .touchUpInside)
        let thumbRow = UIStackView(arrangedSubviews: [thumb, UIView()])

        thread.axis = .vertical
        thread.spacing = Space.space2

        field.delegate = self
        problem.isHidden = true
        problem.accessibilityTraits = .staticText

        resolveButton = KitButton.make("Resolve", glyph: .passed, variant: .outline, height: .sm) { [weak self] in
            guard let self else { return }
            onResolve(!resolved)
        }
        replyButton = KitButton.make("Reply", variant: .action, height: .sm) { [weak self] in self?.reply() }
        replyButton.isEnabled = false
        actions = UIStackView(arrangedSubviews: [UIView(), resolveButton, replyButton])
        actions.spacing = Space.space2
        actions.alignment = .center

        for part in [head, thumbRow, thread, field, problem, actions] as [UIView] { column.addArrangedSubview(part) }
        column.axis = .vertical
        column.spacing = Space.space2
        column.translatesAutoresizingMaskIntoConstraints = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.resized = { [weak self] in self?.keepWritingInView() }
        // A drag of what the card holds puts the keyboard away with it, as iOS's lists do.
        scroll.keyboardDismissMode = .interactive
        scroll.addSubview(column)
        addSubview(scroll)
        addSubview(closeButton)
        // As tall as what it holds, up to what its place allows; past that it scrolls.
        let fits = scroll.heightAnchor.constraint(equalTo: scroll.contentLayoutGuide.heightAnchor)
        fits.priority = .defaultLow
        let pad = 11.0
        NSLayoutConstraint.activate([
            thumb.widthAnchor.constraint(equalToConstant: Size.cPinThumb),
            thumb.heightAnchor.constraint(equalToConstant: Size.cPinThumb),
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
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (card: PinCard, _: UITraitCollection) in card.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("PinCard is built in code") }

    /// The card's pin as the hub has it now, its thumbnail when drawn, and
    /// what went wrong with the last reply, resolve or send. The reply
    /// being written stays as it is.
    func show(_ pin: Pin, thumbnail: Data?, problem said: String?, replying: Bool) {
        let fresh = pin.id != pinId
        pinId = pin.id
        number = pin.label
        resolved = pin.resolved
        disc.show(pin)
        name.text = pin.name
        source.text = pin.source
        source.isHidden = pin.source == nil
        accessibilityLabel = "Pin \(pin.label)"
        let image = thumbnail.flatMap { UIImage(data: $0) }
        thumb.setImage(image, for: .normal)
        thumb.superview?.isHidden = image == nil
        thumb.accessibilityLabel = "Pin \(pin.label)'s picture, full size"
        if fresh || pin.thread != shownThread {
            shownThread = pin.thread
            for entry in thread.arrangedSubviews { entry.removeFromSuperview() }
            for entry in pin.thread { thread.addArrangedSubview(Self.entry(entry)) }
        }
        thread.isHidden = pin.thread.isEmpty
        if fresh { field.text = "" }
        field.placeholder = pin.thread.isEmpty ? "Say what to change here" : "Reply"
        field.accessibilityLabel = pin.thread.isEmpty ? "Comment" : "Reply"
        problem.text = said
        problem.isHidden = said == nil
        KitButton.setTitle(pin.resolved ? "Reopen" : "Resolve", of: resolveButton, variant: .outline, height: .sm)
        resolveButton.configuration?.image = (pin.resolved ? Glyph.reopen : Glyph.passed).image.resized(to: Size.iconMd)
        replyButton.configuration?.showsActivityIndicator = replying
        paintReply()
        // A new pin's card takes the keyboard: the person tapped to say something.
        if fresh, pin.thread.isEmpty { field.becomeFirstResponder() }
    }

    /// Said under the field, in the error formula (PinCard.svelte `.error`).
    func say(_ said: String?) {
        problem.text = said
        problem.isHidden = said == nil
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

    func textViewDidChange(_: UITextView) { paintReply() }

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

    /// While the person writes, the field and what sends it stay in view
    /// however small the keyboard leaves the card (a phone's drawer with the
    /// keyboard up has room for little more than them): brought in, their
    /// foot on the card's padding, whenever the card or what it holds
    /// changes size; a scroll of the person's own is left alone.
    private func keepWritingInView() {
        guard field.isFirstResponder else { return }
        scroll.layoutIfNeeded()
        let writing = column.convert(field.frame.union(actions.frame), to: scroll)
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
        thumb.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }

    /// One thread entry (PinCard.svelte `.entry`): who and when, then the
    /// words, the agent's as markdown with the files its reply names.
    private static func entry(_ entry: PinEntry) -> UIView {
        let who = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        who.text = entry.by == .agent ? "Agent" : "You"
        let when = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        let at = (try? Date(entry.at, strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true)))
            ?? (try? Date(entry.at, strategy: .iso8601))
        when.text = at.map { RailAge.short($0.timeIntervalSince1970 * 1000, now: Date.now.timeIntervalSince1970 * 1000) }
        let line = UIStackView(arrangedSubviews: [who, when, UIView()])
        line.spacing = Space.space2
        line.alignment = .firstBaseline
        let stack = UIStackView(arrangedSubviews: [line])
        stack.axis = .vertical
        stack.spacing = Space.space1
        if entry.by == .agent {
            let words = MarkdownDocumentView(message: true)
            words.setSource(entry.text)
            stack.addArrangedSubview(words)
            if let files = entry.files, !files.isEmpty {
                let named = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkMuted, lines: 0)
                named.text = files.joined(separator: "  ")
                stack.addArrangedSubview(named)
            }
        } else {
            let words = KitLabel(TypeScale.typeBody, ink: Palette.inkRow, lines: 0)
            words.text = entry.text
            stack.addArrangedSubview(words)
        }
        stack.isAccessibilityElement = false
        return stack
    }

    #if DEBUG
    /// Where the probe taps: the field, Reply, Resolve or Reopen (its words), Close.
    /// Its scroll's offset and content height, and whether the field has the keyboard.
    var probeScroll: String {
        "offset=\(Int(scroll.contentOffset.y)) content=\(Int(scroll.contentSize.height)) height=\(Int(scroll.bounds.height)) writing=\(field.isFirstResponder)"
    }

    func probeLine() -> String {
        let words = resolveButton.configuration?.attributedTitle.map { String($0.characters) } ?? "?"
        return "preview card pin=\(number) field=\(PreviewProbe.centre(field)) reply=\(PreviewProbe.centre(replyButton)) resolve=\(words)@\(PreviewProbe.centre(resolveButton)) close=\(PreviewProbe.centre(closeButton)) thread=\(shownThread.count) problem=\(problem.isHidden ? "none" : problem.text ?? "")"
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
        didSet { hint.isHidden = !text.isEmpty }
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
/// `-preview-probe` (scripts/probe-ios-preview-touch.ts): the preview's
/// state as `Probe` lines, each control as its centre in the window's
/// points, where a simulator touch lands.
enum PreviewProbe {
    static let on = ProcessInfo.processInfo.arguments.contains("-preview-probe")
    /// `-preview-comment`: Comment turns on once the page is ready, for a run that cannot tap.
    static let commentAtLaunch = ProcessInfo.processInfo.arguments.contains("-preview-comment")
    /// `-preview-comment-tap`: with it, the page's first button takes one click at its centre, as a tap would land.
    static let tapAtLaunch = ProcessInfo.processInfo.arguments.contains("-preview-comment-tap")
    /// `-preview-send`: Send N runs once, the first time something is owed.
    static let sendAtLaunch = ProcessInfo.processInfo.arguments.contains("-preview-send")
    /// The click, in the page: what the overlay's Comment mode hears from a mouse.
    static let click = """
    (() => {
      const el = document.querySelector("button");
      if (!el) return "no button";
      const r = el.getBoundingClientRect();
      const at = { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true, view: window };
      el.dispatchEvent(new MouseEvent("click", at));
      return "clicked " + Math.round(at.clientX) + "," + Math.round(at.clientY);
    })()
    """

    static func say(_ line: String) {
        guard on else { return }
        Logger(subsystem: "dev.cawco.app", category: "Probe").notice("\(line, privacy: .public)")
    }

    static func centre(_ view: UIView) -> String {
        guard view.window != nil, !view.isHidden else { return "none" }
        let at = view.convert(CGPoint(x: view.bounds.midX, y: view.bounds.midY), to: nil)
        return "\(Int(at.x.rounded())),\(Int(at.y.rounded()))"
    }
}
#endif
