import { ChevronDown, ChevronRight, X } from "lucide-react"
import AsyncFilterSelect from "./AsyncFilterSelect"
import DateRangeSelector from "./DateRangeSelector"

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
  documentTypeFilters,
  setDocumentTypeFilters,
  resetFilters,
  isLoading
}) {
  return (
    <div
      className={`w-full md:w-64 bg-gray-100 dark:bg-gray-800 rounded-lg p-4 h-fit ${
        isFilterOpen ? "block" : "hidden md:block"
      }`}
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium dark:text-white">Search Settings</h3>
        <button 
          className="text-blue-600 dark:text-blue-400 text-sm hover:underline" 
          onClick={resetFilters}
          disabled={isLoading}
        >
          Reset
        </button>
      </div>

      {/* Filter sections */}
      <div className="space-y-4">
        {/* Year Range Filter */}
        <DateRangeSelector yearFilters={yearFilters} setYearFilters={setYearFilters} />

        {/* Document Type Filter */}
        <AsyncFilterSelect
          title="Document Types"
          filters={documentTypeFilters}
          setFilters={setDocumentTypeFilters}
          placeholder="Search document types..."
        />
        
        {/* Mandate Filter */}
        <AsyncFilterSelect
          title="DFO Mandates"
          filters={mandateFilters}
          setFilters={setMandateFilters}
          placeholder="Search mandates..."
        />

        {/* Topic Filter */}
        <AsyncFilterSelect
          title="DFO Topics"
          filters={topicFilters}
          setFilters={setTopicFilters}
          placeholder="Search topics..."
        />

        {/* Author Filter */}
        <AsyncFilterSelect
          title="Authors"
          filters={authorFilters}
          setFilters={setAuthorFilters}
          placeholder="Search authors..."
        />
      </div>
    </div>
  )
}
