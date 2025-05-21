import { useState, useEffect, useMemo } from "react";
import { X, Filter, ArrowUp, ArrowDown } from "lucide-react";
import { fetchRelatedDocumentsByTopic, fetchTopicFilterOptions } from "../services/topicService";
import Link from "next/link";

export default function RelatedDocumentsPopup({
  isOpen,
  onClose,
  topicName,
  topicType,
  documentId
}) {
  // State for all fetched documents and filter options
  const [allDocuments, setAllDocuments] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [filters, setFilters] = useState({
    years: {},
    documentTypes: {}
  });
  const [filterOptions, setFilterOptions] = useState({
    years: [],
    documentTypes: []
  });
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('combined');
  
  // Results per page
  const RESULTS_PER_PAGE = 5;

  // Format the document count
  const formatCount = (count) => {
    return count > 1000 ? `${(count / 1000).toFixed(1)}K` : count;
  };
  
  // Sort documents based on different criteria
  // IMPORTANT: Moving this function BEFORE it's used in useMemo
  const sortDocuments = (docs, sortOption, docTopicType) => {
    if (!docs || docs.length === 0) return [];
    
    const docsToSort = [...docs]; // Create a copy to avoid mutating the original
    
    switch (sortOption) {
      case 'semanticScore':
        return docsToSort.sort((a, b) => b.semanticScore - a.semanticScore);
      case 'llmScore':
        // Only applicable for non-derived topics
        if (docTopicType !== 'derived') {
          return docsToSort.sort((a, b) => b.llmScore - a.llmScore);
        }
        return docsToSort;
      case 'yearDesc':
        return docsToSort.sort((a, b) => b.year - a.year);
      case 'yearAsc':
        return docsToSort.sort((a, b) => a.year - b.year);
      case 'combined':
      default:
        // For derived topics, just use semantic score
        if (docTopicType === 'derived') {
          return docsToSort.sort((a, b) => b.semanticScore - a.semanticScore);
        }
        // For others, use average of semantic and LLM scores
        return docsToSort.sort((a, b) => {
          const scoreA = (a.semanticScore + a.llmScore) / 2;
          const scoreB = (b.semanticScore + b.llmScore) / 2;
          return scoreB - scoreA;
        });
    }
  };

  // Fetch filter options when popup opens
  useEffect(() => {
    if (isOpen) {
      fetchTopicFilterOptions().then(options => {
        setFilterOptions(options);
        setFilters({
          years: Object.fromEntries(options.years.map(year => [year, false])),
          documentTypes: Object.fromEntries(options.documentTypes.map(type => [type, false]))
        });
      }).catch(error => {
        console.error("Error fetching filter options:", error);
      });
    }
  }, [isOpen]);

  // Fetch documents when needed
  useEffect(() => {
    if (!isOpen || !topicName) return;
    
    async function fetchData() {
      setLoading(true);
      try {
        // Using the updated service function (no pagination/sorting parameters)
        const data = await fetchRelatedDocumentsByTopic(
          topicName,
          topicType,
          filters,
          documentId
        );
        
        setAllDocuments(data.documents || []);
        setTotalDocuments(data.totalCount || 0);
        
        // Set metadata if available
        if (data.metadata) {
          setMetadata(data.metadata);
        }
      } catch (err) {
        console.error("Failed to fetch related documents:", err);
        setError("Failed to load related documents. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [isOpen, topicName, topicType, filters, documentId]);
  
  // Apply sorting and pagination to documents
  const displayedDocuments = useMemo(() => {
    if (!allDocuments || allDocuments.length === 0) return [];
    
    // First sort the documents
    const sortedDocs = sortDocuments(allDocuments, sortBy, topicType);
    
    // Calculate total pages
    const newTotalPages = Math.ceil(sortedDocs.length / RESULTS_PER_PAGE);
    if (totalPages !== newTotalPages) {
      setTotalPages(newTotalPages);
      
      // Reset current page if it's out of bounds
      if (currentPage > newTotalPages) {
        setCurrentPage(1);
      }
    }
    
    // Apply pagination
    const startIndex = (currentPage - 1) * RESULTS_PER_PAGE;
    const endIndex = startIndex + RESULTS_PER_PAGE;
    return sortedDocs.slice(startIndex, endIndex);
  }, [allDocuments, sortBy, topicType, currentPage, totalPages]);
  
  if (!isOpen) return null;
  
  // Handle page change
  const handlePageChange = (page) => {
    setCurrentPage(page);
  };
  
  // Handle filter change
  const handleFilterChange = (type, value, checked) => {
    setFilters(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [value]: checked
      }
    }));
    setCurrentPage(1); // Reset to first page when filters change
  };
  
  // Handle sort change
  const handleSortChange = (newSortBy) => {
    setSortBy(newSortBy);
    setCurrentPage(1); // Reset to first page when sort changes
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
          <h3 className="text-lg font-medium dark:text-white flex-1">
            {topicType === 'mandate' ? 'Mandate: ' : topicType === 'dfo' ? 'DFO Topic: ' : 'Derived Topic: '}
            <span className="text-blue-600 dark:text-blue-400">{topicName}</span>
          </h3>
          
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <Filter className="h-4 w-4 mr-1" />
              <span className="text-sm">Filter</span>
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        {/* Filter and Sort panel */}
        {showFilters && (
          <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Filter options */}
              <div>
                <h4 className="text-sm font-medium mb-3 dark:text-gray-300">Filter Documents</h4>
                
                {/* Years filter */}
                <div className="mb-4">
                  <h5 className="text-xs font-medium mb-2 dark:text-gray-400">Years</h5>
                  <div className="flex flex-wrap gap-2">
                    {metadata && metadata.documentsByYear ? 
                      Object.entries(metadata.documentsByYear).sort((a, b) => b[0] - a[0]).map(([year, count]) => (
                        <label key={year} className="flex items-center space-x-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={filters.years[year] || false}
                            onChange={(e) => handleFilterChange('years', year, e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="dark:text-gray-300">{year}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">({count})</span>
                        </label>
                      ))
                    : filterOptions.years.map(year => (
                        <label key={year} className="flex items-center space-x-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={filters.years[year] || false}
                            onChange={(e) => handleFilterChange('years', year, e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="dark:text-gray-300">{year}</span>
                        </label>
                      ))
                    }
                  </div>
                </div>
                
                {/* Document types filter */}
                <div>
                  <h5 className="text-xs font-medium mb-2 dark:text-gray-400">Document Types</h5>
                  <div className="flex flex-wrap gap-2">
                    {metadata && metadata.documentsByType ?
                      Object.entries(metadata.documentsByType).map(([type, count]) => (
                        <label key={type} className="flex items-center space-x-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={filters.documentTypes[type] || false}
                            onChange={(e) => handleFilterChange('documentTypes', type, e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="dark:text-gray-300">{type}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">({count})</span>
                        </label>
                      ))
                    : filterOptions.documentTypes.map(type => (
                        <label key={type} className="flex items-center space-x-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={filters.documentTypes[type] || false}
                            onChange={(e) => handleFilterChange('documentTypes', type, e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="dark:text-gray-300">{type}</span>
                        </label>
                      ))
                    }
                  </div>
                </div>
              </div>
              
              {/* Sort options */}
              <div>
                <h4 className="text-sm font-medium mb-3 dark:text-gray-300">Sort By</h4>
                <div className="space-y-2">
                  {/* Combined Score - only show for non-derived topics */}
                  {topicType !== 'derived' && (
                    <button 
                      onClick={() => handleSortChange('combined')}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-md w-full text-left ${
                        sortBy === 'combined' 
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className="dark:text-gray-300">Combined Score</span>
                      {sortBy === 'combined' && <ArrowDown className="h-4 w-4" />}
                    </button>
                  )}
                  
                  <button 
                    onClick={() => handleSortChange('semanticScore')}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-md w-full text-left ${
                      sortBy === 'semanticScore' 
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="dark:text-gray-300">Semantic Score</span>
                    {sortBy === 'semanticScore' && <ArrowDown className="h-4 w-4" />}
                  </button>
                  
                  {/* LLM Score option only for non-derived topics */}
                  {topicType !== 'derived' && (
                    <button 
                      onClick={() => handleSortChange('llmScore')}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-md w-full text-left ${
                        sortBy === 'llmScore' 
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className="dark:text-gray-300">LLM Score</span>
                      {sortBy === 'llmScore' && <ArrowDown className="h-4 w-4" />}
                    </button>
                  )}
                  
                  <button 
                    onClick={() => handleSortChange('yearDesc')}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-md w-full text-left ${
                      sortBy === 'yearDesc' 
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="dark:text-gray-300">Newest First</span>
                    {sortBy === 'yearDesc' && <ArrowDown className="h-4 w-4" />}
                  </button>
                  
                  <button 
                    onClick={() => handleSortChange('yearAsc')}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-md w-full text-left ${
                      sortBy === 'yearAsc' 
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="dark:text-gray-300">Oldest First</span>
                    {sortBy === 'yearAsc' && <ArrowUp className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="p-4 flex-1 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {/* Show total from metadata if available, else show actual document count */}
              <strong className="font-medium">{formatCount(metadata?.totalDocuments || totalDocuments)}</strong> documents related to this {topicType === 'mandate' ? 'mandate' : 'topic'}
              {totalDocuments > 0 && totalDocuments < (metadata?.totalDocuments || totalDocuments) && (
                <span className="ml-1">(showing top {totalDocuments})</span>
              )}
            </div>
            
            {/* If active filters are applied, show filter count */}
            {(Object.values(filters.years).some(v => v) || Object.values(filters.documentTypes).some(v => v)) && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-2 py-1 rounded-full">
                Filters applied
              </span>
            )}
          </div>
          
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></div>
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></div>
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              {error}
            </div>
          ) : displayedDocuments.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No related documents found with the current filters.
            </div>
          ) : (
            <div className="space-y-4">
              {displayedDocuments.map((doc) => (
                <div key={doc.id} className="border dark:border-gray-700 rounded-lg p-4">
                  <Link href={`/documents/${doc.id}`} className="block">
                    <h4 className="text-blue-600 dark:text-blue-400 font-medium hover:underline">{doc.title}</h4>
                    
                    {/* Add CSAS event */}
                    {doc.csasEvent && (
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        <span className="font-medium">CSAS Event:</span> {doc.csasEvent} {doc.csasYear && `(${doc.csasYear})`}
                      </div>
                    )}
                  </Link>
                  <div className="flex justify-between text-sm mt-2">
                    <div className="text-gray-600 dark:text-gray-400">
                      {doc.documentType} • {doc.year}
                    </div>
                    <div>
                      {topicType === 'derived' ? (
                        <span className="bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded text-xs">
                          <span className="font-medium">Semantic Score:</span> {(doc.semanticScore * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <div className="flex space-x-2">
                          <span className="bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded text-xs">
                            <span className="font-medium">Semantic:</span> {(doc.semanticScore * 100).toFixed(0)}%
                          </span>
                          <span className="bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded text-xs">
                            <span className="font-medium">LLM:</span> {(doc.llmScore * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalDocuments > RESULTS_PER_PAGE && (
          <div className="p-4 border-t dark:border-gray-700">
            <div className="flex items-center justify-between">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`px-2 py-1 rounded ${currentPage === 1 ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 dark:text-blue-400'}`}
              >
                Previous
              </button>
              
              <div className="flex items-center space-x-1">
                {Array.from({ length: Math.min(10, totalPages) }).map((_, i) => {
                  // Show first page, last page, and pages around current page
                  const pageNumber = i + 1;
                  
                  // Handle display of page numbers with potential ellipsis
                  if (
                    pageNumber === 1 || 
                    pageNumber === totalPages || 
                    (pageNumber >= currentPage - 1 && pageNumber <= currentPage + 1)
                  ) {
                    return (
                      <button
                        key={pageNumber}
                        onClick={() => handlePageChange(pageNumber)}
                        className={`w-8 h-8 flex items-center justify-center rounded-full ${
                          currentPage === pageNumber
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  }
                  
                  // Show ellipsis for skipped pages
                  if (pageNumber === 2 && currentPage > 3) {
                    return <span key="ellipsis-start" className="px-1">...</span>;
                  }
                  if (pageNumber === totalPages - 1 && currentPage < totalPages - 2) {
                    return <span key="ellipsis-end" className="px-1">...</span>;
                  }
                  
                  return null;
                })}
              </div>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`px-2 py-1 rounded ${currentPage === totalPages ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 dark:text-blue-400'}`}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
