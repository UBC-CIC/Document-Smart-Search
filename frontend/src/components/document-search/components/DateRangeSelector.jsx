import { useState, useEffect, useRef } from "react";
import { useClickAway } from "react-use";

export default function DateRangeSelector({ yearFilters, setYearFilters }) {
  const dropdownRef = useRef(null);
  const isUserAction = useRef(false); // Track if change is from user interaction
  
  // Get all available years and sort them numerically
  const availableYears = [...new Set(Object.keys(yearFilters).map(y => parseInt(y)))].sort((a, b) => a - b);
  
  // Initialize from/to years based on available years
  const minAvailableYear = availableYears.length > 0 ? Math.min(...availableYears) : new Date().getFullYear() - 5;
  const maxAvailableYear = availableYears.length > 0 ? Math.max(...availableYears) : new Date().getFullYear();
  
  // Create an array of all years in the range for dropdowns
  const allPossibleYears = [];
  for (let year = minAvailableYear; year <= maxAvailableYear; year++) {
    allPossibleYears.push(year);
  }
  
  // State for the selected range
  const [fromYear, setFromYear] = useState(minAvailableYear);
  const [toYear, setToYear] = useState(maxAvailableYear);
  const [isOpen, setIsOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  
  // Update the year filters when range changes (from user interaction only)
  useEffect(() => {
    if (!isUserAction.current || availableYears.length === 0) return;
    
    const updatedFilters = { ...yearFilters };
    Object.keys(updatedFilters).forEach(year => {
      const yearNum = parseInt(year);
      updatedFilters[year] = yearNum >= fromYear && yearNum <= toYear;
    });
    
    setYearFilters(updatedFilters);
    isUserAction.current = false; // Reset after updating filters
  }, [fromYear, toYear]);
  
  // Determine display text
  const displayText = fromYear === toYear 
    ? `${fromYear}` 
    : `${fromYear} to ${toYear}`;
  
  // Initialize the component once with yearFilters data
  useEffect(() => {
    if (initialized || Object.keys(yearFilters).length === 0) return;
    
    const selectedYears = Object.entries(yearFilters)
      .filter(([_, isActive]) => isActive)
      .map(([year]) => parseInt(year));
    
    if (selectedYears.length > 0) {
      // If we have active years selected, use them
      setFromYear(Math.min(...selectedYears));
      setToYear(Math.max(...selectedYears));
    } else if (availableYears.length > 0) {
      // If no years selected but we have available years, default to all years
      setFromYear(minAvailableYear);
      setToYear(maxAvailableYear);
      
      // Initialize the filters to all true within the range
      const updatedFilters = { ...yearFilters };
      Object.keys(updatedFilters).forEach(year => {
        const yearNum = parseInt(year);
        updatedFilters[year] = yearNum >= minAvailableYear && yearNum <= maxAvailableYear;
      });
      setYearFilters(updatedFilters);
    }
    
    setInitialized(true);
  }, [yearFilters, minAvailableYear, maxAvailableYear, availableYears, initialized]);
  
  useClickAway(dropdownRef, () => {
    setIsOpen(false);
  });
  
  const handleFromYearChange = (e) => {
    const newFromYear = parseInt(e.target.value);
    isUserAction.current = true; // Mark this as a user action
    setFromYear(newFromYear);
    
    // If from year is greater than to year, update to year as well
    if (newFromYear > toYear) {
      setToYear(newFromYear);
    }
  };
  
  const handleToYearChange = (e) => {
    const newToYear = parseInt(e.target.value);
    isUserAction.current = true; // Mark this as a user action
    setToYear(newToYear);
    
    // If to year is less than from year, update from year as well
    if (newToYear < fromYear) {
      setFromYear(newToYear);
    }
  };

  // Convert year value to position percentage for visual bar
  const yearToPercent = (year) => {
    if (maxAvailableYear === minAvailableYear) return 50;
    return ((year - minAvailableYear) / (maxAvailableYear - minAvailableYear)) * 100;
  };

  // Don't render anything if there are no years
  if (availableYears.length === 0) return null;

  return (
    <div className="relative">
      <label className="block text-xs md:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        CSAS Year Range
      </label>
      
      <button
        type="button"
        className="w-full flex justify-between items-center px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm text-left cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-gray-700 dark:text-gray-300">{displayText}</span>
        <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && (
        <div 
          ref={dropdownRef}
          className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 shadow-lg rounded-md border border-gray-300 dark:border-gray-600 p-4"
        >
          <div className="flex flex-col space-y-4">
            {/* Year range dropdowns */}
            <div className="flex space-x-2">
              <div className="w-1/2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  From
                </label>
                <select
                  value={fromYear}
                  onChange={handleFromYearChange}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-1.5"
                >
                  {allPossibleYears.map(year => (
                    <option key={`from-${year}`} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              
              <div className="w-1/2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  To
                </label>
                <select
                  value={toYear}
                  onChange={handleToYearChange}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-1.5"
                >
                  {allPossibleYears.map(year => (
                    <option key={`to-${year}`} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Visual bar representation (non-interactive) */}
            <div className="pt-4 pb-2">
              <div className="relative h-2 bg-gray-300 dark:bg-gray-600 rounded-full">
                {/* Filled area between markers */}
                <div 
                  className="absolute h-2 bg-blue-500 rounded-full"
                  style={{ 
                    left: `${yearToPercent(fromYear)}%`,
                    right: `${100 - yearToPercent(toYear)}%`
                  }}
                />
                
                {/* Markers for from and to years */}
                <div 
                  className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white border-2 border-blue-500"
                  style={{ left: `${yearToPercent(fromYear)}%`, marginLeft: '-8px' }}
                >
                  <span className="absolute top-5 left-1/2 -translate-x-1/2 text-xs font-medium">
                    {fromYear}
                  </span>
                </div>
                
                <div 
                  className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white border-2 border-blue-500"
                  style={{ left: `${yearToPercent(toYear)}%`, marginLeft: '-8px' }}
                >
                  <span className="absolute top-5 left-1/2 -translate-x-1/2 text-xs font-medium">
                    {toYear}
                  </span>
                </div>
              </div>
              
              {/* Year labels */}
              <div className="flex justify-between mt-8 px-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {minAvailableYear}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {maxAvailableYear}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
