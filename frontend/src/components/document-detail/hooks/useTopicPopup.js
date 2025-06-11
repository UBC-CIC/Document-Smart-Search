import { useState, useEffect } from "react";
import {
  fetchRelatedDocumentsByTopic,
  fetchTopicFilterOptions,
} from "../services/topicService";

export function useTopicPopup() {
  const [popupState, setPopupState] = useState({
    isOpen: false,
    topicName: "",
    topicType: "",
    excludeDocumentId: null,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [allDocuments, setAllDocuments] = useState([]);
  const [displayedDocuments, setDisplayedDocuments] = useState([]);
  const [totalCount, setTotalCount] = useState(0); // Add state for total count from API
  const [metadata, setMetadata] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({ years: {}, documentTypes: {} });
  const [sortBy, setSortBy] = useState("combined");
  const [filterOptions, setFilterOptions] = useState({
    years: [],
    documentTypes: [],
  });
  const resultsPerPage = 5;

  // Single effect responsible for both filter options and document loading
  useEffect(() => {
    if (popupState.isOpen && popupState.topicName) {
      // First, fetch the filter options
      fetchTopicFilterOptions()
        .then((options) => {
          setFilterOptions(options);
          const newFilters = {
            years: Object.fromEntries(
              options.years.map((year) => [year, false])
            ),
            documentTypes: Object.fromEntries(
              options.documentTypes.map((type) => [type, false])
            ),
          };
          setFilters(newFilters);

          // Once filter options are set, load the documents if we have a topic name and type
          if (popupState.topicType) {
            loadDocuments(
              popupState.topicName,
              popupState.topicType,
              newFilters,
              popupState.excludeDocumentId
            );
          }
        })
        .catch((error) => {
          console.error("Error fetching filter options:", error);
        });
    }
  }, [
    popupState.isOpen,
    popupState.topicName,
    popupState.topicType,
    popupState.excludeDocumentId,
  ]);

  // Only reload documents when filters change (excluding initial load)
  useEffect(() => {
    // This condition ensures we don't trigger on the initial filter setup
    if (
      popupState.isOpen &&
      popupState.topicName &&
      popupState.topicType &&
      filterOptions.years.length > 0
    ) {
      loadDocuments(
        popupState.topicName,
        popupState.topicType,
        filters,
        popupState.excludeDocumentId
      );
    }
  }, [filters]);

  // Handle pagination and sorting client-side
  useEffect(() => {
    if (allDocuments.length > 0) {
      // Sort documents by sortBy
      const sortedDocuments = sortDocuments(
        allDocuments,
        sortBy,
        popupState.topicType
      );

      // Set total pages
      setTotalPages(Math.ceil(sortedDocuments.length / resultsPerPage));

      // Slice for current page
      const startIndex = (currentPage - 1) * resultsPerPage;
      const endIndex = startIndex + resultsPerPage;
      setDisplayedDocuments(sortedDocuments.slice(startIndex, endIndex));
    } else {
      setDisplayedDocuments([]);
    }
  }, [allDocuments, sortBy, currentPage, popupState.topicType]);

  const openPopup = (topicName, topicType, excludeDocumentId = null) => {
    // Set loading to true immediately when popup opens
    setIsLoading(true);

    // Reset sortBy based on topic type
    // For derived topics, only semanticScore is valid
    if (topicType === "derived") {
      setSortBy("semanticScore");
    } else {
      // For mandate and dfo topics, default to combined score
      setSortBy("combined");
    }

    setPopupState({
      isOpen: true,
      topicName,
      topicType,
      excludeDocumentId,
    });
    setCurrentPage(1);
    // Reset documents to avoid showing stale data
    setAllDocuments([]);
    setDisplayedDocuments([]);
    setTotalCount(0);
  };

  const closePopup = () => {
    setPopupState({
      isOpen: false,
      topicName: "",
      topicType: "",
      excludeDocumentId: null,
    });
    setAllDocuments([]);
    setDisplayedDocuments([]);
    setMetadata({});
  };

  const loadDocuments = async (
    topicName,
    topicType,
    currentFilters,
    excludeDocId
  ) => {
    if (!topicName || !topicType) {
      setIsLoading(false);
      return;
    }

    // No need to set isLoading here since it's already set in openPopup
    // Only set it to false if we're reloading due to filter changes
    if (!isLoading) {
      setIsLoading(true);
    }

    try {
      const result = await fetchRelatedDocumentsByTopic(
        topicName,
        topicType,
        currentFilters,
        excludeDocId
      );

      setAllDocuments(result.documents || []);
      setTotalCount(result.totalCount || 0);
      setMetadata({});
    } catch (error) {
      console.error("Failed to load related documents:", error);
      setAllDocuments([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page
  };

  const handleSortChange = (newSortBy) => {
    setSortBy(newSortBy);
    setCurrentPage(1); // Reset to first page
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  // Helper function to sort documents
  const sortDocuments = (docs, sort, topicType) => {
    const docsCopy = [...docs];

    switch (sort) {
      case "semanticScore":
        return docsCopy.sort((a, b) => b.semanticScore - a.semanticScore);
      case "llmScore":
        if (topicType !== "derived") {
          return docsCopy.sort((a, b) => b.llmScore - a.llmScore);
        }
        return docsCopy;
      case "yearDesc":
        return docsCopy.sort((a, b) => b.year - a.year);
      case "yearAsc":
        return docsCopy.sort((a, b) => a.year - b.year);
      case "combined":
      default:
        if (topicType === "derived") {
          return docsCopy.sort((a, b) => b.semanticScore - a.semanticScore);
        }
        return docsCopy.sort((a, b) => {
          const scoreA = (a.semanticScore + a.llmScore) / 2;
          const scoreB = (b.semanticScore + b.llmScore) / 2;
          return scoreB - scoreA;
        });
    }
  };

  return {
    popupState,
    documents: displayedDocuments,
    totalCount, // Return the total count from API
    metadata: {},
    isLoading,
    currentPage,
    totalPages,
    filters,
    filterOptions,
    sortBy,
    openPopup,
    closePopup,
    handleFilterChange,
    handleSortChange,
    handlePageChange,
  };
}
