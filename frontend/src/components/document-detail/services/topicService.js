import { USE_MOCK_DATA } from "./documentDetailService";
import { 
  mockRelatedDocuments, 
  getDefaultMockData, 
  topicMetadata,
  defaultTopicMetadata
} from "../data/topicRelatedData";

// Filter documents by year and document type
const filterMockDocuments = (documents, filters) => {
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

// Paginate documents
const paginateDocuments = (documents, page, resultsPerPage = 5) => {
  const startIndex = (page - 1) * resultsPerPage;
  return documents.slice(startIndex, startIndex + resultsPerPage);
};

// Sort documents based on different criteria
const sortDocuments = (documents, sortBy, topicType) => {
  const docs = [...documents]; // Create a copy to avoid mutating the original
  
  switch (sortBy) {
    case 'semanticScore':
      return docs.sort((a, b) => b.semanticScore - a.semanticScore);
    case 'llmScore':
      // Only applicable for non-derived topics
      if (topicType !== 'derived') {
        return docs.sort((a, b) => b.llmScore - a.llmScore);
      }
      return docs;
    case 'yearDesc':
      return docs.sort((a, b) => b.year - a.year);
    case 'yearAsc':
      return docs.sort((a, b) => a.year - b.year);
    case 'combined':
    default:
      // For derived topics, just use semantic score
      if (topicType === 'derived') {
        return docs.sort((a, b) => b.semanticScore - a.semanticScore);
      }
      // For others, use average of semantic and LLM scores
      return docs.sort((a, b) => {
        const scoreA = (a.semanticScore + a.llmScore) / 2;
        const scoreB = (b.semanticScore + b.llmScore) / 2;
        return scoreB - scoreA;
      });
  }
};

/**
 * Fetch related documents for a topic
 * @param {string} topicName - Name of the topic or mandate
 * @param {string} topicType - Type of topic ('mandate', 'dfo', or 'derived')
 * @param {number} page - Current page number
 * @param {object} filters - Filter settings for years and document types
 * @param {string} sortBy - How to sort the results
 * @param {string} excludeDocumentId - ID of the current document to exclude
 * @returns {Promise<{documents: Array, totalCount: number, metadata: Object}>} - Filtered and paginated documents with total count and metadata
 */
export async function fetchRelatedDocumentsByTopic(
  topicName, 
  topicType, 
  page = 1, 
  filters = { years: {}, documentTypes: {} }, 
  sortBy = 'combined',
  excludeDocumentId
) {
  // Use mock data if enabled
  if (USE_MOCK_DATA) {
    console.log("Using mock data for related documents");
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      // Get mock data for the topic
      let allDocuments = mockRelatedDocuments[topicName] || getDefaultMockData(topicName, topicType);
      
      // Exclude current document if specified
      if (excludeDocumentId) {
        allDocuments = allDocuments.filter(doc => doc.id !== excludeDocumentId);
      }
      
      // Filter the documents based on filters
      const filteredDocuments = filterMockDocuments(allDocuments, filters);
      
      // Sort documents
      const sortedDocuments = sortDocuments(filteredDocuments, sortBy, topicType);
      
      // Paginate the results
      const paginatedDocuments = paginateDocuments(sortedDocuments, page);
      
      // Get metadata from mock data for this topic
      const metadata = topicMetadata[topicName] || defaultTopicMetadata;
      
      return {
        documents: paginatedDocuments,
        totalCount: filteredDocuments.length,
        metadata: metadata // Include metadata directly without a separate API call
      };
    } catch (error) {
      console.error("Error processing mock data for topic:", error);
      throw error;
    }
  }

  // Real API implementation
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/related-documents?type=${encodeURIComponent("Mandate" | "DFO Topic" | "Derived Topic")}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: topicName | mandateName,
        filters: filters,
        currentDocID: excludeDocumentId,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error fetching related documents for topic:", error);
    throw error;
  }
}
