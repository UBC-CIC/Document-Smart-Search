import Link from "next/link"
import { ChevronRight } from "lucide-react"

export default function ResultItem({ result, openQuerySummary }) {
  return (
    <>
      <style jsx global>{`
        .highlight-container em {
          font-style: normal;
          font-weight: bold;
        }
      `}</style>
      
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 md:p-4 border dark:border-gray-700">
        <div className="flex justify-between mb-2">
          <div className="text-xs md:text-sm text-blue-600 dark:text-blue-400">{result.documentType || "Unknown Type"}</div>
        </div>

        {/* <div className="flex justify-between mb-2">
          <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">CSAS Year: {result.csasYear || result.year}</div>
        </div> */}

        <div className="mb-2">
          <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">
            {result.csasEvent ? `${result.csasEvent} (${result.csasYear})` : "No Associated CSAS Event"}
          </div>
        </div>

        <div className="mt-3 md:mt-4 mb-2">
          <div className="flex flex-col sm:flex-row sm:justify-between gap-2 mb-2">
            <div className="font-medium dark:text-white text-sm md:text-base">{
            result.title.length > 20 ? `${result.title.substring(0, 35)}...` : result.title
            }</div>
            <div className="flex space-x-2 text-xs md:text-sm">
              <Link href={`/documents/${result.id}`} className="text-blue-600 dark:text-blue-400">
                Document Summary
              </Link>
              <button className="text-blue-600 dark:text-blue-400" onClick={() => openQuerySummary(result.id)}>
                Query Summary
              </button>
            </div>
          </div>

          <div className="mt-2 bg-gray-100 dark:bg-gray-700 p-2 md:p-3 rounded-md highlight-container">
            {result.highlight && result.highlight.length > 0 ? (
              <ul className="list-disc pl-5 text-xs md:text-sm dark:text-gray-300">
                {result.highlight.map((hl, index) => (
                  <li 
                    key={index} 
                    dangerouslySetInnerHTML={{ __html: hl }}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">No highlights found</p>
            )}
          </div>
        </div>

        <div className="flex justify-end mt-2">
          <a
            href={result.html_url || ""}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 text-xs md:text-sm flex items-center"
          >
            View Document <ChevronRight className="h-3 w-3 md:h-4 md:w-4 ml-1" />
          </a>
        </div>
      </div>
    </>
  )
}
