import { useState, useEffect } from "react";
import { fetchRelatedDocumentsByTopic, fetchTopicFilterOptions } from "../services/topicService";

export function useTopicPopup() {
  const [popupState, setPopupState] = useState({
    isOpen: false,
    topicName: "",
    topicType: "",
    excludeDocumentId: null,
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [allDocuments, setAllDocuments] = useState([]); // Store all fetched documents
  const [displayedDocuments, setDisplayedDocuments] = useState([]); // Store paginated documents
  const [metadata, setMetadata] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({ years: {}, documentTypes: {} });
  const [sortBy, setSortBy] = useState('combined');
  const [filterOptions, setFilterOptions] = useState({ years: [], documentTypes: [] });
  const resultsPerPage = 5;

  // When popup opens with a topic, fetch filter options
  useEffect(() => {
    if (popupState.isOpen && popupState.topicName) {
      // Get filter options when popup opens
      fetchTopicFilterOptions().then(options => {
        setFilterOptions(options);
        setFilters({
          years: Object.fromEntries(options.years.map(year => [year, false])),
          documentTypes: Object.fromEntries(options.documentTypes.map(type => [type, false]))
        });
        
        // Now fetch documents with the initialized filters
        loadDocuments();
      }).catch(error => {
        console.error("Error fetching filter options:", error);
      });
    }
  }, [popupState.isOpen, popupState.topicName, popupState.topicType]);

  // Handle pagination and sorting client-side
  useEffect(() => {
    if (allDocuments.length > 0) {
      // Sort documents by sortBy
      const sortedDocuments = sortDocuments(allDocuments, sortBy, popupState.topicType);
      
      // Set total pages
      setTotalPages(Math.ceil(sortedDocuments.length / resultsPerPage));
      
      // Slice for current page
      const startIndex = (currentPage - 1) * resultsPerPage;
      const endIndex = startIndex + resultsPerPage;
      setDisplayedDocuments(sortedDocuments.slice(startIndex, endIndex));
    }
  }, [allDocuments, sortBy, currentPage, popupState.topicType]);

  const openPopup = (topicName, topicType, excludeDocumentId = null) => {
    setPopupState({
      isOpen: true,
      topicName,
      topicType,
      excludeDocumentId,
    });
    setCurrentPage(1);
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

  const loadDocuments = async () => {
    if (!popupState.topicName || !popupState.topicType) return;
    
    setIsLoading(true);
    
    try {
      // Call fetchRelatedDocumentsByTopic with the updated parameters (no pagination or sorting)
      const result = await fetchRelatedDocumentsByTopic(
        popupState.topicName,
        popupState.topicType,
        filters,
        popupState.excludeDocumentId
      );
      
      setAllDocuments(result.documents || []);
      // No metadata is needed anymore
      setMetadata({}); // Just set to empty object
    } catch (error) {
      console.error("Failed to load related documents:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page
    loadDocuments(); // Reload documents with the new filters
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
      case 'semanticScore':
        return docsCopy.sort((a, b) => b.semanticScore - a.semanticScore);
      case 'llmScore':
        if (topicType !== 'derived') {
          return docsCopy.sort((a, b) => b.llmScore - a.llmScore); 
        }
        return docsCopy;
      case 'yearDesc':
        return docsCopy.sort((a, b) => b.year - a.year);
      case 'yearAsc':
        return docsCopy.sort((a, b) => a.year - b.year);
      case 'combined':
      default:
        if (topicType === 'derived') {
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
    documents: displayedDocuments, // Return the paginated documents
    metadata: {}, // Just return an empty object since we're not using it anymore
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
    handlePageChange
  };
}
