export default function Pagination({ currentPage, setCurrentPage }) {
  return (
    <div className="flex justify-center mt-6 md:mt-8">
      <nav className="flex items-center space-x-1">
        <button className="px-2 py-1 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
          &laquo;
        </button>
        {[1, 2, 3, 4, 5].map((page) => (
          <button
            key={page}
            className={`px-2 md:px-3 py-1 rounded text-xs md:text-sm ${
              currentPage === page
                ? "bg-blue-600 text-white"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
            onClick={() => setCurrentPage(page)}
          >
            {page}
          </button>
        ))}
        <span className="px-1 text-gray-600 dark:text-gray-300">...</span>
        <button className="px-2 py-1 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
          &raquo;
        </button>
      </nav>
    </div>
  )
}
