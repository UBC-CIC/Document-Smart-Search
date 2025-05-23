import { allMockResults, filterOptions as defaultFilters } from "../data/defaultData"

// Simple boolean flag to enable/disable mock data
export const USE_MOCK_DATA = false; // Set to false to disable mock data in development

// Fetch available filter options from the API
export async function fetchFilterOptions() {
  // Use mock data if enabled
  if (USE_MOCK_DATA) {
    return defaultFilters;
  }

  try {
    // Define filters to request
    // const filtersToRequest = ["years", "topics", "mandates", "authors", "document_types"];
    
    // Build the URL with query parameters
    const url = new URL(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/filters`);
    // url.searchParams.append("filters", filtersToRequest.join(","));

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()

    // console.log("Filter options fetched successfully:", data)
    return data
  } catch (error) {
    console.error("Error fetching filter options:", error.message)
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
    // Transform filter format for API
    const transformedFilters = {
      years: Object.keys(filters.yearFilters || {}).filter(key => filters.yearFilters[key]),
      topics: Object.keys(filters.topicFilters || {}).filter(key => filters.topicFilters[key]),
      mandates: Object.keys(filters.mandateFilters || {}).filter(key => filters.mandateFilters[key]),
      authors: Object.keys(filters.authorFilters || {}).filter(key => filters.authorFilters[key]),
      documentTypes: Object.keys(filters.documentTypeFilters || {}).filter(key => filters.documentTypeFilters[key]),
    }
    
    // console.log("Performing document search with query:", query)
    // console.log("Transformed filters:", transformedFilters)
    // console.log("JSON SENDING:", JSON.stringify({ query, filters: transformedFilters }, null, 2))

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/hybrid-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_query: query,
        filters: transformedFilters,
      }),
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()

    // Sort results by semanticScore in descending order
    if (data.results && data.results.length > 0) {
      data.results.sort((a, b) => {
        // Handle cases where semanticScore might not exist
        const scoreA = a.semanticScore !== undefined ? a.semanticScore : 0;
        const scoreB = b.semanticScore !== undefined ? b.semanticScore : 0;
        return scoreB - scoreA; // Descending order
      });
    }

    // Log the highlights and results for debugging
    // console.log("data:", data.results[1])
    return data.results || []
  } catch (error) {
    console.error("Error performing document search:", error.message)
    // Fall back to mock data filtering
    if (USE_MOCK_DATA) {
      console.error("Using mock data due to API failure")
      return filterMockData(query, filters);
    }
    return []
  }
}

// Helper function to filter mock data when API call fails
function filterMockData(query, filters) {
  const { 
    yearFilters, 
    topicFilters, 
    mandateFilters, 
    authorFilters, 
    documentTypeFilters 
  } = filters
  
  let filtered = allMockResults.filter((result) => {
    // Check if any year filter is active, if not, show all years
    const anyYearFilterActive = Object.values(yearFilters).some((value) => value)
    if (anyYearFilterActive && !yearFilters[result.csasYear || result.year]) {
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

    // Check if any author filter is active - could be in csasEvent now
    const anyAuthorFilterActive = Object.values(authorFilters).some((value) => value)
    if (anyAuthorFilterActive) {
      const resultAuthor = result.author || "";
      const resultEvent = result.csasEvent || "";
      // Check both in author field or csasEvent
      if (!authorFilters[resultAuthor] && !Object.keys(authorFilters).some(author => 
        resultEvent.toLowerCase().includes(author.toLowerCase()))) {
        return false;
      }
    }
    
    // Check if any document type filter is active
    const anyDocTypeFilterActive = documentTypeFilters && Object.values(documentTypeFilters).some((value) => value)
    if (anyDocTypeFilterActive) {
      // Get document type, prioritize documentType over category for backwards compatibility
      const docType = result.documentType || result.category || 'Unknown'
      if (!documentTypeFilters[docType]) {
        return false
      }
    }

    // Filter by search query
    if (query) {
      const queryLower = query.toLowerCase()
      return (
        result.title.toLowerCase().includes(queryLower) ||
        (result.csasEvent && result.csasEvent.toLowerCase().includes(queryLower)) ||
        (result.documentType && result.documentType.toLowerCase().includes(queryLower)) ||
        result.highlights.some((highlight) => highlight.toLowerCase().includes(queryLower)) ||
        result.topics.some((topic) => topic.toLowerCase().includes(queryLower)) ||
        result.mandates.some((mandate) => mandate.toLowerCase().includes(queryLower))
      )
    }

    return true
  })

  // Sort mock results by semanticScore if available
  filtered.sort((a, b) => {
    const scoreA = a.semanticScore !== undefined ? a.semanticScore : 0;
    const scoreB = b.semanticScore !== undefined ? b.semanticScore : 0;
    return scoreB - scoreA; // Descending order
  });

  return filtered
}
