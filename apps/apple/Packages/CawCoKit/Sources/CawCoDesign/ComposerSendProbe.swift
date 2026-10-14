#if DEBUG
import CawCoCore
import OSLog
import UIKit

/// `-send-probe-busy` (scripts/probe-ios-busy-send.ts): on a session kept
/// busy, Send and Return queue the message at once, with and without a
/// canvas, and the action box's glyph draws on every frame throughout.
/// Every line in the Probe log as `send …`:
///
/// - (a) words typed and the box pressed: the field clears and the hub's
///   queue holds them pending within 1 s;
/// - (b) the same with Return (the field's own insert of a line break);
/// - (c) the same with a drawn canvas folded to its chip: the message
///   carries `canvas.excalidraw`, `canvas.md` and one picture;
/// - (d) a canvas whose sync socket never answers (CanvasWeb's DEBUG gate,
///   `hang`): Send sends nothing, says why over the field in the canvas's
///   not-connected sentence, and keeps the words and the canvas;
/// - the glyph's face and whether it draws, sampled every display frame
///   from the first press to the last; each change is logged as
///   `send glyph <face> drawn|BLANK`, and no frame is blank.
@MainActor
enum SendProbe {
    private static var armed = ProcessInfo.processInfo.arguments.contains("-send-probe-busy")
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Probe")

    static func arm(_ composer: ComposerView) {
        guard armed else { return }
        armed = false
        Task { await run(composer) }
    }

    fileprivate static func say(_ line: String) {
        log.notice("send \(line, privacy: .public)")
    }

    private static func check(_ name: String, _ ok: Bool, _ detail: String) {
        say("\(ok ? "PASS" : "FAIL") \(name): \(detail)")
    }

    private static func wait(_ seconds: Double) async {
        try? await Task.sleep(for: .seconds(seconds))
    }

    /// Waits up to `seconds` for `ok`, looking every 20 ms; answers whether it came true.
    private static func until(_ seconds: Double, _ ok: () -> Bool) async -> Bool {
        let end = ContinuousClock.now + .seconds(seconds)
        while !ok() {
            guard ContinuousClock.now < end else { return false }
            try? await Task.sleep(for: .milliseconds(20))
        }
        return true
    }

    private static func ms(_ duration: Duration?) -> String {
        guard let duration else { return "never" }
        return "\(duration.components.seconds * 1000 + duration.components.attoseconds / 1_000_000_000_000_000) ms"
    }

    private static func run(_ composer: ComposerView) async {
        guard await until(30, { composer.window != nil && composer.binding?.canvasHost != nil }),
              let binding = composer.binding, let host = binding.canvasHost else {
            return say("FAIL probe: the composer never stood in a window with a canvas host")
        }
        // Busy: the pane's box is Stop while the turn runs.
        let busy = await until(60) { binding.action == .stop }
        check("the session is busy: the box is Stop with the field empty", busy, "the pane's action \(binding.action)")
        guard busy else { return say("done") }
        await wait(1)

        var carried: [(words: String, names: [String])] = []
        let send = binding.onSend
        binding.onSend = { words, attachments in
            carried.append((words, attachments.map(\.name)))
            send(words, attachments)
        }
        defer { binding.onSend = send }
        let watch = GlyphWatch(composer)
        watch.start()
        let stamp = Int(Date().timeIntervalSince1970) % 100_000

        // (a) Send, (b) Return.
        _ = await queues("(a) Send", composer, binding, words: "Busy send (a) \(stamp)") { composer.probePressSend() }
        await wait(1.5)
        _ = await queues("(b) Return", composer, binding, words: "Busy send (b) \(stamp)") {
            composer.probeReturn()
            return true
        }
        await wait(1.5)

        // (c) A drawn canvas, folded to its chip, then Send.
        composer.openCanvas()
        let opened = await until(30) { composer.canvasRoom?.up == true && composer.canvasRoom?.moving == false && binding.canvas != nil }
        let page = composer.canvasRoom?.web
        // The hub draws an agent's elements through a page showing the canvas: one synced with it.
        let ready = await until(20) { page?.connected == true && page?.link == .synced }
        let drew = if opened, let canvas = binding.canvas, ready {
            await CanvasProbe.drawAsAgent(on: canvas.id, in: binding.sessionId, hub: host.hub)
        } else {
            false
        }
        guard drew, let web = page else {
            check("(c) a canvas opens and takes a drawing", false,
                  "opened \(opened), its page \(page != nil), joined \(ready), drawn through the hub \(drew), note \(composer.probeCanvasNote ?? "none")")
            watch.stop()
            return say("done")
        }
        let held = await until(20) { web.link == .synced && (web.drawn ?? 0) > 0 }
        check("(c) the canvas holds a drawing, synced", held, "link \(web.link.rawValue), the page's doc holds \(web.drawn.map(String.init) ?? "nothing")")
        composer.foldCanvas()
        let chipped = await until(20) { composer.canvasRoom?.up == false && composer.canvasChip != nil }
        await wait(1.5)
        let sends = carried.count
        let queued = await queues("(c) Send with the canvas as its chip", composer, binding, words: "Busy send (c) \(stamp)") { composer.probePressSend() }
        let names = carried.count > sends ? carried[sends].names : []
        check("(c) the message carries canvas.excalidraw, canvas.md and one picture, and the canvas leaves the draft",
              chipped && queued && names.contains("canvas.excalidraw") && names.contains("canvas.md")
                  && names.filter { $0.hasSuffix(".png") }.count == 1 && binding.canvas == nil,
              "chip \(chipped), carrying \(names.joined(separator: ", ")); the draft holds a canvas \(binding.canvas != nil)")
        await wait(1.5)

        // (d) A canvas whose sync socket never answers.
        CanvasDebug.gateStart = "hang"
        composer.openCanvas()
        let hung = await until(30) { composer.canvasRoom?.up == true && composer.canvasRoom?.moving == false && composer.canvasRoom?.web?.connected == true }
        CanvasDebug.gateStart = "open"
        guard hung, let stuck = composer.canvasRoom?.web else {
            check("(d) a canvas with its sync hung opens", false, "note \(composer.probeCanvasNote ?? "none")")
            watch.stop()
            return say("done")
        }
        let words = "Busy send (d) \(stamp)"
        composer.probeType(words)
        await wait(0.5)
        let before = carried.count
        let pressed = ContinuousClock.now
        let took = composer.probePressSend()
        let spun = await until(1) { composer.probeCanvasWorking }
        let settled = await until(30) { !composer.probeCanvasWorking }
        let after = ContinuousClock.now - pressed
        await wait(0.5)
        let glyph = composer.probeGlyph
        check("(d) the sync never answered: Send sends nothing, says why over the field, keeps the words and the canvas, and the box is Send again",
              took && spun && settled && carried.count == before && composer.probeCanvasNote == CanvasSendRefusal.notConnected.sentence
                  && composer.field.text == words && binding.canvas != nil && glyph.face == "send" && glyph.drawn,
              "pressed \(took), read under way \(spun), said after \(ms(after)); link \(stuck.link.rawValue), synced ever \(stuck.hasSynced); sends \(carried.count - before); over the field: \(composer.probeCanvasNote ?? "none"); the field: \"\(composer.field.text ?? "")\"; the draft holds a canvas \(binding.canvas != nil); the box \(glyph.face) \(glyph.drawn ? "drawn" : "BLANK")")
        watch.stop()

        check("the box's glyph draws on every frame from the first press to the last",
              watch.blanks.isEmpty && watch.frames > 0,
              "\(watch.frames) frames, faces \(watch.faces.joined(separator: " → ")); blank frames \(watch.blanks.count)\(watch.blanks.first.map { ", the first: \($0)" } ?? "")")
        composer.removeCanvas()
        composer.probeType("")
        say("done")
    }

    /// Words typed, then `press`: the field clears and the hub's queue holds
    /// them pending (the newest of what the reader sent here, queued), each
    /// within 1 s of the press. Answers whether both did.
    private static func queues(_ label: String, _ composer: ComposerView, _ binding: SessionComposerBinding, words: String,
                               press: () -> Bool) async -> Bool {
        composer.probeType(words)
        await wait(0.5)
        let face = composer.probeGlyph
        let pressed = ContinuousClock.now
        let took = press()
        var cleared: Duration?
        var queued: Duration?
        _ = await until(5) {
            let now = ContinuousClock.now - pressed
            if cleared == nil, composer.field.text.isEmpty { cleared = now }
            if queued == nil, binding.recall().contains(where: { $0.text.contains(words) && $0.queued }) { queued = now }
            return cleared != nil && queued != nil
        }
        let ok = took && (cleared ?? .seconds(99)) <= .seconds(1) && (queued ?? .seconds(99)) <= .seconds(1)
        check("\(label): queued within 1 s and the field clears",
              ok, "the box was \(face.face) \(face.drawn ? "drawn" : "BLANK") and took the press \(took); the field cleared after \(ms(cleared)); the hub's queue held it pending after \(ms(queued)); over the field: \(composer.probeCanvasNote ?? "none")")
        return ok
    }
}

/// The action box's glyph on every display frame: its face and whether it
/// draws, each change logged; the frames it drew nothing.
@MainActor
private final class GlyphWatch: NSObject {
    private let composer: ComposerView
    private var link: CADisplayLink?
    private var last = ""
    private(set) var frames = 0
    private(set) var faces: [String] = []
    private(set) var blanks: [String] = []

    init(_ composer: ComposerView) {
        self.composer = composer
    }

    func start() {
        let link = CADisplayLink(target: self, selector: #selector(tick))
        link.add(to: .main, forMode: .common)
        self.link = link
    }

    func stop() {
        link?.invalidate()
        link = nil
    }

    @objc private func tick() {
        let now = composer.probeGlyph
        frames += 1
        let said = "\(now.face) \(now.drawn ? "drawn" : "BLANK")"
        if said != last {
            last = said
            faces.append(said)
            SendProbe.say("glyph \(said): \(now.detail)")
        }
        if !now.drawn { blanks.append("\(now.face): \(now.detail)") }
    }
}
#endif
