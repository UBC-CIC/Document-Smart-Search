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
    { id: "d1", label: "Document X", parentId: "t1" },
    { id: "d2", label: "Document Y", parentId: "t2" },
    { id: "d3", label: "Document Z", parentId: "t3" },
  ]);

  const elements = useMemo(() => {
    const nodes = [
      { data: { id: "DFO", label: "DFO Mandate" } },
      ...mandates.map((m) => ({ data: { id: m.id, label: m.label } })),
      ...topics.map((t) => ({ data: { id: t.id, label: t.label } })),
      ...documents.map((d) => ({ data: { id: d.id, label: d.label } })),
    ];

    const edges = [
      ...mandates.map((m) => ({ data: { source: "DFO", target: m.id } })),
      ...topics.map((t) => ({ data: { source: t.parentId, target: t.id } })),
      ...documents.map((d) => ({ data: { source: d.parentId, target: d.id } })),
    ];

    return [...nodes, ...edges];
  }, [mandates, topics, documents]);

  return (
    <CytoscapeComponent
      elements={elements}
      style={{ width: "100%", height: "600px" }}
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
            backgroundColor: "#4C6EF5",
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
            padding: 10,
            shape: "roundrectangle",
            borderColor: "#e0e0e0",
            borderWidth: 1,
            // shadowBlur: 4,
            // shadowColor: "#999",
            // shadowOpacity: 0.2,
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
