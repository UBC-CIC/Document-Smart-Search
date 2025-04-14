"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Search, ChevronDown, ChevronRight } from "lucide-react"

export default function DocumentSearch() {
  const [activeTab, setActiveTab] = useState("document")
  const [currentPage, setCurrentPage] = useState(1)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filteredResults, setFilteredResults] = useState([])

  // Filter states
  const [yearFilters, setYearFilters] = useState({
    2021: false,
    2020: false,
    2019: false,
  })

  const [topicFilters, setTopicFilters] = useState({
    "Salmon Population": false,
    "Climate Change": false,
    Conservation: false,
    "Indigenous Rights": false,
  })

  const [documentTypeFilters, setDocumentTypeFilters] = useState({
    Research: false,
    Policy: false,
    Assessment: false,
    Report: false,
  })

  const [authorFilters, setAuthorFilters] = useState({
    "DFO Research Team": false,
    "External Researchers": false,
    "Policy Division": false,
  })

  // Expanded sections state
  const [expandedSections, setExpandedSections] = useState({
    topics: true,
    year: true,
    documentType: false,
    author: false,
  })

  // Toggle section expansion
  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  // Sample search results
  const allSearchResults = [
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
    },
  ]

  // Apply all filters
  const applyFilters = () => {
    const filtered = allSearchResults.filter((result) => {
      // Check if any year filter is active, if not, show all years
      const anyYearFilterActive = Object.values(yearFilters).some((value) => value)

      // Filter by year
      if (anyYearFilterActive && !yearFilters[result.year]) {
        return false
      }

      // Check if any topic filter is active
      const anyTopicFilterActive = Object.values(topicFilters).some((value) => value)

      // Filter by topic
      if (anyTopicFilterActive) {
        const hasMatchingTopic = result.topics.some((topic) => topicFilters[topic])
        if (!hasMatchingTopic) {
          return false
        }
      }

      // Check if any document type filter is active
      const anyDocTypeFilterActive = Object.values(documentTypeFilters).some((value) => value)

      // Filter by document type
      if (anyDocTypeFilterActive && !documentTypeFilters[result.documentType]) {
        return false
      }

      // Check if any author filter is active
      const anyAuthorFilterActive = Object.values(authorFilters).some((value) => value)

      // Filter by author
      if (anyAuthorFilterActive && !authorFilters[result.author]) {
        return false
      }

      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          result.title.toLowerCase().includes(query) ||
          result.category.toLowerCase().includes(query) ||
          result.highlights.some((highlight) => highlight.toLowerCase().includes(query)) ||
          result.topics.some((topic) => topic.toLowerCase().includes(query))
        )
      }

      return true
    })

    setFilteredResults(filtered)
  }

  // Reset all filters
  const resetFilters = () => {
    setYearFilters({
      2021: false,
      2020: false,
      2019: false,
    })

    setTopicFilters({
      "Salmon Population": false,
      "Climate Change": false,
      Conservation: false,
      "Indigenous Rights": false,
    })

    setDocumentTypeFilters({
      Research: false,
      Policy: false,
      Assessment: false,
      Report: false,
    })

    setAuthorFilters({
      "DFO Research Team": false,
      "External Researchers": false,
      "Policy Division": false,
    })

    // Clear search query
    setSearchQuery("")
  }

  // Apply filters when search query changes
  useEffect(() => {
    applyFilters()
  }, [searchQuery, yearFilters, topicFilters, documentTypeFilters, authorFilters])

  // Initial load of all results
  useEffect(() => {
    setFilteredResults(allSearchResults)
  }, [])

  // Handle search input
  const handleSearch = (e) => {
    e.preventDefault()
    applyFilters()
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-all duration-300">
      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-6 md:py-8">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-6 md:mb-8 dark:text-white">
          Document & Metadata Search
        </h2>

        {/* Search Box */}
        <div className="mb-6 md:mb-8">
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              placeholder="Search for documents..."
              className="w-full py-2.5 md:py-3 px-4 pr-12 bg-gray-200 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-gray-100 focus:outline-none placeholder:text-gray-500 dark:placeholder:text-gray-400 text-sm md:text-base"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              type="submit"
              className="absolute right-2 md:right-3 top-1/2 transform -translate-y-1/2 bg-white dark:bg-gray-600 p-1.5 md:p-2 rounded-md"
            >
              <Search className="h-4 w-4 md:h-5 md:w-5 dark:text-gray-300" />
            </button>
          </form>
        </div>

        {/* Mobile Filter Toggle */}
        <div className="md:hidden mb-4">
          <button
            className="w-full bg-gray-200 dark:bg-gray-700 py-2 px-4 rounded-lg flex justify-between items-center"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
          >
            <span className="font-medium dark:text-white">Filters</span>
            {isFilterOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
        </div>

        {/* Filters and Results */}
        <div className="flex flex-col md:flex-row gap-6">
          {/* Filters */}
          <div
            className={`w-full md:w-64 bg-gray-100 dark:bg-gray-800 rounded-lg p-4 h-fit ${isFilterOpen ? "block" : "hidden md:block"}`}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium dark:text-white">Search Settings</h3>
              <button className="text-blue-600 dark:text-blue-400 text-sm hover:underline" onClick={resetFilters}>
                Reset
              </button>
            </div>

            {/* Filter sections */}
            <div className="space-y-4">
              {/* Topic Filters */}
              <div>
                <button
                  className="flex justify-between items-center w-full py-2 text-left font-medium dark:text-white"
                  onClick={() => toggleSection("topics")}
                >
                  <span>Topics</span>
                  {expandedSections.topics ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {expandedSections.topics && (
                  <div className="mt-2 pl-2">
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={topicFilters["Salmon Population"]}
                        onChange={() =>
                          setTopicFilters((prev) => ({ ...prev, "Salmon Population": !prev["Salmon Population"] }))
                        }
                        className="rounded"
                      />
                      <span>Salmon Population</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={topicFilters["Climate Change"]}
                        onChange={() =>
                          setTopicFilters((prev) => ({ ...prev, "Climate Change": !prev["Climate Change"] }))
                        }
                        className="rounded"
                      />
                      <span>Climate Change</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={topicFilters["Conservation"]}
                        onChange={() => setTopicFilters((prev) => ({ ...prev, Conservation: !prev["Conservation"] }))}
                        className="rounded"
                      />
                      <span>Conservation</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={topicFilters["Indigenous Rights"]}
                        onChange={() =>
                          setTopicFilters((prev) => ({ ...prev, "Indigenous Rights": !prev["Indigenous Rights"] }))
                        }
                        className="rounded"
                      />
                      <span>Indigenous Rights</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Year Filters */}
              <div>
                <button
                  className="flex justify-between items-center w-full py-2 text-left font-medium dark:text-white"
                  onClick={() => toggleSection("year")}
                >
                  <span>Year</span>
                  {expandedSections.year ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {expandedSections.year && (
                  <div className="mt-2 pl-2">
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={yearFilters["2021"]}
                        onChange={() => setYearFilters((prev) => ({ ...prev, 2021: !prev["2021"] }))}
                        className="rounded"
                      />
                      <span>2021</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={yearFilters["2020"]}
                        onChange={() => setYearFilters((prev) => ({ ...prev, 2020: !prev["2020"] }))}
                        className="rounded"
                      />
                      <span>2020</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={yearFilters["2019"]}
                        onChange={() => setYearFilters((prev) => ({ ...prev, 2019: !prev["2019"] }))}
                        className="rounded"
                      />
                      <span>2019</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Document Type Filters */}
              <div>
                <button
                  className="flex justify-between items-center w-full py-2 text-left font-medium dark:text-white"
                  onClick={() => toggleSection("documentType")}
                >
                  <span>Document Type</span>
                  {expandedSections.documentType ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                {expandedSections.documentType && (
                  <div className="mt-2 pl-2">
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={documentTypeFilters["Research"]}
                        onChange={() => setDocumentTypeFilters((prev) => ({ ...prev, Research: !prev["Research"] }))}
                        className="rounded"
                      />
                      <span>Research</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={documentTypeFilters["Policy"]}
                        onChange={() => setDocumentTypeFilters((prev) => ({ ...prev, Policy: !prev["Policy"] }))}
                        className="rounded"
                      />
                      <span>Policy</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={documentTypeFilters["Assessment"]}
                        onChange={() =>
                          setDocumentTypeFilters((prev) => ({ ...prev, Assessment: !prev["Assessment"] }))
                        }
                        className="rounded"
                      />
                      <span>Assessment</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={documentTypeFilters["Report"]}
                        onChange={() => setDocumentTypeFilters((prev) => ({ ...prev, Report: !prev["Report"] }))}
                        className="rounded"
                      />
                      <span>Report</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Author Filters */}
              <div>
                <button
                  className="flex justify-between items-center w-full py-2 text-left font-medium dark:text-white"
                  onClick={() => toggleSection("author")}
                >
                  <span>Author</span>
                  {expandedSections.author ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {expandedSections.author && (
                  <div className="mt-2 pl-2">
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={authorFilters["DFO Research Team"]}
                        onChange={() =>
                          setAuthorFilters((prev) => ({ ...prev, "DFO Research Team": !prev["DFO Research Team"] }))
                        }
                        className="rounded"
                      />
                      <span>DFO Research Team</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={authorFilters["External Researchers"]}
                        onChange={() =>
                          setAuthorFilters((prev) => ({
                            ...prev,
                            "External Researchers": !prev["External Researchers"],
                          }))
                        }
                        className="rounded"
                      />
                      <span>External Researchers</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={authorFilters["Policy Division"]}
                        onChange={() =>
                          setAuthorFilters((prev) => ({ ...prev, "Policy Division": !prev["Policy Division"] }))
                        }
                        className="rounded"
                      />
                      <span>Policy Division</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
              <div className="flex items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Default to:</span>
                <div className="ml-2 flex items-center bg-gray-200 dark:bg-gray-700 rounded-full p-1">
                  <button className="px-3 py-1 rounded-full bg-white dark:bg-gray-600 text-sm font-medium shadow-sm">
                    Relevance
                  </button>
                  <button className="px-3 py-1 rounded-full text-sm font-medium dark:text-gray-300">Date</button>
                </div>
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">{filteredResults.length} results</span>
            </div>

            {/* Search Results */}
            <div className="space-y-4">
              {filteredResults.length > 0 ? (
                filteredResults.map((result) => (
                  <div
                    key={result.id}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 md:p-4 border dark:border-gray-700"
                  >
                    <div className="flex justify-between mb-2">
                      <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Reference: #{result.id}</div>
                      <div className="text-xs md:text-sm text-blue-600 dark:text-blue-400">{result.category}</div>
                    </div>

                    <div className="flex justify-between mb-2">
                      <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">
                        Created: 4/5/{result.year}
                      </div>
                      <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Year: {result.year}</div>
                    </div>

                    <div className="mt-3 md:mt-4 mb-2">
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-2 mb-2">
                        <div className="font-medium dark:text-white text-sm md:text-base">{result.title}</div>
                        <div className="flex space-x-2 text-xs md:text-sm">
                          <Link href={`/document-summary/`} className="text-blue-600 dark:text-blue-400">
                            Document Summary
                          </Link>
                          <button className="text-blue-600 dark:text-blue-400">Query Summary</button>
                        </div>
                      </div>

                      <div className="mt-2 bg-gray-100 dark:bg-gray-700 p-2 md:p-3 rounded-md">
                        <ul className="list-disc pl-5 text-xs md:text-sm dark:text-gray-300">
                          {result.highlights.map((highlight, index) => (
                            <li key={index}>{highlight}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="flex justify-end mt-2">
                      <Link
                        href={`/document-view/${result.id}`}
                        className="text-blue-600 dark:text-blue-400 text-xs md:text-sm flex items-center"
                      >
                        View Document <ChevronRight className="h-3 w-3 md:h-4 md:w-4 ml-1" />
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 text-center">
                  <p className="text-gray-600 dark:text-gray-400">No documents found matching your search criteria.</p>
                </div>
              )}
            </div>

            {/* Pagination */}
            <div className="flex justify-center mt-6 md:mt-8">
              <nav className="flex items-center space-x-1">
                <button className="px-2 py-1 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
                  &laquo;
                </button>
                {[1, 2, 3, 4, 5].map((page) => (
                  <button
                    key={page}
                    className={`px-2 md:px-3 py-1 rounded text-xs md:text-sm ${
                      currentPage === page
                        ? "bg-blue-600 text-white"
                        : "text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <span className="px-1 text-gray-600 dark:text-gray-300">...</span>
                <button className="px-2 py-1 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
                  &raquo;
                </button>
              </nav>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
