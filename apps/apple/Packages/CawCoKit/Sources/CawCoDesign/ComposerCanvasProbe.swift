#if DEBUG
import CawCoCore
import OSLog
import UIKit

/// A simulator pass's canvas probe (scripts/probe-ios-composer-canvas.ts),
/// every line in the Probe log as `canvas …`. Three passes, one launch each:
///
/// - `-canvas-probe -cawcoProbePencil`: the composer says where its pill is
///   and waits; the script drags a finger up from there, which the canvas's
///   recognizer takes as a pencil for this run. Then, read off the canvas
///   itself: the grown shape's growth paints over `durGrow` from one start,
///   the cut on the page following the shape at every paint (one clock);
///   standing, the page fills the column above the field, and the field
///   takes the keys; the grab's drag settles at 40% of the column and at the
///   column less the field, one spring each; Dock stands the canvas's own
///   view on the artifact panel's page, and its page's Undock brings it
///   back over the field; Send with nothing drawn sends
///   nothing and says so; drawn on (as the agent draws, through the hub),
///   Done leaves a chip whose picture is the export's PNG, byte for byte;
///   Send carries `canvas.excalidraw`, `canvas.md` and one image.
/// - `-canvas-probe-wheel`: the same drag without the pencil stand-in brings
///   the wheel up, never the canvas; the recognizers' touch types.
/// - `-canvas-probe-still`, with Reduce Motion on: Draw opens the canvas and
///   Done folds it with opacity animations only, nothing travelling.
/// - `-canvas-probe-sync`: the canvas page's sync socket goes through a gate
///   (CanvasWeb's DEBUG `gate`), refused from the start: the canvas shows
///   its refusal, a pen stroke adds nothing and Send says it isn't
///   connected; opened, a stroke is counted and synced and Send carries it;
///   on a new canvas, cut after a stroke, the next stroke stays on the page
///   and Send says the drawing hasn't reached the hub. Then the rail's
///   Remove folds that drawn canvas back into the pill over durGrowExit,
///   no chip left, the draft out of the message, the session still
///   listing it.
@MainActor
enum CanvasProbe {
    private enum Pass { case pen, draw, wheel, still, sync }
    private static var pass: Pass? = {
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("-canvas-probe") { return .pen }
        if arguments.contains("-canvas-probe-draw") { return .draw }
        if arguments.contains("-canvas-probe-wheel") { return .wheel }
        if arguments.contains("-canvas-probe-still") { return .still }
        if arguments.contains("-canvas-probe-sync") { return .sync }
        return nil
    }()

    private static let log = Logger(subsystem: "dev.cawco.app", category: "Probe")

    static func arm(_ composer: ComposerView) {
        guard let armed = pass else { return }
        pass = nil
        Task { await run(composer, armed) }
    }

    private static func say(_ line: String) {
        log.notice("canvas \(line, privacy: .public)")
    }

    private static func check(_ name: String, _ ok: Bool, _ detail: String) {
        say("\(ok ? "PASS" : "FAIL") \(name): \(detail)")
    }

    private static func wait(_ seconds: Double) async {
        try? await Task.sleep(for: .seconds(seconds))
    }

    /// Waits up to `seconds` for `ok`; answers whether it came true.
    private static func until(_ seconds: Double, _ ok: () -> Bool) async -> Bool {
        var waited = 0.0
        while !ok() {
            guard waited < seconds else { return false }
            await wait(0.1)
            waited += 0.1
        }
        return true
    }

    private static func f(_ value: Double, _ places: Int = 1) -> String {
        String(format: "%.\(places)f", value)
    }

    private static func run(_ composer: ComposerView, _ pass: Pass) async {
        guard await until(30, { composer.window != nil && composer.binding?.canvasHost != nil }), let window = composer.window else {
            return say("FAIL probe: the composer never stood in a window with a canvas host")
        }
        await wait(2)
        let types = composer.probeTouchTypes
        say("begin \(pass) window \(f(window.bounds.width, 0))x\(f(window.bounds.height, 0)), wheel takes \(types.wheel), pen takes \(types.pen) (direct \(UITouch.TouchType.direct.rawValue), pencil \(UITouch.TouchType.pencil.rawValue))")
        switch pass {
        case .pen: await penPass(composer, window, draw: false)
        case .draw: await penPass(composer, window, draw: true)
        case .wheel: await wheelPass(composer, window)
        case .still: await stillPass(composer)
        case .sync: await syncPass(composer)
        }
        say("done")
    }

    /// Where the script's finger goes down: the pill's middle, in the window's points.
    private static func askForSwipe(_ composer: ComposerView, _ window: UIWindow) {
        let pill = composer.pill.convert(composer.pill.bounds, to: window)
        // What could stand over the pill: every window of the scene and what each presents.
        for shown in window.windowScene?.windows ?? [] where !shown.isHidden {
            var chain: [String] = []
            var presented = shown.rootViewController?.presentedViewController
            while let next = presented {
                chain.append("\(type(of: next))")
                presented = next.presentedViewController
            }
            say("window \(type(of: shown)) level \(f(shown.windowLevel.rawValue, 0)) root \(shown.rootViewController.map { "\(type(of: $0))" } ?? "none") presents \(chain.isEmpty ? "nothing" : chain.joined(separator: " > "))")
        }
        say("swipe at \(Int(pill.midX.rounded())),\(Int(pill.midY.rounded()))")
    }

    // MARK: The pencil's pass

    /// The canvas's pass: opened by the pencil's swipe, or (`draw`) by Attach → Draw, then read.
    private static func penPass(_ composer: ComposerView, _ window: UIWindow, draw: Bool) async {
        guard let binding = composer.binding, let host = binding.canvasHost else { return }
        if draw {
            // Attach's menu holds Draw beside the session's files and photos.
            let menu = composer.probeAttachMenu
            check("Attach is a menu with Draw", menu.last == ComposerView.drawAction, "Attach offers \(menu.joined(separator: " | "))")
            composer.openCanvas()
        } else {
            askForSwipe(composer, window)
        }
        let opened = await until(30) { composer.canvasRoom?.up == true && composer.canvasRoom?.moving == false }
        check(draw ? "Attach → Draw opens the canvas" : "a pencil's swipe up on the pill opens the canvas", opened && composer.wheel == nil,
              "canvas up \(composer.canvasRoom?.up == true), wheel up \(composer.wheel != nil), note \(composer.probeCanvasNote ?? "none")")
        guard opened, let room = composer.canvasRoom, let sizes = room.sizes, let column = host.column() else { return }

        // The growth: one run of paints over durGrow, the cut on the page where the shape is at each.
        let paints = room.probePaints
        if let first = paints.first, let last = paints.last {
            let ms = (last.time - first.time) * 1000
            let frame = 1000.0 / Double(window.screen.maximumFramesPerSecond)
            check("the shape grows over durGrow (\(Int(Motion.durGrow * 1000))ms) from one start",
                  first.open < 0.2 && last.open == 1 && abs(ms - Motion.durGrow * 1000) <= 2 * frame + 1,
                  "\(paints.count) paints, first at growth \(f(first.open, 3)), last \(f(last.open, 3)), \(f(ms))ms apart")
            let worst = paints.map { abs($0.cutTop - $0.shapeTop) }.max() ?? .nan
            let grows = zip(paints, paints.dropFirst()).allSatisfy { $1.open >= $0.open && $1.shapeTop <= $0.shapeTop + 0.01 }
            check("the page is cut to the shape at every paint (one clock)", worst <= 0.5 && grows,
                  "largest gap between the cut's top and the shape's: \(f(worst, 2))pt; the shape only rises: \(grows)")
        } else {
            check("the shape grows over durGrow from one start", false, "no paints were recorded")
        }

        // Standing: the page over the column, the field below it, writable.
        let page = room.stage.convert(room.stage.bounds, to: nil)
        let pill = composer.pill.convert(composer.pill.bounds, to: nil)
        let ceiling = column.minY + Space.space3
        check("the page fills the column above the field",
              abs(page.minY - ceiling - 1) <= 1 && page.maxY <= pill.minY + 0.5 && abs(sizes.height - sizes.max) < 0.5,
              "page \(f(page.minY))–\(f(page.maxY)), column top \(f(column.minY)) + \(f(Space.space3)), pill top \(f(pill.minY)), height \(f(sizes.height)) of \(f(sizes.min))–\(f(sizes.max))")
        let took = composer.field.becomeFirstResponder()
        await wait(0.8)
        check("the field below the canvas takes the keys", took && composer.field.isFirstResponder && room.up,
              "first responder \(composer.field.isFirstResponder), canvas still up \(room.up)")
        composer.field.resignFirstResponder()
        await wait(0.8)

        // The grab: 40% of the column, then the column less the field, each on one spring.
        for (label, height, speed) in [("40% of the column", 0.0, -900.0), ("the column less the field", 5000.0, 900.0)] {
            guard let before = room.sizes else { break }
            let settles = room.probeSettles
            room.probeDrag(to: height, speed: speed)
            _ = await until(3) { !room.probeSpringRunning }
            await wait(0.2)
            let want = speed < 0 ? before.min : before.max
            let rested = room.probeRested ?? .nan
            check("the grab settles at \(label)",
                  abs(rested - want) < 0.5 && abs((room.sizes?.height ?? .nan) - want) < 0.5 && room.probeSettles == settles + 1,
                  "rested at \(f(rested)), wanted \(f(want)) (\(f(want / Double(column.height) * 100))% of the column), \(room.probeSettles - settles) spring")
        }

        // Dock: the same view flies into the panel and stands on its page; the page's Undock brings it back.
        room.web?.onDock()
        let docked = await until(15) { room.docked && !room.moving && composer.canvasChip != nil }
        await wait(0.8)
        let panel = host.panel(binding.canvas?.id ?? "")
        let standing = room.stage.convert(room.stage.bounds, to: nil)
        let gap = panel.map { max(abs($0.shown.minX - standing.minX), abs($0.shown.minY - standing.minY),
                                  abs($0.shown.width - standing.width), abs($0.shown.height - standing.height)) } ?? .nan
        check("Dock stands the canvas's own view on the panel's page, its chip in the composer",
              docked && gap <= 1 && binding.canvas?.docked == true,
              "docked \(room.docked), the view against the panel's page \(f(gap, 2))pt off, chip \(composer.canvasChip != nil), note \(composer.probeCanvasNote ?? "none")")
        room.web?.onUndock()
        let back = await until(15) { room.up && !room.moving && binding.canvas?.docked == false }
        await wait(1.0)
        check("the page's Undock brings it back over the field and closes the panel",
              back && host.panel(binding.canvas?.id ?? "") == nil && composer.canvasChip == nil,
              "over the field \(room.up), panel still showing it \(host.panel(binding.canvas?.id ?? "") != nil), note \(composer.probeCanvasNote ?? "none")")

        // Send with nothing drawn: nothing goes, and it says so.
        var carried: [[String]] = []
        let send = binding.onSend
        binding.onSend = { words, attachments in
            carried.append(attachments.map(\.name))
            send(words, attachments)
        }
        composer.returned()
        _ = await until(15) { !composer.probeCanvasWorking }
        let empty = composer.probeCanvasNote ?? ""
        check("Send with nothing drawn sends nothing and says so", carried.isEmpty && empty.hasPrefix("Nothing is drawn on the canvas"),
              "sends \(carried.count), over the field: \(empty)")

        // Drawn on, as the agent draws: through the hub, onto this canvas.
        guard let canvas = binding.canvas, await drawAsAgent(on: canvas.id, in: binding.sessionId, hub: host.hub) else {
            return check("the canvas takes a drawing", false, "the hub refused the drawing")
        }
        var count = 0
        for _ in 0 ..< 40 where count == 0 {
            count = (try? await host.hub.exportCanvas(canvas.id, name: canvas.name).drawn) ?? 0
            if count == 0 { await wait(0.5) }
        }
        check("the canvas takes a drawing", count > 0, "\(count) elements drawn")

        // Done: the chip, its picture the export's PNG.
        composer.foldCanvas()
        let chipped = await until(20) {
            guard let chip = composer.canvasChip, case let .image(_, _, data) = chip.attachment else { return false }
            return room.up == false && !data.isEmpty
        }
        let export = try? await host.hub.exportCanvas(canvas.id, name: canvas.name)
        var chipBytes = Data()
        if let chip = composer.canvasChip, case let .image(_, _, data) = chip.attachment { chipBytes = data }
        check("Done leaves a chip whose picture is the export's PNG", chipped && export?.png != nil && chipBytes == export?.png,
              "chip \(composer.canvasChip?.attachment.name ?? "none"), its picture \(chipBytes.count) bytes, the export's \(export?.png?.count ?? 0) bytes, same \(chipBytes == export?.png)")

        // Send: the words, the file, the outline and the picture.
        composer.probeType("The canvas probe's drawing")
        composer.returned()
        let went = await until(20) { binding.canvas == nil && !composer.probeCanvasWorking }
        let names = carried.last ?? []
        check("Send carries canvas.excalidraw, canvas.md and one image",
              went && names.contains("canvas.excalidraw") && names.contains("canvas.md") && names.filter { $0.hasSuffix(".png") }.count == 1,
              "sent \(carried.count) message, carrying \(names.joined(separator: ", ")); the draft holds a canvas \(binding.canvas != nil)")
        say("sent canvas \(canvas.id) to \(binding.sessionId)")
        binding.onSend = send
    }

    /// Draws a rectangle with a word in it on the canvas, as `artifact_update` does.
    private static func drawAsAgent(on id: String, in instanceId: String, hub: HubConnection) async -> Bool {
        guard let address = hub.address else { return false }
        var request = URLRequest(url: address.appending(path: "api/instances/\(instanceId)/artifacts/\(id)"))
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = ["elements": [[
            "type": "rectangle", "x": 40, "y": 40, "width": 220, "height": 120,
            "label": ["text": "canvas probe"],
        ]]]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        guard let (data, response) = try? await URLSession.shared.data(for: request) else { return false }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status != 200 { say("the hub answered the drawing \(status): \(String(decoding: data, as: UTF8.self).prefix(300))") }
        return status == 200
    }

    // MARK: The sync's pass

    /// A pen stroke on the page: the page's doc's count after it, or why it couldn't be drawn.
    private static func stroke(_ web: CanvasWeb) async -> (count: Int, error: String?) {
        do {
            return (try await web.probeStroke(), nil)
        } catch {
            return (-1, error.localizedDescription)
        }
    }

    /// The canvas the composer opens, standing, its page bound to its doc (it has said its count).
    private static func openedPage(_ composer: ComposerView, after old: CanvasWeb?) async -> CanvasWeb? {
        composer.openCanvas()
        guard await until(30, { composer.canvasRoom?.up == true && composer.canvasRoom?.moving == false }),
              let web = composer.canvasRoom?.web, web !== old,
              await until(20, { web.connected && web.drawn != nil }) else { return nil }
        return web
    }

    private static func syncPass(_ composer: ComposerView) async {
        guard let binding = composer.binding, let host = binding.canvasHost else { return }
        var carried: [[String]] = []
        let send = binding.onSend
        binding.onSend = { words, attachments in
            carried.append(attachments.map(\.name))
            send(words, attachments)
        }
        defer { binding.onSend = send }

        // (a) The sync socket refused from the start.
        guard let refused = await openedPage(composer, after: nil) else {
            return check("the sync pass opens a canvas", false, "note \(composer.probeCanvasNote ?? "none")")
        }
        await wait(1)
        let line = await refused.probeRefusal() ?? "none"
        let none = await stroke(refused)
        await wait(0.5)
        check("(a) the sync socket refused: the canvas shows the refusal and a pen stroke adds 0 elements",
              refused.refused && line.hasPrefix("The canvas isn't connected to the hub, so what you draw wouldn't reach the agent.")
                  && none.count == 0 && refused.drawn == 0,
              "link \(refused.link.rawValue) (\(refused.linkError ?? "no error")), refused \(refused.refused), over the grid \"\(line)\", the page's doc holds \(none.count) after the stroke\(none.error.map { " (\($0))" } ?? ""), cawco:drawn said \(refused.drawn.map(String.init) ?? "nothing")")
        composer.returned()
        _ = await until(15) { !composer.probeCanvasWorking }
        check("(a) Send on the refused canvas sends nothing and says it isn't connected",
              carried.isEmpty && composer.probeCanvasNote == CanvasSendRefusal.notConnected.sentence,
              "sends \(carried.count), over the field: \(composer.probeCanvasNote ?? "none")")

        // (b) The sync up: a stroke is counted, synced, and Send carries it.
        refused.probeSync("open")
        let synced = await until(10) { refused.link == .synced && !refused.refused }
        let line2 = await refused.probeRefusal()
        let drawn = await stroke(refused)
        let counted = await until(5) { refused.drawn == drawn.count && refused.link == .synced }
        let hubDrawn = (try? await host.hub.exportCanvas(refused.page.id, name: refused.page.name).drawn) ?? -1
        check("(b) the sync up: a stroke is logged cawco:drawn count=N and cawco:sync synced, and the hub holds it",
              synced && line2 == nil && drawn.count > 0 && counted && hubDrawn == drawn.count,
              "link \(refused.link.rawValue), refusal \(line2 ?? "gone"), the page's doc holds \(drawn.count)\(drawn.error.map { " (\($0))" } ?? ""), cawco:drawn said \(refused.drawn.map(String.init) ?? "nothing"), the hub's export \(hubDrawn)")
        composer.returned()
        let went = await until(20) { binding.canvas == nil && !composer.probeCanvasWorking }
        let names = carried.last ?? []
        check("(b) Send carries canvas.excalidraw, canvas.md and one image",
              went && carried.count == 1 && names.contains("canvas.excalidraw") && names.contains("canvas.md")
                  && names.filter { $0.hasSuffix(".png") }.count == 1,
              "sent \(carried.count) message, carrying \(names.joined(separator: ", ")); over the field: \(composer.probeCanvasNote ?? "none")")

        // (c) A new canvas, its sync cut after a stroke: the next stroke stays on the page.
        guard let cut = await openedPage(composer, after: refused) else {
            return check("(c) a second canvas opens", false, "note \(composer.probeCanvasNote ?? "none")")
        }
        cut.probeSync("open")
        _ = await until(10) { cut.link == .synced }
        let first = await stroke(cut)
        let reached = await until(5) {
            cut.drawn == first.count
        }
        var hubFirst = -1
        for _ in 0 ..< 20 where hubFirst != first.count {
            hubFirst = (try? await host.hub.exportCanvas(cut.page.id, name: cut.page.name).drawn) ?? -1
            if hubFirst != first.count { await wait(0.25) }
        }
        cut.probeSync("cut")
        let lost = await until(5) { cut.link == .lost }
        let second = await stroke(cut)
        let sends = carried.count
        composer.returned()
        _ = await until(20) { !composer.probeCanvasWorking }
        let hubAfter = (try? await host.hub.exportCanvas(cut.page.id, name: cut.page.name).drawn) ?? -1
        check("(c) the sync cut after a stroke: Send refuses, the drawing hasn't reached the hub",
              reached && first.count > 0 && hubFirst == first.count && lost && second.count == first.count + 1
                  && carried.count == sends && composer.probeCanvasNote == CanvasSendRefusal.notReached.sentence,
              "first stroke: page \(first.count), hub \(hubFirst); cut: link \(cut.link.rawValue) (\(cut.linkError ?? "no error")); second stroke: page \(second.count)\(second.error.map { " (\($0))" } ?? ""), hub \(hubAfter); sends \(carried.count - sends), over the field: \(composer.probeCanvasNote ?? "none")")

        // Remove, the rail's (`cawco:remove`, posted by the page): the drawn
        // canvas folds back into the pill over durGrowExit, one run, and
        // leaves the message with no chip; the session still lists it.
        guard let room = composer.canvasRoom, room.up, !room.moving else {
            return check("Remove: the drawn canvas stands over the field", false, "canvas up \(composer.canvasRoom?.up == true)")
        }
        let removed = cut.page.id
        cut.probePost("cawco:remove")
        let down = await until(10) { composer.canvasRoom == nil }
        let paints = room.probePaints
        var ran = "no paints were recorded"
        var oneRun = false
        if let firstPaint = paints.first, let lastPaint = paints.last {
            let ms = (lastPaint.time - firstPaint.time) * 1000
            let frame = 1000.0 / Double(composer.window?.screen.maximumFramesPerSecond ?? 60)
            let folds = zip(paints, paints.dropFirst()).allSatisfy { $1.open <= $0.open + 0.001 }
            oneRun = firstPaint.open > 0.8 && lastPaint.open == 0 && folds && abs(ms - Motion.durGrowExit * 1000) <= 2 * frame + 1
            ran = "\(paints.count) paints, growth \(f(firstPaint.open, 3)) → \(f(lastPaint.open, 3)), only folding \(folds), \(f(ms))ms against durGrowExit \(Int(Motion.durGrowExit * 1000))ms"
        }
        let listed = await listed(removed, in: binding.sessionId, hub: host.hub)
        check("Remove folds the drawn canvas back into the pill over durGrowExit, leaves no chip, takes the draft out of the message, and the session still lists it",
              down && oneRun && composer.canvasChip == nil && binding.canvas == nil && listed,
              "canvas down \(down), \(ran); chip \(composer.canvasChip != nil), the draft holds a canvas \(binding.canvas != nil), listed \(listed)")
    }

    /// Whether the hub lists `id` among the session's artifacts (`GET /api/instances/:id/artifacts`).
    private static func listed(_ id: String, in instanceId: String, hub: HubConnection) async -> Bool {
        guard let address = hub.address,
              let (data, _) = try? await URLSession.shared.data(from: address.appending(path: "api/instances/\(instanceId)/artifacts")),
              let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return false }
        return rows.contains { $0["id"] as? String == id }
    }

    // MARK: The finger's pass

    private static func wheelPass(_ composer: ComposerView, _ window: UIWindow) async {
        let types = composer.probeTouchTypes
        let pencil = UITouch.TouchType.pencil.rawValue, direct = UITouch.TouchType.direct.rawValue
        check("the wheel's swipe takes a finger only, the canvas's a pencil only",
              types.wheel == [direct] && types.pen == [pencil], "wheel \(types.wheel), canvas \(types.pen)")
        askForSwipe(composer, window)
        let up = await until(20) { composer.wheel != nil }
        await wait(0.6)
        check("a finger's swipe up on the pill brings the wheel, not the canvas", up && composer.canvasRoom?.up != true,
              "wheel up \(composer.wheel != nil), canvas up \(composer.canvasRoom?.up == true)")
        composer.wheel?.dismiss()
    }

    // MARK: Reduce Motion

    private static func stillPass(_ composer: ComposerView) async {
        guard UIAccessibility.isReduceMotionEnabled else {
            return check("Reduce Motion is on for this pass", false, "UIAccessibility.isReduceMotionEnabled is false")
        }
        composer.openCanvas()
        guard await until(20, { composer.canvasRoom?.up == true }), let room = composer.canvasRoom else {
            return check("Draw opens the canvas with Reduce Motion", false, "note \(composer.probeCanvasNote ?? "none")")
        }
        let opening = await watch(room, for: Motion.durFade + 0.1)
        check("Reduce Motion: the canvas fades in, nothing travels", opening.travelled == 0 && travels(opening.keys).isEmpty && opening.faded,
              "animated keys \(opening.keys.sorted()), travelling \(travels(opening.keys).sorted()), the shape grown from the first look \(opening.travelled == 0), faded \(opening.faded)")
        _ = await until(5) { !room.moving }
        composer.foldCanvas()
        let folding = await watch(room, for: Motion.durFade + 0.1)
        check("Reduce Motion: Done fades it out, nothing travels", folding.travelled == 0 && travels(folding.keys).isEmpty,
              "animated keys \(folding.keys.sorted()), travelling \(travels(folding.keys).sorted()), the shape held still \(folding.travelled == 0)")
        _ = await until(10) { room.up == false }
    }

    /// The keys that move a layer (`position.y`, `transform.scale` and the like
    /// too). Anything else, opacity or UIKit's own bookkeeping
    /// (`UIViewPropertyAnimator`'s `uiFractionalProgress`), travels nowhere.
    private static func travels(_ keys: Set<String>) -> Set<String> {
        keys.filter { key in ["position", "bounds", "transform", "frame"].contains { key == $0 || key.hasPrefix("\($0).") } }
    }

    /// The animations on the page and the shape for `seconds`: their keys,
    /// whether the shape's outline or the page's box moved, and whether an opacity ran.
    private static func watch(_ room: CanvasRoom, for seconds: Double) async -> (keys: Set<String>, travelled: Int, faded: Bool) {
        var keys = Set<String>()
        var travelled = 0
        var faded = false
        let frame = room.stage.frame
        let open = room.probeHalo?.open
        var waited = 0.0
        while waited < seconds {
            for layer in [room.stage.layer, room.probeHalo?.layer].compactMap(\.self) {
                for key in layer.animationKeys() ?? [] {
                    let path = (layer.animation(forKey: key) as? CAPropertyAnimation)?.keyPath ?? key
                    keys.insert(path)
                    if path == "opacity" { faded = true }
                }
            }
            if room.stage.frame != frame || (room.probeHalo.map { $0.open != open && $0.open != 0 } ?? false) { travelled += 1 }
            await wait(1.0 / 60)
            waited += 1.0 / 60
        }
        return (keys, travelled, faded)
    }
}
#endif
