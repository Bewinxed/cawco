public import CawCoAPI
import Foundation
import Observation
import OpenAPIRuntime
import OSLog

@MainActor @Observable
public final class SessionTranscript {
    public let id: String
    public internal(set) var blocks: [Components.Schemas.TranscriptBlock] = []
    public internal(set) var queued: [Components.Schemas.TranscriptBlock] = []
    /// The reader's own sends from this device that the hub has not taken
    /// yet (local.ts `localUserMessage`, client.svelte.ts `local`), oldest
    /// first, drawn after `queued`. Each goes the moment `blocks` or `queued`
    /// holds its id: the hub's row for it takes its place, under the same id.
    /// Nothing the hub sends replaces this list, so a send stays on screen
    /// from the composer until the hub's own row for it is there.
    public internal(set) var local: [LocalSend] = []
    public internal(set) var branches: [Components.Schemas.TranscriptPageBranch] = []
    public internal(set) var tail: Components.Schemas.TranscriptTail?
    public internal(set) var facts: Components.Schemas.TranscriptFacts?
    public internal(set) var location: Components.Schemas.TranscriptWhere?
    /// Where the page older than `blocks` begins: the `before` the hub named,
    /// or nil once the conversation's start is in hand.
    public internal(set) var cursor: String?
    public internal(set) var loading = true
    /// An older page is being read: one at a time (client.svelte.ts
    /// `hydrating`, `SessionsStore.readOlderPage`).
    public internal(set) var loadingOlder = false
    /// Why the last older page could not be read (client.svelte.ts
    /// `olderFault`). The cursor stays where it was, so asking again asks for
    /// the same page.
    public internal(set) var olderFault: ReadFault?
    /// Bumped by every newest page adopted (client.svelte.ts `reads`): an
    /// older page that lands after one belongs to the transcript it replaced.
    @ObservationIgnored var reads = 0
    /// Why the read failed, when it did and nothing was held (client.svelte.ts
    /// `readFault`): the pane says so in place of the transcript.
    public internal(set) var fault: ReadFault?
    /// Why a read again over the rows held failed: the rows stay where the
    /// reader has them, and the read is made again on the next event that can
    /// answer it (the machine back online, the socket back, the backoff after
    /// a read the hub failed, the reader's retry).
    public internal(set) var behind: ReadFault?
    /// A read the hub asked for is out (a transcript `reset`, a
    /// `stream.reset`, a replay broken past repair): the rows drawn are
    /// behind what the hub holds, and the dock says "Catching up…". A read
    /// for any other reason (the socket or the machine back, the backoff, a
    /// retry) catches up quietly. Set as such a read starts, cleared as the
    /// read that ends it lands or fails.
    public internal(set) var catchingUp = false
    /// The fault the reader was last told of by a toast, until a read
    /// lands: the same fault again says nothing (TranscriptView `updateDock`).
    @ObservationIgnored public var toasted: ReadFault?
    /// The hub read the stored transcript again (a transcript `reset`): the
    /// rows held may say something else now, so the next read reads again
    /// every page back to the first row held. Cleared when a read lands.
    @ObservationIgnored var historyChanged = false
    /// The hub answered 404: nothing it or any machine holds goes by this id.
    /// An answer, not a fault: retrying would ask the same question.
    public internal(set) var missing = false
    public internal(set) var blockRevision = 0
    /// Bumped by every read of history (the newest page, an older page, a read
    /// again); a change in blocks under the same value came on the live
    /// stream (arrivals.svelte.ts: a history path replaces, a live path pushes).
    public internal(set) var historyRevision = 0
    init(_ id: String) { self.id = id }
}

/// A message this device sent that the hub has not taken yet: what its row
/// draws until the hub's row for it arrives under the same id (local.ts
/// `localUserMessage`). Its pictures are drawn from the bytes that went out,
/// as `data:` addresses: nothing comes back to draw them from until then.
public struct LocalSend: Sendable, Equatable {
    public enum State: String, Sendable {
        /// On its way: the hub has not answered, or has and its row is not here yet.
        case sending
        /// The hub never took it (the socket was down or went down, or nothing
        /// answered): sent again from this device, under its own id.
        case unreached
    }

    public struct Image: Sendable, Equatable {
        public let src: String
        public let mediaType: String
    }

    public let id: String
    public let text: String
    public let timestamp: String
    public let texts: [SentText]
    public let files: [SentFile]
    public let images: [Image]
    public internal(set) var state: State = .sending
    /// Why it was not taken, while `unreached`.
    public internal(set) var reason: String?
}

/// A pasted or attached text a send carried.
public struct SentText: Sendable, Equatable {
    public let name: String
    public let content: String
}

/// A transcript read that failed (client.svelte.ts `pageFault`): the machine
/// holding it is offline (a 503 naming it), this app is not allowed on the
/// local network the hub is on, or the read failed. `message` is one
/// sentence of why, without its closing stop (`Wire.reason`), never a body
/// as the hub sent it.
public struct ReadFault: Sendable, Equatable {
    public enum Reason: Sendable { case offline, localNetwork, failed }
    public let reason: Reason
    public let machineId: String?
    public let message: String
    /// `offline`, and the hub heard from the machine moments ago (its 503's
    /// `X-Cawco-Machine-State: reconnecting`): how long the hub still reads
    /// it as on its way back (its `Retry-After`), as after a hub restart. A
    /// wait, said in place, never toasted; when it lapses the transcript is
    /// read again (`SessionsStore.readFailed`), and the hub says what it is then.
    public let reconnectingFor: Duration?
    /// Within the window the hub gave (`reconnectingFor`).
    public var reconnecting: Bool { reconnectingFor != nil }

    init(reason: Reason, machineId: String?, message: String, reconnectingFor: Duration? = nil) {
        self.reason = reason
        self.machineId = machineId
        self.message = message
        self.reconnectingFor = reconnectingFor
    }

    /// A read that failed while the hub answered, or never reached it.
    static func failed(_ message: String) -> ReadFault { ReadFault(reason: .failed, machineId: nil, message: message) }

    /// Why a read that never reached an answer failed, in one sentence: what
    /// the failure means, not the generated client's description of it,
    /// which carries the request, the response and the body whole. A request
    /// the system refused as "offline" (-1009) or that reached no host may be
    /// Local Network privacy, the internet up all along: the path to the hub
    /// is asked (`LocalNetwork.denied`) before anything is said.
    static func thrown(_ error: any Error) async -> ReadFault {
        let cause = (error as? ClientError)?.underlyingError ?? error
        if cause is DecodingError { return failed("The hub's answer couldn't be read") }
        guard let url = cause as? URLError else { return failed("The hub couldn't be reached") }
        if url.code == .timedOut { return failed("The hub didn't answer in time") }
        if LocalNetwork.mayBeDenied(url), let address = url.failingURL, await LocalNetwork.denied(address) {
            return ReadFault(reason: .localNetwork, machineId: nil, message: "CawCo isn't allowed on the local network the hub is on")
        }
        return failed("The hub couldn't be reached")
    }
}

/// The hub builds the blocks. This store only adopts its page and applies its
/// sequenced changes; it never constructs a conversation from harness frames.
@MainActor @Observable
public final class SessionsStore {
    public private(set) var transcripts: [String: SessionTranscript] = [:]
    @ObservationIgnored private unowned let hub: HubConnection
    @ObservationIgnored private var readers: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var watches: [String: Int] = [:]
    @ObservationIgnored private var peeked: String?
    var watched: Set<String> { Set(watches.keys) }
    private let log = Logger(subsystem: "dev.cawco.app", category: "Transcript")

    init(hub: HubConnection) { self.hub = hub }

    /// A session's error lines that are this client's own (client.svelte.ts
    /// `notes`): kept apart from what the hub built, and put back under it
    /// after every page read. Gone when the app is, as the web's are on reload.
    @ObservationIgnored private var notes: [String: [Components.Schemas.TranscriptBlock]] = [:]

    /// What the hub or a machine answered to an action this client asked of a
    /// session and could not carry out (client.svelte.ts `addNote(target,
    /// errorMessage(instanceId, message))`): an error line in that session's
    /// transcript, after what it holds now.
    public func noteError(_ id: String, _ text: String) {
        let fields: [String: Any] = [
            "id": "local:\(UUID().uuidString.lowercased())", "instanceId": id, "type": "ui.error", "content": text,
            "timestamp": ISO8601DateFormatter().string(from: Date()),
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: fields),
              let block = try? Wire.decoder().decode(Components.Schemas.TranscriptBlock.self, from: data)
        else {
            log.error("could not note an error on \(id, privacy: .public): \(text, privacy: .public)")
            return
        }
        notes[id, default: []].append(block)
        guard let transcript = transcripts[id] else { return }
        transcript.blocks.append(block)
        transcript.blockRevision += 1
    }

    public func open(_ id: String) -> SessionTranscript {
        watches[id, default: 0] += 1
        if let existing = transcripts[id] { return existing }
        let transcript = SessionTranscript(id)
        transcripts[id] = transcript
        log.info("watching \(id, privacy: .public): \(self.watches.count) sessions watched")
        read(id, because: .open)
        return transcript
    }

    public func close(_ id: String) {
        guard let count = watches[id] else { return }
        if count > 1 { watches[id] = count - 1; return }
        watches[id] = nil
        readers.removeValue(forKey: id)?.cancel()
        failedReads.removeValue(forKey: id)?.timer?.cancel()
        lapses.removeValue(forKey: id)?.cancel()
        olderLapses.removeValue(forKey: id)?.cancel()
        transcripts[id] = nil
        for (uuid, held) in outbox where held.sessionId == id { outbox[uuid] = nil }
        hub.ledger.forget(except: watched)
        log.info("stopped watching \(id, privacy: .public): \(self.watches.count) sessions watched")
    }

    func reset() {
        readers.values.forEach { $0.cancel() }
        readers = [:]
        failedReads.values.forEach { $0.timer?.cancel() }
        failedReads = [:]
        lapses.values.forEach { $0.cancel() }
        lapses = [:]
        olderLapses.values.forEach { $0.cancel() }
        olderLapses = [:]
        transcripts = [:]
        watches = [:]
        peeked = nil
        outbox = [:]
        hub.ledger.forget(except: [])
    }

    /// The socket is back: every watched transcript is read again, quietly,
    /// joined to the rows held (`read`), and the read's page subscribes it.
    /// Never resumed from the cursor the last connection left: the hub
    /// numbers a session's stream in memory, from 1 again after a restart,
    /// so that cursor may sit inside another hub process's numbering, and a
    /// resume from it would replay that process's events onto rows they do
    /// not follow. A read in flight is read again here: it was asked of the
    /// connection before.
    func reconnected() {
        hub.ledger.forget(except: watched)
        for id in watched { read(id, because: .reconnect) }
    }

    /// The app is active again, maybe back from Settings with Local Network
    /// access allowed: a read that privacy refused is read now, the backoff
    /// skipped. There is no status to ask (Local Network Privacy FAQ-9); the
    /// read is the asking.
    func becameActive() {
        for id in watched {
            guard let transcript = transcripts[id], !transcript.loading,
                  (transcript.fault ?? transcript.behind)?.reason == .localNetwork else { continue }
            read(id, because: .active)
        }
    }

    /// The hub's word on its machines changed, with `machineId` online in it:
    /// every transcript whose last read found that machine offline is read now.
    /// A transcript the backoff is already reading again waits for it.
    func machineOnline(_ machineId: String) {
        for id in watched where failedReads[id]?.timer == nil {
            guard let transcript = transcripts[id], !transcript.loading,
                  let fault = transcript.fault ?? transcript.behind, fault.reason == .offline, fault.machineId == machineId else { continue }
            read(id, because: .machineOnline)
        }
    }

    /// How long after a failed read, the hub answering, the transcript is
    /// read again (client.svelte.ts `READ_AGAIN_MS`): the nth failure in a
    /// row waits the nth delay, every one past the last waits the last, and
    /// a read that lands starts it over. Our choice: a blip is caught up
    /// within seconds, a hub that keeps failing is asked once a minute.
    static let readAgain: [Duration] = [.seconds(2), .seconds(4), .seconds(8), .seconds(16), .seconds(32), .seconds(60)]
    /// The failed reads in a row, by session, and the read again each waits for.
    @ObservationIgnored private var failedReads: [String: (count: Int, timer: Task<Void, Never>?)] = [:]

    /// The one read again each transcript waits for when the window the hub
    /// gave a reconnecting machine ends (`ReadFault.reconnectingFor`). Its
    /// own, apart from the backoff: `machineOnline` reads at once over it.
    @ObservationIgnored private var lapses: [String: Task<Void, Never>] = [:]
    /// The same for the older page a reconnecting machine held back
    /// (`olderFault`): asked for again once, when the hub's window ends.
    @ObservationIgnored private var olderLapses: [String: Task<Void, Never>] = [:]

    /// An older page that found its machine reconnecting is asked for again
    /// when the hub's window for it ends (`readOlderPage`), so the strip
    /// before the first row never says "reconnecting" past that window.
    private func lapseOlder(_ transcript: SessionTranscript) {
        let id = transcript.id
        olderLapses.removeValue(forKey: id)?.cancel()
        guard let window = transcript.olderFault?.reconnectingFor else { return }
        log.notice("older page of \(id.prefix(8), privacy: .public) asked again when its machine's reconnecting window lapses in \(String(describing: window), privacy: .public)")
        olderLapses[id] = Task { [weak self] in
            try? await Task.sleep(for: window)
            guard !Task.isCancelled, let self else { return }
            olderLapses[id] = nil
            guard transcripts[id] === transcript, transcript.olderFault?.reconnecting == true else { return }
            readOlderPage(id)
        }
    }

    /// A read failed: over rows held they stay (`behind`), else the pane says
    /// why (`fault`). One the hub failed, or Local Network privacy stopped,
    /// is read again on `readAgain`; one that found the machine offline
    /// waits for `machineOnline`, unless the
    /// hub already lists that machine online: then the machine list has
    /// nothing more to say, and its every change would read again at once,
    /// so it is read again on `readAgain` too. One that found it reconnecting
    /// is also read again once, when the hub's window for it ends: the hub
    /// then says whether it is back or offline, and "reconnecting" never
    /// outlasts the window.
    private func readFailed(_ transcript: SessionTranscript, _ fault: ReadFault) {
        transcript.loading = false
        transcript.catchingUp = false
        if hubRows(transcript).isEmpty { transcript.fault = fault } else { transcript.behind = fault }
        let listedOnline = fault.reason == .offline
            && hub.fleet.machines.contains { $0.machineId == fault.machineId && $0.status == "online" }
        let id = transcript.id
        if let window = fault.reconnectingFor, !listedOnline {
            lapses[id]?.cancel()
            log.notice("read \(id.prefix(8), privacy: .public) again when its machine's reconnecting window lapses in \(String(describing: window), privacy: .public)")
            lapses[id] = Task { [weak self] in
                try? await Task.sleep(for: window)
                guard !Task.isCancelled, let self else { return }
                lapses[id] = nil
                guard let held = transcripts[id], !held.loading, (held.behind ?? held.fault)?.reconnecting == true else { return }
                read(id, because: .reconnectLapsed)
            }
        }
        guard fault.reason != .offline || listedOnline else { return }
        var failed = failedReads[id] ?? (count: 0, timer: nil)
        failed.timer?.cancel()
        let wait = Self.readAgain[min(failed.count, Self.readAgain.count - 1)]
        failed.count += 1
        log.notice("read \(id.prefix(8), privacy: .public) again in \(String(describing: wait), privacy: .public) (failure \(failed.count))")
        failed.timer = Task { [weak self] in
            try? await Task.sleep(for: wait)
            guard !Task.isCancelled, let self else { return }
            failedReads[id]?.timer = nil
            guard let held = transcripts[id], !held.loading, (held.behind ?? held.fault) != nil else { return }
            read(id, because: .backoff)
        }
        failedReads[id] = failed
    }

    /// Peek and delegate readers share the same counted transcript watches as
    /// tabs, so one reader closing never drops another reader's stream.
    public func watchDelegate(_ id: String) { if !id.hasPrefix("run:") { _ = open(id) } }
    public func unwatchDelegate(_ id: String) { close(id) }
    public func setPeeked(_ id: String?) {
        guard peeked != id else { return }
        if let peeked { close(peeked) }
        peeked = id
        if let id, !id.hasPrefix("run:") { _ = open(id) }
    }

    /// Why the newest page is read: each caller of `read` names itself.
    public enum ReadCause: String, Sendable {
        /// The session was opened: nothing is held yet.
        case open
        /// The hub read the stored transcript again (a transcript `reset` event).
        case transcriptReset
        /// The hub's ring could not replay the gap (`stream.reset`).
        case streamReset
        /// The replay came back broken `Ledger.maxResyncAttempts` times.
        case backlogBroken
        /// A message of the session's stream could not be read (`Ledger.unreadable`).
        case streamUnreadable
        /// The reader asked again after a failed read.
        case retry
        /// The socket came back: the stream it carried is followed again from a read.
        case reconnect
        /// A moved session started, and its first read found nothing.
        case moveStarted
        /// The machine the last read found offline is online again.
        case machineOnline
        /// The last read failed while the hub answered: read again on `readAgain`.
        case backoff
        /// The app is active again after Local Network privacy refused the last read.
        case active
        /// The window the hub gave a reconnecting machine ended with it still away.
        case reconnectLapsed

        /// The hub asked for it: the rows drawn are behind what it holds, a
        /// catch-up the dock says. Every other read catches up quietly.
        var catchesUp: Bool { self == .transcriptReset || self == .streamReset || self == .backlogBroken || self == .streamUnreadable }
    }

    /// Reads the newest page, and makes it what the transcript holds.
    ///
    /// A READ AGAIN KEEPS WHAT THE READER HAS LOADED. Over rows already held
    /// (a reset, a resync, a retry, the socket or the machine back), the
    /// newest page is joined to them where they meet: the rows held before
    /// it stay as they are, the page replaces the rest. When the page does
    /// not reach back to the rows held (more arrived than a page holds), the
    /// pages before it are read until one does. When the hub read the stored
    /// transcript again (`historyChanged`), the rows held may read otherwise
    /// now, and every page back to the first row held is read again in their
    /// place. Either way the rows the reader stands among keep their ids, so
    /// the view keeps its place by them. Nothing held, the page is the
    /// transcript (an open).
    ///
    /// A read that fails over rows held leaves them (`behind`); with nothing
    /// held, the pane says why (`fault`). Either is read again on the next
    /// event that can answer it: the machine online again (`machineOnline`),
    /// the socket back (`reconnected`), the backoff after a read the hub
    /// failed (`readAgain`), or the reader's retry.
    ///
    /// Only a read the hub asked for is a catch-up the dock says
    /// (`catchingUp`); the rest catch up quietly.
    public func read(_ id: String, because cause: ReadCause) {
        // An ask no session stands behind has no transcript to read.
        guard let transcript = transcripts[id], let client = hub.client, hub.rowlessAsks(id).isEmpty else { return }
        log.info("read \(id.prefix(8), privacy: .public) because \(cause.rawValue, privacy: .public)")
        readers[id]?.cancel()
        failedReads[id]?.timer?.cancel()
        failedReads[id]?.timer = nil
        lapses.removeValue(forKey: id)?.cancel()
        if cause == .transcriptReset { transcript.historyChanged = true }
        // A read that replaces one the hub asked for still answers the hub.
        if cause.catchesUp { transcript.catchingUp = true }
        transcript.loading = true
        transcript.fault = nil
        transcript.missing = false
        hub.ledger.beginRead(id)
        hub.tasks.refresh(id)
        hub.workItems.load(parent: id)
        readers[id] = Task { [weak self] in
            guard let self else { return }
            do {
                #if DEBUG
                // The simulator cannot enforce Local Network privacy: every read
                // fails as a refused path fails it, with -1009 for the hub's
                // address (`LocalNetwork.denied` injects the path's word).
                if LocalNetwork.debugDenied, let address = hub.address {
                    throw URLError(.notConnectedToInternet, userInfo: [NSURLErrorFailingURLErrorKey: address])
                }
                #endif
                let page: Components.Schemas.TranscriptPage
                switch try await Self.page(client, id: id, before: nil) {
                case let .read(read): page = read
                case .missing:
                    guard !Task.isCancelled else { return }
                    transcript.loading = false
                    transcript.catchingUp = false
                    transcript.missing = true
                    return
                case let .away(machine, window): throw Fault(offline(machine, reconnectingFor: window))
                }
                guard !Task.isCancelled else { return }
                // The pages back to the rows held, when the newest does not reach them.
                var read = page.blocks
                var branches = page.branches
                var cursor = page.cursor
                var pages = 1
                var older: ReadFault?
                var whole: Joined
                while true {
                    let held = hubRows(transcript)
                    if let joined = Self.join(held: held, heldCursor: transcript.cursor, read: read, readCursor: cursor,
                                              historyChanged: transcript.historyChanged) {
                        whole = joined
                        break
                    }
                    // Short of the rows held, with nothing before: the read is the whole conversation.
                    guard let before = cursor else {
                        whole = Joined(blocks: read, cursor: nil, kept: 0)
                        break
                    }
                    let answer: PageAnswer
                    do { answer = try await Self.page(client, id: id, before: before) } catch {
                        guard !Task.isCancelled else { return }
                        older = await Self.fault(error)
                        whole = Joined(blocks: read, cursor: cursor, kept: 0)
                        break
                    }
                    guard !Task.isCancelled else { return }
                    switch answer {
                    case let .read(previous):
                        let have = Set(read.map(\.id))
                        read.insert(contentsOf: previous.blocks.filter { !have.contains($0.id) }, at: 0)
                        let listed = Set(branches.map(\.value1.toolUseId))
                        branches.insert(contentsOf: previous.branches.filter { !listed.contains($0.value1.toolUseId) }, at: 0)
                        cursor = previous.cursor
                        pages += 1
                        continue
                    case .missing:
                        older = .failed("The hub no longer holds the page before these")
                    case let .away(machine, window):
                        older = offline(machine, reconnectingFor: window)
                    }
                    // The rows held before the page that could not be read cannot be joined: the
                    // read stands alone, and the strip before its first row says why.
                    whole = Joined(blocks: read, cursor: cursor, kept: 0)
                    break
                }
                // The branches of the rows kept stay; the read's replace theirs.
                if whole.kept > 0 {
                    let listed = Set(branches.map(\.value1.toolUseId))
                    branches = transcript.branches.filter { !listed.contains($0.value1.toolUseId) } + branches
                }
                // What this client was told about its own actions stays under what the hub holds.
                transcript.blocks = whole.blocks + (notes[id] ?? [])
                transcript.branches = branches
                transcript.queued = page.queued ?? []
                settleLocal(transcript)
                transcript.tail = page.tail
                transcript.facts = page.facts
                transcript.location = page._where
                hub.tasks.refresh(id)
                transcript.cursor = whole.cursor
                // A new newest page is a new read: an older page still on its
                // way was asked of the transcript as it stood before, and so
                // was what was said of one. The view asks for older pages
                // itself, a page at a time, as its reader nears the first rows
                // held (`readOlderPage`).
                transcript.reads += 1
                transcript.olderFault = older
                lapseOlder(transcript)
                transcript.historyChanged = false
                transcript.behind = nil
                transcript.toasted = nil
                failedReads[id]?.timer?.cancel()
                failedReads[id] = nil
                transcript.blockRevision += 1
                transcript.historyRevision += 1
                transcript.loading = false
                transcript.catchingUp = false
                // The history page and its seq are one atomic view of the hub.
                // Resume after it, including events that arrived during the read.
                if let seq = page.seq { hub.ledger.adoptPage(id, seq: seq) }
                log.info("page adopted for \(id, privacy: .public): \(page.blocks.count) blocks at seq \(page.seq ?? -1), \(pages) page(s) read, \(whole.kept) held rows kept, \(whole.blocks.count) rows, older \(whole.cursor ?? "none", privacy: .public)")
            } catch {
                guard !Task.isCancelled else { return }
                let fault = await Self.fault(error)
                guard !Task.isCancelled else { return }
                // The error as it came, for the log only: the reader is told `fault.message`.
                log.error("transcript read for \(id.prefix(8), privacy: .public) (\(self.hubRows(transcript).isEmpty ? "nothing held" : "rows kept", privacy: .public)): \(fault.message, privacy: .public); \(String(describing: error).prefix(500), privacy: .public)")
                readFailed(transcript, fault)
            }
        }
    }

    /// The rows a transcript holds that the hub built: its own error lines left out (`notes`).
    private func hubRows(_ transcript: SessionTranscript) -> [Components.Schemas.TranscriptBlock] {
        guard let mine = notes[transcript.id], !mine.isEmpty else { return transcript.blocks }
        let ids = Set(mine.map(\.id))
        return transcript.blocks.filter { !ids.contains($0.id) }
    }

    /// The rows held and the pages read, as one transcript: its rows, the
    /// cursor before them, and how many of the rows held were kept as they were.
    struct Joined {
        let blocks: [Components.Schemas.TranscriptBlock]
        let cursor: String?
        let kept: Int
    }

    /// The pages read (`read`, oldest first, older pages before `readCursor`)
    /// joined to the rows held, once they reach them; nil while they fall
    /// short and the pages before must be read too. The hub's row ids are
    /// its stored entries' own, the same on every read, so rows meet by id.
    ///
    /// - Nothing held: the read is the transcript.
    /// - The read holds the first row held: it covers every row held, and
    ///   replaces them (a row the hub no longer has goes with them).
    /// - The history changed: the read must reach the first row held, so
    ///   every row held is read again; until then, nil.
    /// - The read's first row is held: the rows held before it stay, the
    ///   read replaces the rest, and the cursor before them is the one held.
    static func join(held: [Components.Schemas.TranscriptBlock], heldCursor: String?, read: [Components.Schemas.TranscriptBlock],
                     readCursor: String?, historyChanged: Bool) -> Joined? {
        guard let first = held.first else { return Joined(blocks: read, cursor: readCursor, kept: 0) }
        if read.contains(where: { $0.id == first.id }) { return Joined(blocks: read, cursor: readCursor, kept: 0) }
        guard !historyChanged, let start = read.first, let at = held.firstIndex(where: { $0.id == start.id }) else { return nil }
        return Joined(blocks: Array(held[..<at]) + read, cursor: heldCursor, kept: at)
    }

    private struct Fault: Error, Sendable { let fault: ReadFault; init(_ fault: ReadFault) { self.fault = fault } }

    /// What a read that threw says: the hub's refusal as `page` read it, else what the failure means (`ReadFault.thrown`).
    private nonisolated static func fault(_ error: any Error) async -> ReadFault {
        if let fault = (error as? Fault)?.fault { return fault }
        return await .thrown(error)
    }

    /// What a page read came back with.
    private enum PageAnswer: Sendable {
        case read(Components.Schemas.TranscriptPage)
        /// The hub answered 404.
        case missing
        /// The machine holding the transcript is not connected (a 503 naming
        /// it), and, while the hub says it is on its way back, for how long.
        case away(String, reconnectingFor: Duration?)
    }

    /// One page of a transcript, fetched and decoded off the main thread:
    /// the generated client's calls run on their caller's actor, and a long
    /// session's page decoded there held the main thread while it opened.
    /// `before`: the cursor of an older page (TRANSCRIPT_OLDER_PAGE, 250 rows).
    @concurrent
    private nonisolated static func page(_ client: Client, id: String, before: String?) async throws -> PageAnswer {
        let output = if let before {
            try await client.getApiInstancesByIdTranscript(path: .init(id: id), query: .init(limit: "250", before: before))
        } else {
            try await client.getApiInstancesByIdTranscript(path: .init(id: id))
        }
        switch output {
        case let .ok(ok): return .read(try ok.body.json)
        case .notFound: return .missing
        case let .undocumented(statusCode, payload):
            if statusCode == 503, let away = payload.headerFields.first(where: { $0.name.canonicalName == "x-cawco-machine" })?.value {
                // Reconnecting is a window: `X-Cawco-Machine-State: reconnecting`
                // with its `Retry-After`, the seconds left of it (hub `reconnectingFor`).
                let state = payload.headerFields.first { $0.name.canonicalName == "x-cawco-machine-state" }?.value
                let left = payload.headerFields.first { $0.name.canonicalName == "retry-after" }?.value
                let window = state == "reconnecting" ? left.flatMap { Int($0) }.map { Duration.seconds($0) } : nil
                return .away(away, reconnectingFor: window)
            }
            throw Fault(await refused(payload.body, status: statusCode))
        case let .conflict(answer): throw Fault(await refused(try? answer.body.plainText, status: 409))
        case let .internalServerError(answer): throw Fault(await refused(try? answer.body.plainText, status: 500))
        case let .gatewayTimeout(answer): throw Fault(await refused(try? answer.body.plainText, status: 504))
        case .unprocessableContent: throw Fault(.failed("The hub refused the read"))
        }
    }

    /// A refusal as one sentence of why (`Wire.reason`): the hub's words when
    /// they are one, its status when they are not or could not be read.
    private nonisolated static func refused(_ body: HTTPBody?, status: Int) async -> ReadFault {
        let data = if let body { try? await Data(collecting: body, upTo: 1_000_000) } else { Data?.none }
        return .failed(Wire.reason(data ?? Data(), status: status))
    }

    /// A 503 naming a machine is the hub saying that machine is not connected;
    /// `reconnectingFor`, that it heard from it moments ago, and how long it
    /// reads it so (client.svelte.ts `readFaultOf`).
    private func offline(_ machine: String, reconnectingFor window: Duration?) -> ReadFault {
        let host = hub.fleet.machineName(machine)
        return window != nil
            ? ReadFault(reason: .offline, machineId: machine, message: "\(host) is reconnecting, so its stored transcript is read once it's back", reconnectingFor: window)
            : ReadFault(reason: .offline, machineId: machine, message: "\(host) is offline, so its stored transcript can't be read right now")
    }

    /// The one page older than what a transcript holds, put in front of it
    /// (client.svelte.ts `readOlderPage`). Asked for by whoever is reading
    /// near the first rows held, never ahead of a reader. One page is out at
    /// a time: asked while one is, it does nothing, and nothing is asked once
    /// the conversation's start is in hand or while the newest page is itself
    /// being read. An answer that comes back to a transcript read again
    /// since, or to a cursor that has moved, is dropped. A page that could
    /// not be read leaves the cursor where it was and says why
    /// (`olderFault`): asking again asks for the same page.
    public func readOlderPage(_ id: String) {
        guard let transcript = transcripts[id], !transcript.loadingOlder, let before = transcript.cursor,
              !transcript.loading, let client = hub.client else { return }
        let reads = transcript.reads
        transcript.loadingOlder = true
        transcript.olderFault = nil
        olderLapses.removeValue(forKey: id)?.cancel()
        log.info("older page asked for \(id, privacy: .public) before \(before, privacy: .public)")
        Task { [weak self] in
            let answer: Result<PageAnswer, any Error>
            do {
                let read = try await Self.page(client, id: id, before: before)
                answer = .success(read)
            } catch { answer = .failure(error) }
            // The read is over before anything it brought is written: whoever
            // its page wakes may ask for the next one in that same pass.
            transcript.loadingOlder = false
            guard let self, transcripts[id] === transcript, transcript.reads == reads, transcript.cursor == before else { return }
            switch answer {
            case let .success(.read(page)):
                let held = Set(transcript.blocks.map(\.id))
                transcript.blocks.insert(contentsOf: page.blocks.filter { !held.contains($0.id) }, at: 0)
                let branched = Set(transcript.branches.map(\.value1.toolUseId))
                transcript.branches.insert(contentsOf: page.branches.filter { !branched.contains($0.value1.toolUseId) }, at: 0)
                transcript.cursor = page.cursor
                transcript.blockRevision += 1
                transcript.historyRevision += 1
                log.info("older page read for \(id, privacy: .public): \(page.blocks.count) blocks, older \(page.cursor ?? "none", privacy: .public)")
                return
            case .success(.missing):
                transcript.olderFault = .failed("The hub no longer holds the page before these")
            case let .success(.away(machine, window)):
                transcript.olderFault = offline(machine, reconnectingFor: window)
            case let .failure(error):
                transcript.olderFault = await Self.fault(error)
            }
            log.error("older page for \(id, privacy: .public) failed: \(transcript.olderFault?.message ?? "", privacy: .public)")
            lapseOlder(transcript)
        }
    }

    func apply(_ id: String, data: Data) {
        guard let transcript = transcripts[id] else { return }
        do {
            // Routing is structural; content is decoded only as generated types.
            guard let frame = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  frame["kind"] as? String == "transcript",
                  let events = frame["events"] as? [[String: Any]] else { return }
            log.debug("events for \(id.prefix(8), privacy: .public): \(events.map { $0["type"] as? String ?? "?" }.joined(separator: ","), privacy: .public)")
            for event in events {
                switch event["type"] as? String {
                case "block.append", "block.insert", "block.update":
                    transcript.blockRevision += 1
                    guard let raw = event["block"] else { continue }
                    let block: Components.Schemas.TranscriptBlock = try decode(raw)
                    hub.tasks.ingest(id, toolName: block.metadata?.toolName)
                    if let parent = block.parentToolUseId {
                        if let at = transcript.branches.firstIndex(where: { $0.value1.toolUseId == parent }) {
                            upsert(block, into: &transcript.branches[at].value2.blocks, event: event)
                        }
                    } else { upsert(block, into: &transcript.blocks, event: event) }
                case "block.remove":
                    transcript.blockRevision += 1
                    let removed = event["id"] as? String
                    transcript.blocks.removeAll { $0.id == removed }
                    transcript.queued.removeAll { $0.id == removed }
                case "queue":
                    transcript.blockRevision += 1
                    transcript.queued = try decode(event["blocks"] ?? [])
                case "tail":
                    if let patch = event["tail"] as? [String: Any], let tail = transcript.tail {
                        transcript.tail = try merge(tail, with: patch)
                    }
                case "tail.append":
                    transcript.tail?.streaming += event["streaming"] as? String ?? ""
                    transcript.tail?.thinkingStream += event["thinking"] as? String ?? ""
                case "facts":
                    if let patch = event["facts"] as? [String: Any], let facts = transcript.facts {
                        transcript.facts = try merge(facts, with: patch)
                    }
                case "branch":
                    transcript.blockRevision += 1
                    if let raw = event["branch"] as? [String: Any] {
                        let branch: Components.Schemas.TranscriptBranch = try decode(raw)
                        let at = transcript.branches.firstIndex { $0.value1.toolUseId == branch.toolUseId }
                        var complete = raw
                        complete["blocks"] = try at.map { try JSONSerialization.jsonObject(with: Wire.encoder().encode(transcript.branches[$0].value2.blocks)) } ?? []
                        let pageBranch: Components.Schemas.TranscriptPageBranch = try decode(complete)
                        if let at { transcript.branches[at] = pageBranch } else { transcript.branches.append(pageBranch) }
                    }
                case "reset": read(id, because: .transcriptReset); return
                default: break
                }
            }
            settleLocal(transcript)
        } catch {
            // The rows may now miss what the event said: read again, on the backoff.
            log.error("transcript event unreadable: \(String(describing: error).prefix(500), privacy: .public)")
            readFailed(transcript, .failed("An update from the hub couldn't be read"))
        }
    }

    private func upsert(_ block: Components.Schemas.TranscriptBlock, into blocks: inout [Components.Schemas.TranscriptBlock], event: [String: Any]) {
        if let at = blocks.firstIndex(where: { $0.id == block.id }) { blocks[at] = block; return }
        if event["type"] as? String == "block.insert" {
            let after = event["after"] as? String
            let at = after.flatMap { id in blocks.firstIndex { $0.id == id } }.map { $0 + 1 } ?? 0
            blocks.insert(block, at: at)
        } else { blocks.append(block) }
    }

    private func decode<T: Decodable>(_ raw: Any) throws -> T {
        try Wire.decoder().decode(T.self, from: JSONSerialization.data(withJSONObject: raw))
    }

    private func merge<T: Codable>(_ value: T, with patch: [String: Any]) throws -> T {
        var raw = try JSONSerialization.jsonObject(with: Wire.encoder().encode(value)) as! [String: Any]
        for (key, value) in patch { raw[key] = value }
        return try decode(raw)
    }

    /// A user turn (core `SendPayload`): its words, and what it carries
    /// beside them, images as base64 with no `data:` prefix, texts the
    /// reader attached or pasted at length, and files the hub already holds,
    /// by its reference. `replaces` names the send this one stands in for
    /// (a withdrawn queued send), which the hub then retires.
    public func steer(_ row: InstanceRow, text: String, images: [(mediaType: String, data: Data)] = [], texts: [(name: String, content: String)] = [],
                      files: [SentFile] = [], replaces: String? = nil) -> String {
        steer(sessionId: row.id, machineId: row.machineId, text: text, images: images, texts: texts, files: files, replaces: replaces)
    }

    /// The same send by the session's ids, for a sender that has no row: a
    /// push's Reply, which knows the session and its machine from the push.
    public func steer(sessionId: String, machineId: String, text: String, images: [(mediaType: String, data: Data)] = [],
                      texts: [(name: String, content: String)] = [], files: [SentFile] = [], replaces: String? = nil) -> String {
        let uuid = UUID().uuidString.lowercased()
        var message: [String: any Sendable] = [
            "type": "user", "uuid": uuid, "origin": ["kind": "human"],
            "message": ["role": "user", "content": text],
        ]
        if let replaces { message["replaces"] = replaces }
        var body: [String: any Sendable] = ["instanceId": sessionId, "message": message]
        if !images.isEmpty {
            body["images"] = images.map { ["mediaType": $0.mediaType, "data": $0.data.base64EncodedString()] as [String: any Sendable] }
        }
        if !texts.isEmpty || !files.isEmpty {
            body["attachments"] = texts.map { ["kind": "text", "name": $0.name, "content": $0.content] as [String: any Sendable] }
                + files.map { ["kind": "file", "name": $0.name, "mediaType": $0.mediaType, "size": $0.size, "ref": $0.ref] as [String: any Sendable] }
        }
        let payload = try! OpenAPIValueContainer(unvalidatedValue: body)
        let id = submitSend(uuid, sessionId: sessionId, machineId: machineId, payload: payload)
        // Drawn at once (client.svelte.ts `noteSendSubmitted`), unless it never
        // left this device: then its words are still the composer's. A send in
        // place of another draws nothing of its own: the one it replaces stands
        // until the hub retires it as it takes this one.
        if replaces == nil, let transcript = transcripts[sessionId], hub.ledger.commands[id]?.undelivered != true {
            let sources = images.map { LocalSend.Image(src: "data:\($0.mediaType);base64,\($0.data.base64EncodedString())", mediaType: $0.mediaType) }
            transcript.local.append(LocalSend(id: uuid, text: text, timestamp: ISO8601DateFormatter().string(from: Date()),
                                              texts: texts.map { SentText(name: $0.name, content: $0.content) }, files: files, images: sources))
            outbox[uuid] = (sessionId, machineId, payload)
            transcript.blockRevision += 1
        }
        return id
    }

    /// A send's command, under the message's own uuid (client.svelte.ts: the
    /// command id is the uuid), so the hub's record of it and the row this
    /// device drew are one id. Should the hub never take it, its row says so.
    private func submitSend(_ uuid: String, sessionId: String, machineId: String, payload: OpenAPIValueContainer) -> String {
        hub.ledger.submit(kind: .send, sessionId: sessionId, machineId: machineId, payload: payload, settlesAt: .accepted,
                          effects: Ledger.Effects(settled: { [weak self] stage, reason in
                              guard stage == .failed else { return }
                              self?.unreached(uuid, in: sessionId, reason: reason)
                          }), commandId: uuid)
    }

    /// What each send drawn from this device went out with, by its uuid,
    /// until the hub has its row: what Send again sends (client.svelte.ts `sendOutbox`).
    @ObservationIgnored private var outbox: [String: (sessionId: String, machineId: String, payload: OpenAPIValueContainer)] = [:]

    /// The hub never took the send `uuid`: its row says it did not go, and why (client.svelte.ts `markUnreached`).
    private func unreached(_ uuid: String, in sessionId: String, reason: String?) {
        guard let transcript = transcripts[sessionId], let at = transcript.local.firstIndex(where: { $0.id == uuid }) else { return }
        transcript.local[at].state = .unreached
        transcript.local[at].reason = reason ?? "The hub never took it."
        transcript.blockRevision += 1
    }

    /// Sends again a message the hub never took, under its own uuid, on its
    /// own row, which goes back to sending where it stands (client.svelte.ts
    /// `retrySend`). A hub that did take it after all answers with its record,
    /// and hands the machine nothing twice.
    public func resend(_ uuid: String) {
        guard let held = outbox[uuid], let transcript = transcripts[held.sessionId],
              let at = transcript.local.firstIndex(where: { $0.id == uuid }) else { return }
        transcript.local[at].state = .sending
        transcript.local[at].reason = nil
        transcript.blockRevision += 1
        _ = submitSend(uuid, sessionId: held.sessionId, machineId: held.machineId, payload: held.payload)
    }

    /// The sends this device drew that the hub's rows now hold go: the hub's
    /// row for each stands in its place, under the same id.
    private func settleLocal(_ transcript: SessionTranscript) {
        guard !transcript.local.isEmpty else { return }
        var held = Set(transcript.queued.map(\.id))
        held.formUnion(transcript.blocks.lazy.map(\.id))
        let taken = transcript.local.filter { held.contains($0.id) }.map(\.id)
        guard !taken.isEmpty else { return }
        transcript.local.removeAll { held.contains($0.id) }
        for uuid in taken { outbox[uuid] = nil }
        transcript.blockRevision += 1
    }

    /// Takes back a send the session has not read yet (`send.withdraw`,
    /// client.svelte.ts `replaceQueued`): the hub asks the harness to recall
    /// it, and its `applied` acknowledgement says what it found, `withdrawn`
    /// or `started` (`Ledger.Command.outcome`). Only Claude's harness recalls
    /// a single pending send. `settled` hears the command's last word.
    /// `send.withdraw`, by its wire name: the generator spells a dotted case its own way.
    private static let withdrawKind = Components.Schemas.CommandKind(rawValue: "send.withdraw")!

    public func withdraw(_ row: InstanceRow, sendId: String, settled: @escaping (Ledger.Stage, String?) -> Void) -> String {
        hub.ledger.submit(kind: Self.withdrawKind, sessionId: row.id, machineId: row.machineId,
                          payload: try! OpenAPIValueContainer(unvalidatedValue: ["sendId": sendId] as [String: any Sendable]),
                          settlesAt: .applied, effects: Ledger.Effects(settled: settled))
    }

    public func stop(_ row: InstanceRow) -> String {
        hub.ledger.submit(kind: .interrupt, sessionId: row.id, machineId: row.machineId,
            payload: try! OpenAPIValueContainer(unvalidatedValue: ["instanceId": row.id, "method": "interrupt", "args": [] as [String]] as [String: any Sendable]), settlesAt: .applied)
    }
}
