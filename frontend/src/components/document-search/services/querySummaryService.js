import { USE_MOCK_DATA } from "./documentSearchService";
import { allMockResults } from "../data/defaultData";

/**
 * Gets a document summary directly from the backend API
 */
export async function getQuerySummary(userQuery, documentId) {
  // If using mock data, generate a mock summary
  if (USE_MOCK_DATA) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate API delay
    const document = allMockResults.find((doc) => doc.id === documentId);

    if (!document) {
      return {
        documentId,
        title: "Document Not Found",
        summary: "The requested document could not be found.",
        keyInsights: ["No information available"],
      };
    }

    return {
      documentId,
      title: document.title,
      summary: `This is a mock summary of the document "${
        document.title
      }" which focuses on ${document.topics.join(", ")}. Published in ${
        document.year
      } by ${document.author}.`,
      keyInsights: [
        `Key topic: ${document.topics[0] || "Unknown"}`,
        `Published in ${document.year} by ${document.author}`,
        `Document category: ${document.category}`,
        `Related to ${document.mandates.join(", ")}`,
      ],
    };
  }

  try {
    // Single API call to get document summary from backend
    const token = await getUserToken();
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_ENDPOINT}user/expert-analysis`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          documentId: documentId,
          userQuery: userQuery,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return {
      documentId,
      title: data.title,
      summary: data.summary,
      keyInsights: data.keyInsights || [],
    };
  } catch (error) {
    console.error("Error getting document summary:", error);

    return {
      documentId,
      title: "Error Retrieving Summary",
      summary: "There was an error retrieving the summary for this document.",
      keyInsights: ["Please try again later"],
    };
  }
}
