import CawCoCore

/// Every word of the paywall and notification setup (paywall/final/COPY.md,
/// v3 2026-10-09), one enum per screen. `price` is always StoreKit's
/// `displayPrice`; a string that names it is nil until the price has arrived,
/// and the sentence says "pay once" until then (P1a): the charge is always said.
enum PaywallCopy {
    /// P1: the free week is still on offer.
    enum P1 {
        static let headline = "Never leave an agent waiting."

        /// T (App Review R10): the duration and the downstream charge, above the button.
        static func terms(_ price: String?) -> String {
            "7 days free, then \(price ?? "pay") once. No subscription."
        }

        /// The free week's rows. Day 6 is the reminder's notice (R14); Day 7 says what is lost (R10).
        static let timeline: [(day: String, text: String)] = [
            ("Today", "Every agent on one live board. Approve from your phone."),
            ("Day 6", "One reminder: tomorrow is the last free day."),
            ("Day 7", "The app locks. Nothing is charged on its own."),
        ]

        static let primary = "Start 7 days free"
        /// The one buying label everywhere; "Get Pro" alone while the price loads (P1a).
        static func secondary(_ price: String?) -> String {
            price.map { "Get Pro · \($0)" } ?? "Get Pro"
        }
    }

    /// The three links under the buttons, shared by P1, P1e and the gate bar.
    enum Links {
        static let restore = "Restore purchase"
        static let terms = "Terms"
        static let privacy = "Privacy"
        static let included = "What's included"
        static let changeHub = "Change hub"
    }

    /// P1e: the week is over, or was already used on this Apple Account.
    enum P1e {
        static let headline = "Your 7 days are up."
        static func terms(_ price: String?) -> String {
            "The app is locked. Pay \(spaced(price))once to unlock it. No subscription."
        }
    }

    /// T's tap: the paywall for a live week, in its Get Pro form.
    enum Keep {
        static let headline = "Keep the board after day 7."
        static func subline(_ price: String?) -> String {
            "Pay \(spaced(price))once. Everything you set up stays."
        }
    }

    /// P1a, P1b, P1c and a failed purchase.
    enum Store {
        static let loading = "Getting prices…"
        static func restricted(_ price: String?) -> String {
            "Purchases are off on this device (Screen Time or a management profile). Turn them on to start the free 7 days or pay \(spaced(price))once."
        }

        static let unavailable = "The App Store didn't answer."
        static let tryAgain = "Try again"
        static let failed = "The App Store didn't complete that. Nothing was charged."
    }

    /// G: the bar over the locked board.
    enum Gate {
        static let line = "The board is locked."
        static func trial(_ price: String?) -> String {
            "Try 7 days free, then \(price ?? "pay") once to keep it. Nothing is charged on its own."
        }

        static func ended(_ price: String?) -> String {
            "Pay \(spaced(price))once to unlock it. No subscription."
        }

        static let askToBuy = "Waiting for a family organizer to approve the request."
    }

    /// S1: the week started, or Pro bought or restored.
    enum S1 {
        static let startedHeadline = "Your free 7 days start now."
        static func startedBody(_ price: String?) -> String {
            "Everything is on. On day 7 the app locks unless you've paid \(spaced(price))once. One more step: notifications, so an agent's question reaches you wherever you are."
        }

        static let boughtHeadline = "Pro is yours."
        static let boughtBody = "Paid once, on every iPhone, iPad and Mac signed into this Apple Account. One more step: notifications, so an agent's question reaches you wherever you are."
        static let restoredProHeadline = "Pro is back."
        static let restoredTrialHeadline = "Your free 7 days are back."
        static let notifyLine = "Without notifications, you only find out when you open the app."
        static let primary = "Turn on notifications"
        static let later = "Later"
    }

    /// S3 and S6, S7: the setup checklist.
    enum Setup {
        static let headline = "Setting up…"
        static let allowed = "Notifications allowed"
        static let registering = "Registering this device…"
        static let registeringSlow = "Still registering. This needs an internet connection."
        static let registerFailed = "This device couldn't register for notifications. Check its connection, then try again."
        static let relay = "Connecting to the relay…"
        static let relayFailed = "Couldn't reach the relay."
        static let relayBody = "Your purchase is safe and nothing is charged twice. The relay didn't answer; try again in a moment."
        static let test = "Sending a test notification…"
        static let tryAgain = "Try again"
    }

    /// S4 and S4b: the test.
    enum S4 {
        static let headline = "That was the test."
        static let body = "From now on, the moment an agent needs you, your phone says so. Approve safe actions right from the lock screen."
        static let done = "Done"
        static let lateHeadline = "No test yet."
        static let lateBody = "It can take a few seconds. If nothing arrives, check that CawCo is allowed under iOS Settings › Notifications."
        static let sendAgain = "Send test again"
    }

    /// S5: iOS refused notifications.
    enum S5 {
        static let headline = "Notifications are off."
        static let body = "iOS is blocking them for CawCo, so an agent's question can't reach the lock screen. Turn them on under Settings › Notifications › CawCo. The board works either way."
        static let openSettings = "Open Settings"
        static let later = "Later"
    }

    /// S8: Ask to Buy.
    enum S8 {
        static let headline = "Sent for approval."
        static let trialBody = "Your free 7 days start when a family organizer approves the request. Nothing to do here."
        static let proBody = "Pro turns on when a family organizer approves the request. Nothing to do here."
        static let done = "Done"
    }

    /// R: restore.
    enum Restore {
        static let checking = "Checking…"
        static let nothing = "Nothing to restore on this Apple Account."
        static let failed = "The App Store check failed. Try again."
        static let unverified = "That purchase couldn't be verified. Try again."
    }

    /// T and T6: the week's days left, and its one reminder.
    enum Trial {
        /// The sidebar's line under the name, by whole days left.
        static func line(daysLeft: Int) -> String {
            switch daysLeft {
            case ...1: "Free trial · ends today"
            case 2: "Free trial · last day tomorrow"
            default: "Free trial · \(daysLeft) days left"
            }
        }

        static let owned = "Pro"
        static let cardTitle = "Your free 7 days end tomorrow."
        static func cardBody(_ price: String?) -> String {
            "Tomorrow the app locks; your hub, machines and sessions stay as they are. To keep the app, pay \(spaced(price))once. Nothing is charged on its own."
        }

        static let pushTitle = "Free trial ends tomorrow"
        /// Informational, no price (App Review R14).
        static let pushBody = "Tomorrow the app locks. To keep it, get Pro once in the app; nothing is charged on its own."
    }

    /// H: the hub sheet's Notifications section.
    enum Hub {
        static let title = "Notifications"
        static let off = "Notifications are off, so an agent's question only reaches you in the app."
        static let turnOn = "Turn on notifications"
        static let denied = "Notifications are off in iOS Settings."
        static let openSettings = "Open Settings"
        static let registering = "Registering this device…"
        static let registerFailed = "This device couldn't register for notifications."
        static let relayFailed = "Couldn't reach the relay."
        static let tryAgain = "Try again"
        static let quiet = "Quiet"
        /// Quiet on sends nothing; off, it sends what needs you (ruling 2, §2 H4).
        static let quietOn = "Sends nothing."
        static let quietOff = "Sends what needs you."
        static let test = "Send a test notification"
        /// H5: the day-6 reminder's switch.
        static let reminder = "Trial reminder"
        static let reminderOn = "One notification on day 6, the day before the free trial ends."
        static let reminderOff = "No reminder. The trial still ends on day 7."
        /// H7: this device leaves the relay.
        static let remove = "Remove this device from the relay"
        static let removeHint = "Deletes this device's registration from the relay. Notifications stop until you turn them on again; your purchase is untouched."
    }

    /// StoreKit's price and a space, or nothing while it hasn't arrived, so a
    /// sentence reads "Pay once" until then (P1a.price): the charge is always said.
    static func spaced(_ price: String?) -> String {
        price.map { "\($0) " } ?? ""
    }

    /// The banner the hero draws when no ask is waiting: the machine is real, the ask an example.
    static func bannerTitle(harness: String, machine: String) -> String {
        "\(harness) on \(machine) needs you"
    }

    static let bannerExample = "Allow edit to README.md?"
}
