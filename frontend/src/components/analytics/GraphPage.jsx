"use client";

import React, { useState, useMemo } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import coseBilkent from "cytoscape-cose-bilkent";
import Filters from "../document-search/components/Filters"; // adjust path as needed
import { SlidersHorizontal } from "lucide-react";
import { useDocumentSearch } from "../document-search/hooks/useDocumentSearch"; // adjust path as needed

cytoscape.use(coseBilkent);



// Mock data
const mandates = [
  { id: "m1", label: "Mandate 1" },
  { id: "m2", label: "Mandate 2" },
];

const topics = [
  { id: "t1", label: "Topic A", parentId: "m1" },
  { id: "t2", label: "Topic B", parentId: "m2" },
  { id: "t3", label: "Topic C", parentId: "m2" },
];

const documents = [
  { id: "d1", label: "Document X", parentIds: ["t1", "t2"] },
  { id: "d2", label: "Document Y", parentIds: ["t2"] },
  { id: "d3", label: "Document Z", parentIds: ["t3"] },
];

const csasEvents = [
  { id: "e1", label: "CSAS Event 1", parentIds: ["d1", "d2"] },
  { id: "e2", label: "CSAS Event 2", parentIds: ["d2", "d3"] },
];

const generatedTopics = [
  { id: "g1", label: "Generated Topic Alpha", parentId: "d1" },
  { id: "g2", label: "Generated Topic Beta", parentId: "d3" },
];

export default function GraphPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // const [yearFilters, setYearFilters] = useState({ from: 2010, to: 2024 });
  // const [topicFilters, setTopicFilters] = useState([]);
  // const [mandateFilters, setMandateFilters] = useState([]);
  // const [documentTypeFilters, setDocumentTypeFilters] = useState([]);
  // const [authorFilters, setAuthorFilters] = useState([]);

    const {
      yearFilters,
      setYearFilters,
      topicFilters,
      setTopicFilters,
      mandateFilters,
      setMandateFilters,
      authorFilters,
      setAuthorFilters,
      documentTypeFilters,
      setDocumentTypeFilters,
      resetFilters,
      applyFilters,
      totalResults,
      totalPages,
      isLoading,
      hasSearched,
    } = useDocumentSearch()

  // const resetFilters = () => {
  //   setTopicFilters([]);
  //   setMandateFilters([]);
  //   setDocumentTypeFilters([]);
  //   setAuthorFilters([]);
  //   setYearFilters({ from: 2010, to: 2024 });
  // };

  const elements = useMemo(() => {
    
    console.log("mandateFilters:", mandateFilters);
    const selectedMandateIds = new Set(Array.isArray(mandateFilters) ? mandateFilters : []);
    const selectedTopicIds = new Set(Array.isArray(topicFilters) ? topicFilters : []);


    let filteredMandates = mandates;
    let filteredTopics = topics;
    let filteredDocuments = documents;

    if (selectedMandateIds.size > 0) {
      filteredMandates = mandates.filter((m) => selectedMandateIds.has(m.id));
      filteredTopics = topics.filter((t) => selectedMandateIds.has(t.parentId));
      filteredDocuments = documents.filter((d) =>
        d.parentIds.some((pid) => filteredTopics.some((t) => t.id === pid))
      );
    } else if (selectedTopicIds.size > 0) {
      filteredTopics = topics.filter((t) => selectedTopicIds.has(t.id));
      filteredDocuments = documents.filter((d) =>
        d.parentIds.some((pid) => selectedTopicIds.has(pid))
      );
    }

    const filteredCsasEvents = csasEvents.filter((e) =>
      e.parentIds.some((pid) => filteredDocuments.map((d) => d.id).includes(pid))
    );
    const filteredGeneratedTopics = generatedTopics.filter((g) =>
      filteredDocuments.map((d) => d.id).includes(g.parentId)
    );

    const nodes = [
      { data: { id: "DFO", label: "DFO Mandate" } },
      ...filteredMandates.map((m) => ({ data: { id: m.id, label: m.label } })),
      ...filteredTopics.map((t) => ({ data: { id: t.id, label: t.label } })),
      ...filteredDocuments.map((d) => ({ data: { id: d.id, label: d.label } })),
      ...filteredCsasEvents.map((e) => ({ data: { id: e.id, label: e.label } })),
      ...filteredGeneratedTopics.map((g) => ({ data: { id: g.id, label: g.label } })),
    ];

    const edges = [
      ...filteredMandates.map((m) => ({ data: { source: "DFO", target: m.id } })),
      ...filteredTopics.map((t) => ({ data: { source: t.parentId, target: t.id } })),
      ...filteredDocuments.flatMap((d) =>
        d.parentIds.map((pid) => ({ data: { source: pid, target: d.id } }))
      ),
      ...filteredCsasEvents.flatMap((e) =>
        e.parentIds.map((pid) => ({ data: { source: pid, target: e.id } }))
      ),
      ...filteredGeneratedTopics.map((g) => ({
        data: { source: g.parentId, target: g.id },
      })),
    ];

    return [...nodes, ...edges];
  }, [mandateFilters, topicFilters, yearFilters, documentTypeFilters]);

  return (
    <div className="relative h-screen w-screen bg-white dark:bg-gray-900">
      {/* Toggle Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute left-6 z-50 bg-gray-400  text-white px-3 py-1 rounded-md"
        style={{ bottom: '6rem'}}
      >
        <SlidersHorizontal size={18} className="inline mr-1" />
        Filters
      </button>

      {/* Floating Filter Panel */}
      <div
        className={`fixed top-10 left-0 h-full w-80 z-40 transform bg-gray-100 dark:bg-gray-800 transition-transform duration-300 p-4 shadow-lg ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Filters
          isFilterOpen={sidebarOpen}
          yearFilters={yearFilters}
          setYearFilters={setYearFilters}
          topicFilters={topicFilters}
          setTopicFilters={setTopicFilters}
          mandateFilters={mandateFilters}
          setMandateFilters={setMandateFilters}
          authorFilters={authorFilters}
          setAuthorFilters={setAuthorFilters}
          documentTypeFilters={documentTypeFilters}
          setDocumentTypeFilters={setDocumentTypeFilters}
          resetFilters={resetFilters}
          isLoading={false}
        />
      </div>

      {/* Graph Area */}
      <CytoscapeComponent
        elements={elements}
        style={{ width: "100%", height: "100%" }}
        layout={{
          name: "cose-bilkent",
          animate: "end",
          animationDuration: 1000,
          fit: true,
          padding: 30,
          gravity: -120,
          gravityRange: 3.8,
          nodeRepulsion: 90000,
          edgeElasticity: 0.25,
          nestingFactor: 0.8,
          idealEdgeLength: 120,
          nodeDimensionsIncludeLabels: true,
          randomize: false,
        }}
        stylesheet={[
          { selector: 'node[id = "DFO"]', style: { backgroundColor: "#4F46E5", color: "#fff", fontWeight: "bold", borderWidth: 3 } },
          { selector: 'node[id ^= "m"]', style: { backgroundColor: "#10B981", color: "#fff" } },
          { selector: 'node[id ^= "t"]', style: { backgroundColor: "#FACC15" } },
          { selector: 'node[id ^= "d"]', style: { backgroundColor: "#EF4444", color: "#fff" } },
          { selector: 'node[id ^= "e"]', style: { backgroundColor: "#8B5CF6", color: "#fff" } },
          { selector: 'node[id ^= "g"]', style: { backgroundColor: "#0EA5E9", color: "#fff" } },
          {
            selector: "node",
            style: {
              label: "data(label)",
              fontSize: 12,
              textWrap: "wrap",
              textMaxWidth: 100,
              textValign: "center",
              textHalign: "center",
              shape: "roundrectangle",
              width: "label",
              height: "label",
              padding: 15,
              borderWidth: 0,
              shadowBlur: 6,
              shadowColor: "#00000020",
            },
          },
          {
            selector: "edge",
            style: {
              width: 2,
              lineColor: "#CBD5E1",
              targetArrowColor: "#94A3B8",
              targetArrowShape: "triangle",
              curveStyle: "bezier",
              arrowScale: 1.2,
            },
          },
        ]}
      />
    </div>
  );
}
