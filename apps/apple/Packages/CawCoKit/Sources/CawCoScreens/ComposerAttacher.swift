import CawCoCore
import CawCoDesign
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/// What rides with a conversation's words (Composer.svelte `attach`): the sources a file input offers on
/// iOS (the photo library and files), what is pasted into the field that is
/// not words, and each pick read off its source into its own place in the
/// draft; a picture as a picture, a text as text, anything else uploaded to
/// the hub with its chip following along, tried again from the chip.
@MainActor
final class ComposerAttacher: NSObject, PHPickerViewControllerDelegate, UIDocumentPickerDelegate {
    private let hub: HubConnection
    private let binding: SessionComposerBinding
    /// Where the pickers stand and a refusal is said.
    private weak var presenter: UIViewController?

    init(hub: HubConnection, binding: SessionComposerBinding, presenter: UIViewController) {
        self.hub = hub
        self.binding = binding
        self.presenter = presenter
        super.init()
    }

    /// What the draft carries, as a send takes it; nil while a pick is still
    /// being read or a file is not on the hub yet: nothing is sent then.
    struct Carried {
        var images: [(mediaType: String, data: Data)] = []
        var texts: [(name: String, content: String)] = []
        var files: [SentFile] = []
    }

    static func carried(_ attachments: [ComposerAttachment]) -> Carried? {
        var carried = Carried()
        for attachment in attachments {
            switch attachment {
            case let .image(_, mediaType, data): carried.images.append((mediaType, data))
            case let .text(name, content): carried.texts.append((name, content))
            case let .file(_, name, mediaType, size, .ready(ref)): carried.files.append(SentFile(name: name, mediaType: mediaType, size: size, ref: ref))
            case .file, .pending: return nil
            }
        }
        return carried
    }

    /// The sources a file input offers on iOS: the photo library and files.
    func menu() -> UIMenu {
        UIMenu(children: [
            UIAction(title: "Photo Library", image: Glyph.window.image) { [weak self] _ in self?.pickPhotos() },
            UIAction(title: "Choose File", image: Glyph.document.image) { [weak self] _ in self?.pickFiles() },
        ])
    }

    private func pickPhotos() {
        var config = PHPickerConfiguration()
        config.filter = .any(of: [.images, .videos])
        // A video as it is stored, not transcoded first.
        config.preferredAssetRepresentationMode = .current
        config.selectionLimit = 0
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        presenter?.present(picker, animated: true)
    }

    /// Any file at all: a picture, a text, or anything else, which uploads.
    private func pickFiles() {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: true)
        picker.allowsMultipleSelection = true
        picker.delegate = self
        presenter?.present(picker, animated: true)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        for result in results {
            let provider = result.itemProvider
            if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
                loadFile(provider, type: .movie)
            } else {
                loadImage(provider)
            }
        }
    }

    func documentPicker(_: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        for url in urls {
            let type = (try? url.resourceValues(forKeys: [.contentTypeKey]).contentType) ?? UTType(filenameExtension: url.pathExtension)
            ingest(url, name: url.lastPathComponent, type: type)
        }
    }

    /// Whatever is pasted into the composer that is not words: a picture as
    /// a picture, anything else as Choose File takes it, by its own type
    /// rather than the link Files copies beside it; and a bare link to a file,
    /// as the file it names.
    func pasted(_ items: [NSItemProvider]) {
        for provider in items {
            let types = provider.registeredTypeIdentifiers.compactMap(UTType.init)
            if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                loadImage(provider)
            } else if let type = types.first(where: { !$0.conforms(to: .url) }) {
                loadFile(provider, type: type)
            } else if types.contains(where: { $0.conforms(to: .fileURL) }) {
                loadLinkedFile(provider)
            }
        }
    }

    private func refused(_ words: String) {
        guard let view = presenter?.view else { return }
        Toast.error(words, in: view)
    }

    /// A pasted link to a file: the file it names, copied while it may be read.
    private func loadLinkedFile(_ provider: NSItemProvider) {
        let slot = reserve(provider.suggestedName ?? "File")
        _ = provider.loadObject(ofClass: URL.self) { [weak self] url, error in
            let scoped = url?.startAccessingSecurityScopedResource() ?? false
            let kept = url.flatMap { Self.keep($0, name: $0.lastPathComponent) }
            if scoped { url?.stopAccessingSecurityScopedResource() }
            let reason = error?.localizedDescription ?? "The file couldn't be read."
            Task { @MainActor in
                guard let self else { return }
                guard let kept else {
                    self.binding.resolve(slot, with: nil)
                    self.refused("Couldn't attach that file. \(reason)")
                    return
                }
                let type = (try? kept.resourceValues(forKeys: [.contentTypeKey]).contentType) ?? UTType(filenameExtension: kept.pathExtension)
                self.ingest(kept, name: kept.lastPathComponent, type: type, slot: slot)
            }
        }
    }

    /// A pick or paste is read off its source in the background. Its place
    /// in the draft is taken now, under its own id, and what it becomes
    /// fills that place and no other: a read that lands after the place is
    /// gone (removed, or sent) is dropped rather than riding the next message.
    private func reserve(_ name: String) -> String {
        let id = UUID().uuidString
        binding.attach(.pending(id: id, name: name))
        return id
    }

    private func loadImage(_ provider: NSItemProvider) {
        let name = provider.suggestedName ?? "Image"
        let slot = reserve(name)
        provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { [weak self] data, error in
            let image = data.flatMap(Self.sendable)
            Task { @MainActor in
                guard let self else { return }
                guard let image else {
                    self.binding.resolve(slot, with: nil)
                    self.refused("Couldn't attach \(name). \(error?.localizedDescription ?? "The picture couldn't be read.")")
                    return
                }
                self.binding.resolve(slot, with: .image(name: name, mediaType: image.type, data: image.data))
            }
        }
    }

    /// A provider's file, copied out of the callback (its copy is gone once
    /// the callback returns) and taken as a picked file, in its own place.
    private func loadFile(_ provider: NSItemProvider, type: UTType) {
        let suggested = provider.suggestedName
        let slot = reserve(suggested ?? "File")
        provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { [weak self] url, error in
            let kept = url.flatMap { Self.keep($0, name: Self.fileName(suggested, url: $0, type: type)) }
            // The copy's own type is the narrower one (a video picked as any movie is a QuickTime movie).
            let actual = kept.flatMap { UTType(filenameExtension: $0.pathExtension) }.flatMap { $0.conforms(to: type) ? $0 : nil } ?? type
            let reason = error?.localizedDescription ?? "The file couldn't be read."
            Task { @MainActor in
                guard let self else { return }
                guard let kept else {
                    self.binding.resolve(slot, with: nil)
                    self.refused("Couldn't attach that file. \(reason)")
                    return
                }
                self.ingest(kept, name: kept.lastPathComponent, type: actual, slot: slot)
            }
        }
    }

    /// The largest text that rides as text, folded into the turn.
    private static let textLimit = 1024 * 1024

    /// What a file becomes (Composer.svelte `addFiles`): a picture, through
    /// `sendable`; a text, when it is one, reads as UTF-8 and is at most
    /// 1 MB; anything else a file, uploading to the hub at once.
    /// `slot`: the place a pick reserved, which this fills; without one the
    /// attachment is added at the end.
    private func ingest(_ url: URL, name: String, type: UTType?, slot: String? = nil) {
        let place = { [binding] (attachment: ComposerAttachment) -> Bool in
            guard let slot else {
                binding.attach(attachment)
                return true
            }
            return binding.resolve(slot, with: attachment)
        }
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        if type?.conforms(to: .image) == true, let data = try? Data(contentsOf: url), let image = Self.sendable(data) {
            place(.image(name: name, mediaType: image.type, data: image.data))
            return
        }
        if type?.conforms(to: .text) == true, size <= Self.textLimit,
           let data = try? Data(contentsOf: url), let text = String(data: data, encoding: .utf8) {
            place(.text(name: name, content: text))
            return
        }
        let id = slot ?? UUID().uuidString
        let mediaType = type?.preferredMIMEType ?? "application/octet-stream"
        guard place(.file(id: id, name: name, mediaType: mediaType, size: size, state: .uploading(0))) else { return }
        uploads[id] = Upload(url: url, name: name, mediaType: mediaType)
        upload(id)
    }

    /// A file on its way to the hub, kept until the hub has it so a failed
    /// upload can be tried again. `attempt` lets a late word from an earlier
    /// try fall on the floor.
    private struct Upload {
        let url: URL
        let name: String
        let mediaType: String
        var attempt = 0
    }

    private var uploads: [String: Upload] = [:]

    /// Uploads (again) the file `id`; its chip follows along.
    func upload(_ id: String) {
        guard var job = uploads[id] else { return }
        job.attempt += 1
        uploads[id] = job
        let attempt = job.attempt
        binding.updateFile(id, .uploading(0))
        // Heard on URLSession's queue; the chip moves on the main actor.
        let report: @Sendable (Double) -> Void = { [weak self] fraction in
            Task { @MainActor in
                guard let self, self.uploads[id]?.attempt == attempt else { return }
                self.binding.updateFile(id, .uploading(fraction))
            }
        }
        Task { [weak self, hub] in
            do {
                let file = try await hub.uploadFile(at: job.url, name: job.name, mediaType: job.mediaType, progress: report)
                guard let self, uploads[id]?.attempt == attempt else { return }
                uploads[id] = nil
                binding.updateFile(id, .ready(file.ref))
                if job.url.path.hasPrefix(Self.keptFiles.path) { try? FileManager.default.removeItem(at: job.url.deletingLastPathComponent()) }
            } catch {
                guard let self, uploads[id]?.attempt == attempt else { return }
                // A later progress word from this try must not bring the ring back.
                uploads[id]?.attempt += 1
                binding.updateFile(id, .failed(error.localizedDescription))
            }
        }
    }

    /// Where pasted and picked files wait to upload: a folder of their own each.
    nonisolated private static var keptFiles: URL {
        FileManager.default.temporaryDirectory.appending(path: "cawco-uploads", directoryHint: .isDirectory)
    }

    nonisolated private static func keep(_ url: URL, name: String) -> URL? {
        let folder = keptFiles.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        let kept = folder.appending(path: name)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: url, to: kept)
            return kept
        } catch {
            return nil
        }
    }

    /// The name a pasted or picked file goes by: the name its source
    /// suggested, with its type's extension, else the copy's own.
    nonisolated private static func fileName(_ suggested: String?, url: URL, type: UTType) -> String {
        // A pasted item names nothing, and its copy's name is a hash: it goes by its kind ("PDF document.pdf").
        let suggested = suggested.flatMap { $0.isEmpty ? nil : $0 } ?? type.localizedDescription ?? "File"
        guard let ext = type.preferredFilenameExtension ?? (url.pathExtension.isEmpty ? nil : url.pathExtension),
              (suggested as NSString).pathExtension.isEmpty else { return suggested }
        return "\(suggested).\(ext)"
    }

    /// An image as a turn carries it: PNG stays PNG, anything else as JPEG.
    nonisolated private static func sendable(_ data: Data) -> (type: String, data: Data)? {
        if data.starts(with: [0x89, 0x50, 0x4E, 0x47]) { return ("image/png", data) }
        guard let image = UIImage(data: data), let jpeg = image.jpegData(compressionQuality: 0.9) else { return nil }
        return ("image/jpeg", jpeg)
    }
}
