#if DEBUG
import CawCoCore
import CawCoDesign
import OSLog
import UIKit

/// `-parity-probe` (DEBUG only): the web's 685a5ea2 and 464cb194 in the app,
/// against a scratch fleet (scripts/probe-kit/specs/ios-parity.ts, which
/// names its ids in `-parity-probe-ids`). Each flow runs through the
/// function its control runs, and what stands on screen is read off the
/// views into the ParityProbe log:
///
/// 1. a memory curator run's proposal, parked under its own id, opens from
///    its push's fields in the session that made it, its card in that
///    session's composer; a pane opened on the proposal's own id moves
///    there; Approve in that composer answers it, and Caw's panel lists it
///    no longer;
/// 2. in the rail that stands (its column beside the page over the rail's
///    900pt breakpoint, else the sheet the bar's toggle brings over the
///    page), the session's row carries the session's menu, and Delete
///    transcript asks under that row, in the rail, then deletes;
/// 3. a machine's keychain unlock opens under its row, and the hub's refusal
///    of an install stands under that row too, nothing presented over the page;
///
/// and, before the fleet is waited on, what needs none of it:
///
/// 4. the artifact panel's head for a component canvas, its page holding
///    picks, at four head widths: each control standing (its key, its form,
///    its frame) by the web's `standing()`, and what More holds;
/// 5. that canvas's view: its menu's entries, and the message `deliver`
///    hands the page for each entry pressed and on the page's ready;
/// 6. eb42f1374: the round Caw button's rim, and Caw's panel's section rule
///    in light and dark; the web's 111bec1fb: the phone's standing glass's
///    outline the same hairline in.
@MainActor
enum ParityProbe {
    static let on = ProcessInfo.processInfo.arguments.contains("-parity-probe")
    static let log = Logger(subsystem: "dev.cawco.app", category: "ParityProbe")

    static func start(shell: ShellController, home: HomeModel) {
        Task { @MainActor [weak shell] in
            guard let shell else { return }
            await run(shell, home: home)
            log.notice("parity-probe: done")
        }
    }

    /// `-parity-probe-ids proposal=<p-…>,origin=<session>,del=<session>,ghost=<machine>`.
    private static var ids: [String: String] {
        let pairs = (UserDefaults.standard.string(forKey: "parity-probe-ids") ?? "").split(separator: ",").compactMap { pair -> (String, String)? in
            let parts = pair.split(separator: "=", maxSplits: 1).map(String.init)
            return parts.count == 2 ? (parts[0], parts[1]) : nil
        }
        return Dictionary(pairs, uniquingKeysWith: { first, _ in first })
    }

    private static func wait(_ seconds: Double) async {
        try? await Task.sleep(for: .seconds(seconds))
    }

    @discardableResult
    private static func until(_ seconds: Double = 15, _ done: () -> Bool) async -> Bool {
        let end = ContinuousClock.now + .seconds(seconds)
        while !done() {
            if ContinuousClock.now > end { return false }
            await wait(0.1)
        }
        return true
    }

    private static func views<T: UIView>(_: T.Type, in root: UIView) -> [T] {
        [root as? T].compactMap(\.self) + root.subviews.flatMap { views(T.self, in: $0) }
    }

    /// What is presented over the page, if anything: nothing, for what is answered in place.
    private static func modal(_ shell: ShellController) -> String {
        shell.presentedViewController.map { String(describing: type(of: $0)) } ?? "none"
    }

    /// A menu as its words: a titled submenu as `Title[…]`, an untitled one
    /// inline, a checked entry with `*`, entries `, `, sections ` | `.
    private static func words(_ elements: [UIMenuElement]) -> String {
        func said(_ element: UIMenuElement) -> String {
            if let menu = element as? UIMenu {
                let inner = menu.children.map(said).joined(separator: ", ")
                return menu.title.isEmpty ? inner : "\(menu.title)[\(inner)]"
            }
            return (element as? UIAction).map { $0.title + ($0.state == .on ? "*" : "") } ?? "?"
        }
        return elements.map(said).joined(separator: " | ")
    }

    /// A message as JSON, its keys sorted.
    private static func json(_ message: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: message, options: [.sortedKeys, .withoutEscapingSlashes]) else { return "?" }
        return String(decoding: data, as: UTF8.self)
    }

    /// Sorted widths as runs: `300-310,415`.
    private static func spans(_ widths: [Int]) -> String {
        var runs: [(Int, Int)] = []
        for width in widths {
            if let last = runs.last, last.1 + 1 == width { runs[runs.count - 1].1 = width } else { runs.append((width, width)) }
        }
        return runs.map { $0 == $1 ? "\($0)" : "\($0)-\($1)" }.joined(separator: ",")
    }

    /// The head widths read: a phone's drawer, a phone's full width, a narrow split and a desk's card.
    private static let headWidths = [330.0, 390, 523, 720]

    /// 4 and 5: a preview controller of its own, at each head width, then its canvas view's entries pressed.
    private static func head(_ shell: ShellController) async {
        let session = "parity-probe-head"
        for key in ["cawco-canvas-view:", "cawco-preview-mode:", "cawco-preview-inspect:"] {
            UserDefaults.standard.removeObject(forKey: key + session)
        }
        let preview = PreviewController(hub: shell.hub, instanceId: session)
        shell.addChild(preview)
        preview.view.isHidden = true
        shell.view.addSubview(preview.view)
        preview.didMove(toParent: shell)
        defer {
            preview.willMove(toParent: nil)
            preview.view.removeFromSuperview()
            preview.removeFromParent()
        }
        preview.probeAs(component: true, sends: true)
        for width in headWidths {
            // The head stands `space-2` in from the card's sides.
            preview.view.frame = CGRect(x: 0, y: 0, width: width + 2 * Space.space2, height: 640)
            var standing = ""
            for _ in 0 ..< 4 {
                preview.view.setNeedsLayout()
                preview.view.layoutIfNeeded()
                let now = preview.probeStanding()
                if now == standing { break }
                standing = now
            }
            log.notice("head standing [\(Int(width), privacy: .public)] \(standing, privacy: .public)")
            log.notice("head more menu [\(Int(width), privacy: .public)] \(words(preview.probeOverflow), privacy: .public)")
            await wait(0.1)
        }

        // Every 1pt from 300 to 800, each layout laid out twice more, for a
        // component canvas and a plain preview, with and without Send picks,
        // at 0 open pins and at 2: what stands must not move between frames,
        // nor a control a narrower head stands go from a wider one. What
        // stands at each width is logged as runs, to read against the web's.
        for component in [true, false] {
            for sends in [true, false] {
                preview.probeAs(component: component, sends: sends)
                for open in [0, 2] {
                    sweep(preview, "\(component ? "canvas" : "preview") \(sends ? "sends" : "quiet") open \(open)", open: open)
                }
            }
        }
        preview.probeOpen = nil
        preview.probeAs(component: true, sends: true)

        let view = preview.probeCanvasView
        log.notice("canvas view button [head] label=\(view.button.accessibilityLabel ?? "-", privacy: .public) glyph=\(Glyph.dataLayers.rawValue, privacy: .public) menu=\(view.button.showsMenuAsPrimaryAction ? "primary" : "no", privacy: .public)")
        log.notice("canvas view menu [fresh] \(words(view.entries()), privacy: .public)")
        var sent: [String] = []
        preview.probeDelivered = { message in
            if message["type"] as? String == "cawco:canvas-view" { sent.append(json(message)) }
        }
        // Each entry, as its press runs it; Reduced motion twice, on then off.
        for choice in CanvasViewControl.choices + [.motion] {
            sent = []
            view.pick(choice)
            log.notice("canvas view chose [\(choice.words, privacy: .public)] sent=\(sent.joined(separator: " + "), privacy: .public)")
        }
        log.notice("canvas view menu [chosen] \(words(view.entries()), privacy: .public)")
        log.notice("canvas view kept [session] \(UserDefaults.standard.string(forKey: "cawco-canvas-view:\(session)") ?? "-", privacy: .public)")
        sent = []
        preview.probeReady()
        log.notice("canvas view ready [page] sent=\(sent.joined(separator: " + "), privacy: .public)")
        preview.probeDelivered = nil
    }

    /// One configuration's sweep, every 1pt from 300 to 800: the widths whose
    /// layout moved between frames, where a wider head lost a control, and
    /// what stood at each width, each widened form marked `:whole`, as runs
    /// of widths.
    private static func sweep(_ preview: PreviewController, _ config: String, open: Int) {
        preview.probeOpen = open
        var unsettled: [Int] = []
        var drops: [String] = []
        var runs: [(from: Int, to: Int, dressed: Set<String>)] = []
        var narrower: Set<String>?
        for width in 300 ... 800 {
            preview.view.frame = CGRect(x: 0, y: 0, width: Double(width) + 2 * Space.space2, height: 640)
            preview.view.setNeedsLayout()
            preview.view.layoutIfNeeded()
            let first = preview.probeStood
            var lines: [String] = []
            for _ in 0 ..< 2 {
                preview.view.setNeedsLayout()
                preview.view.layoutIfNeeded()
                lines.append(preview.probeStanding())
            }
            let stood = preview.probeStood
            if first != stood || lines[0] != lines[1] { unsettled.append(width) }
            if let narrower, !narrower.isSubset(of: stood) {
                drops.append("\(width):\(narrower.subtracting(stood).sorted().joined(separator: "+"))")
            }
            narrower = stood
            let dressed = preview.probeDressed
            if let last = runs.last, last.dressed == dressed {
                runs[runs.count - 1].to = width
            } else {
                runs.append((width, width, dressed))
            }
        }
        log.notice("head sweep [\(config, privacy: .public)] widths=300-800 unsettled=\(unsettled.isEmpty ? "none" : spans(unsettled), privacy: .public) drops=\(drops.isEmpty ? "none" : drops.joined(separator: ","), privacy: .public)")
        let stands = runs.map { "\($0.from)-\($0.to)=\($0.dressed.sorted().joined(separator: "+"))" }
        log.notice("head stands [\(config, privacy: .public)] \(stands.joined(separator: " "), privacy: .public)")
    }

    /// 6: the Caw button laid out at its own size, round and the phone's
    /// standing glass, and the section rule in each scheme.
    private static func caw() {
        for standing in [false, true] {
            let button = NeedsCawButton(standing: standing)
            let side = button.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
            button.frame = CGRect(origin: .zero, size: side)
            button.setNeedsLayout()
            button.layoutIfNeeded()
            log.notice("caw rim [\(standing ? "standing" : "round", privacy: .public)] \(button.probeRim, privacy: .public)")
        }
        for style in [UIUserInterfaceStyle.light, .dark] {
            log.notice("caw rule [\(style == .dark ? "dark" : "light", privacy: .public)] \(CawPanelProbe.sectionRule(style), privacy: .public)")
        }
    }

    private static func run(_ shell: ShellController, home: HomeModel) async {
        await head(shell)
        caw()
        let hub = shell.hub
        let ids = ids
        guard let proposal = ids["proposal"], let origin = ids["origin"], let ghost = ids["ghost"] else {
            log.error("parity-probe: -parity-probe-ids names proposal, origin and ghost")
            return
        }
        log.notice("parity-probe: waiting for the fleet")
        guard await until(120, {
            hub.needs.parked[proposal] != nil && hub.fleet.byId[origin] != nil
                && hub.fleet.machines.contains { $0.machineId == ghost }
                && ids["del"].map { hub.fleet.byId[$0] != nil } ?? true
        }) else {
            log.error("parity-probe: the fleet never listed the proposal, its origin and the machines")
            return
        }
        await wait(2)

        // 1. The proposal, where it was made.
        let workspace = shell.workspace
        func paneSay(_ step: String) {
            let cards = shell.probePanes.session(origin)?.probeAsks ?? []
            let listed = home.needs.contains { $0.id == "\(proposal):\(proposal)" }
            log.notice("\(step, privacy: .public) [\(proposal, privacy: .public)] front: \(workspace.activeSessionId ?? "board", privacy: .public) | tabs: \(workspace.openIds.joined(separator: ","), privacy: .public) | origin's cards: \(cards.joined(separator: ","), privacy: .public) | parked: \(hub.needs.parked[proposal] != nil ? "yes" : "no", privacy: .public) | Caw's panel lists it: \(listed ? "yes" : "no", privacy: .public) | over the page: \(modal(shell), privacy: .public)")
        }
        // A tap on its push: the hub's `ask` data, routed as PushNote routes a tap.
        let fields = ["kind": "ask", "instanceId": proposal, "requestId": proposal, "machineId": "hub", "originInstanceId": origin]
        let route = PushNote.route(fields)
        log.notice("push route [\(proposal, privacy: .public)] \(String(describing: route), privacy: .public)")
        shell.open(route)
        await until(30) { workspace.activeSessionId == origin && shell.probePanes.session(origin)?.probeAsks.contains(proposal) == true }
        await wait(2)
        paneSay("push landed")

        // A pane opened on the proposal's own id moves to the session that made it.
        shell.returnToFleet(origin)
        await wait(1.5)
        shell.openSession(proposal)
        await until(30) { workspace.activeSessionId == origin && !workspace.openIds.contains(proposal) }
        await wait(2)
        paneSay("proposal's pane moved")

        // Approve in the origin's composer: answered on machine "hub", gone everywhere.
        shell.probePanes.session(origin)?.probeAnswer(proposal, allow: true)
        await until(60) { hub.needs.parked[proposal] == nil }
        await wait(2)
        paneSay("answered in its origin")

        // 2. The rail's session menu, in the rail that stands: its column
        // beside the page over the rail's breakpoint, else the sheet the
        // bar's toggle brings over the page.
        if let del = ids["del"] {
            log.notice("rail column [\(del, privacy: .public)] \(shell.probeRailState, privacy: .public)")
        }
        if let del = ids["del"] {
            let rail: SidebarViewController
            let form: String
            if shell.probeRailBeside {
                rail = shell.probeRail
                form = "column"
            } else {
                shell.probePressRailToggle()
                await until(10) { shell.probeRailSheet.map { $0.viewIfLoaded?.window != nil && !$0.isBeingPresented } ?? false }
                guard let sheet = shell.probeRailSheet else {
                    log.error("rail sheet [\(del, privacy: .public)]: the bar's toggle brought no sheet")
                    return
                }
                rail = sheet
                form = "sheet"
                log.notice("rail sheet [\(del, privacy: .public)] over the page: \(modal(shell), privacy: .public)")
            }
            await until(30) { rail.probeRow(del) != nil }
            /// What stands over the rail itself: the page's for the column, the sheet's own for the sheet.
            func overRail() -> String {
                form == "column" ? modal(shell) : rail.presentedViewController.map { String(describing: type(of: $0)) } ?? "none"
            }
            func railSay(_ step: String) {
                log.notice("\(step, privacy: .public) [\(del, privacy: .public)] rail: \(form, privacy: .public) | question: \(shell.sessionAsks.at == nil ? "none on screen" : shell.sessionAsks.view.probeState, privacy: .public) | under its rail row: \(rail.probeAskUnder(del) ? "yes" : "no", privacy: .public) | over the rail: \(overRail(), privacy: .public) | rail row: \(rail.probeRow(del) == nil ? "gone" : "listed", privacy: .public) | hub row: \(hub.fleet.byId[del] == nil ? "gone" : "listed", privacy: .public)")
            }
            if let row = rail.probeRow(del) {
                let host = MenuHost(copier: { title, _, _ in UIAction(title: title) { _ in } }, view: row, refresh: {}, close: {}, whenClosed: { $0() })
                func titles(_ menu: UIMenu) -> [String] {
                    menu.children.flatMap { element -> [String] in
                        if let inner = element as? UIMenu { return titles(inner) }
                        return (element as? UIAction).map { [$0.title] } ?? []
                    }
                }
                let items = row.menu?(host).map(titles) ?? []
                let attached = row.interactions.contains { $0 is UIContextMenuInteraction }
                log.notice("rail menu [\(del, privacy: .public)] attached: \(attached ? "yes" : "no", privacy: .public) | items: \(items.joined(separator: ", "), privacy: .public)")
                // Delete transcript, as its item asks it (SessionMenus `ask`).
                if let live = hub.fleet.byId[del]?.session, let question = SessionMenus.deleteQuestion(live, context: shell.sessionMenus.at(rail.probeAskPlace)) {
                    shell.sessionAsks.ask(question.request, at: question.at)
                    await wait(1.5)
                    railSay("rail delete asked")
                    // A local hub answers within a frame: it is held still while the question is read in flight.
                    log.notice("parity-probe: hold the hub")
                    await wait(2)
                    shell.sessionAsks.view.probeConfirm()
                    await wait(1)
                    railSay("rail delete in flight")
                    log.notice("parity-probe: free the hub")
                    await until(60) { !shell.sessionAsks.view.running }
                    await until(30) { rail.probeRow(del) == nil }
                    await wait(1.5)
                    railSay("rail delete answered")
                }
            } else {
                log.error("rail menu [\(del, privacy: .public)]: no rail row on screen")
            }
            // The sheet goes before the machines: their card opens over the page alone.
            if form == "sheet" {
                shell.probeCloseRailSheet()
                await until(10) { shell.presentedViewController == nil }
            }
        }

        // 3. A machine's unlock and its update's refusal, under its row.
        shell.probeOpenMachines()
        await wait(1.5)
        let lists = { (shell.view.window?.windowScene?.windows ?? []).flatMap { views(MachinesListView.self, in: $0) }.filter { $0.window != nil } }
        guard let list = lists().first else {
            log.error("machines [\(ghost, privacy: .public)]: no machines list on screen")
            return
        }
        func machineSay(_ step: String) {
            log.notice("\(step, privacy: .public) [\(ghost, privacy: .public)] under its row: \(list.probeUnder(ghost).joined(separator: " ; "), privacy: .public) | over the page: \(modal(shell), privacy: .public)")
        }
        list.probeUnlock(ghost)
        await wait(1.5)
        machineSay("unlock opened")
        list.probeUnlockView?.probeSubmit("probe-not-a-password")
        await until(30) { list.probeUnlockView.map { !$0.probeState.contains("Unlocking ") } ?? true }
        await wait(1)
        machineSay("unlock answered")
        hub.installUpdate(machineId: ghost)
        await until(30) { hub.updateRefused[ghost] != nil }
        await wait(1.5)
        machineSay("install refused")
        shell.probeCloseMachines()
    }
}
#endif
