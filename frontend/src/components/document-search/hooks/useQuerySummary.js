import { useState, useEffect, useRef } from "react";
import { getQuerySummary } from "../services/querySummaryService";

export function useQuerySummary() {
  const [isQuerySummaryOpen, setIsQuerySummaryOpen] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [userQuery, setUserQuery] = useState("");
  const [querySummaryLoading, setQuerySummaryLoading] = useState(false);
  const [querySummaryData, setQuerySummaryData] = useState(null);
  const modalRef = useRef(null);

  const fetchSummary = async (userQuery, documentId) => {
    // Return cached summary if available for the same document and query
    if (querySummaryData && 
        querySummaryData.documentId === documentId && 
        querySummaryData.userQuery === userQuery) {
      return querySummaryData;
    }

    setQuerySummaryLoading(true);
    
    try {
      const summaryData = await getQuerySummary(userQuery, documentId);
      setQuerySummaryData(summaryData);
      return summaryData;
    } finally {
      setQuerySummaryLoading(false);
    }
  };

  const openQuerySummary = async (documentId, userQuery = "") => {
    setSelectedDocumentId(documentId);
    setUserQuery(userQuery);
    setIsQuerySummaryOpen(true);

    // Start loading the summary immediately
    fetchSummary(userQuery, documentId);
  };

  const closeQuerySummary = () => {
    setIsQuerySummaryOpen(false);
    setSelectedDocumentId(null);
    setUserQuery("");
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        closeQuerySummary();
      }
    };

    if (isQuerySummaryOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isQuerySummaryOpen]);

  return {
    isQuerySummaryOpen,
    selectedDocumentId,
    userQuery,
    querySummaryLoading,
    querySummaryData,
    modalRef,
    openQuerySummary,
    closeQuerySummary,
  };
}
