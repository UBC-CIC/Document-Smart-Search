"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Search, ChevronDown, ChevronRight, FileText, Download } from "lucide-react"

export default function DocumentSearch() {
  const [activeTab, setActiveTab] = useState("document")
  const [currentPage, setCurrentPage] = useState(1)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filteredResults, setFilteredResults] = useState([])
  const [documents, setDocuments] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filter states
  const [yearFilters, setYearFilters] = useState({})
  const [topicFilters, setTopicFilters] = useState({})
  const [documentTypeFilters, setDocumentTypeFilters] = useState({})
  const [authorFilters, setAuthorFilters] = useState({})

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

  // Use the full API endpoint from your environment variable
  const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT || ""

  // Fetch documents from API without using category
  const fetchDocuments = async () => {
    setLoading(true)
    setError(null)

    try {
      // Use absolute URL (API Gateway endpoint) instead of a relative URL
      const response = await fetch(`${API_ENDPOINT}/user/documents`)

      if (!response.ok) {
        throw new Error(`Error fetching documents: ${response.statusText}`)
      }

      const data = await response.json()
      setDocuments(data.document_files || {})

      // Extract unique filter values from documents
      const years = {}
      const topics = {}
      const types = {}
      const authors = {}

      // Process documents to create filterable results
      const processedResults = Object.entries(data.document_files || {}).map(([fileName, fileData]) => {
        const metadata = fileData.metadata ? JSON.parse(fileData.metadata) : {}
        const year = metadata.year || "Unknown"
        const documentType = metadata.type || "Unknown"
        const author = metadata.author || "Unknown"
        const documentTopics = metadata.topics || []

        // Add to filter options
        years[year] = false
        types[documentType] = false
        authors[author] = false
        documentTopics.forEach((topic) => {
          topics[topic] = false
        })

        return {
          id: fileName.split(".")[0],
          title: metadata.title || fileName,
          highlights: metadata.highlights || [],
          year,
          category: "", // Category removed
          documentType,
          author,
          topics: documentTopics,
          url: fileData.url,
          fileName,
        }
      })

      setYearFilters(years)
      setTopicFilters(topics)
      setDocumentTypeFilters(types)
      setAuthorFilters(authors)
      setFilteredResults(processedResults)
    } catch (err) {
      console.error("Error fetching documents:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Apply all filters on the fetched documents
  const applyFilters = () => {
    if (!documents || Object.keys(documents).length === 0) return

    const processedResults = Object.entries(documents).map(([fileName, fileData]) => {
      const metadata = fileData.metadata ? JSON.parse(fileData.metadata) : {}
      return {
        id: fileName.split(".")[0],
        title: metadata.title || fileName,
        highlights: metadata.highlights || [],
        year: metadata.year || "Unknown",
        category: "",
        documentType: metadata.type || "Unknown",
        author: metadata.author || "Unknown",
        topics: metadata.topics || [],
        url: fileData.url,
        fileName,
      }
    })

    const filtered = processedResults.filter((result) => {
      // Filter by year if any filter is active
      const anyYearFilterActive = Object.values(yearFilters).some((value) => value)
      if (anyYearFilterActive && !yearFilters[result.year]) {
        return false
      }

      // Filter by topic if active
      const anyTopicFilterActive = Object.values(topicFilters).some((value) => value)
      if (anyTopicFilterActive) {
        const hasMatchingTopic = result.topics.some((topic) => topicFilters[topic])
        if (!hasMatchingTopic) {
          return false
        }
      }

      // Filter by document type if active
      const anyDocTypeFilterActive = Object.values(documentTypeFilters).some((value) => value)
      if (anyDocTypeFilterActive && !documentTypeFilters[result.documentType]) {
        return false
      }

      // Filter by author if active
      const anyAuthorFilterActive = Object.values(authorFilters).some((value) => value)
      if (anyAuthorFilterActive && !authorFilters[result.author]) {
        return false
      }

      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          result.title.toLowerCase().includes(query) ||
          result.highlights.some((highlight) => highlight.toLowerCase().includes(query)) ||
          result.topics.some((topic) => topic.toLowerCase().includes(query)) ||
          result.fileName.toLowerCase().includes(query)
        )
      }

      return true
    })

    setFilteredResults(filtered)
  }

  // Reset all filters
  const resetFilters = () => {
    setYearFilters((prevFilters) => {
      const resetFilters = {}
      Object.keys(prevFilters).forEach((key) => {
        resetFilters[key] = false
      })
      return resetFilters
    })
    setTopicFilters((prevFilters) => {
      const resetFilters = {}
      Object.keys(prevFilters).forEach((key) => {
        resetFilters[key] = false
      })
      return resetFilters
    })
    setDocumentTypeFilters((prevFilters) => {
      const resetFilters = {}
      Object.keys(prevFilters).forEach((key) => {
        resetFilters[key] = false
      })
      return resetFilters
    })
    setAuthorFilters((prevFilters) => {
      const resetFilters = {}
      Object.keys(prevFilters).forEach((key) => {
        resetFilters[key] = false
      })
      return resetFilters
    })
    setSearchQuery("")
  }

  // Apply filters when dependencies change
  useEffect(() => {
    applyFilters()
  }, [searchQuery, yearFilters, topicFilters, documentTypeFilters, authorFilters])

  // Initial load of documents (no category needed)
  useEffect(() => {
    fetchDocuments()
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    applyFilters()
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-all duration-300">
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
            className={`w-full md:w-64 bg-gray-100 dark:bg-gray-800 rounded-lg p-4 h-fit ${
              isFilterOpen ? "block" : "hidden md:block"
            }`}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium dark:text-white">Search Settings</h3>
              <button
                className="text-blue-600 dark:text-blue-400 text-sm hover:underline"
                onClick={resetFilters}
              >
                Reset
              </button>
            </div>
            <div className="space-y-4">
              {/* Topic Filters */}
              <div>
                <button
                  className="flex justify-between items-center w-full py-2 text-left font-medium dark:text-white"
                  onClick={() => toggleSection("topics")}
                >
                  <span>Topics</span>
                  {expandedSections.topics ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                {expandedSections.topics && (
                  <div className="mt-2 pl-2">
                    {Object.keys(topicFilters).length > 0 ? (
                      Object.keys(topicFilters).map((topic) => (
                        <label key={topic} className="flex items-center space-x-2 text-sm dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={topicFilters[topic]}
                            onChange={() =>
                              setTopicFilters((prev) => ({ ...prev, [topic]: !prev[topic] }))
                            }
                            className="rounded"
                          />
                          <span>{topic}</span>
                        </label>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No topics available</p>
                    )}
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
                  {expandedSections.year ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                {expandedSections.year && (
                  <div className="mt-2 pl-2">
                    {Object.keys(yearFilters).length > 0 ? (
                      Object.keys(yearFilters).map((year) => (
                        <label key={year} className="flex items-center space-x-2 text-sm dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={yearFilters[year]}
                            onChange={() =>
                              setYearFilters((prev) => ({ ...prev, [year]: !prev[year] }))
                            }
                            className="rounded"
                          />
                          <span>{year}</span>
                        </label>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No years available</p>
                    )}
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
                    {Object.keys(documentTypeFilters).length > 0 ? (
                      Object.keys(documentTypeFilters).map((type) => (
                        <label key={type} className="flex items-center space-x-2 text-sm dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={documentTypeFilters[type]}
                            onChange={() =>
                              setDocumentTypeFilters((prev) => ({ ...prev, [type]: !prev[type] }))
                            }
                            className="rounded"
                          />
                          <span>{type}</span>
                        </label>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No document types available</p>
                    )}
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
                  {expandedSections.author ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                {expandedSections.author && (
                  <div className="mt-2 pl-2">
                    {Object.keys(authorFilters).length > 0 ? (
                      Object.keys(authorFilters).map((author) => (
                        <label key={author} className="flex items-center space-x-2 text-sm dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={authorFilters[author]}
                            onChange={() =>
                              setAuthorFilters((prev) => ({ ...prev, [author]: !prev[author] }))
                            }
                            className="rounded"
                          />
                          <span>{author}</span>
                        </label>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No authors available</p>
                    )}
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
                  <button className="px-3 py-1 rounded-full text-sm font-medium dark:text-gray-300">
                    Date
                  </button>
                </div>
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">{filteredResults.length} results</span>
            </div>
            {loading && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 text-center">
                <p className="text-gray-600 dark:text-gray-400">Loading documents...</p>
              </div>
            )}
            {error && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 text-center border border-red-300">
                <p className="text-red-600 dark:text-red-400">Error: {error}</p>
              </div>
            )}
            <div className="space-y-4">
              {!loading && !error && filteredResults.length > 0 ? (
                filteredResults.map((result) => (
                  <div
                    key={result.id + result.fileName}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 md:p-4 border dark:border-gray-700"
                  >
                    <div className="flex justify-between mb-2">
                      <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">File: {result.fileName}</div>
                    </div>
                    <div className="flex justify-between mb-2">
                      <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">
                        Type: {result.documentType}
                      </div>
                      <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Year: {result.year}</div>
                    </div>
                    <div className="mt-3 md:mt-4 mb-2">
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-2 mb-2">
                        <div className="font-medium dark:text-white text-sm md:text-base">{result.title}</div>
                        <div className="flex space-x-2 text-xs md:text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Author: {result.author}</span>
                        </div>
                      </div>
                      {result.highlights && result.highlights.length > 0 && (
                        <div className="mt-2 bg-gray-100 dark:bg-gray-700 p-2 md:p-3 rounded-md">
                          <ul className="list-disc pl-5 text-xs md:text-sm dark:text-gray-300">
                            {result.highlights.map((highlight, index) => (
                              <li key={index}>{highlight}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {result.topics && result.topics.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {result.topics.map((topic, index) => (
                            <span
                              key={index}
                              className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded-full text-gray-700 dark:text-gray-300"
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end mt-2 space-x-2">
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 text-xs md:text-sm flex items-center"
                      >
                        <Download className="h-3 w-3 md:h-4 md:w-4 mr-1" /> Download
                      </a>
                      <Link
                        href={`/document-view/${result.id}`}
                        className="text-blue-600 dark:text-blue-400 text-xs md:text-sm flex items-center"
                      >
                        <FileText className="h-3 w-3 md:h-4 md:w-4 mr-1" /> View
                      </Link>
                    </div>
                  </div>
                ))
              ) : !loading && !error ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 text-center">
                  <p className="text-gray-600 dark:text-gray-400">No documents found matching your search criteria.</p>
                </div>
              ) : null}
            </div>
            {filteredResults.length > 0 && (
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
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
