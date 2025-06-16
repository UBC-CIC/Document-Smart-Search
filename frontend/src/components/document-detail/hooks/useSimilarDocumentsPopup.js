import { useState, useEffect } from "react";
import {
  fetchSimilarDocuments,
  fetchSimilarDocumentFilterOptions,
} from "../services/similarDocumentsService";

export function useSimilarDocumentsPopup() {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [documentId, setDocumentId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [allDocuments, setAllDocuments] = useState([]);
  const [displayedDocuments, setDisplayedDocuments] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ years: {}, documentTypes: {} });
  const [sortBy, setSortBy] = useState("semanticScore");
  const [filterOptions, setFilterOptions] = useState({
    years: [],
    documentTypes: [],
  });
  const resultsPerPage = 5; // Number of results per page

  // Fetch filter options when popup opens
  useEffect(() => {
    if (isPopupOpen) {
      fetchSimilarDocumentFilterOptions()
        .then((options) => {
          setFilterOptions(options);
          setFilters({
            years: Object.fromEntries(
              options.years.map((year) => [year, false])
            ),
            documentTypes: Object.fromEntries(
              options.documentTypes.map((type) => [type, false])
            ),
          });

          // Load initial documents
          if (documentId) {
            loadDocuments(documentId);
          }
        })
        .catch((error) =>
          console.error("Error fetching filter options:", error)
        );
    }
  }, [isPopupOpen, documentId]);

  // Handle sorting and pagination when documents, sort option, or page changes
  useEffect(() => {
    if (allDocuments.length > 0) {
      // Sort documents client-side
      const sortedDocuments = sortDocuments(allDocuments, sortBy);

      // Update total pages
      setTotalPages(Math.ceil(sortedDocuments.length / resultsPerPage));

      // Apply pagination
      const startIndex = (currentPage - 1) * resultsPerPage;
      const endIndex = startIndex + resultsPerPage;
      setDisplayedDocuments(sortedDocuments.slice(startIndex, endIndex));
    }
  }, [allDocuments, sortBy, currentPage]);

  const openPopup = (docId) => {
    setDocumentId(docId);
    setIsPopupOpen(true);
    setCurrentPage(1);
  };

  const closePopup = () => {
    setIsPopupOpen(false);
    setDocumentId(null);
    setAllDocuments([]);
    setDisplayedDocuments([]);
  };

  const loadDocuments = async (docId) => {
    if (!docId) return;

    setIsLoading(true);
    try {
      // Call the service with the updated parameters - only pass the documentId and filters
      const data = await fetchSimilarDocuments(docId, filters);
      setAllDocuments(data.documents || []);
      setTotalCount(data.totalCount || 0);

      if (data.filterOptions) {
        setFilterOptions(data.filterOptions);
      }
    } catch (error) {
      console.error("Error loading similar documents:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when filters change
    if (documentId) {
      loadDocuments(documentId, newFilters);
    }
  };

  const handleSortChange = (newSortBy) => {
    setSortBy(newSortBy);
    setCurrentPage(1); // Reset to first page when sort changes
  };

  // Sort documents based on different criteria
  const sortDocuments = (documents, sortByOption) => {
    const docs = [...documents];

    switch (sortByOption) {
      case "semanticScore":
        return docs.sort((a, b) => b.semanticScore - a.semanticScore);
      case "yearDesc":
        return docs.sort((a, b) => b.year - a.year);
      case "yearAsc":
        return docs.sort((a, b) => a.year - b.year);
      default:
        // Default is semantic score
        return docs.sort((a, b) => b.semanticScore - a.semanticScore);
    }
  };

  return {
    isPopupOpen,
    documentId,
    isLoading,
    documents: displayedDocuments, // Return only the paginated documents
    currentPage,
    totalPages,
    totalCount,
    filters,
    filterOptions,
    sortBy,
    openPopup,
    closePopup,
    handlePageChange,
    handleFilterChange,
    handleSortChange,
  };
}
