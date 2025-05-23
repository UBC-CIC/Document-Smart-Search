// Default filter options - used when API fails to provide filter options
export const filterOptions = {
  years: ["2016", "2017", "2018", "2019", "2020", "2021", "2025"],
  topics: ['Stock Assessments', 'Biomass Estimation', 'Harvest Strategies & TAC (Total Allowable Catch)', 'Fisheries Monitoring & Compliance'],
  mandates: ['Sustainable Fisheries and Aquaculture', 'Cross-Cutting Themes'],
  authors: ["DFO Research Team", "External Researchers", "Policy Division"],
  documentTypes: ["Unknown"]
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
    csasYear: "2021",
    documentType: "Research Document",
    csasEvent: "East Coast Salmon Framework",
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
    csasYear: "2021",
    documentType: "Terms of Reference",
    csasEvent: "Aquaculture Sustainability Assessment",
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
    csasYear: "2020",
    documentType: "Scientific Advice",
    csasEvent: "Climate Impact Study",
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
    csasYear: "2020",
    documentType: "Policy",
    csasEvent: "Atlantic Cod Conservation Framework",
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
    csasYear: "2019",
    documentType: "Policy",
    csasEvent: "Indigenous Fishing Rights Review",
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
    csasYear: "2019",
    documentType: "Research",
    csasEvent: "Marine Pollution Assessment",
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
    csasYear: "2019",
    documentType: "Research",
    csasEvent: "Salmon Migration Study",
    topics: ["Salmon Population", "Migration"],
    mandates: ["Sustainable Fisheries", "Species at Risk"],
  },
]
