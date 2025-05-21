import { mockDocumentDetails } from "../data/documentDetailData"

// Always enable mock data for now to ensure it works
export const USE_MOCK_DATA = true;

/**
 * Fetches document details by ID
 */
export async function fetchDocumentDetail(documentId) {
  console.log("Fetching document details for ID:", documentId);
  
  // Use mock data 
  if (USE_MOCK_DATA) {
    console.log("Using mock data");
    // Add a small delay to simulate network request
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const mockData = mockDocumentDetails[documentId] || mockDocumentDetails.default;
    console.log("Mock data found:", mockData ? "Yes" : "No");
    return mockData;
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}documents/${documentId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching document details:", error);
    // Fallback to mock data on error
    return mockDocumentDetails.default;
  }
}

/**
 * Fetches related documents for a given CSAS event
 */
export async function fetchRelatedDocuments(csasEvent, csasYear, excludeDocumentId) {
  console.log("Fetching related documents for event:", csasEvent, "year:", csasYear);
  
  // Use mock data
  if (USE_MOCK_DATA) {
    console.log("Using mock data for related documents");
    // Add a small delay to simulate network request
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const relatedDocs = Object.values(mockDocumentDetails)
      .filter(doc => 
        doc.id !== excludeDocumentId && 
        doc.id !== 'default' &&  // Skip the default doc
        doc.csasEvent === csasEvent && 
        doc.csasYear === csasYear
      );
    console.log("Found related documents:", relatedDocs.length);
    return relatedDocs;
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}documents/related`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        csasEvent,
        csasYear
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    // Filter out the current document
    return data.filter(doc => doc.id !== excludeDocumentId);
  } catch (error) {
    console.error("Error fetching related documents:", error);
    // Fallback to mock related data
    return Object.values(mockDocumentDetails)
      .filter(doc => 
        doc.id !== excludeDocumentId && 
        doc.csasEvent === csasEvent && 
        doc.csasYear === csasYear
      );
  }
}
