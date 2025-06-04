"use client";

import { useState, useEffect, useRef } from "react";
import { Info } from "lucide-react";
import AsyncSelect from "react-select/async";
import { ResponsiveContainer } from "recharts";
import { useClickAway } from "react-use";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, Bar, BarChart, Cell } from 'recharts';
import { colorPalette, mockTopicTrendsData, mockTopicOptions, mockDocumentTypes } from "./mockdata/mockAnalyticsData";
import { getUserToken } from "@/lib/getUserToken";

// Set this to false to use real API data
const USE_MOCK_DATA = false;

/**
 * Fetch available filter options for topics
 */
const fetchFilterOptions = async () => {
  try {
    // Define filters to request
    const filtersToRequest = ["years", "document_types", "derived_topics"];
    
    // Build the URL with query parameters
    const url = new URL(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/filters`);
    url.searchParams.append("filters", filtersToRequest.join(","));
    const token = await getUserToken();
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json();
    return {
      years: data.years || [],
      documentTypes: data.documentTypes || [],
      topics: data.derivedTopics || []
    };
  } catch (error) {
    console.error("Error fetching filter options:", error.message);
    return { years: [], documentTypes: [], topics: [] };
  }
};

export default function DerivedTopicTrends() {
  // State variables
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState([]);
  const [allTopics, setAllTopics] = useState([]);
  const [allDocumentTypes, setAllDocumentTypes] = useState([]);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [selectedDocTypes, setSelectedDocTypes] = useState([]);
  
  // Year range picker state
  const [isYearSelectorOpen, setIsYearSelectorOpen] = useState(false);
  const yearSelectorRef = useRef(null);
  
  // Available years - calculated once during initial fetch
  const [availableYears, setAvailableYears] = useState([]);
  const [minAvailableYear, setMinAvailableYear] = useState(2010);
  const [maxAvailableYear, setMaxAvailableYear] = useState(new Date().getFullYear());
  
  // Selected range - can be changed by user
  const [fromYear, setFromYear] = useState(2010);
  const [toYear, setToYear] = useState(new Date().getFullYear());

  // Generate all years in a range
  const generateYearsInRange = (start, end) => {
    const years = [];
    for (let year = start; year <= end; year++) {
      years.push(year);
    }
    return years;
  };
  
  // Calculate total documents for a given topic
  const getTotalDocuments = (topic) => {
    return chartData
      .filter(data => data.year >= fromYear && data.year <= toYear)
      .reduce((total, data) => total + (data[topic] || 0), 0);
  };

  // Fetch chart data based on selected criteria
  const fetchChartData = async () => {
    // Don't fetch data if no topics are selected
    if (selectedTopics.length === 0) {
      setChartData([]);
      setLoading(false);
      return;
    }

    if (USE_MOCK_DATA) {
      setChartData(mockTopicTrendsData);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      // For real API implementation
      const url = new URL(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/chart_data`);
      url.searchParams.append("fromYear", fromYear.toString());
      url.searchParams.append("toYear", toYear.toString());
      
      if (selectedTopics.length > 0) {
        url.searchParams.append("derived_topics", selectedTopics.join(","));
      }
      
      if (selectedDocTypes.length > 0) {
        url.searchParams.append("document_types", selectedDocTypes.join(","));
      }
      const token = await getUserToken();
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json();
      setChartData(data);
    } catch (error) {
      console.error(`Error fetching chart data:`, error);
      setChartData([]);
    } finally {
      setLoading(false);
    }
  };

  // Initialize filter options and set up available years
  const fetchFilters = async () => {
    setLoading(true);
    
    try {
      let years = [];
      
      if (USE_MOCK_DATA) {
        setAllTopics(mockTopicOptions);
        setAllDocumentTypes(mockDocumentTypes);
        setChartData(mockTopicTrendsData);
        
        // Extract unique years from mock data
        years = [...new Set(mockTopicTrendsData.map(item => item.year))].sort((a, b) => a - b);
      } else {
        const filterOptions = await fetchFilterOptions();
        
        // Process topics
        if (filterOptions.topics && filterOptions.topics.length > 0) {
          setAllTopics(filterOptions.topics);
        }
        
        // Process document types
        if (filterOptions.documentTypes && filterOptions.documentTypes.length > 0) {
          setAllDocumentTypes(filterOptions.documentTypes);
        }
        
        // Process years
        if (filterOptions.years && filterOptions.years.length > 0) {
          years = filterOptions.years.map(year => parseInt(year)).sort((a, b) => a - b);
        }
      }
      
      // Only set year range once during initialization
      if (years.length > 0) {
        const minYear = Math.min(...years);
        const maxYear = Math.max(...years);
        
        // Generate all years in range
        const fullYearRange = generateYearsInRange(minYear, maxYear);
        setAvailableYears(fullYearRange);
        
        // Set min/max range
        setMinAvailableYear(minYear);
        setMaxAvailableYear(maxYear);
        
        // Initialize selected range to full range
        setFromYear(minYear);
        setToYear(maxYear);
      } else {
        // Fallback to default years if no data
        const currentYear = new Date().getFullYear();
        const defaultRange = generateYearsInRange(currentYear - 10, currentYear);
        setAvailableYears(defaultRange);
      }
    } catch (error) {
      console.error(`Error fetching filters:`, error);
      
      // Fallback to default years on error
      const currentYear = new Date().getFullYear();
      const defaultRange = generateYearsInRange(currentYear - 10, currentYear);
      setAvailableYears(defaultRange);
    } finally {
      setLoading(false);
    }
  };

  // Format options for AsyncSelect
  const formatOptionsForSelect = (options) => {
    return options.map(option => ({
      label: option,
      value: option
    }));
  };

  // Get random items from an array
  const getRandomItems = (array, count) => {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };

  // Handle selecting topics (limited to 10)
  const handleTopicSelection = (selected) => {
    const selectedValues = selected ? selected.map(item => item.value) : [];
    
    if (selectedValues.length > 10) {
      // Limit to first 10 selections
      setSelectedTopics(selectedValues.slice(0, 10));
      // Could add a toast/notification here to inform user
    } else {
      setSelectedTopics(selectedValues);
    }
  };

  // Handle selecting random topics
  const handleSelectRandomTopics = () => {
    const MAX_TOPICS = 10;
    
    if (allTopics.length <= MAX_TOPICS) {
      // If we have 10 or fewer topics, select all of them
      setSelectedTopics(allTopics);
      return;
    }
    
    if (selectedTopics.length >= MAX_TOPICS) {
      // If already at limit, select 10 different random topics
      const unselectedTopics = allTopics.filter(topic => !selectedTopics.includes(topic));
      
      // If all topics are already selected, reshuffle for new random selection
      if (unselectedTopics.length === 0) {
        setSelectedTopics(getRandomItems(allTopics, MAX_TOPICS));
        return;
      }
      
      // Get up to 10 random unselected topics
      const randomUnselected = getRandomItems(unselectedTopics, MAX_TOPICS);
      setSelectedTopics(randomUnselected);
    } else {
      // Select random topics up to 10 total
      setSelectedTopics(getRandomItems(allTopics, MAX_TOPICS));
    }
  };

  // Handle deselecting all topics
  const handleDeselectAllTopics = () => {
    setSelectedTopics([]);
  };

  // Handle search for AsyncSelect components
  const handleTopicSearch = async (inputValue) => {
    if (!inputValue) return formatOptionsForSelect(allTopics);
    return formatOptionsForSelect(
      allTopics.filter(topic => topic.toLowerCase().includes(inputValue.toLowerCase()))
    );
  };
  
  const handleDocTypeSearch = async (inputValue) => {
    if (!inputValue) return formatOptionsForSelect(allDocumentTypes);
    return formatOptionsForSelect(
      allDocumentTypes.filter(docType => docType.toLowerCase().includes(inputValue.toLowerCase()))
    );
  };

  // Year range selector handlers
  const handleFromYearChange = (e) => {
    const newFromYear = parseInt(e.target.value);
    setFromYear(newFromYear);
    
    // If from year is greater than to year, update to year as well
    if (newFromYear > toYear) {
      setToYear(newFromYear);
    }
  };
  
  const handleToYearChange = (e) => {
    const newToYear = parseInt(e.target.value);
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

  // Click away handler
  useClickAway(yearSelectorRef, () => {
    setIsYearSelectorOpen(false);
  });

  // Filter chart data based on selected years
  const filteredChartData = chartData.filter(item => 
    item.year >= fromYear && item.year <= toYear
  );
  
  // Effect hooks
  useEffect(() => {
    fetchFilters();
  }, []);

  useEffect(() => {
    // Only fetch data if topics are selected, regardless of document types
    if (selectedTopics.length > 0) {
      fetchChartData();
    } else {
      // Clear chart data when no topics are selected
      setChartData([]);
    }
  }, [fromYear, toYear, selectedTopics, selectedDocTypes]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-all duration-300">
      <main className="max-w-5xl mx-auto px-4 py-6 md:py-8">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-6 md:mb-8 dark:text-white">
          Derived Topic Trends Analytics
        </h2>

        {/* Filters */}
        <div className="mb-6 md:mb-8 bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 md:p-4 border dark:border-gray-700">
          <h3 className="font-medium dark:text-white mb-3 md:mb-4 text-sm md:text-base">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-xs md:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Year Range
              </label>
              
              <button
                type="button"
                className="w-full flex justify-between items-center px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm text-left cursor-pointer"
                onClick={() => setIsYearSelectorOpen(!isYearSelectorOpen)}
              >
                <span className="text-gray-700 dark:text-gray-300">
                  {fromYear === toYear ? `${fromYear}` : `${fromYear} to ${toYear}`}
                </span>
                <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {isYearSelectorOpen && (
                <div 
                  ref={yearSelectorRef}
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
                          {availableYears.map(year => (
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
                          {availableYears.map(year => (
                            <option key={`to-${year}`} value={year}>{year}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    {/* Years in range summary */}
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {fromYear === toYear 
                        ? `1 year selected: ${fromYear}` 
                        : `${toYear - fromYear + 1} years selected: ${fromYear} to ${toYear}`}
                    </div>
                    
                    {/* Visual bar representation */}
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

            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Document Type
              </label>
              <AsyncSelect
                cacheOptions
                defaultOptions={formatOptionsForSelect(allDocumentTypes)}
                loadOptions={handleDocTypeSearch}
                isMulti
                placeholder="Select document types..."
                onChange={(selected) => setSelectedDocTypes(selected ? selected.map(item => item.value) : [])}
                styles={{
                  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                }}
                menuPortalTarget={typeof window !== 'undefined' ? document.body : null}
              />
            </div>
            
            <div className="md:col-span-2">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs md:text-sm font-medium text-gray-700 dark:text-gray-300">
                  Derived Topic Filter <span className="text-xs text-gray-500">(Max 10)</span>
                </label>
                <div className="flex space-x-3">
                  <button 
                    type="button"
                    onClick={handleDeselectAllTopics}
                    className="text-xs md:text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
                  >
                    Deselect All
                  </button>
                  <button 
                    type="button"
                    onClick={handleSelectRandomTopics}
                    className="text-xs md:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                  >
                    {allTopics.length <= 10 ? "Select All Topics" : "Select Random 10 Topics"}
                  </button>
                </div>
              </div>
              <AsyncSelect
                cacheOptions
                defaultOptions={formatOptionsForSelect(allTopics)}
                loadOptions={handleTopicSearch}
                isMulti
                placeholder="Search topics... (10 max)"
                onChange={handleTopicSelection}
                styles={{
                  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                }}
                menuPortalTarget={typeof window !== 'undefined' ? document.body : null}
                value={formatOptionsForSelect(selectedTopics)}
              />
            </div>
          </div>
        </div>

        {/* Analytics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-1 gap-4 md:gap-6">
          {/* Line Chart - Topic Trends Over Time */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 md:p-4 border dark:border-gray-700">
            <div className="flex justify-between items-center mb-3 md:mb-4">
              <h3 className="font-medium dark:text-white text-sm md:text-base">
                Yearly Document Count Trends by Derived Topic
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  {USE_MOCK_DATA ? "Mock Data" : "Last updated: " + new Date().toLocaleDateString()}
                </span>
                <Info className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </div>
            </div>
            {(selectedTopics.length === 0) ?
              (<div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              <p className="text-sm text-gray-600 dark:text-gray-300">Select topics to begin</p>
            </div>) : (
            <ResponsiveContainer width="100%" height={450}>
              <LineChart data={filteredChartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <XAxis 
                  dataKey="year" 
                  label={{ value: "CSAS Year", position: "insideBottom", offset: -15 }}
                  dy={5} // Add extra space below X-axis
                />
                <YAxis />
                <Tooltip />
                <Legend wrapperStyle={{ paddingTop: 20 }}/>
                {selectedTopics.map((topic, index) => (
                  <Line
                    key={topic}
                    type="monotone"
                    dataKey={topic}
                    stroke={colorPalette[index % colorPalette.length]}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={true}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>)}
          </div>

          {/* Bar Chart - Total Document Count */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 md:p-4 border dark:border-gray-700">
            <div className="flex justify-between items-center mb-3 md:mb-4">
              <h3 className="font-medium dark:text-white text-sm md:text-base">
                Total Document Count by Derived Topic
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  {USE_MOCK_DATA ? "Mock Data" : "Last updated: " + new Date().toLocaleDateString()}
                </span>
                <Info className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </div>
            </div>
            {(selectedTopics.length === 0) ?
              (<div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              <p className="text-sm text-gray-600 dark:text-gray-300">Select topics to begin</p>
            </div>) : (
            <ResponsiveContainer width="100%" height={450}>
              <BarChart 
                data={selectedTopics.map(topic => ({ 
                  name: topic, 
                  count: getTotalDocuments(topic) 
                }))} 
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
              >
                <XAxis dataKey="name" tick={false} />
                <YAxis />
                <Tooltip />
                <Legend 
                  wrapperStyle={{ paddingTop: 0 }}
                  payload={selectedTopics.map((topic, index) => ({
                    value: topic,
                    type: 'square',
                    color: colorPalette[index % colorPalette.length]
                  }))}
                />
                <Bar dataKey="count" barSize={75}>
                  {selectedTopics.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={colorPalette[index % colorPalette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>)}
          </div>      
        </div>
      </main>
    </div>
  );
}
