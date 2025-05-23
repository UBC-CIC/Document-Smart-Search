"use client";

import React, { useState, useMemo } from "react";
import CytoscapeComponent from "react-cytoscapejs";

export default function GraphPage() {
  const [mandates] = useState([
    { id: "m1", label: "Mandate 1" },
    { id: "m2", label: "Mandate 2" },
  ]);

  const [topics] = useState([
    { id: "t1", label: "Topic A", parentId: "m1" },
    { id: "t2", label: "Topic B", parentId: "m2" },
    { id: "t3", label: "Topic C", parentId: "m2" },
  ]);

  const [documents] = useState([
    { id: "d1", label: "Document X", parentIds: ["t1", "t2"] }, // Multiple topic parents
    { id: "d2", label: "Document Y", parentIds: ["t2"] },
    { id: "d3", label: "Document Z", parentIds: ["t3"] },
  ]);

  const [csasEvents] = useState([
    { id: "e1", label: "CSAS Event 1", parentIds: ["d1", "d2"] },
    { id: "e2", label: "CSAS Event 2", parentIds: ["d2", "d3"] },
  ]);

  const [generatedTopics] = useState([
    { id: "g1", label: "Generated Topic Alpha", parentId: "d1" },
    { id: "g2", label: "Generated Topic Beta", parentId: "d3" },
  ]);

  const elements = useMemo(() => {
    const nodes = [
      { data: { id: "DFO", label: "DFO Mandate" } },
      ...mandates.map((m) => ({ data: { id: m.id, label: m.label } })),
      ...topics.map((t) => ({ data: { id: t.id, label: t.label } })),
      ...documents.map((d) => ({ data: { id: d.id, label: d.label } })),
      ...csasEvents.map((e) => ({ data: { id: e.id, label: e.label } })),
      ...generatedTopics.map((g) => ({ data: { id: g.id, label: g.label } })),
    ];

    const edges = [
      ...mandates.map((m) => ({ data: { source: "DFO", target: m.id } })),
      ...topics.map((t) => ({ data: { source: t.parentId, target: t.id } })),
      ...documents.flatMap((d) =>
        d.parentIds.map((pid) => ({ data: { source: pid, target: d.id } }))
      ),
      ...csasEvents.flatMap((e) =>
        e.parentIds.map((pid) => ({ data: { source: pid, target: e.id } }))
      ),
      ...generatedTopics.map((g) => ({ data: { source: g.parentId, target: g.id } })),
    ];

    return [...nodes, ...edges];
  }, [mandates, topics, documents, csasEvents, generatedTopics]);

  return (
    <CytoscapeComponent
      elements={elements}
      style={{ width: "100%", height: "875px" }}
      layout={{
        name: "cose",
        animate: true,
        animationDuration: 1000,
        fit: true,
        nodeRepulsion: 800000,
        idealEdgeLength: 100,
        edgeElasticity: 100,
        gravity: 80,
        componentSpacing: 120,
        nestingFactor: 1.2,
        padding: 30,
      }}
      stylesheet={[
        {
          selector: 'node[id = "DFO"]',
          style: {
            backgroundColor: "#6d85ff",
          },
        },
        {
          selector: 'node[id ^= "m"]',
          style: {
            backgroundColor: "#38D9A9",
          },
        },
        {
          selector: 'node[id ^= "t"]',
          style: {
            backgroundColor: "#FFD43B",
          },
        },
        {
          selector: 'node[id ^= "d"]',
          style: {
            backgroundColor: "#FF6B6B",
          },
        },
        {
          selector: 'node[id ^= "e"]',
          style: {
            backgroundColor: "#A78BFA", // Purple for CSAS Events
          },
        },
        {
          selector: 'node[id ^= "g"]',
          style: {
            backgroundColor: "#00B8D9", // Blue for Generated Topics
          },
        },
        {
          selector: "node",
          style: {
            label: "data(label)",
            fontSize: 11,
            color: "#1e1e1e",
            textWrap: "wrap",
            textMaxWidth: 90,
            textValign: "center",
            textHalign: "center",
            width: "label",
            height: "label",
            padding: 20,
            shape: "roundrectangle",
            borderColor: "#e0e0e0",
            borderWidth: 1,
          },
        },
        {
          selector: "edge",
          style: {
            width: 2.5,
            lineColor: "#B0BEC5",
            targetArrowColor: "#B0BEC5",
            targetArrowShape: "triangle",
            curveStyle: "bezier",
            arrowScale: 1.4,
          },
        },
      ]}
    />
  );
}
