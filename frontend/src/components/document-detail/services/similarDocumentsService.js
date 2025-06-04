import { USE_MOCK_DATA } from "./documentDetailService";
import { 
  mockSimilarDocuments, 
  defaultSimilarDocuments,
  similarDocumentFilterOptions as defaultFilterOptions
} from "../data/similarDocumentsData";

/**
 * Fetch available filter options for similar documents
 * This is now a separate function with a single responsibility
 */
export async function fetchSimilarDocumentFilterOptions() {
  // Use mock data if enabled
  if (USE_MOCK_DATA) {
    return defaultFilterOptions;
  }

  try {
    // Define filters to request
    const filtersToRequest = ["years", "document_types"];
    
    // Build the URL with query parameters
    const url = new URL(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/filters`);
    url.searchParams.append("filters", filtersToRequest.join(","));

    const token = await getUserToken();
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json();

    return {
      years: data.years || [],
      documentTypes: data.documentTypes || []
    };
  } catch (error) {
    console.error("Error fetching filter options:", error.message);
    return defaultFilterOptions;
  }
}

/**
 * Fetch semantically similar documents for a document ID
 * Returns up to 50 filtered documents without pagination or sorting
 */
export async function fetchSimilarDocuments(documentId, filters = { years: {}, documentTypes: {} }) {
  // Use mock data if enabled
  if (USE_MOCK_DATA) {
    console.log("Using mock data for similar documents with ID:", documentId);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    try {
      // Get mock data for the document
      let allDocuments = mockSimilarDocuments[documentId] || defaultSimilarDocuments;
      
      // Filter documents - only apply filtering
      const filteredDocuments = filterMockDocuments(allDocuments, filters);
      
      // Limit to 50 results maximum
      const limitedResults = filteredDocuments.slice(0, 50);
      
      return {
        documents: limitedResults,
        totalCount: filteredDocuments.length
      };
    } catch (error) {
      console.error("Error processing mock similar documents:", error);
      throw error;
    }
  }
  
  // Real API implementation
  try {
    // Convert our filter format to API expected format
    const apiFilters = {
      years: Object.entries(filters.years)
        .filter(([_, isActive]) => isActive)
        .map(([year]) => year),
      documentTypes: Object.entries(filters.documentTypes)
        .filter(([_, isActive]) => isActive)
        .map(([type]) => type)
    };
    
    const token = await getUserToken();
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/similarity-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        documentId: documentId,
        filters: {
          years: Object.keys(filters.years).filter(year => filters.years[year]),
          documentTypes: Object.keys(filters.documentTypes).filter(type => filters.documentTypes[type])
        },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Get response data
    const responseData = await response.json();
    
    // Return documents and metadata without pagination or sorting
    return {
      documents: responseData.documents || [],
      totalCount: responseData.totalCount || 0
    };
  } catch (error) {
    console.error("Error fetching similar documents:", error);
    throw error;
  }
}

// Filter documents by year and document type
const filterMockDocuments = (documents, filters) => {
  if (!documents) return [];
  
  // Create a copy of documents to avoid mutation
  let result = [...documents];
  
  // Filter by years if any year filters are active
  const activeYearFilters = Object.entries(filters.years).filter(([_, isActive]) => isActive);
  if (activeYearFilters.length > 0) {
    const activeYears = activeYearFilters.map(([year]) => year);
    result = result.filter(doc => activeYears.includes(String(doc.year)));
  }
  
  // Filter by document types if any document type filters are active
  const activeTypeFilters = Object.entries(filters.documentTypes).filter(([_, isActive]) => isActive);
  if (activeTypeFilters.length > 0) {
    const activeTypes = activeTypeFilters.map(([type]) => type);
    result = result.filter(doc => activeTypes.includes(doc.documentType));
  }
  
  return result;
};
