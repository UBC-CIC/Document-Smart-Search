export const mockDocumentDetails = {
  "6472": {
    id: "6472",
    title: "East Coast Salmon Stock Census",
    lastUpdated: "Jan 31, 2023",
    verified: true,
    type: "Research Document",
    year: "2021",
    subject: "Annual monitoring of Atlantic salmon populations on the east coast of Canada",
    csasEvent: "Framework for Assessing the Ecological Flow Requirements of Canada's East Coast Salmon",
    csasYear: "2021",
    documentUrl: "https://publications.gc.ca/site/archivee-archived.html?url=https://publications.gc.ca/collections/collection_2023/mpo-dfo/fs70-7/Fs70-7-2023-036-eng.pdf",
    // Multiple authors or none
    authors: [
      { name: "Dr. Sarah Johnson", department: "DFO Science Branch" },
      { name: "Dr. Michael Lee", department: "Memorial University" }
    ],
    relatedMandates: [
      { 
        name: "Sustainable Fisheries Framework", 
        explanation: "This census directly supports the sustainability goals by providing population data needed for quota decisions",
        semanticScore: 0.92,
        llmScore: 0.88
      },
      { 
        name: "Species at Risk Act Implementation", 
        explanation: "Salmon population monitoring is essential for determining if species are at risk and require protection",
        semanticScore: 0.85,
        llmScore: 0.91
      },
      { 
        name: "Aquatic Ecosystem Management", 
        explanation: "The data provides insights into overall ecosystem health and interactions between species",
        semanticScore: 0.79,
        llmScore: 0.82
      },
      { 
        name: "Indigenous Fisheries Strategy", 
        explanation: "Population data informs consultations with Indigenous communities regarding traditional fishing rights",
        semanticScore: 0.76,
        llmScore: 0.74
      }
    ],
    primaryTopics: [
      {
        name: "Salmon Population Assessment",
        explanation: "Detailed methodology for counting and assessing salmon populations across multiple rivers",
        semanticScore: 0.95,
        llmScore: 0.93
      },
      {
        name: "Marine Ecosystem Health",
        explanation: "Analysis of how salmon populations serve as indicators for broader ecosystem health",
        semanticScore: 0.87,
        llmScore: 0.89
      }
    ],
    secondaryTopics: [
      {
        name: "Sustainable Seafood Production",
        semanticScore: 0.72
      },
      {
        name: "Fishing Gear Design and Bycatch Reduction",
        semanticScore: 0.65
      }
    ],
    // Include related documents directly
    relatedDocuments: [
      {
        id: "6273",
        title: "Sustainable Aquaculture Practices",
        type: "Terms of Reference",
        year: "2021",
        csasEvent: "Framework for Assessing the Ecological Flow Requirements of Canada's East Coast Salmon",
        csasYear: "2021",
        documentUrl: "https://publications.gc.ca/site/eng/9.850192/publication.html"
      }
    ]
  },
  "6273": {
    id: "6273",
    title: "Sustainable Aquaculture Practices",
    lastUpdated: "Feb 15, 2023",
    verified: true,
    type: "Science Advisory Report",
    year: "2021",
    subject: "Review of sustainable practices in Canadian aquaculture",
    csasEvent: "Framework for Assessing the Ecological Flow Requirements of Canada's East Coast Salmon",
    csasYear: "2021",
    documentUrl: "https://publications.gc.ca/site/eng/9.850192/publication.html",
    authors: [
      { name: "Dr. Rebecca Wong", department: "DFO Aquaculture Division" },
      { name: "Dr. Thomas Smith", department: "University of British Columbia" }
    ],
    relatedMandates: [
      { 
        name: "Sustainable Fisheries Framework", 
        explanation: "This report directly addresses sustainable practices in aquaculture production",
        semanticScore: 0.94,
        llmScore: 0.96
      },
      { 
        name: "Aquatic Ecosystem Management", 
        explanation: "The research evaluates impacts of aquaculture on surrounding ecosystems",
        semanticScore: 0.91,
        llmScore: 0.89
      }
    ],
    primaryTopics: [
      {
        name: "Aquaculture Management",
        explanation: "Analysis of current management practices and recommendations for improvement",
        semanticScore: 0.98,
        llmScore: 0.97
      }
    ],
    secondaryTopics: [
      {
        name: "Water Quality Assessment",
        semanticScore: 0.83
      },
      {
        name: "Fish Health Monitoring",
        semanticScore: 0.79
      }
    ],
    // Include related documents directly
    relatedDocuments: [
      {
        id: "6472",
        title: "East Coast Salmon Stock Census",
        type: "Research Document",
        year: "2021",
        csasEvent: "Framework for Assessing the Ecological Flow Requirements of Canada's East Coast Salmon",
        csasYear: "2021",
        documentUrl: "https://publications.gc.ca/site/archivee-archived.html?url=https://publications.gc.ca/collections/collection_2023/mpo-dfo/fs70-7/Fs70-7-2023-036-eng.pdf"
      }
    ]
  },
  "default": {
    id: "unknown",
    title: "Document Not Found",
    lastUpdated: "N/A",
    verified: false,
    type: "Unknown",
    year: "N/A",
    subject: "This document could not be found in our system",
    csasEvent: "N/A",
    csasYear: "N/A",
    documentUrl: "#",
    authors: [],
    relatedMandates: [],
    primaryTopics: [],
    secondaryTopics: [],
    relatedDocuments: []  // Empty array for default/error case
  }
};
