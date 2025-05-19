import Link from "next/link"
import { ChevronRight } from "lucide-react"

export default function ResultItem({ result, openQuerySummary }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 md:p-4 border dark:border-gray-700">
      <div className="flex justify-between mb-2">
        <div className="text-xs md:text-sm text-blue-600 dark:text-blue-400">{result.category}</div>
      </div>

      <div className="flex justify-between mb-2">
        <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Created: 4/5/{result.year}</div>
        <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Year: {result.year}</div>
      </div>

      <div className="flex justify-between mb-2">
        <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Author: {result.author}</div>
        <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Mandates: {result.mandates.join(", ")}</div>
      </div>

      <div className="mt-3 md:mt-4 mb-2">
        <div className="flex flex-col sm:flex-row sm:justify-between gap-2 mb-2">
          <div className="font-medium dark:text-white text-sm md:text-base">{result.title}</div>
          <div className="flex space-x-2 text-xs md:text-sm">
            <Link href={`/document-summary/`} className="text-blue-600 dark:text-blue-400">
              Document Summary
            </Link>
            <button className="text-blue-600 dark:text-blue-400" onClick={() => openQuerySummary(result.id)}>
              Query Summary
            </button>
          </div>
        </div>

        <div className="mt-2 bg-gray-100 dark:bg-gray-700 p-2 md:p-3 rounded-md">
          <ul className="list-disc pl-5 text-xs md:text-sm dark:text-gray-300">
            {result.highlights.map((highlight, index) => (
              <li key={index}>{highlight}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex justify-end mt-2">
        <a
          href="https://publications.gc.ca/site/archivee-archived.html?url=https://publications.gc.ca/collections/collection_2023/mpo-dfo/fs70-7/Fs70-7-2023-036-eng.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 text-xs md:text-sm flex items-center"
        >
          View Document <ChevronRight className="h-3 w-3 md:h-4 md:w-4 ml-1" />
        </a>
      </div>
    </div>
  )
}
