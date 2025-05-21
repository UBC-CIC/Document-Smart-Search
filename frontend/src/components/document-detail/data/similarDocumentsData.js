// Mock data for semantically similar documents
export const mockSimilarDocuments = {
  // Document ID 6472
  "6472": [
    {
      id: "7001",
      title: "Atlantic Salmon Population Monitoring Framework",
      documentType: "Research Document",
      year: "2022",
      semanticScore: 0.92,
      csasEvent: "East Coast Salmon Monitoring Program",
      csasYear: "2022"
    },
    {
      id: "7002",
      title: "Ecological Requirements of Atlantic Salmon",
      documentType: "Scientific Advice",
      year: "2021",
      semanticScore: 0.89,
      csasEvent: "Atlantic Salmon Habitat Review",
      csasYear: "2021"
    },
    {
      id: "7003",
      title: "Species Distribution Models for Atlantic Salmon",
      documentType: "Research Document",
      year: "2023",
      semanticScore: 0.87,
      csasEvent: "Salmon Distribution Modelling",
      csasYear: "2023"
    },
    {
      id: "6273",
      title: "Sustainable Aquaculture Practices",
      documentType: "Terms of Reference",
      year: "2021",
      semanticScore: 0.84,
      csasEvent: "Aquaculture Sustainability Framework",
      csasYear: "2021"
    },
    {
      id: "7004",
      title: "Climate Change Impacts on Atlantic Salmon Habitat",
      documentType: "Research Document",
      year: "2022",
      semanticScore: 0.82,
      csasEvent: "Climate Impact on Salmon Habitat",
      csasYear: "2022"
    },
    {
      id: "7005",
      title: "Comparative Study of Salmon Populations in Eastern Canada",
      documentType: "Scientific Advice",
      year: "2020",
      semanticScore: 0.79,
      csasEvent: "Comparative Salmon Study",
      csasYear: "2020"
    },
    {
      id: "7006",
      title: "Migration Patterns of Atlantic Salmon: A Review",
      documentType: "Research Document",
      year: "2019",
      semanticScore: 0.77,
      csasEvent: "Salmon Migration Review",
      csasYear: "2019"
    }
  ],
  // Document ID 6273
  "6273": [
    {
      id: "8001",
      title: "Advances in Aquaculture Technologies",
      documentType: "Research Document",
      year: "2023",
      semanticScore: 0.91,
      csasEvent: "Aquaculture Technology Workshop",
      csasYear: "2023"
    },
    {
      id: "8002",
      title: "Environmental Impact Assessment of Aquaculture Operations",
      documentType: "Scientific Advice",
      year: "2022",
      semanticScore: 0.88,
      csasEvent: "Environmental Assessment Framework",
      csasYear: "2022"
    },
    {
      id: "8003",
      title: "Sustainable Fish Feed Development",
      documentType: "Research Document",
      year: "2021",
      semanticScore: 0.86,
      csasEvent: "Sustainable Feed for Fish",
      csasYear: "2021"
    },
    {
      id: "8004",
      title: "Water Quality Management in Aquaculture",
      documentType: "Terms of Reference",
      year: "2020",
      semanticScore: 0.83,
      csasEvent: "Water Management in Aquaculture",
      csasYear: "2020"
    },
    {
      id: "8005",
      title: "Disease Prevention in Farmed Fish",
      documentType: "Research Document",
      year: "2022",
      semanticScore: 0.81,
      csasEvent: "Disease Management in Aquaculture",
      csasYear: "2022"
    },
    {
      id: "8006",
      title: "Economic Benefits of Sustainable Aquaculture",
      documentType: "Policy",
      year: "2021",
      semanticScore: 0.78,
      csasEvent: "Economic Aspects of Aquaculture",
      csasYear: "2021"
    }
  ]
};

// Default similar documents for when a document ID doesn't match
export const defaultSimilarDocuments = [
  {
    id: "9001",
    title: "Marine Ecosystem Management Principles",
    documentType: "Research Document",
    year: "2023",
    semanticScore: 0.72,
    csasEvent: "Marine Conservation Planning",
    csasYear: "2023"
  },
  {
    id: "9002",
    title: "Fisheries Conservation and Management",
    documentType: "Scientific Advice",
    year: "2022",
    semanticScore: 0.70,
    csasEvent: "Fisheries Management Framework",
    csasYear: "2022"
  },
  {
    id: "9003",
    title: "Coastal Habitat Restoration Techniques",
    documentType: "Research Document",
    year: "2021",
    semanticScore: 0.67
  }
];

// Years and document types for filtering
export const similarDocumentFilterOptions = {
  years: ["2023", "2022", "2021", "2020", "2019"],
  documentTypes: ["Research Document", "Scientific Advice", "Terms of Reference", "Policy"]
};
