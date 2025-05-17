"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { DateRange } from "react-date-range";
import AsyncSelect from "react-select/async";
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { useRef } from "react";
import { useClickAway } from "react-use";

export default function TopicTrends() {
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef(null);
  const [editingField, setEditingField] = useState(null); // 'start' or 'end'
  const [allTopics, setAllTopics] = useState([
    { label: "Salmon", value: "salmon" },
    { label: "Conservation", value: "conservation" },
    { label: "Climate Change", value: "climate-change" },
    { label: "Aquaculture", value: "aquaculture" },
    { label: "Fisheries", value: "fisheries" },
    { label: "Biodiversity", value: "biodiversity" },
    // ... add more if needed
  ]);


  useClickAway(calendarRef, () => {
    setShowCalendar(false);
  });
  const [dateRange, setDateRange] = useState([
    {
      startDate: new Date(2010, 0, 1),
      endDate: new Date(2023, 11, 31),
      key: "selection",
    },
  ]);
  const [selectedTopics, setSelectedTopics] = useState([]);

  const handleTopicSearch = async (inputValue) => {
    const allTopics = [
      { label: "Salmon", value: "salmon" },
      { label: "Conservation", value: "conservation" },
      { label: "Climate Change", value: "climate-change" },
      { label: "Aquaculture", value: "aquaculture" },
      { label: "Fisheries", value: "fisheries" },
      { label: "Biodiversity", value: "biodiversity" },
      // ... add more if needed
    ];
  
    if (!inputValue) return allTopics; // return all on empty search
  
    return allTopics.filter((topic) =>
      topic.label.toLowerCase().includes(inputValue.toLowerCase())
    );
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-all duration-300">
      <main className="max-w-5xl mx-auto px-4 py-6 md:py-8">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-6 md:mb-8 dark:text-white">
          Topics Trend Analytics
        </h2>

        {/* Filters */}
        <div className="mb-6 md:mb-8 bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 md:p-4 border dark:border-gray-700">
          <h3 className="font-medium dark:text-white mb-3 md:mb-4 text-sm md:text-base">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
  <label className="block text-xs md:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
    Date Range
  </label>
  <div className="flex space-x-2">
    <input
      type="text"
      readOnly
      onClick={() => {setEditingField('start'); setShowCalendar(true)}}
      value={dateRange[0].startDate.toLocaleDateString()}
      className="w-full cursor-pointer rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1.5 text-xs md:text-sm"
    />
    <input
      type="text"
      readOnly
      onClick={() => {setEditingField('end'); setShowCalendar(true)}}
      value={dateRange[0].endDate.toLocaleDateString()}
      className="w-full cursor-pointer rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1.5 text-xs md:text-sm"
    />
  </div>

  {showCalendar && (
    <div ref={calendarRef} className="absolute z-50 mt-2 shadow-lg">
      <DateRange
        editableDateInputs
        onChange={(item) => {
          const newStart = editingField === "start" ? item.selection.startDate : dateRange[0].startDate;
          const newEnd = editingField === "end" ? item.selection.endDate : dateRange[0].endDate;
      
          setDateRange([{ startDate: newStart, endDate: newEnd, key: "selection" }]);
          setShowCalendar(false);
        }}
        moveRangeOnFirstSelection={false}
        ranges={dateRange}
        minDate={new Date(2000, 0, 1)}
        maxDate={new Date()}
      />
    </div>
  )}
</div>


            <div className="md:col-span-2">
              <label className="block text-xs md:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Topic Filter
              </label>
              <AsyncSelect
                cacheOptions
                defaultOptions={allTopics}
                loadOptions={handleTopicSearch}
                isMulti
                placeholder="Search topics..."
                onChange={(selected) => setSelectedTopics(selected)}
                styles={{
                  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                }}
                menuPortalTarget={typeof window !== 'undefined' ? document.body : null}
              />
            </div>
          </div>
        </div>

        {/* Analytics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Co-occurrence */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 md:p-4 border dark:border-gray-700">
            <div className="flex justify-between items-center mb-3 md:mb-4">
              <h3 className="font-medium dark:text-white text-sm md:text-base">
                Topic Co-occurrence Network (2010 - 2023)
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  Last updated: Jan 10, 2023
                </span>
                <Info className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </div>
            </div>
            <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              {/* Placeholder */}
              <p className="text-sm text-gray-600 dark:text-gray-300">Graph Placeholder</p>
            </div>
          </div>

          {/* Trend Over Time */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 md:p-4 border dark:border-gray-700">
            <div className="flex justify-between items-center mb-3 md:mb-4">
              <h3 className="font-medium dark:text-white text-sm md:text-base">
                Total Document Count by Topic (2010 - 2023)
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  Last updated: Jan 10, 2023
                </span>
                <Info className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </div>
            </div>
            <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              {/* Placeholder */}
              <p className="text-sm text-gray-600 dark:text-gray-300">Line Chart Placeholder</p>
            </div>
          </div>

          {/* Distribution */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 md:p-4 border dark:border-gray-700">
            <div className="flex justify-between items-center mb-3 md:mb-4">
              <h3 className="font-medium dark:text-white text-sm md:text-base">
                Topic Distribution by Category
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  Last updated: Jan 10, 2023
                </span>
                <Info className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </div>
            </div>
            <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              {/* Placeholder */}
              <p className="text-sm text-gray-600 dark:text-gray-300">Bar Chart Placeholder</p>
            </div>
          </div>

          {/* Proportion */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 md:p-4 border dark:border-gray-700">
            <div className="flex justify-between items-center mb-3 md:mb-4">
              <h3 className="font-medium dark:text-white text-sm md:text-base">
                Proportion of Documents by Topic
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  Last updated: Jan 10, 2023
                </span>
                <Info className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </div>
            </div>
            <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              {/* Placeholder */}
              <p className="text-sm text-gray-600 dark:text-gray-300">Pie Chart Placeholder</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
