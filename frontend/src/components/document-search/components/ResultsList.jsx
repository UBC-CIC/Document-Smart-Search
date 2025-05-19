import ResultItem from "./ResultItem"
import Pagination from "./Pagination"

export default function ResultsList({ 
  filteredResults, 
  sortBy, 
  handleSortChange, 
  totalResults, 
  currentPage,
  setCurrentPage,
  openQuerySummary 
}) {
  return (
    <div className="flex-1">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
        <div className="flex items-center">
          <span className="text-sm text-gray-600 dark:text-gray-400">Sort by:</span>
          <div className="ml-2 flex items-center bg-gray-200 dark:bg-gray-700 rounded-full p-1">
            <button
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                sortBy === "recent" ? "bg-white dark:bg-gray-600 shadow-sm" : "dark:text-gray-300"
              }`}
              onClick={() => handleSortChange("recent")}
            >
              Recent
            </button>
            <button
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                sortBy === "oldest" ? "bg-white dark:bg-gray-600 shadow-sm" : "dark:text-gray-300"
              }`}
              onClick={() => handleSortChange("oldest")}
            >
              Oldest
            </button>
            <button
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                sortBy === "a-z" ? "bg-white dark:bg-gray-600 shadow-sm" : "dark:text-gray-300"
              }`}
              onClick={() => handleSortChange("a-z")}
            >
              A-Z
            </button>
          </div>
        </div>
        <span className="text-sm text-gray-600 dark:text-gray-400">{totalResults} results</span>
      </div>

      {/* Search Results */}
      <div className="space-y-4">
        {filteredResults.length > 0 ? (
          filteredResults.map((result) => (
            <ResultItem key={result.id} result={result} openQuerySummary={openQuerySummary} />
          ))
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 text-center">
            <p className="text-gray-600 dark:text-gray-400">No documents found matching your search criteria.</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      <Pagination currentPage={currentPage} setCurrentPage={setCurrentPage} />
    </div>
  )
}
