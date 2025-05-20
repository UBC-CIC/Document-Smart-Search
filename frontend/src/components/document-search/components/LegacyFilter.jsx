import { ChevronDown, ChevronRight } from "lucide-react"
import FilterSection from "./FilterSection"

export default function Filters({
  isFilterOpen,
  yearFilters,
  setYearFilters,
  topicFilters,
  setTopicFilters,
  mandateFilters,
  setMandateFilters,
  authorFilters,
  setAuthorFilters,
  resetFilters,
}) {
  return (
    <div
      className={`w-full md:w-64 bg-gray-100 dark:bg-gray-800 rounded-lg p-4 h-fit ${
        isFilterOpen ? "block" : "hidden md:block"
      }`}
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium dark:text-white">Search Settings</h3>
        <button className="text-blue-600 dark:text-blue-400 text-sm hover:underline" onClick={resetFilters}>
          Reset
        </button>
      </div>

      {/* Filter sections */}
      <div className="space-y-4">
        <FilterSection title="Topics" filters={topicFilters} setFilters={setTopicFilters} initialExpanded={true} />
        <FilterSection title="Year" filters={yearFilters} setFilters={setYearFilters} initialExpanded={true} />
        <FilterSection title="Mandates" filters={mandateFilters} setFilters={setMandateFilters} initialExpanded={true} />
        <FilterSection title="Author" filters={authorFilters} setFilters={setAuthorFilters} initialExpanded={true} />
      </div>
    </div>
  )
}
