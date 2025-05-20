import { use } from "react";
import { allMockResults, filterOptions as defaultFilters } from "../data/defaultData"

// Simple boolean flag to enable/disable mock data
export const USE_MOCK_DATA = true; // Set to false to disable mock data in development

// Fetch available filter options from the API
export async function fetchFilterOptions() {
  // Use mock data if enabled
  if (USE_MOCK_DATA) {
    return defaultFilters;
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}search/filters`)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    return data
  } catch (error) {
    console.error("Error fetching filter options:", error.message)
    // Always fall back to default filters if API call fails
    return defaultFilters
  }
}

// Perform search against the API
export async function performDocumentSearch(query, filters) {
  // If this is an empty initial search (no query, no active filters), 
  // return an empty array instead of all results
  const hasActiveFilters = Object.values(filters).some(filterGroup => 
    Object.values(filterGroup).some(isActive => isActive)
  )
  
  if (!query && !hasActiveFilters) {
    return []
  }

  // Use mock data if enabled
  if (USE_MOCK_DATA) {
    return filterMockData(query, filters);
  }
  
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}search/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        filters
      }),
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    return data.results || []
  } catch (error) {
    console.error("Error performing document search:", error.message)
    // Fall back to mock data filtering
    if (useMockData) {
      console.error("Using mock data due to API failure")
      return filterMockData(query, filters);
    }
    return []
  }
}

// Helper function to filter mock data when API call fails
function filterMockData(query, filters) {
  const { yearFilters, topicFilters, mandateFilters, authorFilters } = filters
  
  const filtered = allMockResults.filter((result) => {
    // Check if any year filter is active, if not, show all years
    const anyYearFilterActive = Object.values(yearFilters).some((value) => value)
    if (anyYearFilterActive && !yearFilters[result.year]) {
      return false
    }

    // Check if any topic filter is active
    const anyTopicFilterActive = Object.values(topicFilters).some((value) => value)
    if (anyTopicFilterActive) {
      const hasMatchingTopic = result.topics.some((topic) => topicFilters[topic])
      if (!hasMatchingTopic) {
        return false
      }
    }

    // Check if any mandate filter is active
    const anyMandateFilterActive = Object.values(mandateFilters).some((value) => value)
    if (anyMandateFilterActive) {
      const hasMatchingMandate = result.mandates.some((mandate) => mandateFilters[mandate])
      if (!hasMatchingMandate) {
        return false
      }
    }

    // Check if any author filter is active
    const anyAuthorFilterActive = Object.values(authorFilters).some((value) => value)
    if (anyAuthorFilterActive && !authorFilters[result.author]) {
      return false
    }

    // Filter by search query
    if (query) {
      const queryLower = query.toLowerCase()
      return (
        result.title.toLowerCase().includes(queryLower) ||
        result.category.toLowerCase().includes(queryLower) ||
        result.highlights.some((highlight) => highlight.toLowerCase().includes(queryLower)) ||
        result.topics.some((topic) => topic.toLowerCase().includes(queryLower)) ||
        result.mandates.some((mandate) => mandate.toLowerCase().includes(queryLower))
      )
    }

    return true
  })

  return filtered
}
