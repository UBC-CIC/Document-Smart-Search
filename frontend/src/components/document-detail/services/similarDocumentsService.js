import { USE_MOCK_DATA } from "./documentDetailService";
import { 
  mockSimilarDocuments, 
  defaultSimilarDocuments,
  similarDocumentFilterOptions
} from "../data/similarDocumentsData";

// Filter documents by year and document type
const filterDocuments = (documents, filters) => {
  let result = [...documents];
  
  // Filter by years if any year filters are active
  const activeYearFilters = Object.entries(filters.years).filter(([_, isActive]) => isActive);
  if (activeYearFilters.length > 0) {
    result = result.filter(doc => 
      activeYearFilters.some(([year, _]) => doc.year === year)
    );
  }
  
  // Filter by document types if any document type filters are active
  const activeTypeFilters = Object.entries(filters.documentTypes).filter(([_, isActive]) => isActive);
  if (activeTypeFilters.length > 0) {
    result = result.filter(doc =>
      activeTypeFilters.some(([type, _]) => doc.documentType === type)
    );
  }
  
  return result;
};

// Sort documents based on different criteria
const sortDocuments = (documents, sortBy) => {
  const docs = [...documents];
  
  switch (sortBy) {
    case 'semanticScore':
      return docs.sort((a, b) => b.semanticScore - a.semanticScore);
    case 'yearDesc':
      return docs.sort((a, b) => b.year - a.year);
    case 'yearAsc':
      return docs.sort((a, b) => a.year - b.year);
    default:
      // Default is semantic score
      return docs.sort((a, b) => b.semanticScore - a.semanticScore);
  }
};

/**
 * Fetch semantically similar documents for a document ID
 */
export async function fetchSimilarDocuments(documentId, page = 1, filters = { years: {}, documentTypes: {} }, sortBy = 'semanticScore') {
  // Use mock data if enabled
  if (USE_MOCK_DATA) {
    console.log("Using mock data for similar documents with ID:", documentId);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    try {
      // Get mock data for the document
      let allDocuments = mockSimilarDocuments[documentId] || defaultSimilarDocuments;
      
      // Filter documents
      const filteredDocuments = filterDocuments(allDocuments, filters);
      
      // Sort documents
      const sortedDocuments = sortDocuments(filteredDocuments, sortBy);
      
      // Paginate the results - using exactly 5 per page
      const resultsPerPage = 5;
      const startIndex = (page - 1) * resultsPerPage;
      const paginatedDocuments = sortedDocuments.slice(startIndex, startIndex + resultsPerPage);
      
      // Calculate total pages
      const totalPages = Math.ceil(sortedDocuments.length / resultsPerPage);
      
      return {
        documents: paginatedDocuments,
        totalCount: sortedDocuments.length,
        totalPages,
        filterOptions: similarDocumentFilterOptions
      };
    } catch (error) {
      console.error("Error processing mock similar documents:", error);
      throw error;
    }
  }
  
  // Real API implementation
  try {
    // This should call user/similarity-search according to the OpenAPI spec
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/similarity-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentId: documentId,
        filters: filters,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error fetching similar documents:", error);
    throw error;
  }
}
