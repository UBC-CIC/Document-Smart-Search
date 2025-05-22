import { mockDocumentDetails } from "../data/documentDetailData"

// Always enable mock data for now to ensure it works
export const USE_MOCK_DATA = false;

/**
 * Fetches document details by ID, including related documents
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
    
    // Include related documents directly in the response
    // They are now part of the document object from the mockDocumentDetails
    return mockData;
  }

  try {
    // In the real API implementation, we expect related documents to be included in the response
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/document-details?document_id=${encodeURIComponent(documentId)}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();

    // // Fetch with POST method (Need to determine which one is better)
    // const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/document-details`, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     document_id: documentId
    //   }),
    // })

    
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
