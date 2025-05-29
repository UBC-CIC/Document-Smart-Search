import { useState, useEffect } from "react";
import { X, Filter, ArrowUp, ArrowDown, Info } from "lucide-react";
import Link from "next/link";
import { useTopicPopup } from "../hooks/useTopicPopup";

export default function RelatedDocumentsPopup({
  isOpen,
  onClose,
  topicName,
  topicType,
  documentId
}) {
  const [showTooltip, setShowTooltip] = useState(null);
  
  // Topic-specific relevance explanations
  const derivedTopicExplanation = "The semantic similarity of this document to the topic.";
  const mandateExplanation = "Relevance of this document to the mandate as rated by a LLM.";
  const dfoTopicExplanation = "Relevance of this document to the topic as rated by a LLM.";
  
  // Get the appropriate explanation based on topic type
  const getRelevanceExplanation = () => {
    if (topicType === 'derived') return derivedTopicExplanation;
    if (topicType === 'mandate') return mandateExplanation;
    return dfoTopicExplanation;
  };
  
  // Use the hook to manage all state and data fetching
  const {
    popupState,
    documents,
    totalCount, // Use the totalCount from the API response
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
  } = useTopicPopup();

  // Local UI state only - not for data fetching
  const [showFilters, setShowFilters] = useState(false);
  
  // CRITICAL FIX: Call openPopup when the component props change
  useEffect(() => {
    if (isOpen && topicName && topicType) {
      // Open the popup in the hook
      openPopup(topicName, topicType, documentId);
    }
  }, [isOpen, topicName, topicType, documentId]);

  // Close the popup in the hook when this component closes
  useEffect(() => {
    if (!isOpen && popupState.isOpen) {
      closePopup();
    }
  }, [isOpen]);
  
  // Format the document count
  const formatCount = (count) => {
    return count > 1000 ? `${(count / 1000).toFixed(1)}K` : count;
  };
  
  // Don't render anything if the popup is closed
  if (!isOpen) return null;

  // Handle local close that calls the parent's onClose
  const handleClose = () => {
    onClose();
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
              onClick={handleClose}
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
                    {filterOptions.years.map(year => (
                      <label key={year} className="flex items-center space-x-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={filters.years[year] || false}
                          onChange={(e) => handleFilterChange({
                            ...filters,
                            years: {
                              ...filters.years,
                              [year]: e.target.checked
                            }
                          })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="dark:text-gray-300">{year}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                {/* Document types filter */}
                <div>
                  <h5 className="text-xs font-medium mb-2 dark:text-gray-400">Document Types</h5>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.documentTypes.map(type => (
                      <label key={type} className="flex items-center space-x-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={filters.documentTypes[type] || false}
                          onChange={(e) => handleFilterChange({
                            ...filters,
                            documentTypes: {
                              ...filters.documentTypes,
                              [type]: e.target.checked
                            }
                          })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="dark:text-gray-300">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Sort options */}
              <div>
                <h4 className="text-sm font-medium mb-3 dark:text-gray-300">Sort By</h4>
                <div className="space-y-2">
                  {/* Combined Score renamed to Relevancy for non-derived topics */}
                  {topicType !== 'derived' && (
                    <button 
                      onClick={() => handleSortChange('combined')}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-md w-full text-left ${
                        sortBy === 'combined' 
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className="dark:text-gray-300">Relevance Score</span>
                      {sortBy === 'combined' && <ArrowDown className="h-4 w-4" />}
                    </button>
                  )}
                  
                  {/* For derived topics, keep the semantic score option */}
                  {topicType === 'derived' && (
                    <button 
                      onClick={() => handleSortChange('semanticScore')}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-md w-full text-left ${
                        sortBy === 'semanticScore' 
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className="dark:text-gray-300">Relevance Score</span>
                      {sortBy === 'semanticScore' && <ArrowDown className="h-4 w-4" />}
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
              <strong className="font-medium">{formatCount(totalCount)}</strong> documents related to this {topicType === 'mandate' ? 'mandate' : 'topic'}
            </div>
            
            {/* If active filters are applied, show filter count */}
            {(Object.values(filters.years).some(v => v) || Object.values(filters.documentTypes).some(v => v)) && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-2 py-1 rounded-full">
                Filters applied
              </span>
            )}
          </div>
          
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></div>
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></div>
              </div>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No related documents found with the current filters.
            </div>
          ) : (
            <div className="space-y-4">
              {documents.map((doc, index) => (
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
                      {doc.documentType} • {doc.year || (doc.csasYear ? `${doc.csasYear}*` : "N/A")}
                    </div>
                    <div>
                      <span className="bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded text-xs flex items-center">
                        <span className="font-medium">Relevance Score:</span>
                        <span className="ml-1">
                          {/* Show semantic score for derived topics, LLM score for others */}
                          {((topicType === 'derived' ? doc.semanticScore : doc.llmScore) * 100).toFixed(0)}%
                        </span>
                        <div 
                          className="ml-1 relative cursor-help"
                          onMouseEnter={() => setShowTooltip(`doc-${index}`)}
                          onMouseLeave={() => setShowTooltip(null)}
                        >
                          <Info className="h-3 w-3 text-gray-400" />
                          {showTooltip === `doc-${index}` && (
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-50">
                              {getRelevanceExplanation()}
                            </div>
                          )}
                        </div>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
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
