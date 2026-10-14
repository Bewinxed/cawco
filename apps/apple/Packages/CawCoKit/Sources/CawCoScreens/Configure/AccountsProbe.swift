#if DEBUG
import CawCoCore
import CawCoDesign
import OSLog
import UIKit

/// `-accounts-probe` (DEBUG only): Configure → Accounts against a scratch
/// hub. Each flow runs through the function its control runs, and what the
/// list, the account page's rows and footer, the routing editor and the
/// setup draw is read off their views at each stage into the AccountsProbe
/// log, beside the hub's word. `-accounts-probe-capture <url>` sends the
/// window at each named stage there as `<stage>.png` (scripts/probe-kit
/// specs/ios-accounts.ts serves it, for a separate screenshot review).
@MainActor
enum AccountsProbe {
    static let on = ProcessInfo.processInfo.arguments.contains("-accounts-probe")
    static let log = Logger(subsystem: "dev.cawco.app", category: "AccountsProbe")

    /// Every visible text under `view`, depth first: labels, field text and
    /// placeholders, and button titles in brackets.
    static func texts(in view: UIView) -> [String] {
        var out: [String] = []
        func walk(_ node: UIView) {
            guard !node.isHidden, node.alpha > 0.01 else { return }
            if let button = node as? UIButton {
                let title = button.configuration?.attributedTitle.map { String($0.characters) } ?? button.currentTitle ?? ""
                if !title.isEmpty { out.append("[\(title)\(button.isEnabled ? "" : " (disabled)")]") }
                return
            }
            if let label = node as? UILabel, let text = label.text ?? label.attributedText?.string, !text.isEmpty {
                out.append(text)
                return
            }
            if let field = node as? UITextField {
                out.append("field '\(field.isSecureTextEntry && !(field.text ?? "").isEmpty ? "••••" : field.text ?? "")'\(field.isEnabled ? "" : " (disabled)")")
                return
            }
            node.subviews.forEach(walk)
        }
        walk(view)
        return out
    }

    static func start(shell: ShellController) {
        Task { @MainActor [weak shell] in
            guard let shell else { return }
            await run(shell)
        }
    }

    private static func wait(_ seconds: Double) async {
        try? await Task.sleep(for: .seconds(seconds))
    }

    @discardableResult
    private static func until(_ seconds: Double = 20, _ done: () -> Bool) async -> Bool {
        let end = ContinuousClock.now + .seconds(seconds)
        while !done() {
            if ContinuousClock.now > end { return false }
            await wait(0.2)
        }
        return true
    }

    private static func controllers<T: UIViewController>(_: T.Type, from root: UIViewController?) -> [T] {
        guard let root else { return [] }
        let below = root.children + [root.presentedViewController].compactMap(\.self)
        let navs = (root as? UINavigationController)?.viewControllers ?? []
        var seen = Set<ObjectIdentifier>()
        return ([root as? T].compactMap(\.self) + (below + navs).flatMap { controllers(T.self, from: $0) })
            .filter { seen.insert(ObjectIdentifier($0)).inserted }
    }

    private static func onScreen<T: UIViewController>(_: T.Type, _ shell: ShellController) -> T? {
        controllers(T.self, from: shell).first { $0.view.window != nil }
    }

    /// Where the probe's spec takes the captures: a loopback address it
    /// serves, since the Mac app's sandbox writes only its own container.
    private static let captureURL = ProcessInfo.processInfo.arguments.firstIndex(of: "-accounts-probe-capture").flatMap { at in
        ProcessInfo.processInfo.arguments.indices.contains(at + 1) ? URL(string: ProcessInfo.processInfo.arguments[at + 1]) : nil
    }

    /// Sends the window as `<stage>.png` to the capture address, when one was named.
    private static func capture(_ stage: String, _ shell: ShellController) async {
        guard let base = captureURL, let window = shell.view.window,
              let png = UIGraphicsImageRenderer(bounds: window.bounds).image(actions: { _ in
                  window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
              }).pngData() else { return }
        var request = URLRequest(url: base.appending(path: "\(stage).png"))
        request.httpMethod = "PUT"
        let status = await (try? URLSession.shared.upload(for: request, from: png)).map { ($0.1 as? HTTPURLResponse)?.statusCode ?? 0 }
        log.notice("capture \(stage, privacy: .public): \(status.map { "sent, \($0)" } ?? "not sent", privacy: .public)")
    }

    private static func say(_ step: String, _ text: String) {
        log.notice("\(step, privacy: .public): \(text, privacy: .public)")
    }

    private static func run(_ shell: ShellController) async {
        let hub = shell.hub
        guard await until(30, { FleetAccounts.view(hub) != nil && FleetAccounts.choices(hub) != nil && !hub.fleet.machines.isEmpty }) else {
            say("start", "the hub's accounts were never read")
            return
        }
        let machine = hub.fleet.machines.first { FleetAccounts.online($0) }
        say("start", "machines \(hub.fleet.machines.map { "\($0.name) \($0.status)" }.joined(separator: ", "))")

        // 1. The machine menu's "Sign in an account…" opens the native section.
        if let machine {
            let menu = MachineMenu(machineId: machine.machineId, host: shell)
            say("machine menu", menu.probeItems.joined(separator: " | "))
            menu.probeAccounts()
        }
        await until { onScreen(AccountsSectionController.self, shell)?.ready == true }
        await wait(1)
        guard let section = onScreen(AccountsSectionController.self, shell) else {
            say("machine menu", "no Accounts section on screen")
            return
        }
        say("machine menu", "opened the Accounts section natively; web pages over the app: \(controllers(UIViewController.self, from: shell).filter { String(describing: type(of: $0)).contains("Safari") }.count)")
        say("list", section.probeLines.joined(separator: " / "))
        let config = ConfigSections.accounts
        say("list row", "count \(config.count?(hub).map(String.init) ?? "-") badge \(config.badge(config, hub).map { "\($0.count)" } ?? "none")")
        await capture("list", shell)

        guard let view = FleetAccounts.view(hub) else { return }
        let claude = FleetAccounts.accounts(view, provider: FleetAccounts.claude)
        let signed = claude.first { account in view.signins.contains { $0.accountId == account.id && $0.state == "signed-in" } }
        let second = claude.first { $0.id != signed?.id }

        // 2. The account page: rename and recolour, Save answers in place.
        if let second, let machine {
            section.probeOpen(second.id)
            await until { onScreen(AccountEditorController.self, shell) != nil }
            await wait(1.2)
            guard let editor = onScreen(AccountEditorController.self, shell) else { return }
            say("editor", texts(in: editor.view).joined(separator: " / "))
            await capture("editor", shell)
            editor.probeType(nickname: "Probe second")
            editor.probePick(hue: "violet")
            say("editor dirty", editor.probeFooter)
            editor.probeRunSave()
            say("editor saving", editor.probeFooter)
            await until { FleetAccounts.view(hub)?.accounts.first { $0.id == second.id }?.label == "Probe second" }
            say("editor saved", "\(editor.probeFooter) | hub: label \(FleetAccounts.view(hub)?.accounts.first { $0.id == second.id }?.label ?? "-") hue \(FleetAccounts.view(hub)?.accounts.first { $0.id == second.id }?.hue ?? "-")")

            // 3. Sign in on the machine, on its row: the link, then a code that is not one.
            let rows = editor.probeMachines
            rows.probeToggle(machine.machineId)
            await wait(1)
            let row = rows.probeRow(machine.machineId)
            say("sign in open", row?.probeState ?? "no row")
            (row?.current as? PastePanel)?.probeOpenLink()
            await wait(0.5)
            await until(40) { row?.probeState.contains("Opening") == false }
            await wait(1)
            say("sign in link", "\(row?.probeState ?? "no row") | opened \(SignInBrowser.lastOpened?.host() ?? "nothing")")
            await capture("signin-link", shell)
            if SignInBrowser.lastOpened != nil {
                (row?.current as? PastePanel)?.probeSubmit("not-a-real-code")
                await until(60) { row?.probeState.contains("Checking") == false }
                await wait(1)
                say("sign in code refused", row?.probeState ?? "no row")
                await capture("signin-refused", shell)
            }
            rows.probeToggle(machine.machineId)
            await wait(0.6)

            // 4. Sign out on the machine: the row says it runs, then the hub's answer
            // stands there (its refusal in its words, or the row as the hub now has it).
            rows.probeSignOut(machine.machineId)
            // The row redraws on the page's next refresh: read it once it has, a frame at a time.
            var running = row?.probeState ?? "no row"
            for _ in 0 ..< 60 where !running.contains("Signing out") {
                try? await Task.sleep(for: .milliseconds(16))
                running = row?.probeState ?? "no row"
            }
            say("sign out running", running)
            await until { row?.probeState.contains("Signing out") == false }
            await wait(0.6)
            let held = FleetAccounts.view(hub).map { FleetAccounts.state($0.signins, account: second.id, machine: machine.machineId) } ?? "-"
            say("sign out answered", "\(row?.probeState ?? "no row") | hub: \(held)")
            editor.navigationController?.popViewController(animated: false)
            await wait(0.8)
        }

        // 5. Removing the signed-in account: the question, then the hub's answer under it.
        if let signed {
            section.probeOpen(signed.id)
            await until { onScreen(AccountEditorController.self, shell) != nil }
            await wait(1)
            if let editor = onScreen(AccountEditorController.self, shell) {
                say("signed-in editor", texts(in: editor.probeMachines).joined(separator: " / "))
                editor.probeRunDelete()
                await wait(0.6)
                say("remove asks", editor.probeFooter)
                await capture("remove-question", shell)
                editor.probeConfirm()
                say("remove pending", editor.probeFooter)
                await until(40) { !editor.probeFooter.contains("Removing") }
                await wait(0.6)
                let still = FleetAccounts.view(hub)?.accounts.contains { $0.id == signed.id } ?? false
                say("remove answered", "\(editor.view.window == nil ? "editor closed" : editor.probeFooter) | hub still has it: \(still)")
                if editor.view.window != nil { editor.navigationController?.popViewController(animated: false) }
                await wait(0.8)
            }
        }

        // 6. Routing: Spread for your sessions, Fill first in a new order for delegates.
        if let now = FleetAccounts.view(hub), FleetAccounts.accounts(now, provider: FleetAccounts.claude).count > 1 {
            section.probeRouting(FleetAccounts.claude)
            await until { onScreen(RoutingEditorController.self, shell) != nil }
            await wait(1.2)
            if let routing = onScreen(RoutingEditorController.self, shell) {
                say("routing", texts(in: routing.view).joined(separator: " / "))
                await capture("routing", shell)
                routing.probePicker?.probeChoose("spread")
                routing.probeTab(1)
                await wait(0.8)
                routing.probePicker?.probeChoose("fill-first")
                await wait(0.6)
                let ids = FleetAccounts.accounts(now, provider: FleetAccounts.claude).map(\.id)
                routing.probePicker?.probeOrder(ids.reversed())
                routing.probeLimit?.probeSet(move: true, wait: 20)
                say("routing dirty", "\(routing.probePicker?.probeState ?? "-") | limit figure \(routing.probeLimit?.probeFigure ?? "-") | \(routing.probeFooter)")
                await capture("routing-fill-first", shell)
                routing.probeRunSave()
                await until { routing.probeFooter.contains("Saved") || routing.probeRefusal != nil }
                let held = FleetAccounts.view(hub).flatMap { FleetAccounts.routing($0, provider: FleetAccounts.claude) }
                say("routing saved", "\(routing.probeFooter) | hub: yours \(held?.yours.strategy ?? "-") delegates \(held?.delegates.strategy ?? "-") wait \(held?.atLimit.waitMinutes ?? -1) order \(FleetAccounts.view(hub).map { FleetAccounts.accounts($0, provider: FleetAccounts.claude).map(FleetAccounts.name) } ?? [])")
                await until { routing.view.window == nil }
                await wait(0.6)
            }
        }

        // 7. Add account: Claude's sign-in makes the account; Cancel takes it back.
        section.probeSetup()
        await until { onScreen(AccountSetupController.self, shell) != nil }
        await wait(1)
        if let setup = onScreen(AccountSetupController.self, shell) {
            say("setup", "\(setup.probeStep): \(setup.probeContent.joined(separator: " / ")) | \(setup.probeFoot)")
            await capture("setup-provider", shell)
            setup.probeChoose("anthropic:subscription")
            await until { setup.probeStep == "Sign in" }
            await wait(1)
            say("setup sign in", "\(setup.probeContent.joined(separator: " / ")) | \(setup.probeFoot)")
            let before = FleetAccounts.view(hub)?.accounts.count ?? 0
            setup.probeRows.first?.probePress()
            await until(40) { setup.probeCreated != nil && setup.probeRows.first?.probeState.contains("Opening") == false }
            await wait(1)
            say("setup signing in", "created \(setup.probeCreated ?? "nothing") | hub accounts \(before) → \(FleetAccounts.view(hub)?.accounts.count ?? 0) | \(setup.probeRows.map(\.probeState).joined(separator: " // ")) | \(setup.probeFoot)")
            await capture("setup-signin", shell)
            setup.probeCancel()
            await until { setup.view.window == nil || setup.probeFoot.contains("refused") }
            await wait(1)
            say("setup cancelled", "\(setup.view.window == nil ? "closed" : setup.probeFoot) | hub accounts \(FleetAccounts.view(hub)?.accounts.count ?? 0)")
        }

        // 8. A key provider: the key goes to the machine and its answer stands on its row.
        if let key = FleetAccounts.choices(hub)?.first(where: { $0.signin == "api-key" && !FleetAccounts.machines(running: $0.harnesses, hub: hub).isEmpty }) {
            section.probeSetup()
            await until { onScreen(AccountSetupController.self, shell) != nil }
            await wait(1)
            if let setup = onScreen(AccountSetupController.self, shell) {
                setup.probeChoose(key.key)
                await until { setup.probeStep == "Sign in" }
                await wait(1)
                say("key step", "\(setup.probeContent.joined(separator: " / ")) | \(setup.probeFoot)")
                setup.probeKeyPanel?.probeSend("sk-probe-not-a-key")
                await until(40) { setup.probeKeyPanel.map { !texts(in: $0).contains { $0.contains("Sending") } } ?? true }
                await wait(1)
                say("key sent", "\(setup.probeContent.joined(separator: " / ")) | \(setup.probeFoot)")
                await capture("setup-key", shell)
                setup.probeCancel()
                await until { setup.view.window == nil }
                await wait(1)
            }
        }

        // 9. The account no session runs on goes: question, then the list without it.
        if let second {
            section.probeOpen(second.id)
            await until { onScreen(AccountEditorController.self, shell) != nil }
            await wait(1)
            if let editor = onScreen(AccountEditorController.self, shell) {
                editor.probeRunDelete()
                await wait(0.5)
                say("remove second asks", editor.probeFooter)
                editor.probeConfirm()
                await until(40) { editor.view.window == nil || editor.probeFooter.contains("refused") }
                await wait(1)
                say("remove second answered", "\(editor.view.window == nil ? "editor closed" : editor.probeFooter) | list: \(section.probeLines.joined(separator: " / "))")
                await capture("list-after", shell)
            }
        }
        // 10. With nobody signed in on the machine, its menu offers "Sign in an
        // account…": from the fleet, the item's own action opens the section.
        if let machine {
            await until(60) { hub.fleet.machines.first { $0.machineId == machine.machineId }?.auth == .unauthenticated }
            shell.go(.fleet)
            await wait(1)
            let menu = MachineMenu(machineId: machine.machineId, host: shell)
            let items = menu.probeItems
            say("machine menu signed out", items.joined(separator: " | "))
            if items.contains(where: { $0.hasPrefix("Sign in an account…") }) {
                menu.probeAccounts()
                await until { onScreen(AccountsSectionController.self, shell)?.ready == true }
                await wait(0.6)
                say("machine menu signed out opened", onScreen(AccountsSectionController.self, shell) == nil ? "no Accounts section on screen" : "the Accounts section, natively")
            }
        }
        say("done", "accounts probe: done")
    }
}
#endif
