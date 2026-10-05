// This file holds Swift ports of two parts of @xyflow/system 0.0.83
// (node_modules/@xyflow/system/dist/esm/index.js): the smooth-step edge path
// (`getPoints`, `getBend`, `getSmoothStepPath`, in `SmoothStep` below) and the
// fit to view (`parsePadding`, `calculateAppliedPaddings`,
// `getViewportForBounds`, in `WorkflowCanvasView.fit`). That package is:
//
// MIT License
//
// Copyright (c) 2019-2025 webkid GmbH
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
// The same text ships in the app as CawCoDesign/Resources/Licenses/xyflow-system.txt.

import CawCoCore
import CawCoDesign
import UIKit

/// The workflow's graph, read (WorkflowCanvas.svelte on Svelte Flow): the
/// node cards where the graph puts them, the edges between their ports, a
/// 16pt dot grid behind, panned by a drag and zoomed from 0.15 to 2 by a
/// pinch. It opens fitted to the graph, and Fit graph or F fits it again
/// (`fit.ts`: a fifth of padding, never past 1). A tap on a node selects
/// it; a tap on the pane lets it go. Nothing here changes the graph.
final class WorkflowCanvasView: UIView, UIScrollViewDelegate {
    /// `fit.ts` `FIT`, and the canvas's own `minZoom` and `maxZoom`.
    private static let fitPadding = 0.2
    private static let fitMaxZoom = 1.0
    private static let minZoom = 0.15
    private static let maxZoom = 2.0
    /// Room round the graph to pan into.
    private static let margin = 1200.0

    private let scroll = UIScrollView()
    private let board = DotGrid()
    private let edges = WorkflowEdgeLayer()
    private let tools = WorkflowCanvasTools()
    private var cards: [String: WorkflowNodeCardView] = [:]
    private var graph = WorkflowGraph.empty
    private var origin = CGPoint.zero
    private var fitted = false
    private var selection: String?

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRecess
        clipsToBounds = true
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.delegate = self
        scroll.minimumZoomScale = Self.minZoom
        scroll.maximumZoomScale = Self.maxZoom
        scroll.showsVerticalScrollIndicator = false
        scroll.showsHorizontalScrollIndicator = false
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.bouncesZoom = false
        addSubview(scroll)
        scroll.addSubview(board)
        board.addSubview(edges)
        board.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(paneTapped)))
        tools.onZoom = { [weak self] step in self?.zoom(by: step) }
        tools.onFit = { [weak self] in self?.fit(animated: true) }
        addSubview(tools)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: topAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            // Svelte Flow's Panel stands 15pt in from the canvas's edge.
            tools.centerXAnchor.constraint(equalTo: centerXAnchor),
            tools.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -15),
            heightAnchor.constraint(greaterThanOrEqualToConstant: 280),
        ])
        isAccessibilityElement = false
        accessibilityLabel = "Workflow graph"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkflowCanvasView is built in code")
    }

    /// The graph, each node's pinned problem, and the names of the workflows a node may start.
    func set(_ next: WorkflowGraph, problems: [String: String], names: [String: String]) {
        graph = next
        cards.values.forEach { $0.removeFromSuperview() }
        cards = [:]
        for node in next.nodes {
            var childName: String?
            if case let .workflow(id, _) = node.kind { childName = names[id] }
            let card = WorkflowNodeCardView(node, problem: problems[node.id], childName: childName)
            card.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(nodeTapped(_:))))
            card.selected = node.id == selection
            board.addSubview(card)
            cards[node.id] = card
        }
        fitted = false
        setNeedsLayout()
    }

    /// The nodes' frames in the graph's own coordinates.
    private var nodeFrames: [String: CGRect] {
        var frames: [String: CGRect] = [:]
        for node in graph.nodes {
            guard let card = cards[node.id] else { continue }
            let size = card.systemLayoutSizeFitting(CGSize(width: WorkflowNodeCardView.width, height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel)
            frames[node.id] = CGRect(x: node.x, y: node.y, width: WorkflowNodeCardView.width, height: size.height)
        }
        return frames
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0, !fitted else { return }
        let frames = nodeFrames
        let extent = frames.values.reduce(CGRect.null) { $0.union($1) }
        guard !extent.isNull else { return }
        // The board is the graph's extent and room to pan; a node stands at its position less the board's origin.
        scroll.zoomScale = 1
        origin = CGPoint(x: extent.minX - Self.margin, y: extent.minY - Self.margin)
        board.frame = CGRect(x: 0, y: 0, width: extent.width + Self.margin * 2, height: extent.height + Self.margin * 2)
        scroll.contentSize = board.frame.size
        edges.frame = board.bounds
        for (id, frame) in frames {
            cards[id]?.frame = frame.offsetBy(dx: -origin.x, dy: -origin.y)
            cards[id]?.layoutIfNeeded()
        }
        edges.draw(graph.edges, selection: selection) { [cards, board] node, port in
            cards[node].map { card in
                let at = port.map { card.sourcePoint($0) } ?? card.targetPoint
                return card.convert(at, to: board)
            }
        }
        fitted = true
        fit(animated: false)
    }

    /// Svelte Flow's `fitView`, ported from `parsePadding`,
    /// `calculateAppliedPaddings` and `getViewportForBounds` in
    /// node_modules/@xyflow/system/dist/esm/index.js, @xyflow/system 0.0.83:
    /// the zoom at which the nodes' bounds fill the canvas less its padding,
    /// held between the least zoom and `FIT.maxZoom`; the bounds' centre on
    /// the canvas's.
    private func fit(animated: Bool) {
        // In the graph's own coordinates, as Svelte Flow works it: the floors below turn on them.
        let extent = cards.values.map(\.frame).reduce(CGRect.null) { $0.union($1) }.offsetBy(dx: origin.x, dy: origin.y)
        guard !extent.isNull, bounds.width > 0 else { return }
        // `parsePadding`: a number is that share of the canvas, as whole points a side.
        let padX = ((bounds.width - bounds.width / (1 + Self.fitPadding)) * 0.5).rounded(.down)
        let padY = ((bounds.height - bounds.height / (1 + Self.fitPadding)) * 0.5).rounded(.down)
        let zoom = min(Self.fitMaxZoom, max(Self.minZoom, min((bounds.width - padX * 2) / extent.width, (bounds.height - padY * 2) / extent.height)))
        var x = bounds.width / 2 - extent.midX * zoom
        var y = bounds.height / 2 - extent.midY * zoom
        // `calculateAppliedPaddings`: where flooring left less than the padding asked for, the view shifts to give it back.
        let left = (extent.minX * zoom + x).rounded(.down)
        let top = (extent.minY * zoom + y).rounded(.down)
        let right = (bounds.width - (extent.maxX * zoom + x)).rounded(.down)
        let bottom = (bounds.height - (extent.maxY * zoom + y)).rounded(.down)
        x = x - min(left - padX, 0) + min(right - padX, 0)
        y = y - min(top - padY, 0) + min(bottom - padY, 0)
        // The board stands at the graph's origin less its margin.
        let offset = CGPoint(x: -x - origin.x * zoom, y: -y - origin.y * zoom)
        let move = {
            self.scroll.zoomScale = zoom
            self.scroll.contentOffset = offset
        }
        // Zoom and fit glide to the new view: movement on screen, `durPanel` on the in-out curve.
        if animated, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeInOut.animator(Motion.durPanel) { move() }.startAnimation()
        } else {
            move()
        }
        tools.show(zoom: zoom)
    }

    /// Zoom in and out step by a factor of 1.2 about the canvas's centre (d3-zoom's `scaleBy`).
    private func zoom(by factor: Double) {
        let next = min(Self.maxZoom, max(Self.minZoom, scroll.zoomScale * factor))
        let centre = CGPoint(x: (scroll.contentOffset.x + bounds.width / 2) / scroll.zoomScale, y: (scroll.contentOffset.y + bounds.height / 2) / scroll.zoomScale)
        let move = {
            self.scroll.zoomScale = next
            self.scroll.contentOffset = CGPoint(x: centre.x * next - self.bounds.width / 2, y: centre.y * next - self.bounds.height / 2)
        }
        if UIAccessibility.isReduceMotionEnabled { move() } else { Motion.easeInOut.animator(Motion.durPanel) { move() }.startAnimation() }
        tools.show(zoom: next)
    }

    func viewForZooming(in _: UIScrollView) -> UIView? { board }
    func scrollViewDidZoom(_ scrollView: UIScrollView) { tools.show(zoom: scrollView.zoomScale) }

    @objc private func nodeTapped(_ tap: UITapGestureRecognizer) {
        select((tap.view as? WorkflowNodeCardView)?.node.id)
    }

    @objc private func paneTapped() { select(nil) }

    private func select(_ id: String?) {
        selection = id
        for (key, card) in cards { card.selected = key == id }
    }

    /// F fits the graph (WorkflowCanvasTools.svelte).
    override var canBecomeFirstResponder: Bool { true }
    override var keyCommands: [UIKeyCommand]? {
        [UIKeyCommand(input: "f", modifierFlags: [], action: #selector(fitPressed))]
    }

    @objc private func fitPressed() { fit(animated: true) }

    /// Svelte Flow's `Background` of dots: one 1pt dot every 16pt, scaling with the zoom.
    private final class DotGrid: UIView {
        init() {
            super.init(frame: .zero)
            registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: DotGrid, _: UITraitCollection) in view.paint() }
            paint()
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            fatalError("DotGrid is built in code")
        }

        private func paint() {
            let ink = Palette.neutral8.resolvedColor(with: traitCollection)
            let tile = UIGraphicsImageRenderer(size: CGSize(width: 16, height: 16)).image { context in
                ink.setFill()
                context.cgContext.fillEllipse(in: CGRect(x: 7.5, y: 7.5, width: 1, height: 1))
            }
            backgroundColor = UIColor(patternImage: tile)
        }
    }
}

// MARK: Node card

/// One node (WorkflowNodeCard.svelte): a 260pt raised card inside a
/// hairline at `--radius-md`. Its kind's glyph in a 28pt box (filled with the
/// brand for a step) and its title; a step's harness and model; two lines of
/// what it does; a map's body; the problem pinned on it; and, where it
/// leaves by more than one port, a column of them each ending in its handle.
/// A node that takes an edge has a handle on its leading edge, and one that
/// leaves by a single port has that handle on its trailing edge.
final class WorkflowNodeCardView: UIView {
    static let width = 260.0
    private static let handle = 10.0

    let node: WorkflowNode
    var selected = false { didSet { paint() } }
    private var portRows: [String: UIView] = [:]
    private var handles: [UIView] = []

    /// workflow-ui.ts `kinds`: each kind's glyph.
    static func glyph(_ kind: WorkflowNode.Kind) -> Glyph {
        switch kind {
        case .start, .other: .rocket
        case .end: .box
        case .branch: .subagent
        case .map: .hook
        case .workflow: .workflow
        case .step: .cpu
        case .check: .toolTodo
        case .jev: .jev
        case .ask: .ask
        }
    }

    /// What the node does, in a line or two.
    static func summary(_ node: WorkflowNode, childName: String?) -> String {
        switch node.kind {
        case let .start(inputs): inputs.isEmpty ? "No inputs" : inputs.map(\.name).joined(separator: ", ")
        case let .end(outputs): outputs.isEmpty ? "No outputs" : outputs.joined(separator: ", ")
        case let .step(_, _, prompt):
            prompt.split(separator: "\n", omittingEmptySubsequences: false).first.flatMap { $0.isEmpty ? nil : String($0) } ?? "Write a task in the inspector"
        case let .check(rules): "\(rules) rules · all must pass"
        case let .ask(question, _, _): question.isEmpty ? "What should happen next?" : question
        case .branch: "First matching case"
        case let .map(over, _): over.isEmpty ? "Choose an array" : over
        case let .workflow(_, inputs): "\(childName ?? "Choose a workflow") · \(inputs) inputs"
        case let .jev(questions):
            "\(questions.count) \(questions.count == 1 ? "question" : "questions") · \(Self.typeNames(questions))"
        case .other: ""
        }
    }

    /// The questions' types, each once in the order met, by the editor's names (`JEV_TYPE_NAMES`).
    private static func typeNames(_ types: [String]) -> String {
        var seen: [String] = []
        for type in types where !seen.contains(type) { seen.append(type) }
        return seen.map { ["noul": "Noul", "choice": "Choice", "score": "Score"][$0] ?? $0 }.joined(separator: ", ")
    }

    init(_ node: WorkflowNode, problem: String?, childName: String?) {
        self.node = node
        super.init(frame: .zero)
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        boxShadow = Shadow.shadowTile

        let filled = { if case .step = node.kind { true } else { false } }()
        let mark = UIView()
        mark.translatesAutoresizingMaskIntoConstraints = false
        mark.layer.cornerRadius = Radius.radiusSm
        mark.layer.cornerCurve = .continuous
        mark.backgroundColor = filled ? Palette.brandSolid : .clear
        mark.layer.borderWidth = filled ? 0 : 1
        let glyph = GlyphView(Self.glyph(node.kind), size: Size.iconMd, tint: filled ? Palette.onBrand : Palette.inkStrong)
        mark.addSubview(glyph)
        let title = KitLabel(TypeScale.typeBody.withWeight(TypeScale.weightStrong), ink: Palette.inkStrong, lines: 0)
        title.text = node.title
        let header = UIStackView(arrangedSubviews: [mark, title])
        header.spacing = Space.space2
        header.alignment = .center
        header.isLayoutMarginsRelativeArrangement = true
        header.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space3, leading: Space.space4, bottom: Space.space3, trailing: Space.space4)

        let body = UIStackView()
        body.axis = .vertical
        body.spacing = Space.space2
        body.isLayoutMarginsRelativeArrangement = true
        body.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: Space.space4, bottom: Space.space3, trailing: Space.space4)
        if case let .step(harness, model, _) = node.kind {
            let meta = KitLabel(WorkflowForm.text(TypeScale.typeMeta), ink: Palette.inkMuted, lines: 0)
            meta.tabular = true
            meta.text = "\(harness) · \(model.isEmpty ? "Choose a model" : model)"
            body.addArrangedSubview(meta)
        }
        let summary = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 2)
        summary.text = Self.summary(node, childName: childName)
        body.addArrangedSubview(summary)
        if case let .map(_, inner) = node.kind {
            let group = DashedBox(text: "\(inner.nodes.count) nodes in body")
            body.addArrangedSubview(group)
        }
        if let problem {
            let said = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
            said.text = problem
            let chip = UIStackView(arrangedSubviews: [WorkflowStatusChip(.waiting), UIView()])
            let pinned = UIStackView(arrangedSubviews: [chip, said])
            pinned.axis = .vertical
            pinned.spacing = Space.space1
            body.addArrangedSubview(pinned)
        }

        let column = UIStackView(arrangedSubviews: [header, body])
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)

        let ports = node.ports
        if ports.count > 1 {
            // `.ports`: a hairline above, 7pt of block padding; each port's name at the end, strong, 4pt by 14pt in.
            let list = UIStackView()
            list.axis = .vertical
            list.isLayoutMarginsRelativeArrangement = true
            list.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2 + 1, leading: 0, bottom: Space.space2, trailing: 0)
            let rule = UIView()
            rule.backgroundColor = Palette.borderHairline
            rule.translatesAutoresizingMaskIntoConstraints = false
            list.addSubview(rule)
            NSLayoutConstraint.activate([
                rule.topAnchor.constraint(equalTo: list.topAnchor),
                rule.leadingAnchor.constraint(equalTo: list.leadingAnchor),
                rule.trailingAnchor.constraint(equalTo: list.trailingAnchor),
                rule.heightAnchor.constraint(equalToConstant: 1),
            ])
            for port in ports {
                let name = KitLabel(WorkflowForm.text(TypeScale.typeLabel), ink: Palette.inkStrong)
                name.text = port
                name.textAlignment = .right
                let row = UIStackView(arrangedSubviews: [name])
                row.isLayoutMarginsRelativeArrangement = true
                row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space1, leading: Space.space4, bottom: Space.space1, trailing: Space.space4)
                list.addArrangedSubview(row)
                portRows[port] = row
            }
            column.addArrangedSubview(list)
        }
        NSLayoutConstraint.activate([
            // The card's 1pt border is part of its box: its 260pt include it, and its content starts inside it.
            column.topAnchor.constraint(equalTo: topAnchor, constant: 1),
            column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -1),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 1),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -1),
            widthAnchor.constraint(equalToConstant: Self.width),
            mark.widthAnchor.constraint(equalToConstant: 28),
            mark.heightAnchor.constraint(equalToConstant: 28),
            glyph.centerXAnchor.constraint(equalTo: mark.centerXAnchor),
            glyph.centerYAnchor.constraint(equalTo: mark.centerYAnchor),
        ])
        if case .start = node.kind {} else { handles.append(dot()) }
        for _ in ports { handles.append(dot()) }
        markView = mark
        isAccessibilityElement = true
        accessibilityTraits = .button
        accessibilityLabel = "\(node.title), \(Self.summary(node, childName: childName))"
        accessibilityIdentifier = "workflow-node"
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (card: WorkflowNodeCardView, _: UITraitCollection) in card.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkflowNodeCardView is built in code")
    }

    private weak var markView: UIView?

    /// A handle: 10pt, `neutral-8` inside a ring of the raised surface.
    private func dot() -> UIView {
        let dot = UIView(frame: CGRect(x: 0, y: 0, width: Self.handle, height: Self.handle))
        dot.backgroundColor = Palette.neutral8
        dot.layer.cornerRadius = Self.handle / 2
        dot.layer.borderWidth = 1
        dot.isUserInteractionEnabled = false
        addSubview(dot)
        return dot
    }

    /// Where an edge arrives: the leading edge's middle.
    var targetPoint: CGPoint { CGPoint(x: 0, y: bounds.midY) }

    /// Where an edge leaves by `port`: the trailing edge beside the port's row, or its middle for a lone port.
    func sourcePoint(_ port: String) -> CGPoint {
        guard let row = portRows[port] else { return CGPoint(x: bounds.maxX, y: bounds.midY) }
        return CGPoint(x: bounds.maxX, y: row.convert(row.bounds, to: self).midY)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        var points: [CGPoint] = []
        if case .start = node.kind {} else { points.append(targetPoint) }
        points += node.ports.map(sourcePoint)
        for (dot, point) in zip(handles, points) { dot.center = point }
    }

    /// The selection ring is drawn over the card's own border, so the border itself turns the colour.
    private func paint() {
        layer.borderWidth = selected ? Size.focusRingWidth : 1
        layer.borderColor = (selected ? Palette.brandSolid : Palette.borderHairline).resolvedColor(with: traitCollection).cgColor
        markView?.layer.borderColor = Palette.neutral8.resolvedColor(with: traitCollection).cgColor
        for dot in handles { dot.layer.borderColor = Palette.surfaceRaised.resolvedColor(with: traitCollection).cgColor }
    }

    /// `.group`: a dashed `neutral-8` box at `--radius-sm`, 11pt in.
    private final class DashedBox: UIView {
        private let edge = CAShapeLayer()

        init(text: String) {
            super.init(frame: .zero)
            let label = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
            label.text = text
            addSubview(label)
            NSLayoutConstraint.activate([
                label.topAnchor.constraint(equalTo: topAnchor, constant: Space.space3),
                label.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space3),
                label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
                label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3),
            ])
            edge.fillColor = nil
            edge.lineWidth = 1
            edge.lineDashPattern = [3, 3]
            layer.addSublayer(edge)
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            fatalError("DashedBox is built in code")
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            edge.frame = bounds
            edge.path = UIBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), cornerRadius: Radius.radiusSm).cgPath
            edge.strokeColor = Palette.neutral8.resolvedColor(with: traitCollection).cgColor
        }
    }
}

// MARK: Edges

/// The graph's edges (WorkflowEdge.svelte): each a smooth-step path from a
/// node's port to a node's input, 1.5pt in `neutral-8` (3pt when chosen),
/// looping 100pt under the lower of its ends when its target is not to the
/// right of its source; its condition and its limit, when it has either, on
/// the recess at the path's middle.
final class WorkflowEdgeLayer: UIView {
    private var lines: [CAShapeLayer] = []
    private var labels: [UIView] = []

    init() {
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        backgroundColor = .clear
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkflowEdgeLayer is built in code")
    }

    /// `point` answers where a node's port (or, with no port, its input) stands on the board.
    func draw(_ edges: [WorkflowEdge], selection: String?, point: (_ node: String, _ port: String?) -> CGPoint?) {
        lines.forEach { $0.removeFromSuperlayer() }
        labels.forEach { $0.removeFromSuperview() }
        lines = []
        labels = []
        for edge in edges {
            guard let source = point(edge.from.node, edge.from.port), let target = point(edge.to.node, nil) else { continue }
            let route = SmoothStep.path(
                source: source, target: target,
                centerY: target.x <= source.x ? max(source.y, target.y) + 100 : nil
            )
            let line = CAShapeLayer()
            line.path = route.path
            line.fillColor = nil
            line.lineWidth = edge.id == selection ? 3 : 1.5
            line.strokeColor = Palette.neutral8.resolvedColor(with: traitCollection).cgColor
            layer.addSublayer(line)
            lines.append(line)
            let said = [
                edge.when.map { "\($0.path) \($0.op) \($0.value ?? "")" } ?? "",
                edge.maxIterations.map { "×\(Int($0))" } ?? "",
            ].filter { !$0.isEmpty }.joined(separator: " · ")
            guard !said.isEmpty else { continue }
            let text = KitLabel(WorkflowForm.text(TypeScale.typeLabel), ink: Palette.inkStrong)
            text.text = said
            let box = UIView()
            box.backgroundColor = Palette.surfaceRecess
            box.layer.cornerRadius = Radius.radiusSm
            box.addSubview(text)
            let size = text.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
            text.frame = CGRect(x: Space.space1, y: Space.space1, width: size.width, height: size.height)
            text.translatesAutoresizingMaskIntoConstraints = true
            box.bounds = CGRect(x: 0, y: 0, width: size.width + Space.space1 * 2, height: size.height + Space.space1 * 2)
            box.center = route.label
            addSubview(box)
            labels.append(box)
        }
    }
}

/// Svelte Flow's smooth-step edge path, ported from `getPoints`, `getBend`
/// and `getSmoothStepPath` in
/// node_modules/@xyflow/system/dist/esm/index.js, @xyflow/system 0.0.83
/// (the version bun.lock pins under @xyflow/svelte 1.7.0), with the defaults
/// the editor's edges use: `borderRadius` 5, `offset` 20, `stepPosition` 0.5,
/// the source handle on a node's right and the target handle on its left.
enum SmoothStep {
    private static let borderRadius = 5.0
    private static let offset = 20.0
    private static let stepPosition = 0.5

    /// `handleDirections[Position.Right]` and `[Position.Left]`.
    private static let sourceDir = CGPoint(x: 1, y: 0)
    private static let targetDir = CGPoint(x: -1, y: 0)

    static func path(source: CGPoint, target: CGPoint, centerY: Double?) -> (path: CGPath, label: CGPoint) {
        let (points, label) = points(source: source, target: target, centerY: centerY)
        let path = CGMutablePath()
        path.move(to: points[0])
        for index in 1 ..< points.count - 1 {
            bend(path, points[index - 1], points[index], points[index + 1])
        }
        path.addLine(to: points[points.count - 1])
        return (path, label)
    }

    /// `getPoints`: an orthogonal route. With a right source handle and a
    /// left target handle the primary direction is horizontal (`dirAccessor`
    /// is `x`) and the handles are opposite, so only that branch is reached.
    private static func points(source: CGPoint, target: CGPoint, centerY: Double?) -> ([CGPoint], CGPoint) {
        let sourceGapped = CGPoint(x: source.x + sourceDir.x * offset, y: source.y + sourceDir.y * offset)
        let targetGapped = CGPoint(x: target.x + targetDir.x * offset, y: target.y + targetDir.y * offset)
        // `getDirection` for a horizontal source handle.
        let currDir = sourceGapped.x < targetGapped.x ? 1.0 : -1.0
        let centreX = sourceGapped.x + (targetGapped.x - sourceGapped.x) * stepPosition
        let centreY = centerY ?? (sourceGapped.y + targetGapped.y) / 2
        let verticalSplit = [CGPoint(x: centreX, y: sourceGapped.y), CGPoint(x: centreX, y: targetGapped.y)]
        let horizontalSplit = [CGPoint(x: sourceGapped.x, y: centreY), CGPoint(x: targetGapped.x, y: centreY)]
        let middle = sourceDir.x == currDir ? verticalSplit : horizontalSplit
        var path = [source]
        if sourceGapped != middle[0] { path.append(sourceGapped) }
        path += middle
        if targetGapped != middle[middle.count - 1] { path.append(targetGapped) }
        path.append(target)
        return (path, CGPoint(x: centreX, y: centreY))
    }

    /// `getBend`: the corner at `b`, rounded by at most `borderRadius` and half of either leg.
    private static func bend(_ path: CGMutablePath, _ a: CGPoint, _ b: CGPoint, _ c: CGPoint) {
        let size = min(hypot(b.x - a.x, b.y - a.y) / 2, hypot(c.x - b.x, c.y - b.y) / 2, borderRadius)
        if (a.x == b.x && b.x == c.x) || (a.y == b.y && b.y == c.y) {
            path.addLine(to: b)
            return
        }
        if a.y == b.y {
            let xDir = a.x < c.x ? -1.0 : 1.0
            let yDir = a.y < c.y ? 1.0 : -1.0
            path.addLine(to: CGPoint(x: b.x + size * xDir, y: b.y))
            path.addQuadCurve(to: CGPoint(x: b.x, y: b.y + size * yDir), control: b)
            return
        }
        let xDir = a.x < c.x ? 1.0 : -1.0
        let yDir = a.y < c.y ? -1.0 : 1.0
        path.addLine(to: CGPoint(x: b.x, y: b.y + size * yDir))
        path.addQuadCurve(to: CGPoint(x: b.x + size * xDir, y: b.y), control: b)
    }
}

// MARK: Tools

/// The canvas's tools (WorkflowCanvasTools.svelte), a raised bar at its foot:
/// zoom out, the zoom as a percentage, zoom in, and Fit graph.
final class WorkflowCanvasTools: UIView {
    var onZoom: (Double) -> Void = { _ in }
    var onFit: () -> Void = {}
    private let percent = KitLabel(WorkflowForm.text(TypeScale.typeMeta), ink: Palette.inkStrong)

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        boxShadow = Shadow.shadowTile
        // d3-zoom steps a button's zoom by 1.2.
        let out = KitButton.workflow("−") { [weak self] in self?.onZoom(1 / 1.2) }
        out.accessibilityLabel = "Zoom out"
        let into = Self.glyphButton(.plus, label: "Zoom in") { [weak self] in self?.onZoom(1.2) }
        let fit = Self.glyphButton(.maximize, label: "Fit graph") { [weak self] in self?.onFit() }
        percent.tabular = true
        percent.textAlignment = .center
        percent.widthAnchor.constraint(greaterThanOrEqualToConstant: 40).isActive = true
        let row = UIStackView(arrangedSubviews: [out, percent, into, fit])
        row.spacing = Space.space1
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            row.topAnchor.constraint(equalTo: topAnchor, constant: Space.space1),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space1),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space1),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space1),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkflowCanvasTools is built in code")
    }

    func show(zoom: Double) {
        percent.text = "\(Int((zoom * 100).rounded()))%"
    }

    /// A `.wf-btn` holding a 16pt glyph alone.
    private static func glyphButton(_ glyph: Glyph, label: String, action: @escaping () -> Void) -> UIButton {
        let button = KitButton.workflow("", action: action)
        button.configuration?.attributedTitle = nil
        button.configuration?.image = glyph.image.resized(to: Size.iconMd)
        button.configuration?.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.inkStrong }
        button.accessibilityLabel = label
        return button
    }
}
