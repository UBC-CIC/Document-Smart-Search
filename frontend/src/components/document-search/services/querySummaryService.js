import { USE_MOCK_DATA } from "./documentSearchService";
import { allMockResults } from "../data/defaultData";
import { getUserToken } from "../../../lib/getUserToken";

/**
 * Gets a document summary directly from the backend API
 */
export async function getQuerySummary(userQuery, documentId) {
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
