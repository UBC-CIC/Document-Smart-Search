import { useState, useEffect, useRef } from "react";
import { getQuerySummary } from "../services/querySummaryService";

export function useQuerySummary() {
  const [isQuerySummaryOpen, setIsQuerySummaryOpen] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [querySummaryLoading, setQuerySummaryLoading] = useState(false);
  const [querySummaryData, setQuerySummaryData] = useState(null);
  const modalRef = useRef(null);

  const fetchSummary = async (documentId) => {
    // Return cached summary if available
    if (querySummaryData && querySummaryData.documentId === documentId) {
      return querySummaryData;
    }

    setQuerySummaryLoading(true);
    
    try {
      const summaryData = await getQuerySummary(documentId);
      setQuerySummaryData(summaryData);
      return summaryData;
    } finally {
      setQuerySummaryLoading(false);
    }
  };

  const openQuerySummary = async (documentId) => {
    setSelectedDocumentId(documentId);
    setIsQuerySummaryOpen(true);

    // Start loading the summary immediately
    fetchSummary(documentId);
  };

  const closeQuerySummary = () => {
    setIsQuerySummaryOpen(false);
    setSelectedDocumentId(null);
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
    querySummaryLoading,
    querySummaryData,
    modalRef,
    openQuerySummary,
    closeQuerySummary,
  };
}
