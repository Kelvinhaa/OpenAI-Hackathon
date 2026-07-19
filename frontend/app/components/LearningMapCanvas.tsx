"use client";

import { useMemo } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ConceptEdgeResponse, ConceptNodeResponse } from "@/types/study";

type MapNodeData = { label: string; badge: string };

function ConceptMapNode({ data }: NodeProps<Node<MapNodeData>>) {
  return (
    <div className="learning-map-node-card">
      <Handle type="target" position={Position.Left} />
      <span>{data.badge}</span>
      <strong>{data.label}</strong>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { concept: ConceptMapNode };

function masteryDisplay(concept: ConceptNodeResponse) {
  if (concept.review_count === 0) return { badge: "New", tone: "new" };
  if (concept.last_rating === 1) return { badge: "Needs work", tone: "needs-work" };
  if (concept.last_rating === 4 || concept.stability >= 21) return { badge: "Steady", tone: "steady" };
  return { badge: "Growing", tone: "growing" };
}

function layoutConcepts(concepts: ConceptNodeResponse[], edges: ConceptEdgeResponse[]) {
  const ids = new Set(concepts.map((concept) => concept.id));
  const prerequisites = new Map<number, number[]>();
  const dependents = new Map<number, number[]>();
  concepts.forEach((concept) => {
    prerequisites.set(concept.id, []);
    dependents.set(concept.id, []);
  });
  edges.forEach((edge) => {
    if (!ids.has(edge.prerequisite_node_id) || !ids.has(edge.dependent_node_id)) return;
    prerequisites.get(edge.dependent_node_id)?.push(edge.prerequisite_node_id);
    dependents.get(edge.prerequisite_node_id)?.push(edge.dependent_node_id);
  });

  const queue = concepts
    .filter((concept) => prerequisites.get(concept.id)?.length === 0)
    .sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id)
    .map((concept) => concept.id);
  const depth = new Map<number, number>(concepts.map((concept) => [concept.id, 0]));
  let cursor = 0;
  while (cursor < queue.length) {
    const id = queue[cursor++];
    for (const dependentId of dependents.get(id) ?? []) {
      depth.set(dependentId, Math.max(depth.get(dependentId) ?? 0, (depth.get(id) ?? 0) + 1));
      const remaining = prerequisites.get(dependentId);
      if (remaining && remaining.every((prerequisiteId) => queue.includes(prerequisiteId))) queue.push(dependentId);
    }
  }

  const columns = new Map<number, ConceptNodeResponse[]>();
  concepts.forEach((concept) => {
    const column = depth.get(concept.id) ?? 0;
    columns.set(column, [...(columns.get(column) ?? []), concept]);
  });

  return [...columns.entries()].flatMap(([column, items]) => (
    items
      .sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id)
      .map((concept, row): Node<MapNodeData> => {
        const state = masteryDisplay(concept);
        return {
          id: String(concept.id),
          position: { x: column * 280 + 48, y: row * 154 + 68 },
          targetPosition: Position.Left,
          sourcePosition: Position.Right,
          data: { label: concept.title, badge: state.badge },
          type: "concept",
          ariaLabel: concept.title,
          ariaRole: "button",
          focusable: true,
          className: `learning-map-node learning-map-node--${state.tone}`,
          style: { width: 194 },
        };
      })
  ));
}

export function LearningMapCanvas({
  concepts,
  edges,
  selectedConceptId,
  onSelect,
}: {
  concepts: ConceptNodeResponse[];
  edges: ConceptEdgeResponse[];
  selectedConceptId: string | null;
  onSelect: (conceptId: string) => void;
}) {
  const nodes = useMemo(() => layoutConcepts(concepts, edges).map((node) => ({
    ...node,
    selected: node.id === selectedConceptId,
  })), [concepts, edges, selectedConceptId]);
  const flowEdges = useMemo<Edge[]>(() => edges.map((edge) => ({
    id: String(edge.id),
    source: String(edge.prerequisite_node_id),
    target: String(edge.dependent_node_id),
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: "#e87832" },
    style: { stroke: "#e87832", strokeWidth: 1.5 },
    focusable: false,
  })), [edges]);

  return (
    <div className="learning-map-canvas">
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_event, node) => onSelect(node.id)}
        fitView
        fitViewOptions={{ padding: 0.24, maxZoom: 1.05 }}
        minZoom={0.45}
        maxZoom={1.7}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="rgba(131, 103, 67, 0.12)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
