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
@MainActor
enum CanvasProbe {
    private enum Pass { case pen, wheel, still }
    private static var pass: Pass? = {
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("-canvas-probe") { return .pen }
        if arguments.contains("-canvas-probe-wheel") { return .wheel }
        if arguments.contains("-canvas-probe-still") { return .still }
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
        case .pen: await penPass(composer, window)
        case .wheel: await wheelPass(composer, window)
        case .still: await stillPass(composer)
        }
        say("done")
    }

    /// Where the script's finger goes down: the pill's middle, in the window's points.
    private static func askForSwipe(_ composer: ComposerView, _ window: UIWindow) {
        let pill = composer.pill.convert(composer.pill.bounds, to: window)
        say("swipe at \(Int(pill.midX.rounded())),\(Int(pill.midY.rounded()))")
    }

    // MARK: The pencil's pass

    private static func penPass(_ composer: ComposerView, _ window: UIWindow) async {
        guard let binding = composer.binding, let host = binding.canvasHost else { return }
        askForSwipe(composer, window)
        let opened = await until(30) { composer.canvasRoom?.up == true && composer.canvasRoom?.moving == false }
        check("a pencil's swipe up on the pill opens the canvas", opened && composer.wheel == nil,
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
        guard let canvas = binding.canvas, await draw(on: canvas.id, in: binding.sessionId, hub: host.hub) else {
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
    private static func draw(on id: String, in instanceId: String, hub: HubConnection) async -> Bool {
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
        check("Reduce Motion: the canvas fades in, nothing travels", opening.travelled == 0 && opening.keys.subtracting(["opacity"]).isEmpty && opening.faded,
              "animated keys \(opening.keys.sorted()), the shape grown from the first look \(opening.travelled == 0), faded \(opening.faded)")
        _ = await until(5) { !room.moving }
        composer.foldCanvas()
        let folding = await watch(room, for: Motion.durFade + 0.1)
        check("Reduce Motion: Done fades it out, nothing travels", folding.travelled == 0 && folding.keys.subtracting(["opacity"]).isEmpty,
              "animated keys \(folding.keys.sorted()), the shape held still \(folding.travelled == 0)")
        _ = await until(10) { room.up == false }
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
