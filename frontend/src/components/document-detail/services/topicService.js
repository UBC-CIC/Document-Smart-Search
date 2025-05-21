import { USE_MOCK_DATA } from "./documentDetailService";
import { 
  mockRelatedDocuments, 
  getDefaultMockData, 
  topicMetadata,
  defaultTopicMetadata
} from "../data/topicRelatedData";
import { 
  similarDocumentFilterOptions as defaultFilterOptions
} from "../data/similarDocumentsData";

/**
 * Fetch available filter options for topic documents
 */
export async function fetchTopicFilterOptions() {
  // Use mock data if enabled
  if (USE_MOCK_DATA) {
    return defaultFilterOptions;
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/filters`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filters: ["years", "documentTypes"],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
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
 * Fetch related documents for a topic
 * Returns up to 50 filtered documents without pagination or sorting
 * 
 * @param {string} topicName - Name of the topic or mandate
 * @param {string} topicType - Type of topic ('mandate', 'dfo', or 'derived')
 * @param {object} filters - Filter settings for years and document types
 * @param {string} excludeDocumentId - ID of the current document to exclude
 * @returns {Promise<{documents: Array, totalCount: number, metadata: Object}>}
 */
export async function fetchRelatedDocumentsByTopic(
  topicName, 
  topicType,
  filters = { years: {}, documentTypes: {} },
  excludeDocumentId = null
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
      
      // Filter the documents based on filters - only apply filtering, no sorting or pagination
      const filteredDocuments = filterMockDocuments(allDocuments, filters);
      
      // Limit to 50 results maximum
      const limitedResults = filteredDocuments.slice(0, 50);
      
      // Get metadata for this topic
      const metadata = topicMetadata[topicName] || defaultTopicMetadata;
      
      return {
        documents: limitedResults,
        totalCount: filteredDocuments.length,
        metadata: metadata
      };
    } catch (error) {
      console.error("Error processing mock data for topic:", error);
      throw error;
    }
  }

  // Real API implementation
  try {
    // Simplified API call - just request filtered results (up to 50)
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/related-documents?type=${encodeURIComponent(topicType)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: topicName,
        filters: {
          years: Object.keys(filters.years).filter(year => filters.years[year]),
          documentTypes: Object.keys(filters.documentTypes).filter(type => filters.documentTypes[type])
        },
        currentDocID: excludeDocumentId,
        limit: 50  // Request up to 50 documents
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
      totalCount: responseData.totalCount || 0,
      metadata: responseData.metadata || {}
    };
  } catch (error) {
    console.error("Error fetching related documents for topic:", error);
    throw error;
  }
}

// Filter documents by year and document type - only used for mock data
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
