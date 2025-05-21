"use client"

import { useState } from "react"

// Components
import SearchBar from "./components/SearchBar"
import Filters from "./components/Filters"
import ResultsList from "./components/ResultsList"
import QuerySummaryModal from "./components/QuerySummaryModal"

// Hooks
import { useDocumentSearch } from "./hooks/useDocumentSearch"
import { useQuerySummary } from "./hooks/useQuerySummary"

export default function DocumentSearch() {
  const [activeTab, setActiveTab] = useState("document")
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  
  const {
    searchQuery,
    setSearchQuery,
    filteredResults,
    sortBy,
    setSortBy,
    currentPage, 
    setCurrentPage,
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
  
  const {
    isQuerySummaryOpen,
    selectedDocumentId,
    userQuery,
    querySummaryLoading,
    querySummaryData,
    modalRef,
    openQuerySummary,
    closeQuerySummary,
  } = useQuerySummary()

  // Handle search input
  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      applyFilters()
    }
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
        <SearchBar 
          searchQuery={searchQuery} 
          setSearchQuery={setSearchQuery} 
          handleSearch={handleSearch} 
          isLoading={isLoading}
        />

        {/* Mobile Filter Toggle */}
        <div className="md:hidden mb-4">
          <button
            className="w-full bg-gray-200 dark:bg-gray-700 py-2 px-4 rounded-lg flex justify-between items-center"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
          >
            <span className="font-medium dark:text-white">Filters</span>
            {isFilterOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>

        {/* Filters and Results */}
        <div className="flex flex-col md:flex-row gap-6">
          {/* Filters */}
          <Filters 
            isFilterOpen={isFilterOpen}
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
            isLoading={isLoading}
          />

          {/* Results */}
          <ResultsList 
            filteredResults={filteredResults}
            sortBy={sortBy}
            handleSortChange={handleSortChange}
            totalResults={totalResults}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            totalPages={totalPages}
            openQuerySummary={(documentId) => openQuerySummary(documentId, searchQuery)}
            isLoading={isLoading}
            hasSearched={hasSearched}
            searchQuery={searchQuery}
          />
        </div>
      </main>
      
      {/* Query Summary Modal */}
      <QuerySummaryModal 
        isOpen={isQuerySummaryOpen}
        onClose={closeQuerySummary}
        modalRef={modalRef}
        documentId={selectedDocumentId}
        userQuery={userQuery}
        loading={querySummaryLoading}
        summaryData={querySummaryData}
      />
    </div>
  )
}
