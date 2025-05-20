import { allMockResults } from "../data/defaultData";
import { USE_MOCK_DATA } from "./documentSearchService";

/**
 * Fetches document details by ID from API or mock data
 */
export async function fetchDocumentById(documentId) {
  // If using mock data, return from mock data
  if (USE_MOCK_DATA) {
    return allMockResults.find((doc) => doc.id === documentId);
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}search/document/${documentId}`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error("Error fetching document:", error)
    // Fall back to mock data if available
    return allMockResults.find((doc) => doc.id === documentId);
  }
}

/**
 * Generates a summary for a document using the LLM API
 */
export async function generateDocumentSummary(document) {
  if (!document) {
    return {
      title: "Document Not Found",
      summary: "The requested document could not be found.",
      keyInsights: ["No information available"],
    }
  }

  // Create a prompt that asks for a summary of the document
  const prompt = `Please provide a comprehensive summary of the document titled "${document.title}" (ID: ${document.id}). 
  The document is about ${document.topics.join(", ")} and was authored by ${document.author} in ${document.year}.
  Include key insights and main points from the document.`

  try {
    // Call the LLM API endpoint
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/text_generation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message_content: prompt,
        user_role: "public",
      }),
    })

    if (!response.ok) {
      throw new Error("Failed to generate summary")
    }

    const data = await response.json()

    // Parse the response to extract key insights
    const paragraphs = data.content.split("\n\n").filter((p) => p.trim().length > 0)
    const summary = paragraphs[0] || data.content

    // Extract key insights (assuming they might be in bullet points or separate paragraphs)
    let keyInsights = []
    if (paragraphs.length > 1) {
      // Try to find bullet points
      const bulletMatches = data.content.match(/[•\-*]\s+(.*?)(?=\n[•\-*]|\n\n|$)/gs)
      if (bulletMatches && bulletMatches.length > 0) {
        keyInsights = bulletMatches.map((point) => point.replace(/^[•\-*]\s+/, "").trim())
      } else {
        // Use additional paragraphs as insights
        keyInsights = paragraphs.slice(1).map((p) => p.trim())
      }
    }

    // Limit to 4 key insights
    keyInsights = keyInsights.slice(0, 4)

    // If no key insights were found, create some generic ones
    if (keyInsights.length === 0) {
      keyInsights = [
        "This is an important document in the field of " + document.topics[0],
        "Published in " + document.year + " by " + document.author,
        "Relates to " + document.mandates.join(", "),
      ]
    }

    return {
      title: document.title,
      summary,
      keyInsights,
    }
  } catch (error) {
    console.error("Error generating summary:", error)
    return {
      title: "Summary Generation Failed",
      summary: "We couldn't generate a summary for this document. Please try again later or view the full document for more information.",
      keyInsights: [
        "Summary generation failed",
        "Please try again later",
        "You can view the full document for complete information",
      ],
    }
  }
}

/**
 * Fetches and generates a summary for a document by ID
 */
export async function getQuerySummary(documentId) {
  try {
    const document = await fetchDocumentById(documentId);
    const summaryData = await generateDocumentSummary(document);
    
    return {
      ...summaryData,
      documentId,
    };
  } catch (error) {
    console.error("Error in getQuerySummary:", error);
    return {
      documentId,
      title: "Error Retrieving Summary",
      summary: "There was an error retrieving the summary for this document.",
      keyInsights: ["Please try again later"],
    };
  }
}
