import CawCoAPI
import Foundation
import OpenAPIRuntime
import OSLog

/// Every message the person sent from this device that the hub has not
/// taken yet, kept on disk with what it carries (its pictures as the bytes
/// that went out) until the hub says it has it. A socket that drops, a hub
/// that restarts, an app that is quit or relaunched: the message waits here,
/// reads pending on its row, and goes again under its own uuid the moment a
/// connection to its hub opens (`SessionsStore.drain`). The hub takes a
/// repeat of a uuid as the same send (server.ts `deliverToSession`: the
/// record it holds is said again, the machine handed nothing twice), so a
/// send whose acknowledgement was lost is sent again without posting twice.
///
/// One per process: every connection to a hub (each window's, a push's
/// Reply) reads and writes the same messages. A message leaves when the hub
/// takes it (its `accepted`, or its row for it read), when a push's Reply
/// says the hub refused it, or when the person sends a refused one again.
@MainActor
final class SendOutbox {
    static let shared = SendOutbox()

    struct Entry: Codable, Sendable {
        let uuid: String
        /// The hub it is for: a device moved to another hub sends it nowhere.
        let hub: String
        let sessionId: String
        let machineId: String
        /// When it was sent, the order it goes in.
        let at: Date
        /// The send's own time, as its row reads it.
        let timestamp: String
        /// It draws a row of its own (a send in place of another draws none).
        let drawn: Bool
        /// The send it goes in place of, when it does.
        var replaces: String?
        let text: String
        let texts: [Text]
        let files: [File]
        /// The send as it goes on the wire, pictures and all.
        let payload: OpenAPIValueContainer
        /// The hub refused it, with its words: kept for Send again, never sent by itself.
        var refusal: String?

        struct Text: Codable, Sendable { let name: String; let content: String }
        struct File: Codable, Sendable { let name: String; let mediaType: String; let size: Int; let ref: String }
    }

    private(set) var entries: [Entry] = []
    private let folder: URL
    private let log = Logger(subsystem: "dev.cawco.app", category: "Outbox")

    private init() {
        folder = URL.applicationSupportDirectory.appending(path: "send-outbox", directoryHint: .isDirectory)
        let names = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
        for file in names where file.pathExtension == "json" {
            do {
                entries.append(try Wire.decoder().decode(Entry.self, from: Data(contentsOf: file)))
            } catch {
                log.error("outbox: \(file.lastPathComponent, privacy: .public) unreadable, removed: \(String(describing: error), privacy: .public)")
                try? FileManager.default.removeItem(at: file)
            }
        }
        entries.sort { $0.at < $1.at }
        if !entries.isEmpty {
            log.notice("outbox: \(self.entries.count) unsent from before: \(self.entries.map { "\($0.uuid.prefix(8))\($0.refusal == nil ? "" : " refused")" }.joined(separator: ", "), privacy: .public)")
        }
    }

    func entry(_ uuid: String) -> Entry? { entries.first { $0.uuid == uuid } }

    /// Kept before it goes, so nothing between the press and the hub's word can lose it.
    func keep(_ entry: Entry) {
        entries.removeAll { $0.uuid == entry.uuid }
        entries.append(entry)
        write(entry)
    }

    /// The hub refused it: it stays, with the hub's words, for Send again.
    func refuse(_ uuid: String, _ reason: String) {
        guard let at = entries.firstIndex(where: { $0.uuid == uuid }) else { return }
        entries[at].refusal = reason
        write(entries[at])
    }

    /// Sent again by the person: it waits for the hub again.
    func retry(_ uuid: String) {
        guard let at = entries.firstIndex(where: { $0.uuid == uuid }), entries[at].refusal != nil else { return }
        entries[at].refusal = nil
        write(entries[at])
    }

    /// The hub has it, or it is no longer this device's to send.
    func remove(_ uuid: String) {
        guard entries.contains(where: { $0.uuid == uuid }) else { return }
        entries.removeAll { $0.uuid == uuid }
        try? FileManager.default.removeItem(at: file(uuid))
        log.notice("outbox: \(uuid.prefix(8), privacy: .public) gone, \(self.entries.count) left")
    }

    private func file(_ uuid: String) -> URL { folder.appending(path: "\(uuid).json") }

    private func write(_ entry: Entry) {
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try Wire.encoder().encode(entry).write(to: file(entry.uuid), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            log.fault("outbox: \(entry.uuid.prefix(8), privacy: .public) not written: \(String(describing: error), privacy: .public)")
        }
    }
}
