import { useState, useEffect, useRef } from "react"
import { allMockResults } from "../data/defaultData"
import { USE_MOCK_DATA } from "../services/documentSearchService"

export function useQuerySummary() {
  const [isQuerySummaryOpen, setIsQuerySummaryOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState(null)
  const [querySummaryLoading, setQuerySummaryLoading] = useState(false)
  const [querySummaryData, setQuerySummaryData] = useState(null)
  const modalRef = useRef(null)

  const getQuerySummary = async (documentId) => {
    // Return cached summary if available
    if (querySummaryData && querySummaryData.documentId === documentId) {
      return querySummaryData
    }

    setQuerySummaryLoading(true)
    
    try {
      // Get document details
      let document = null;
      
      // If not using mock data, try to get from API
      if (!USE_MOCK_DATA) {
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}search/document/${documentId}`)
          if (response.ok) {
            document = await response.json()
          }
        } catch (error) {
          console.error("Error fetching document:", error)
        }
      }
      
      // If API fetch failed or using mock data
      if (!document) {
        document = allMockResults.find((doc) => doc.id === documentId)
      }

      // If document is still not found
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

      // Call the LLM API endpoint
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/text_generation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message_content: prompt,
          user_role: "public", // Default to public role
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

      const summaryData = {
        documentId,
        title: document.title,
        summary,
        keyInsights,
      }

      setQuerySummaryData(summaryData)
      return summaryData
    } catch (error) {
      console.error("Error generating summary:", error)
      return {
        title: "Summary Generation Failed",
        summary:
          "We couldn't generate a summary for this document. Please try again later or view the full document for more information.",
        keyInsights: [
          "Summary generation failed",
          "Please try again later",
          "You can view the full document for complete information",
        ],
      }
    } finally {
      setQuerySummaryLoading(false)
    }
  }

  const openQuerySummary = async (documentId) => {
    setSelectedDocumentId(documentId)
    setIsQuerySummaryOpen(true)

    // Start loading the summary immediately
    getQuerySummary(documentId)
  }

  const closeQuerySummary = () => {
    setIsQuerySummaryOpen(false)
    setSelectedDocumentId(null)
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        closeQuerySummary()
      }
    }

    if (isQuerySummaryOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isQuerySummaryOpen])

  return {
    isQuerySummaryOpen,
    selectedDocumentId,
    querySummaryLoading,
    querySummaryData,
    modalRef,
    openQuerySummary,
    closeQuerySummary,
  }
}
