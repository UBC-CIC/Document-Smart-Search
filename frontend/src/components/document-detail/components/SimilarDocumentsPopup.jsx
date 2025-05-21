import { useState, useEffect } from "react";
import { X, Filter, ArrowUp, ArrowDown } from "lucide-react";
import { fetchSimilarDocuments } from "../services/similarDocumentsService";
import Link from "next/link";

export default function SimilarDocumentsPopup({ 
  isOpen, 
  onClose, 
  documentId 
}) {
  const [documents, setDocuments] = useState([]);
  const [filterOptions, setFilterOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [filters, setFilters] = useState({
    years: {},
    documentTypes: {}
  });
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('semanticScore');
  
  // FIXED: Results per page is 5, not 10
  const RESULTS_PER_PAGE = 5;

  useEffect(() => {
    if (!isOpen || !documentId) return;
    
    async function fetchData() {
      setLoading(true);
      try {
        const data = await fetchSimilarDocuments(
          documentId, 
          currentPage, 
          filters, 
          sortBy
        );
        
        setDocuments(data.documents);
        setTotalDocuments(data.totalCount);
        setTotalPages(Math.ceil(data.totalCount / RESULTS_PER_PAGE));
        
        // Set filter options if available
        if (data.filterOptions) {
          setFilterOptions(data.filterOptions);
        }
      } catch (err) {
        console.error("Failed to fetch similar documents:", err);
        setError("Failed to load similar documents. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [isOpen, documentId, currentPage, filters, sortBy]);
  
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
            Semantically Similar Documents
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
                
                {/* Years filter - WITHOUT document counts */}
                <div className="mb-4">
                  <h5 className="text-xs font-medium mb-2 dark:text-gray-400">Years</h5>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions && filterOptions.years ? 
                      filterOptions.years.map(year => (
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
                    : ['2023', '2022', '2021', '2020', '2019'].map(year => (
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
                
                {/* Document types filter - WITHOUT document counts */}
                <div>
                  <h5 className="text-xs font-medium mb-2 dark:text-gray-400">Document Types</h5>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions && filterOptions.documentTypes ?
                      filterOptions.documentTypes.map(type => (
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
                    : ['Research Document', 'Terms of Reference', 'Scientific Advice', 'Policy'].map(type => (
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
                <h4 className="text-sm font-medium mb-3 dark:text-gray-300">Sort By (Within Top Results)</h4>
                <div className="space-y-2">
                  <button 
                    onClick={() => handleSortChange('semanticScore')}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-md w-full text-left ${
                      sortBy === 'semanticScore' 
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="dark:text-gray-300">Semantic Relevance</span>
                    {sortBy === 'semanticScore' && <ArrowDown className="h-4 w-4" />}
                  </button>
                  
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
              <strong className="font-medium">Most semantically similar documents (By text content)</strong>
            </div>
            
            {/* If active filters are applied, show filter indicator */}
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
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No similar documents found with the current filters.
            </div>
          ) : (
            <div className="space-y-4">
              {documents.map((doc) => (
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
                      <span className="bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded text-xs">
                        <span className="font-medium">Semantic Score:</span> {(doc.semanticScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Show a message when there are more results */}
              {totalPages > 1 && currentPage < totalPages && (
                <div className="text-center py-2 text-sm text-gray-500 dark:text-gray-400">
                  Showing {currentPage * RESULTS_PER_PAGE} of {Math.min(totalDocuments, 50)} most similar documents
                </div>
              )}
            </div>
          )}
        </div>

        {/* Make sure pagination is visible when there are multiple pages */}
        {totalPages > 1 && (
          <div className="p-4 border-t dark:border-gray-700">
            <div className="flex items-center justify-between">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`px-2 py-1 rounded ${currentPage === 1 ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 dark:text-blue-400 hover:underline'}`}
              >
                Previous
              </button>
              
              <div className="flex items-center space-x-1">
                {/* Make pagination more visible by enhancing the styling */}
                {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                  const pageNumber = i + 1;
                  return (
                    <button
                      key={i}
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
                })}
                
                {/* Show ellipsis if there are more pages */}
                {totalPages > 5 && <span className="px-1">...</span>}
              </div>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`px-2 py-1 rounded ${currentPage === totalPages ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 dark:text-blue-400 hover:underline'}`}
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
