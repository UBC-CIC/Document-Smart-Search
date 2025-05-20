"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Search, ChevronDown, ChevronRight, X } from "lucide-react"

export default function DocumentSearch() {
  const [activeTab, setActiveTab] = useState("document")
  const [currentPage, setCurrentPage] = useState(1)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filteredResults, setFilteredResults] = useState([])
  const [sortBy, setSortBy] = useState("recent") // Default sort is recent (newest first)
  const [isQuerySummaryOpen, setIsQuerySummaryOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState(null)
  const modalRef = useRef(null)

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

  const [mandateFilters, setMandateFilters] = useState({
    "Sustainable Fisheries": false,
    "Species at Risk": false,
    "Aquatic Ecosystem": false,
    "Indigenous Fisheries": false,
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
    mandates: true,
    author: true,
  })

  // Toggle section expansion
  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  const [querySummaryLoading, setQuerySummaryLoading] = useState(false)
  const [querySummaryData, setQuerySummaryData] = useState(null)

  const getQuerySummary = async (documentId) => {
    // Find the document by ID
    const document = allSearchResults.find((doc) => doc.id === documentId)

    if (!document) {
      return {
        title: "Document Not Found",
        summary: "The requested document could not be found.",
        keyInsights: ["No information available"],
      }
    }

    // Return cached summary if available
    if (querySummaryData && querySummaryData.documentId === documentId) {
      return querySummaryData
    }

    setQuerySummaryLoading(true)

    try {
      // Create a prompt that asks for a summary of the document
      const prompt = `Please provide a comprehensive summary of the document titled "${document.title}" (ID: ${document.id}). 
      The document is about ${document.topics.join(", ")} and was authored by ${document.author} in ${document.year}.
      Include key insights and main points from the document.`

      // Call the LLM API endpoint
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/text_generation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message_content: prompt,
          user_role: "public", // Default to public role
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to generate summary")
      }

      const data = await response.json()

      // Parse the response to extract key insights
      // This is a simple approach - in production you might want to prompt the LLM to format its response
      const paragraphs = data.content.split("\n\n").filter((p) => p.trim().length > 0)
      const summary = paragraphs[0] || data.content

      // Extract key insights (assuming they might be in bullet points or separate paragraphs)
      let keyInsights = []
      if (paragraphs.length > 1) {
        // Try to find bullet points
        const bulletMatches = data.content.match(/[•\-*]\s+(.*?)(?=\n[•\-*]|\n\n|$)/gs)
        if (bulletMatches && bulletMatches.length > 0) {
          keyInsights = bulletMatches.map((point) => point.replace(/^[•\-*]\s+/, "").trim())
        } else {
          // Use additional paragraphs as insights
          keyInsights = paragraphs.slice(1).map((p) => p.trim())
        }
      }

      // Limit to 4 key insights
      keyInsights = keyInsights.slice(0, 4)

      // If no key insights were found, create some generic ones
      if (keyInsights.length === 0) {
        keyInsights = [
          "This is an important document in the field of " + document.topics[0],
          "Published in " + document.year + " by " + document.author,
          "Relates to " + document.mandates.join(", "),
        ]
      }

      const summaryData = {
        documentId,
        title: document.title,
        summary,
        keyInsights,
      }

      setQuerySummaryData(summaryData)
      return summaryData
    } catch (error) {
      console.error("Error generating summary:", error)
      return {
        title: document.title,
        summary:
          "We couldn't generate a summary for this document. Please try again later or view the full document for more information.",
        keyInsights: [
          "Summary generation failed",
          "Please try again later",
          "You can view the full document for complete information",
        ],
      }
    } finally {
      setQuerySummaryLoading(false)
    }
  }

  // Update the openQuerySummary function to call the API
  const openQuerySummary = async (documentId) => {
    setSelectedDocumentId(documentId)
    setIsQuerySummaryOpen(true)

    // Start loading the summary immediately
    getQuerySummary(documentId)
  }

  const closeQuerySummary = () => {
    setIsQuerySummaryOpen(false)
    setSelectedDocumentId(null)
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        closeQuerySummary()
      }
    }

    if (isQuerySummaryOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isQuerySummaryOpen])

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

      // Check if any mandate filter is active
      const anyMandateFilterActive = Object.values(mandateFilters).some((value) => value)

      // Filter by mandate
      if (anyMandateFilterActive) {
        const hasMatchingMandate = result.mandates.some((mandate) => mandateFilters[mandate])
        if (!hasMatchingMandate) {
          return false
        }
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
          result.topics.some((topic) => topic.toLowerCase().includes(query)) ||
          result.mandates.some((mandate) => mandate.toLowerCase().includes(query))
        )
      }

      return true
    })

    // Sort results based on sortBy
    if (sortBy === "recent") {
      filtered.sort((a, b) => Number.parseInt(b.year) - Number.parseInt(a.year))
    } else if (sortBy === "oldest") {
      filtered.sort((a, b) => Number.parseInt(a.year) - Number.parseInt(b.year))
    } else if (sortBy === "a-z") {
      filtered.sort((a, b) => a.title.localeCompare(b.title))
    }

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

    setMandateFilters({
      "Sustainable Fisheries": false,
      "Species at Risk": false,
      "Aquatic Ecosystem": false,
      "Indigenous Fisheries": false,
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
  }, [searchQuery, yearFilters, topicFilters, mandateFilters, authorFilters, sortBy])

  // Initial load of all results
  useEffect(() => {
    setFilteredResults(allSearchResults)
  }, [])

  // Handle search input
  const handleSearch = (e) => {
    e.preventDefault()
    applyFilters()
  }

  // Handle sort change
  const handleSortChange = (sort) => {
    setSortBy(sort)
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

              {/* Mandate Filters */}
              <div>
                <button
                  className="flex justify-between items-center w-full py-2 text-left font-medium dark:text-white"
                  onClick={() => toggleSection("mandates")}
                >
                  <span>Mandates</span>
                  {expandedSections.mandates ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                {expandedSections.mandates && (
                  <div className="mt-2 pl-2">
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={mandateFilters["Sustainable Fisheries"]}
                        onChange={() =>
                          setMandateFilters((prev) => ({
                            ...prev,
                            "Sustainable Fisheries": !prev["Sustainable Fisheries"],
                          }))
                        }
                        className="rounded"
                      />
                      <span>Sustainable Fisheries</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={mandateFilters["Species at Risk"]}
                        onChange={() =>
                          setMandateFilters((prev) => ({ ...prev, "Species at Risk": !prev["Species at Risk"] }))
                        }
                        className="rounded"
                      />
                      <span>Species at Risk</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={mandateFilters["Aquatic Ecosystem"]}
                        onChange={() =>
                          setMandateFilters((prev) => ({ ...prev, "Aquatic Ecosystem": !prev["Aquatic Ecosystem"] }))
                        }
                        className="rounded"
                      />
                      <span>Aquatic Ecosystem</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={mandateFilters["Indigenous Fisheries"]}
                        onChange={() =>
                          setMandateFilters((prev) => ({
                            ...prev,
                            "Indigenous Fisheries": !prev["Indigenous Fisheries"],
                          }))
                        }
                        className="rounded"
                      />
                      <span>Indigenous Fisheries</span>
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
                <span className="text-sm text-gray-600 dark:text-gray-400">Sort by:</span>
                <div className="ml-2 flex items-center bg-gray-200 dark:bg-gray-700 rounded-full p-1">
                  <button
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      sortBy === "recent" ? "bg-white dark:bg-gray-600 shadow-sm" : "dark:text-gray-300"
                    }`}
                    onClick={() => handleSortChange("recent")}
                  >
                    Recent
                  </button>
                  <button
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      sortBy === "oldest" ? "bg-white dark:bg-gray-600 shadow-sm" : "dark:text-gray-300"
                    }`}
                    onClick={() => handleSortChange("oldest")}
                  >
                    Oldest
                  </button>
                  <button
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      sortBy === "a-z" ? "bg-white dark:bg-gray-600 shadow-sm" : "dark:text-gray-300"
                    }`}
                    onClick={() => handleSortChange("a-z")}
                  >
                    A-Z
                  </button>
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
                      <div className="text-xs md:text-sm text-blue-600 dark:text-blue-400">{result.category}</div>
                    </div>

                    <div className="flex justify-between mb-2">
                      <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">
                        Created: 4/5/{result.year}
                      </div>
                      <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Year: {result.year}</div>
                    </div>

                    <div className="flex justify-between mb-2">
                      <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Author: {result.author}</div>
                      <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">
                        Mandates: {result.mandates.join(", ")}
                      </div>
                    </div>

                    <div className="mt-3 md:mt-4 mb-2">
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-2 mb-2">
                        <div className="font-medium dark:text-white text-sm md:text-base">{result.title}</div>
                        <div className="flex space-x-2 text-xs md:text-sm">
                          <Link href={`/document-summary/`} className="text-blue-600 dark:text-blue-400">
                            Document Summary
                          </Link>
                          <button
                            className="text-blue-600 dark:text-blue-400"
                            onClick={() => openQuerySummary(result.id)}
                          >
                            Query Summary
                          </button>
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
                      <a
                        href="https://publications.gc.ca/site/archivee-archived.html?url=https://publications.gc.ca/collections/collection_2023/mpo-dfo/fs70-7/Fs70-7-2023-036-eng.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 text-xs md:text-sm flex items-center"
                      >
                        View Document <ChevronRight className="h-3 w-3 md:h-4 md:w-4 ml-1" />
                      </a>
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
      {isQuerySummaryOpen && selectedDocumentId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div
            ref={modalRef}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto"
          >
            <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-medium dark:text-white">
                {querySummaryData?.title ||
                  allSearchResults.find((doc) => doc.id === selectedDocumentId)?.title ||
                  "Loading..."}
              </h3>
              <button
                onClick={closeQuerySummary}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4">
              {querySummaryLoading ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="flex items-center space-x-2 mb-4">
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></div>
                    <div
                      className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                    <div
                      className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.4s" }}
                    ></div>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">Generating AI summary...</p>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                      AI-Generated Document Summary
                    </h4>
                    <p className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed">
                      {querySummaryData?.summary || "Summary not available"}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Key Insights</h4>
                    <ul className="list-disc pl-5 text-sm dark:text-gray-300 space-y-1">
                      {(querySummaryData?.keyInsights || ["No key insights available"]).map((insight, index) => (
                        <li key={index}>{insight}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400 italic">
              This summary was generated using AI and may not capture all nuances of the document. Please refer to the
              original document for complete information.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
