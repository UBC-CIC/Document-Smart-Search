import { useState, useEffect } from "react"
import { allSearchResults, filterOptions } from "../data/mockData"

export function useDocumentSearch() {
  const [searchQuery, setSearchQuery] = useState("")
  const [filteredResults, setFilteredResults] = useState([])
  const [sortBy, setSortBy] = useState("recent") // Default sort is recent (newest first)
  const [currentPage, setCurrentPage] = useState(1)

  // Filter states
  const [yearFilters, setYearFilters] = useState(
    Object.fromEntries(filterOptions.years.map((year) => [year, false]))
  )

  const [topicFilters, setTopicFilters] = useState(
    Object.fromEntries(filterOptions.topics.map((topic) => [topic, false]))
  )

  const [mandateFilters, setMandateFilters] = useState(
    Object.fromEntries(filterOptions.mandates.map((mandate) => [mandate, false]))
  )

  const [authorFilters, setAuthorFilters] = useState(
    Object.fromEntries(filterOptions.authors.map((author) => [author, false]))
  )

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
    setYearFilters(Object.fromEntries(filterOptions.years.map((year) => [year, false])))
    setTopicFilters(Object.fromEntries(filterOptions.topics.map((topic) => [topic, false])))
    setMandateFilters(Object.fromEntries(filterOptions.mandates.map((mandate) => [mandate, false])))
    setAuthorFilters(Object.fromEntries(filterOptions.authors.map((author) => [author, false])))
    setSearchQuery("")
  }

  // Apply filters when search query or filters change
  useEffect(() => {
    applyFilters()
  }, [searchQuery, yearFilters, topicFilters, mandateFilters, authorFilters, sortBy])

  // Initial load of all results
  useEffect(() => {
    setFilteredResults(allSearchResults)
  }, [])

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
  }
}
