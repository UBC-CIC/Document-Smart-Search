import ResultItem from "./ResultItem";
import Pagination from "./Pagination";
import { Search } from "lucide-react";

export default function ResultsList({
  filteredResults,
  sortBy,
  handleSortChange,
  totalResults,
  currentPage,
  setCurrentPage,
  openQuerySummary,
  isLoading,
  hasSearched,
  totalPages,
}) {
  return (
    <div className="flex-1">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
        <div className="flex items-center">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Sort by:
          </span>
          <div className="ml-2 flex items-center bg-gray-200 dark:bg-gray-700 rounded-full p-1">
            <button
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                sortBy === "relevance"
                  ? "bg-white dark:bg-gray-600 shadow-sm"
                  : "dark:text-gray-300"
              }`}
              onClick={() => handleSortChange("relevance")}
              disabled={isLoading || !hasSearched}
            >
              Relevance
            </button>
            <button
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                sortBy === "recent"
                  ? "bg-white dark:bg-gray-600 shadow-sm"
                  : "dark:text-gray-300"
              }`}
              onClick={() => handleSortChange("recent")}
              disabled={isLoading || !hasSearched}
            >
              Recent
            </button>
            <button
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                sortBy === "oldest"
                  ? "bg-white dark:bg-gray-600 shadow-sm"
                  : "dark:text-gray-300"
              }`}
              onClick={() => handleSortChange("oldest")}
              disabled={isLoading || !hasSearched}
            >
              Oldest
            </button>
            <button
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                sortBy === "a-z"
                  ? "bg-white dark:bg-gray-600 shadow-sm"
                  : "dark:text-gray-300"
              }`}
              onClick={() => handleSortChange("a-z")}
              disabled={isLoading || !hasSearched}
            >
              A-Z
            </button>
          </div>
        </div>
        {hasSearched && (
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {totalResults} results
          </span>
        )}
      </div>

      {/* Search Results */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
            <div className="flex justify-center items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></div>
              <div
                className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: "0.2s" }}
              ></div>
              <div
                className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: "0.4s" }}
              ></div>
            </div>
            <p className="mt-3 text-gray-600 dark:text-gray-400">
              Loading results...
            </p>
          </div>
        ) : !hasSearched ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
            <div className="flex justify-center mb-4">
              <Search className="h-12 w-12 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
              Search for Documents
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              Enter keywords in the search box above and press the search button
              to find relevant documents. Use filters to narrow your results.
            </p>
          </div>
        ) : filteredResults.length > 0 ? (
          filteredResults.map((result) => (
            <ResultItem
              key={result.id}
              result={result}
              openQuerySummary={openQuerySummary}
            />
          ))
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              No documents found matching your search criteria.
            </p>
          </div>
        )}
      </div>

      {/* Pagination - only show when not loading and total results exist */}
      {!isLoading && hasSearched && totalResults > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          setCurrentPage={setCurrentPage}
        />
      )}
    </div>
  );
}
