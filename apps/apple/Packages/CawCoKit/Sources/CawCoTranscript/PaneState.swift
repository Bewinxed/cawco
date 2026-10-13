import CawCoCore
import CawCoDesign
import UIKit

/// A named state standing in the transcript area instead of a transcript
/// (SessionPane.svelte): a read that failed, with Try again; an id nothing
/// answers to, with the way back to the fleet; a stored transcript with no
/// turns. The one empty state (app.css `.kit-empty`): a 20pt mark, the title
/// in the title role, one line saying why, at most one action, centred in the
/// area at 46 characters wide (`m-auto max-w-[46ch] px-[--space-6]`).
final class PaneState: UIView {
    enum State: Equatable {
        case fault(ReadFault)
        case missing(String)
        case blank
    }

    private let column = UIStackView()
    private let mark = GlyphView(.alert, size: Size.iconLg, tint: Palette.inkMuted)
    /// `.kit-empty-title` balances its lines, `.kit-empty-line` wraps pretty (LineWrap).
    private let title = WrapLabel(wrap: .balance)
    private let line = WrapLabel(wrap: .pretty)
    /// The window width the title's fluid size was set for.
    private var titleViewport: Double?
    private var titleText = ""
    private var action: UIButton?
    private var shown: State?
    var onRetry: () -> Void = {}
    var onReturn: () -> Void = {}

    override init(frame: CGRect) {
        super.init(frame: frame)
        column.axis = .vertical
        column.alignment = .leading
        column.spacing = Space.space2
        for view in [mark, title, line] { column.addArrangedSubview(view) }
        column.setCustomSpacing(Space.space2 + Space.space1, after: mark)
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        let measure = ("0" as NSString).size(withAttributes: [.font: TypeScale.typeBody.font]).width * 46
        let wide = column.widthAnchor.constraint(equalToConstant: measure)
        wide.priority = .defaultHigh
        NSLayoutConstraint.activate([
            column.centerXAnchor.constraint(equalTo: centerXAnchor),
            column.centerYAnchor.constraint(equalTo: centerYAnchor),
            column.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: Space.space6),
            column.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -Space.space6),
            column.widthAnchor.constraint(lessThanOrEqualToConstant: measure), wide,
            column.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: Space.space6),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// The title at the size its clamp() takes in this window.
    private func setTitle() {
        let viewport = window.map { Double($0.bounds.width) }
        titleViewport = viewport
        title.attributedText = Styled.emptyTitle(titleText, viewport: viewport)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if let window, Double(window.bounds.width) != titleViewport { setTitle() }
    }

    func show(_ state: State) {
        guard state != shown else { return }
        shown = state
        action?.removeFromSuperview()
        let titleText: String
        let lineText: NSAttributedString
        let actionTitle: String
        let body = Styled.attributes(TypeScale.typeBody, color: Palette.inkMuted, lineBreak: .byWordWrapping)
        switch state {
        case let .fault(fault):
            mark.glyph = fault.reason == .offline ? .laptop : .alert
            titleText = fault.reason == .offline
                ? (fault.reconnecting ? "This machine is reconnecting" : "This machine is offline")
                : "This transcript couldn't be read"
            // SessionPane `faultLine`: what went wrong, then what to do about it.
            // The fault's message is one sentence without its stop (`ReadFault`).
            let said = switch fault.reason {
            case .offline: fault.reconnecting ? "\(fault.message)." : "\(fault.message). Try again once it is back online."
            case .localNetwork: "\(fault.message). \(LocalNetwork.allowIt), and it's read as soon as you're back."
            case .failed: "Reading it failed: \(fault.message). Try again; if it fails the same way, the hub's log has the cause."
            }
            lineText = NSAttributedString(string: said, attributes: body)
            // The one action that changes a Local Network refusal opens Settings where its switch is.
            actionTitle = fault.reason == .localNetwork ? LocalNetwork.settingsAction : "Try again"
        case let .missing(id):
            mark.glyph = .alert
            titleText = "This session isn't reachable from here"
            let text = NSMutableAttributedString(string: "The hub has no record of ", attributes: body)
            var code = body
            code[.font] = TypeScale.typeCode.font(TypeScale.textLabel)
            text.append(NSAttributedString(string: id, attributes: code))
            text.append(NSAttributedString(string: ", and no machine it can reach has a transcript filed under it. It may live on a machine that is offline, or it may have been deleted.", attributes: body))
            lineText = text
            actionTitle = "Back to the fleet"
        case .blank:
            mark.glyph = .chat
            titleText = "Nothing has been said here yet"
            lineText = NSAttributedString(string: "The transcript was found and has no turns yet. Write the first message below.", attributes: body)
            actionTitle = ""
        }
        self.titleText = titleText
        setTitle()
        line.attributedText = lineText
        guard !actionTitle.isEmpty else { action = nil; return }
        let title = actionTitle
        let button = KitButton.make(actionTitle, variant: .outline) { [weak self] in
            switch title {
            case "Try again": self?.onRetry()
            case LocalNetwork.settingsAction: UIApplication.shared.open(LocalNetwork.settingsURL)
            default: self?.onReturn()
            }
        }
        column.addArrangedSubview(button)
        column.setCustomSpacing(Space.space2 * 2, after: line)
        action = button
    }
}
