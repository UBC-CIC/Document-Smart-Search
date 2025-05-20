import { useState, useEffect } from "react"
import { filterOptions as defaultFilters } from "../data/defaultData"
import { fetchFilterOptions, performDocumentSearch } from "../services/documentSearchService"

export function useDocumentSearch() {
  const [searchQuery, setSearchQuery] = useState("")
  const [filteredResults, setFilteredResults] = useState([])
  const [sortBy, setSortBy] = useState("recent") // Default sort is recent (newest first)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [filterOptions, setFilterOptions] = useState(defaultFilters) // Use default filters initially
  const [hasSearched, setHasSearched] = useState(false)
  const [rawResults, setRawResults] = useState([]) // Store the raw results before sorting

  // Filter states
  const [yearFilters, setYearFilters] = useState({})
  const [topicFilters, setTopicFilters] = useState({})
  const [mandateFilters, setMandateFilters] = useState({})
  const [authorFilters, setAuthorFilters] = useState({})

  // Fetch filter options on component mount
  useEffect(() => {
    async function getFilterOptions() {
      setIsLoading(true)
      try {
        const options = await fetchFilterOptions()
        setFilterOptions(options)
        
        // Initialize filter states based on fetched options
        setYearFilters(Object.fromEntries(options.years.map((year) => [year, false])))
        setTopicFilters(Object.fromEntries(options.topics.map((topic) => [topic, false])))
        setMandateFilters(Object.fromEntries(options.mandates.map((mandate) => [mandate, false])))
        setAuthorFilters(Object.fromEntries(options.authors.map((author) => [author, false])))
      } catch (error) {
        console.error("Error getting filter options:", error)
      } finally {
        setIsLoading(false)
      }
    }
    
    getFilterOptions()
  }, [])

  // Apply all filters and perform search
  const applyFilters = async () => {
    // Don't perform search if query is empty
    if (!searchQuery.trim() && !Object.values(yearFilters).some(val => val) && 
        !Object.values(topicFilters).some(val => val) && 
        !Object.values(mandateFilters).some(val => val) &&
        !Object.values(authorFilters).some(val => val)) {
      return;
    }
    
    setIsLoading(true)
    setHasSearched(true)
    
    try {
      const filters = {
        yearFilters,
        topicFilters,
        mandateFilters,
        authorFilters,
      }
      
      // When fetching results, we don't need to pass the sortBy parameter to the backend
      const results = await performDocumentSearch(searchQuery, filters)
      setRawResults(results) // Store raw results
      
      // Apply sorting in the frontend
      const sortedResults = sortResults(results, sortBy)
      setFilteredResults(sortedResults)
    } catch (error) {
      console.error("Error applying filters:", error)
      setFilteredResults([])
      setRawResults([])
    } finally {
      setIsLoading(false)
    }
  }

  // Function to sort results based on sortBy
  const sortResults = (results, sortOption) => {
    const resultsToSort = [...results] // Create a copy to avoid mutating the original
    
    if (sortOption === "recent") {
      return resultsToSort.sort((a, b) => Number.parseInt(b.year) - Number.parseInt(a.year))
    } else if (sortOption === "oldest") {
      return resultsToSort.sort((a, b) => Number.parseInt(a.year) - Number.parseInt(b.year))
    } else if (sortOption === "a-z") {
      return resultsToSort.sort((a, b) => a.title.localeCompare(b.title))
    }
    
    return resultsToSort
  }

  // Reset all filters
  const resetFilters = () => {
    setYearFilters(Object.fromEntries(filterOptions.years.map((year) => [year, false])))
    setTopicFilters(Object.fromEntries(filterOptions.topics.map((topic) => [topic, false])))
    setMandateFilters(Object.fromEntries(filterOptions.mandates.map((mandate) => [mandate, false])))
    setAuthorFilters(Object.fromEntries(filterOptions.authors.map((author) => [author, false])))
    setSearchQuery("")
    
    // Clear results
    setFilteredResults([])
    setRawResults([])
    setHasSearched(false)
  }

  // Update results when sort option changes (client-side sorting)
  useEffect(() => {
    if (hasSearched && rawResults.length > 0) {
      const sortedResults = sortResults(rawResults, sortBy)
      setFilteredResults(sortedResults)
    }
  }, [sortBy, rawResults])

  return {
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
    resetFilters,
    applyFilters,
    totalResults: filteredResults.length,
    isLoading,
    hasSearched,
  }
}
