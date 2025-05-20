// Default filter options - used when API fails to provide filter options
export const filterOptions = {
  years: ["2021", "2020", "2019"],
  topics: ["Salmon Population", "Climate Change", "Conservation", "Indigenous Rights"],
  mandates: ["Sustainable Fisheries", "Species at Risk", "Aquatic Ecosystem", "Indigenous Fisheries"],
  authors: ["DFO Research Team", "External Researchers", "Policy Division"],
}


// Mock search results - used when API fails and mock mode is enabled
export const allMockResults = [
  {
    id: "6472",
    title: "Salmon Fishing Impact Assessment",
    highlights: [
      "The Salmon population has declined by 15% in the past decade",
      "Experts say that Salmon fishing has impacted population growth rates",
    ],
    year: "2021",
    category: "Impact Assessment",
    documentType: "Assessment",
    author: "DFO Research Team",
    topics: ["Salmon Population", "Fishing Impact"],
    mandates: ["Sustainable Fisheries", "Species at Risk"],
  },
  {
    id: "6273",
    title: "Sustainable Aquaculture Practices",
    highlights: [
      "New sustainable practices in aquaculture show promising results",
      "Reduced environmental impact through closed-containment systems",
    ],
    year: "2021",
    category: "Sustainability",
    documentType: "Report",
    author: "External Researchers",
    topics: ["Aquaculture", "Sustainability"],
    mandates: ["Sustainable Fisheries", "Aquatic Ecosystem"],
  },
  {
    id: "5981",
    title: "Climate Change Effects on Marine Ecosystems",
    highlights: [
      "Rising ocean temperatures affecting marine biodiversity",
      "Coral reef systems showing signs of stress due to climate change",
    ],
    year: "2020",
    category: "Climate Research",
    documentType: "Research",
    author: "DFO Research Team",
    topics: ["Climate Change", "Marine Ecosystems"],
    mandates: ["Aquatic Ecosystem"],
  },
  {
    id: "5742",
    title: "Conservation Strategies for Atlantic Cod",
    highlights: [
      "Atlantic cod populations require immediate conservation measures",
      "Proposed strategies include seasonal fishing restrictions",
    ],
    year: "2020",
    category: "Conservation",
    documentType: "Policy",
    author: "Policy Division",
    topics: ["Conservation", "Atlantic Cod"],
    mandates: ["Species at Risk", "Sustainable Fisheries"],
  },
  {
    id: "5391",
    title: "Indigenous Fishing Rights Framework",
    highlights: [
      "New framework developed in consultation with Indigenous communities",
      "Recognition of traditional fishing practices and knowledge",
    ],
    year: "2019",
    category: "Policy",
    documentType: "Policy",
    author: "Policy Division",
    topics: ["Indigenous Rights", "Fishing Policy"],
    mandates: ["Indigenous Fisheries"],
  },
  {
    id: "5127",
    title: "Ocean Plastic Pollution Study",
    highlights: [
      "Microplastics detected in 85% of sampled marine species",
      "Long-term effects on marine food chains remain concerning",
    ],
    year: "2019",
    category: "Pollution",
    documentType: "Research",
    author: "External Researchers",
    topics: ["Pollution", "Marine Ecosystems"],
    mandates: ["Aquatic Ecosystem"],
  },
  {
    id: "4983",
    title: "Salmon Migration Patterns",
    highlights: [
      "Changes in salmon migration timing observed over past decade",
      "Correlation with changing water temperatures and currents",
    ],
    year: "2019",
    category: "Research",
    documentType: "Research",
    author: "DFO Research Team",
    topics: ["Salmon Population", "Migration"],
    mandates: ["Sustainable Fisheries", "Species at Risk"],
  },
]
