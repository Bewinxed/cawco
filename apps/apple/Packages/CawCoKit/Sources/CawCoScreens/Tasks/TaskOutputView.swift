import AVKit
import CawCoCore
import CawCoDesign
import CawCoTranscript
import SafariServices
import UIKit

/// One of a task's outputs, drawn small, as the project's Made list draws it
/// (TaskOutput.svelte `compact`): what it is (core deliverables) under its
/// file row. A post: its card, the first part's words only; markdown: the
/// file drawn as a turn's words are, at most 6rem, fading at its foot; an
/// image: its thumbnail, at most 6rem, which opens in the lightbox; video or
/// audio: the platform's own player; anything else: its file row alone,
/// whose Open shows the file itself. A file the hub does not hold yet says
/// so in the hub's words.
final class TaskOutputView: UIView {
    private let hub: HubConnection
    private let projectId: String
    private let taskId: String
    private let path: String
    private let kind: DeliverableKind
    private let body = UIView()
    private var player: AVPlayerViewController?
    /// The task's `updatedAt` it was read at: written again, it is read again.
    private var version: Double = -1

    private var name: String { path.split(separator: "/").last.map(String.init) ?? path }

    /// Said once its body has drawn (or refused): what it is and how it stands, for the probe.
    var onDrawn: () -> Void = {}
    #if DEBUG
    private(set) var probeState = "reading"
    #endif

    private func drawn(_ state: String) {
        #if DEBUG
        probeState = state
        #endif
        onDrawn()
    }

    init(hub: HubConnection, projectId: String, taskId: String, path: String) {
        self.hub = hub
        self.projectId = projectId
        self.taskId = taskId
        self.path = path
        kind = DeliverableKind(path: path)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceWell
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        clipsToBounds = true
        build()
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: TaskOutputView, _: UITraitCollection) in view.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskOutputView is built in code")
    }

    private var url: URL? {
        (try? ProjectTasks(hub: hub, projectId: projectId))?.outputURL(taskId, name: path)
    }

    private func paint() {
        layer.borderColor = Palette.borderWell.resolvedColor(with: traitCollection).cgColor
        rowRule.backgroundColor = Palette.borderWell
    }

    private let rowRule = UIView()

    private func build() {
        // Its file row: the document glyph, its name (cut from the end), and for a file, Open ↗.
        let icon = GlyphView(.document, size: Size.iconMd, tint: Palette.inkMuted)
        let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        label.text = name
        label.lineBreakMode = .byTruncatingTail
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        LedgerParts.tip(label, path)
        var parts: [UIView] = [icon, label]
        if kind == .file {
            let open = KitButton.make(Words.Made.open, glyph: .external, variant: .ghost, height: .xs) { [weak self] in self?.openFile() }
            open.configuration?.imagePlacement = .trailing
            open.setContentHuggingPriority(.required, for: .horizontal)
            parts.append(UIView())
            parts.append(open)
        }
        let row = UIStackView(arrangedSubviews: parts)
        row.spacing = Space.space2
        row.alignment = .center
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: Space.space3, bottom: 0, trailing: Space.space1)
        row.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHSm).isActive = true
        let column = UIStackView(arrangedSubviews: [row])
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: topAnchor),
            column.bottomAnchor.constraint(equalTo: bottomAnchor),
            column.leadingAnchor.constraint(equalTo: leadingAnchor),
            column.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        guard kind != .file else { return }
        rowRule.translatesAutoresizingMaskIntoConstraints = false
        rowRule.heightAnchor.constraint(equalToConstant: 1).isActive = true
        column.addArrangedSubview(rowRule)
        body.translatesAutoresizingMaskIntoConstraints = false
        column.addArrangedSubview(body)
    }

    /// Reads it again when its task was written again (`version`).
    func show(version next: Double) {
        guard next != version else { return }
        version = next
        switch kind {
        case .post, .markdown: read()
        case .image: showImage()
        case .video, .audio: showPlayer()
        case .file: drawn("file")
        }
    }

    private func fill(_ view: UIView, inset: Double = Space.space2) {
        body.subviews.forEach { $0.removeFromSuperview() }
        view.translatesAutoresizingMaskIntoConstraints = false
        body.addSubview(view)
        NSLayoutConstraint.activate([
            view.topAnchor.constraint(equalTo: body.topAnchor, constant: inset),
            view.bottomAnchor.constraint(equalTo: body.bottomAnchor, constant: -inset),
            view.leadingAnchor.constraint(equalTo: body.leadingAnchor, constant: inset),
            view.trailingAnchor.constraint(equalTo: body.trailingAnchor, constant: -inset),
        ])
    }

    private func problem(_ words: String) {
        let line = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
        line.text = words
        fill(line)
    }

    /// A post and markdown are read as text; three skeleton lines stand meanwhile.
    private func read() {
        let skeleton = UIStackView(arrangedSubviews: [SkeletonView(height: 14), SkeletonView(height: 14), SkeletonView(height: 14)])
        skeleton.axis = .vertical
        skeleton.spacing = Space.space2
        skeleton.isAccessibilityElement = false
        fill(skeleton)
        Task { [weak self] in
            guard let self else { return }
            do {
                let (data, _) = try await ProjectTasks(hub: hub, projectId: projectId).readOutput(taskId, name: path)
                let text = String(decoding: data, as: UTF8.self)
                if kind == .post {
                    switch PostFile.parse(text) {
                    case let .success(post):
                        fill(CompactPostCard(post))
                        drawn("post:\(post.account)")
                    case let .failure(why):
                        problem(Words.Made.notPost(name: name, problem: why.sentence))
                        drawn("refused")
                    }
                } else {
                    let words = MarkdownDocumentView(message: true)
                    words.setSource(text)
                    fill(FootClip(words, height: 96))
                    drawn("markdown:\(text.count)")
                }
            } catch {
                problem(error.localizedDescription)
                drawn("refused")
            }
        }
    }

    /// Its thumbnail, at most 6rem tall at its own shape, which opens in the lightbox.
    private func showImage() {
        guard let url else { return }
        let image = UIImageView()
        image.contentMode = .scaleAspectFit
        image.layer.cornerRadius = Radius.radiusSm
        image.layer.cornerCurve = .continuous
        image.clipsToBounds = true
        let button = UIControl()
        image.translatesAutoresizingMaskIntoConstraints = false
        image.isUserInteractionEnabled = false
        button.addSubview(image)
        let height = image.heightAnchor.constraint(equalToConstant: 96)
        let width = image.widthAnchor.constraint(equalToConstant: 96)
        NSLayoutConstraint.activate([
            image.topAnchor.constraint(equalTo: button.topAnchor),
            image.bottomAnchor.constraint(equalTo: button.bottomAnchor),
            image.leadingAnchor.constraint(equalTo: button.leadingAnchor),
            image.trailingAnchor.constraint(lessThanOrEqualTo: button.trailingAnchor),
            height, width,
        ])
        button.isAccessibilityElement = true
        button.accessibilityLabel = Words.Made.openFile(name: name)
        button.accessibilityTraits = .button
        button.addAction(UIAction { [weak self, weak image] _ in
            guard let self, let image else { return }
            LightboxPresenter.image(url, caption: path, path: path, from: image)
        }, for: .touchUpInside)
        fill(button)
        Task { [weak self, weak image] in
            guard let (data, response) = try? await URLSession.shared.data(for: .hub(url)),
                  (response as? HTTPURLResponse)?.statusCode == 200, let picture = UIImage(data: data) else { return }
            guard let image, let self else { return }
            image.image = picture
            drawn("image:\(Int(picture.size.width))x\(Int(picture.size.height))")
            // `max-block-size: 6rem` at its own shape, no wider than the tile.
            let scale = min(1, 96 / max(1, picture.size.height))
            height.constant = picture.size.height * scale
            width.constant = picture.size.width * scale
        }
    }

    /// The platform's own player, its controls, the hub's pass carried as the dashboard's cookie.
    private func showPlayer() {
        guard let url else { return }
        let cookies = hub.passCookie(on: url).map { [$0] } ?? []
        let asset = AVURLAsset(url: url, options: [AVURLAssetHTTPCookiesKey: cookies])
        let controller = AVPlayerViewController()
        controller.player = AVPlayer(playerItem: AVPlayerItem(asset: asset))
        controller.view.layer.cornerRadius = Radius.radiusSm
        controller.view.clipsToBounds = true
        controller.view.backgroundColor = Palette.surfaceRecess
        player = controller
        let box = UIView()
        controller.view.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(controller.view)
        NSLayoutConstraint.activate([
            controller.view.topAnchor.constraint(equalTo: box.topAnchor),
            controller.view.bottomAnchor.constraint(equalTo: box.bottomAnchor),
            controller.view.leadingAnchor.constraint(equalTo: box.leadingAnchor),
            controller.view.trailingAnchor.constraint(equalTo: box.trailingAnchor),
        ])
        if kind == .video {
            // The tile's width, at most 24rem tall.
            let shape = box.heightAnchor.constraint(equalTo: box.widthAnchor, multiplier: 9.0 / 16.0)
            shape.priority = .defaultHigh
            NSLayoutConstraint.activate([shape, box.heightAnchor.constraint(lessThanOrEqualToConstant: 384)])
        } else {
            // Audio: its controls' height.
            box.heightAnchor.constraint(equalToConstant: Size.cBtnHLg).isActive = true
        }
        fill(box)
        adopt()
        drawn(kind == .video ? "video" : "audio")
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        adopt()
    }

    /// The player's controller is a child of the controller this view stands in.
    private func adopt() {
        guard let player, window != nil, player.parent == nil else { return }
        var responder: UIResponder? = next
        while let at = responder, !(at is UIViewController) { responder = at.next }
        guard let host = responder as? UIViewController else { return }
        host.addChild(player)
        player.didMove(toParent: host)
    }

    /// A file: the output's own route, in the browser over the app (`target="_blank"`).
    private func openFile() {
        guard let url else { return }
        var responder: UIResponder? = next
        while let at = responder, !(at is UIViewController) { responder = at.next }
        (responder as? UIViewController)?.present(SFSafariViewController(url: url), animated: true)
    }
}

/// A post drawn small (PostCard.svelte `compact`): a neutral card in the
/// house's own surfaces, no service's trade dress. The account under its
/// initial, then the first part's words, three lines at most.
private final class CompactPostCard: UIView {
    init(_ post: PostFile) {
        super.init(frame: .zero)
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        let handle = post.account.hasPrefix("@") ? String(post.account.dropFirst()) : post.account
        let initial = KitLabel(TypeScale.typeMeta.with(weight: TypeScale.weightStrong), ink: Palette.inkStrong)
        initial.text = handle.prefix(1).uppercased()
        initial.textAlignment = .center
        initial.backgroundColor = Palette.surfaceFill
        initial.layer.cornerRadius = 12
        initial.clipsToBounds = true
        initial.isAccessibilityElement = false
        let account = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        account.text = post.account
        account.lineBreakMode = .byTruncatingTail
        let who = UIStackView(arrangedSubviews: [initial, account])
        who.spacing = Space.space2
        who.alignment = .center
        let text = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 3)
        text.text = post.text
        let column = UIStackView(arrangedSubviews: [who, text])
        column.axis = .vertical
        column.spacing = Space.space2
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            initial.widthAnchor.constraint(equalToConstant: 24),
            initial.heightAnchor.constraint(equalToConstant: 24),
            column.topAnchor.constraint(equalTo: topAnchor, constant: Space.space2),
            column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space2),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3),
        ])
        accessibilityLabel = Words.Made.post
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (card: CompactPostCard, _: UITraitCollection) in card.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CompactPostCard is built in code")
    }

    private func paint() {
        layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }
}

/// Words held to a height, fading out over their last `space-6` (`.compact .markdown`).
private final class FootClip: UIView {
    private let fade = CAGradientLayer()
    private let content: UIView

    init(_ content: UIView, height: Double) {
        self.content = content
        super.init(frame: .zero)
        clipsToBounds = true
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        let cap = heightAnchor.constraint(lessThanOrEqualToConstant: height)
        let natural = heightAnchor.constraint(equalTo: content.heightAnchor)
        natural.priority = .defaultHigh
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: topAnchor),
            content.leadingAnchor.constraint(equalTo: leadingAnchor),
            content.trailingAnchor.constraint(equalTo: trailingAnchor),
            cap, natural,
        ])
        fade.colors = [UIColor.black.cgColor, UIColor.black.cgColor, UIColor.clear.cgColor]
        layer.mask = fade
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("FootClip is built in code")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        fade.frame = bounds
        let edge = bounds.height > 0 ? max(0, 1 - Space.space6 / bounds.height) : 1
        fade.locations = [0, NSNumber(value: edge), 1]
        CATransaction.commit()
    }
}
