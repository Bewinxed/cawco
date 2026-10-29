public import Foundation
import Observation

/// A JSON value as a sheet's args hold it (core stage.ts `Story.args`): a
/// literal the story file writes, which the inspector shows and writes back.
public enum SheetValue: Sendable, Hashable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([SheetValue])
    case object([String: SheetValue])

    /// A value JSONSerialization read; nil for anything that is not JSON.
    init?(_ any: Any) {
        switch any {
        case is NSNull: self = .null
        // A JSON boolean reads as NSNumber too: CFBoolean tells them apart.
        case let number as NSNumber where CFGetTypeID(number) == CFBooleanGetTypeID(): self = .bool(number.boolValue)
        case let number as NSNumber: self = .number(number.doubleValue)
        case let text as String: self = .string(text)
        case let list as [Any]: self = .array(list.compactMap(SheetValue.init))
        case let record as [String: Any]: self = .object(record.compactMapValues(SheetValue.init))
        default: return nil
        }
    }

    /// What JSONSerialization writes.
    var json: Any {
        switch self {
        case .null: NSNull()
        case let .bool(value): value
        case let .number(value): value
        case let .string(value): value
        case let .array(values): values.map(\.json)
        case let .object(values): values.mapValues(\.json)
        }
    }

    /// As a control shows it (SheetInspector.svelte `shown`): a string as itself, a number without a needless `.0`.
    public var shown: String {
        switch self {
        case .null: ""
        case let .bool(value): value ? "true" : "false"
        case let .number(value): value.rounded() == value && abs(value) < 1e15 ? String(Int(value)) : String(value)
        case let .string(value): value
        case .array, .object:
            (try? JSONSerialization.data(withJSONObject: json, options: [.sortedKeys, .fragmentsAllowed]))
                .map { String(decoding: $0, as: UTF8.self) } ?? ""
        }
    }
}

/// One prop of a component as the stage's docgen reads it (core stage.ts `PropMeta`).
public struct SheetProp: Sendable, Hashable {
    public let name: String
    /// Storybook's SBType name (core `PropKind`): it decides the control.
    public let kind: String
    /// The type as the source writes it.
    public let raw: String
    /// An enum's values, or a token kind's names, in the order its type lists them.
    public let options: [SheetValue]?
    /// Its default as the source writes it, like `"neutral"`.
    public let defaultValue: String?
    public let description: String?
    public let required: Bool

    /// Its default without docgen's quotes (SheetInspector.svelte `QUOTES`): the control's bare option.
    public var bareDefault: String? {
        defaultValue?.replacing(/^["'`]|["'`]$/, with: "")
    }
}

/// A component's props as the stage read them (core stage.ts `ComponentDoc`).
public struct SheetComponent: Sendable, Hashable {
    public let file: String
    public let name: String
    public let note: String?
    public let props: [SheetProp]
    /// `checked`, `jsdoc` or `unknown`: how its props were read.
    public let types: String
}

/// One story of a story file (core stage.ts `Story`).
public struct SheetStory: Sendable, Hashable {
    public let name: String
    public let args: [String: SheetValue]
    /// Args whose value is code, not a literal: their source text.
    public let code: [String: String]
    /// The story's own component, when it names one apart from the meta's.
    public let component: String?
}

/// A sheet as its page says it on each run (core stage.ts `SheetOnPage`,
/// the overlay's `cawco:sheet`): its stories, its meta and each component's
/// props. The page's code shares the overlay's window, so every field is
/// checked and bounded as wire.ts `previewSheet` does; the stage checks
/// every write again against the props it reads itself.
public struct SheetOnPage: Sendable, Hashable {
    public let file: String
    public let stories: [SheetStory]
    public let metaArgs: [String: SheetValue]
    public let metaCode: [String: String]
    public let metaComponent: String?
    public let components: [SheetComponent]

    /// wire.ts `SHEET_BOUNDS`.
    private enum Bounds {
        static let stories = 100, components = 20, props = 200, options = 100, args = 100, tokens = 2000, name = 200, text = 1000
    }

    private static let kinds: Set<String> = ["string", "number", "boolean", "enum", "token-color", "token-size", "token-font",
                                             "slot", "function", "object", "array", "other"]

    /// The sheet a page's message carries; nil when it is no sheet.
    public init?(_ value: Any?) {
        guard let raw = value as? [String: Any], let meta = raw["meta"] as? [String: Any],
              let file = Self.text(raw["file"], Bounds.text), !file.isEmpty else { return nil }
        self.file = file
        stories = Self.list(raw["stories"], Bounds.stories).compactMap(Self.story)
        metaArgs = Self.args(meta["args"])
        metaCode = Self.code(meta["code"])
        metaComponent = Self.text(meta["component"], Bounds.text)
        components = Self.list(raw["components"], Bounds.components).compactMap(Self.component)
    }

    private static func text(_ value: Any?, _ max: Int) -> String? {
        (value as? String).map { String($0.prefix(max)) }
    }

    private static func list(_ value: Any?, _ max: Int) -> [Any] {
        Array((value as? [Any] ?? []).prefix(max))
    }

    /// At most `Bounds.args` of them, each key no longer than a name; in key order, as the page's object lists them is lost to JSONSerialization.
    private static func args(_ value: Any?) -> [String: SheetValue] {
        guard let raw = value as? [String: Any] else { return [:] }
        var out: [String: SheetValue] = [:]
        for key in raw.keys.sorted().prefix(Bounds.args) where key.count <= Bounds.name {
            if let one = raw[key].flatMap(SheetValue.init) { out[key] = one }
        }
        return out
    }

    private static func code(_ value: Any?) -> [String: String] {
        args(value).compactMapValues { if case let .string(text) = $0 { String(text.prefix(Bounds.text)) } else { nil } }
    }

    private static func story(_ value: Any) -> SheetStory? {
        guard let raw = value as? [String: Any], let name = text(raw["name"], Bounds.name),
              SheetInspection.isStoryName(name),
              raw["line"] is NSNumber, raw["column"] is NSNumber else { return nil }
        return SheetStory(name: name, args: args(raw["args"]), code: code(raw["code"]),
                          component: text(raw["component"], Bounds.text))
    }

    private static func component(_ value: Any) -> SheetComponent? {
        guard let raw = value as? [String: Any], let file = text(raw["file"], Bounds.text), !file.isEmpty,
              let name = text(raw["name"], Bounds.name), !name.isEmpty,
              let types = raw["types"] as? String, ["checked", "jsdoc", "unknown"].contains(types) else { return nil }
        return SheetComponent(file: file, name: name, note: text(raw["note"], Bounds.text).flatMap { $0.isEmpty ? nil : $0 },
                              props: list(raw["props"], Bounds.props).compactMap(prop), types: types)
    }

    private static func prop(_ value: Any) -> SheetProp? {
        guard let raw = value as? [String: Any], let type = raw["type"] as? [String: Any],
              let name = text(raw["name"], Bounds.name), !name.isEmpty,
              let kind = type["name"] as? String, kinds.contains(kind) else { return nil }
        let token = kind.hasPrefix("token-")
        let options: [SheetValue]? = kind == "enum" || token
            ? list(raw["options"], token ? Bounds.tokens : Bounds.options).compactMap { one in
                if let text = one as? String, text.count <= Bounds.name { return .string(text) }
                if !token, let number = one as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() { return .number(number.doubleValue) }
                return nil
            }
            : nil
        return SheetProp(name: name, kind: kind, raw: text(type["raw"], Bounds.text) ?? "", options: options,
                         defaultValue: text(raw["defaultValue"], Bounds.text), description: text(raw["description"], Bounds.text),
                         required: raw["required"] as? Bool == true)
    }
}

/// A story export added, duplicated, removed, or moved before another (`before: nil` to the end) (core stage.ts `StoryOp`).
public enum StoryOp: Sendable, Hashable {
    case add(String, args: [String: SheetValue])
    case duplicate(String, as: String)
    case remove(String)
    case move(String, before: String?)

    var json: [String: Any] {
        switch self {
        case let .add(name, args): ["add": name, "args": args.mapValues(\.json)]
        case let .duplicate(name, copy): ["duplicate": name, "as": copy]
        case let .remove(name): ["remove": name]
        // `before` is always said: null puts it at the end.
        case let .move(name, before): ["move": name, "before": before.map { $0 as Any } ?? NSNull()]
        }
    }
}

/// A sheet's write from its inspector (artifact-api.ts `SheetChange`): one story's args, or a story op.
public enum SheetChange: Sendable, Hashable {
    case args(story: String, values: [String: SheetValue], unset: [String])
    case story(StoryOp)

    var json: [String: Any] {
        switch self {
        case let .args(story, values, unset):
            var args: [String: Any] = ["story": story, "values": values.mapValues(\.json)]
            if !unset.isEmpty { args["unset"] = unset }
            return ["args": args]
        case let .story(op):
            return ["story": op.json]
        }
    }
}

/// A prop's own control (sheet-inspector.svelte.ts `controlOf`).
public enum SheetControl: Sendable {
    case segments, select, toggle, text, number, slot, code

    /// Where it stands in the list (SheetInspector.svelte `RANK`).
    public var rank: Int {
        switch self {
        case .segments, .select: 0
        case .toggle: 1
        case .text, .number: 2
        case .slot, .code: 3
        }
    }

    public init(_ prop: SheetProp) {
        switch prop.kind {
        case "enum":
            let options = prop.options ?? []
            self = options.count <= 4 && options.allSatisfy { $0.shown.count <= 10 } ? .segments : .select
        case "boolean": self = .toggle
        case "string", "token-color", "token-size", "token-font": self = .text
        case "number": self = .number
        case "slot": self = .slot
        default: self = .code
        }
    }
}

/// A sheet's inspector (live components spec §5; sheet-inspector.svelte.ts):
/// the person shapes a component from its sheet without writing code. Its
/// controls are the chosen story's props, as the sheet's page says them
/// (`cawco:sheet`); a change mounts the story again at once with the new
/// args (`cawco:story-args`, no write), and Save writes them into the
/// story's `args` in its file, through the hub to the stage. The story
/// buttons add one from the current controls, duplicate, remove and move
/// one. Everything inside a component stays a pin.
@MainActor
@Observable
public final class SheetInspection {
    /// Whether `name` is a story's name the file can take (story-file.ts `STORY_NAME`).
    public nonisolated static func isStoryName(_ name: String) -> Bool {
        name.wholeMatch(of: /[A-Z][A-Za-z0-9_]{0,99}/) != nil
    }

    /// The sheet as its page last said it; nil until it has.
    public private(set) var sheet: SheetOnPage?
    /// The story the controls are for.
    public private(set) var chosen: String?
    /// The person's values, by story, not saved yet.
    public private(set) var edits: [String: [String: SheetValue]] = [:]
    /// The story's own args the person dropped back to the meta's or the default, by story.
    public private(set) var drops: [String: [String]] = [:]
    /// A write under way: Save, or a story button's.
    public enum Writing: Sendable { case save, op }
    public private(set) var writing: Writing?
    /// Why the last write was refused, in the refuser's words.
    public private(set) var problem: String?

    @ObservationIgnored private let post: ([String: Any]) -> Void
    @ObservationIgnored private let write: (SheetChange) async throws -> Void

    /// `post` hands the sheet's page a message; `write` sends a change to the hub.
    public init(post: @escaping ([String: Any]) -> Void, write: @escaping (SheetChange) async throws -> Void) {
        self.post = post
        self.write = write
    }

    /// The page said its sheet (a run, a props refresh): the choice kept while its story stands, and every unsaved story mounted with its values again.
    public func heard(_ sheet: SheetOnPage) {
        self.sheet = sheet
        let names = sheet.stories.map(\.name)
        if !(chosen.map(names.contains) ?? false) { chosen = names.first }
        for name in edits.keys where !names.contains(name) { forget(name) }
        for name in drops.keys where !names.contains(name) { forget(name) }
        for name in names where dirty(name) { live(name) }
    }

    /// The inspector's story: the page stands what the design graph keeps, so a choice here is the inspector's alone.
    public func choose(_ name: String) {
        chosen = name
        problem = nil
    }

    public var story: SheetStory? {
        sheet?.stories.first { $0.name == chosen }
    }

    /// The component the chosen story mounts: its own, else the meta's.
    public var component: SheetComponent? {
        let file = story?.component ?? sheet?.metaComponent
        return sheet?.components.first { $0.file == file }
    }

    /// Whether story `name` holds values or drops not saved.
    public func dirty(_ name: String?) -> Bool {
        guard let name else { return false }
        return !(edits[name] ?? [:]).isEmpty || !(drops[name] ?? []).isEmpty
    }

    public var isDirty: Bool { dirty(chosen) }

    /// Prop `prop`'s value as the chosen story mounts it now: the person's, the story's, the meta's; nil for the component's default.
    public func value(_ prop: SheetProp) -> SheetValue? {
        guard let name = chosen, let story else { return nil }
        if let edited = edits[name]?[prop.name] { return edited }
        if !(drops[name] ?? []).contains(prop.name), let own = story.args[prop.name] { return own }
        return sheet?.metaArgs[prop.name]
    }

    /// Prop `prop`'s value when it is code in the file (a fixture, a function): read-only here.
    public func code(_ prop: SheetProp) -> String? {
        guard let story else { return nil }
        if let own = story.code[prop.name] { return own }
        return story.args[prop.name] == nil ? sheet?.metaCode[prop.name] : nil
    }

    /// The prop's control: code in the file is read-only whatever its type.
    public func control(_ prop: SheetProp) -> SheetControl {
        code(prop) == nil ? SheetControl(prop) : .code
    }

    /// Whether the chosen story sets prop `prop` itself, or the person changed it: Reset is offered.
    public func own(_ prop: SheetProp) -> Bool {
        guard let name = chosen else { return false }
        if edits[name]?[prop.name] != nil { return true }
        return story?.args[prop.name] != nil && !(drops[name] ?? []).contains(prop.name)
    }

    /// The person set prop `prop` of the chosen story: mounted again at once, saved by Save.
    public func set(_ prop: SheetProp, _ value: SheetValue) {
        guard let name = chosen else { return }
        problem = nil
        edits[name, default: [:]][prop.name] = value
        drops[name] = (drops[name] ?? []).filter { $0 != prop.name }
        live(name)
    }

    /// Prop `prop` back to the meta's or the component's default: the story's own arg dropped on Save.
    public func reset(_ prop: SheetProp) {
        guard let name = chosen, let story else { return }
        edits[name]?[prop.name] = nil
        if story.args[prop.name] != nil, !(drops[name] ?? []).contains(prop.name) {
            drops[name, default: []].append(prop.name)
        }
        live(name)
    }

    /// The chosen story's changes let go: it mounts from its file again.
    public func discard() {
        guard let name = chosen else { return }
        forget(name)
        post(["type": "cawco:story-args", "story": name, "args": NSNull()])
    }

    /// Save: the chosen story's values and drops written into its `args`; the page redraws from the file.
    public func save() async {
        guard let name = chosen, dirty(name), writing == nil else { return }
        let change = SheetChange.args(story: name, values: edits[name] ?? [:], unset: drops[name] ?? [])
        writing = .save
        problem = nil
        do {
            try await write(change)
            // The file holds them now; its edit runs the sheet again with no override.
            forget(name)
        } catch {
            problem = Self.words(error)
        }
        writing = nil
    }

    /// A story button: a story added from the chosen one's current values,
    /// duplicated, removed, or moved a place up or down. Answers whether it
    /// was written; a refusal stands under the buttons.
    @discardableResult
    public func run(_ op: StoryOp) async -> Bool {
        guard writing == nil else { return false }
        writing = .op
        problem = nil
        defer { writing = nil }
        do {
            try await write(.story(op))
            switch op {
            case let .add(name, _): chosen = name
            case let .duplicate(_, copy): chosen = copy
            case .remove, .move: break
            }
            return true
        } catch {
            problem = Self.words(error)
            return false
        }
    }

    /// The chosen story's args as they stand on screen, each literal one: what Add story writes.
    public func current() -> [String: SheetValue] {
        var out: [String: SheetValue] = [:]
        for prop in component?.props ?? [] where code(prop) == nil && prop.kind != "slot" {
            if let value = value(prop) { out[prop.name] = value }
        }
        for (key, value) in sheet?.metaArgs ?? [:] where out[key] == value { out[key] = nil }
        return out
    }

    /// A move of the chosen story by one place: up before the one above it, down after the one below it.
    public func moveBy(_ by: Int) -> StoryOp? {
        let names = sheet?.stories.map(\.name) ?? []
        guard let at = chosen.flatMap(names.firstIndex), names.indices.contains(at + by) else { return nil }
        return by < 0 ? .move(names[at], before: names[at - 1]) : .move(names[at], before: names.indices.contains(at + 2) ? names[at + 2] : nil)
    }

    /// Why a new story's name can't be taken, or nil (SheetInspector.svelte `nameProblem`).
    public func nameProblem(_ name: String, file: String) -> String? {
        let name = name.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return nil }
        guard Self.isStoryName(name) else { return Words.Artifacts.nameRule }
        return sheet?.stories.contains { $0.name == name } == true ? Words.Artifacts.nameTaken(file: file, name: name) : nil
    }

    private func forget(_ name: String) {
        edits[name] = nil
        drops[name] = nil
    }

    /// Story `name` mounted again with the person's values over its file's args; a drop is the meta's value (or none).
    private func live(_ name: String) {
        guard dirty(name) else {
            post(["type": "cawco:story-args", "story": name, "args": NSNull()])
            return
        }
        var args = sheet?.stories.first { $0.name == name }?.args ?? [:]
        for key in drops[name] ?? [] { args[key] = sheet?.metaArgs[key] }
        args.merge(edits[name] ?? [:]) { _, edited in edited }
        post(["type": "cawco:story-args", "story": name, "args": args.mapValues(\.json)])
    }

    /// A refusal in its own words (hub-read.ts `failureWords`).
    private static func words(_ error: any Error) -> String {
        if let refusal = error as? TaskRefusal { return refusal.message }
        if error is URLError { return "The hub could not be reached." }
        return error.localizedDescription
    }
}
