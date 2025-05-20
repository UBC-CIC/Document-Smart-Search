import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

export default function FilterSection({ title, filters, setFilters, initialExpanded = true }) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)

  return (
    <div>
      <button
        className="flex justify-between items-center w-full py-2 text-left font-medium dark:text-white"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span>{title}</span>
        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {isExpanded && (
        <div className="mt-2 pl-2">
          {Object.keys(filters).map((key) => (
            <label key={key} className="flex items-center space-x-2 text-sm dark:text-gray-300">
              <input
                type="checkbox"
                checked={filters[key]}
                onChange={() => setFilters((prev) => ({ ...prev, [key]: !prev[key] }))}
                className="rounded"
              />
              <span>{key}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
