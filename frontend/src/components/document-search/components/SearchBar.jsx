import { Search } from "lucide-react"

export default function SearchBar({ searchQuery, setSearchQuery, handleSearch, isLoading }) {
  return (
    <div className="mb-6 md:mb-8">
      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          placeholder="Search for documents..."
          className="w-full py-2.5 md:py-3 px-4 pr-12 bg-gray-200 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-gray-100 focus:outline-none placeholder:text-gray-500 dark:placeholder:text-gray-400 text-sm md:text-base"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={isLoading}
          required
        />
        <button
          type="submit"
          className={`absolute right-2 md:right-3 top-1/2 transform -translate-y-1/2 bg-white dark:bg-gray-600 p-1.5 md:p-2 rounded-md ${
            isLoading || !searchQuery.trim() ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          disabled={isLoading || !searchQuery.trim()}
        >
          {isLoading ? (
            <div className="h-4 w-4 md:h-5 md:w-5 border-2 border-t-2 border-gray-500 border-t-blue-500 rounded-full animate-spin"></div>
          ) : (
            <Search className="h-4 w-4 md:h-5 md:w-5 dark:text-gray-300" />
          )}
        </button>
      </form>
    </div>
  )
}
