"use client";

import { useState, useEffect } from "react";
import { Info } from "lucide-react";
import { DateRange } from "react-date-range";
import AsyncSelect from "react-select/async";
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { ResponsiveContainer } from "recharts";
import { useRef } from "react";
import { useClickAway } from "react-use";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, Bar, BarChart, Cell } from 'recharts';

export default function TopicTrends() {
  const [showCalendar, setShowCalendar] = useState(false);
  const [loading, setLoading] = useState(true);
  const calendarRef = useRef(null);
  // const [chartData, setChartData] = useState([]);
  const [editingField, setEditingField] = useState(null); // 'start' or 'end'
const chartData = [
  {
    year: 2010,
    "Stock Assessments": 12,
    "Biomass Estimation": 8,
    "Harvest Strategies & TAC (Total Allowable Catch)": 15,
    "Fisheries Monitoring & Compliance": 10,
    "Bycatch Reduction": 7,
    "Indigenous & Community-Based Fisheries": 5,
    "Sustainable Practices": 14,
    "Regulatory Compliance": 9,
    "Innovation in Aquaculture Technologies": 6,
  },
  {
    year: 2011,
    "Stock Assessments": 14,
    "Biomass Estimation": 10,
    "Harvest Strategies & TAC (Total Allowable Catch)": 17,
    "Fisheries Monitoring & Compliance": 12,
    "Bycatch Reduction": 6,
    "Indigenous & Community-Based Fisheries": 8,
    "Sustainable Practices": 13,
    "Regulatory Compliance": 10,
    "Innovation in Aquaculture Technologies": 5,
  },
  {
    year: 2012,
    "Stock Assessments": 16,
    "Biomass Estimation": 11,
    "Harvest Strategies & TAC (Total Allowable Catch)": 19,
    "Fisheries Monitoring & Compliance": 14,
    "Bycatch Reduction": 9,
    "Indigenous & Community-Based Fisheries": 6,
    "Sustainable Practices": 15,
    "Regulatory Compliance": 12,
    "Innovation in Aquaculture Technologies": 7,
  },
  {
    year: 2013,
    "Stock Assessments": 18,
    "Biomass Estimation": 13,
    "Harvest Strategies & TAC (Total Allowable Catch)": 16,
    "Fisheries Monitoring & Compliance": 15,
    "Bycatch Reduction": 8,
    "Indigenous & Community-Based Fisheries": 9,
    "Sustainable Practices": 14,
    "Regulatory Compliance": 11,
    "Innovation in Aquaculture Technologies": 9,
  },
  {
    year: 2014,
    "Stock Assessments": 20,
    "Biomass Estimation": 12,
    "Harvest Strategies & TAC (Total Allowable Catch)": 18,
    "Fisheries Monitoring & Compliance": 16,
    "Bycatch Reduction": 10,
    "Indigenous & Community-Based Fisheries": 7,
    "Sustainable Practices": 13,
    "Regulatory Compliance": 13,
    "Innovation in Aquaculture Technologies": 11,
  },
  {
    year: 2015,
    "Stock Assessments": 22,
    "Biomass Estimation": 14,
    "Harvest Strategies & TAC (Total Allowable Catch)": 20,
    "Fisheries Monitoring & Compliance": 17,
    "Bycatch Reduction": 11,
    "Indigenous & Community-Based Fisheries": 8,
    "Sustainable Practices": 16,
    "Regulatory Compliance": 14,
    "Innovation in Aquaculture Technologies": 10,
  },
  {
    year: 2016,
    "Stock Assessments": 24,
    "Biomass Estimation": 15,
    "Harvest Strategies & TAC (Total Allowable Catch)": 21,
    "Fisheries Monitoring & Compliance": 18,
    "Bycatch Reduction": 13,
    "Indigenous & Community-Based Fisheries": 9,
    "Sustainable Practices": 17,
    "Regulatory Compliance": 16,
    "Innovation in Aquaculture Technologies": 13,
  },
  {
    year: 2017,
    "Stock Assessments": 26,
    "Biomass Estimation": 16,
    "Harvest Strategies & TAC (Total Allowable Catch)": 23,
    "Fisheries Monitoring & Compliance": 19,
    "Bycatch Reduction": 14,
    "Indigenous & Community-Based Fisheries": 10,
    "Sustainable Practices": 18,
    "Regulatory Compliance": 15,
    "Innovation in Aquaculture Technologies": 12,
  },
  {
    year: 2018,
    "Stock Assessments": 28,
    "Biomass Estimation": 18,
    "Harvest Strategies & TAC (Total Allowable Catch)": 24,
    "Fisheries Monitoring & Compliance": 21,
    "Bycatch Reduction": 12,
    "Indigenous & Community-Based Fisheries": 11,
    "Sustainable Practices": 20,
    "Regulatory Compliance": 17,
    "Innovation in Aquaculture Technologies": 14,
  },
  {
    year: 2019,
    "Stock Assessments": 30,
    "Biomass Estimation": 19,
    "Harvest Strategies & TAC (Total Allowable Catch)": 26,
    "Fisheries Monitoring & Compliance": 22,
    "Bycatch Reduction": 15,
    "Indigenous & Community-Based Fisheries": 12,
    "Sustainable Practices": 21,
    "Regulatory Compliance": 18,
    "Innovation in Aquaculture Technologies": 15,
  },
  {
    year: 2020,
    "Stock Assessments": 31,
    "Biomass Estimation": 21,
    "Harvest Strategies & TAC (Total Allowable Catch)": 27,
    "Fisheries Monitoring & Compliance": 23,
    "Bycatch Reduction": 16,
    "Indigenous & Community-Based Fisheries": 14,
    "Sustainable Practices": 22,
    "Regulatory Compliance": 19,
    "Innovation in Aquaculture Technologies": 17,
  },
  {
    year: 2021,
    "Stock Assessments": 33,
    "Biomass Estimation": 22,
    "Harvest Strategies & TAC (Total Allowable Catch)": 28,
    "Fisheries Monitoring & Compliance": 24,
    "Bycatch Reduction": 17,
    "Indigenous & Community-Based Fisheries": 13,
    "Sustainable Practices": 24,
    "Regulatory Compliance": 20,
    "Innovation in Aquaculture Technologies": 18,
  },
  {
    year: 2022,
    "Stock Assessments": 32,
    "Biomass Estimation": 20,
    "Harvest Strategies & TAC (Total Allowable Catch)": 29,
    "Fisheries Monitoring & Compliance": 25,
    "Bycatch Reduction": 18,
    "Indigenous & Community-Based Fisheries": 15,
    "Sustainable Practices": 25,
    "Regulatory Compliance": 21,
    "Innovation in Aquaculture Technologies": 19,
  },
  {
    year: 2023,
    "Stock Assessments": 35,
    "Biomass Estimation": 23,
    "Harvest Strategies & TAC (Total Allowable Catch)": 31,
    "Fisheries Monitoring & Compliance": 26,
    "Bycatch Reduction": 20,
    "Indigenous & Community-Based Fisheries": 16,
    "Sustainable Practices": 27,
    "Regulatory Compliance": 22,
    "Innovation in Aquaculture Technologies": 21,
  },
];


  const colorPalette = [
    "#1f77b4", // blue
    "#d62728", // red
    "#2ca02c", // green
    "#ff7f0e", // orange
    "#9467bd", // purple
    "#8c564b", // brown
    "#e377c2", // pink
    "#7f7f7f", // gray
    "#bcbd22", // yellow-green
    "#17becf", // cyan
    "#393b79", // deep indigo
    "#637939", // olive
    "#843c39", // dark red-brown
    "#e7969c", // light pink
    "#a55194", // violet
    "#9c9ede"  // lavender blue
  ];
  
const [allTopics, setAllTopics] = useState([
  { label: "Stock Assessments", value: "Stock Assessments" },
  { label: "Biomass Estimation", value: "Biomass Estimation" },
  { label: "Harvest Strategies & TAC (Total Allowable Catch)", value: "Harvest Strategies & TAC (Total Allowable Catch)" },
  { label: "Fisheries Monitoring & Compliance", value: "Fisheries Monitoring & Compliance" },
  { label: "Bycatch Reduction", value: "Bycatch Reduction" },
  { label: "Indigenous & Community-Based Fisheries", value: "Indigenous & Community-Based Fisheries" },
  { label: "Sustainable Practices", value: "Sustainable Practices" },
  { label: "Regulatory Compliance", value: "Regulatory Compliance" },
  { label: "Innovation in Aquaculture Technologies", value: "Innovation in Aquaculture Technologies" },
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

  const getTotalDocuments = (topic) => {
    return chartData.reduce((total, data) => total + (data[topic] || 0), 0);
  };

  


  const fetchChartData = async () => {
    setLoading(true);
    try {
      const session = await fetchAuthSession()
      const token = session.tokens.idToken
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}user/chart_data?startDate=${dateRange[0].startDate.toISOString()}&endDate=${dateRange[0].endDate.toISOString()}&topics=${selectedTopics.map(topic => topic.value).join(",")}`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      // Update state with the fetched data
      // setChartData(data);

      // Dynamically calculate min and max dates based on the fetched chart data
      const dates = data.map(item => item.year);
      const dynamicMinDate = new Date(Math.min(...dates));
      const dynamicMaxDate = new Date(Math.max(...dates));

      // Set the min and max dates for the calendar based on the selected topics' data
      setMinDate(dynamicMinDate);
      setMaxDate(dynamicMaxDate);

      // Update dateRange state to use the new min and max dates
      setDateRange([{ startDate: dynamicMinDate, endDate: dynamicMaxDate, key: "selection" }]);
    } catch (error) {
      console.error(`Error fetching min/max dates:`, error)
      setDateRange([{ startDate: new Date(2000, 0, 1), endDate: new Date(), key: "selection" }]);
      // setChartData([]); // Reset chart data on error
    } finally {
      setLoading(false)
    }

  };

  const fetchTopics = async () => {
    setLoading(true)
    try {
      const session = await fetchAuthSession()
      const token = session.tokens.idToken
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}user/topics`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      console.log(data)
      setAllTopics(data)
    } catch (error) {
      console.error(`Error fetching topics:`, error)
      
    } finally {
      setLoading(false)
    }
  };

  useEffect(() => {
    fetchTopics(); // Fetch topics when component mounts
  }, []);

  useEffect(() => {
    if (selectedTopics.length > 0) {
      fetchChartData(); // Fetch the chart data when the date range or selected topics change
    }
  }, [dateRange, selectedTopics]); // Adding dateRange and selectedTopics as dependencies


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
          Topic Trends Analytics
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
        <div className="grid grid-cols-1 md:grid-cols-1 gap-4 md:gap-6">
          {/* Co-occurrence */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 md:p-4 border dark:border-gray-700">
            <div className="flex justify-between items-center mb-3 md:mb-4">
              <h3 className="font-medium dark:text-white text-sm md:text-base">
                Document Count Timeline by Topic
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  Last updated: Jan 10, 2023
                </span>
                <Info className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </div>
            </div>
            {(selectedTopics.length === 0) ?
              (<div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              {/* Placeholder */}
              <p className="text-sm text-gray-600 dark:text-gray-300">Select topics to begin</p>
            </div>) : (
            <ResponsiveContainer width="100%" height={450}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <XAxis dataKey="year" label={{ value: "Year", position: "insideBottom", offset: -5 }} />
                <YAxis label={{ value: "# of Documents", angle: -90, position: "insideLeft" }} />
                <Tooltip />
                <Legend />
                {selectedTopics.map((topic, index) => (
                  <Line
                    key={topic.value}
                    type="monotone"
                    dataKey={topic.value}
                    stroke={colorPalette[index % colorPalette.length]}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={true}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>)}
          </div>

          {/* Trend Over Time */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 md:p-4 border dark:border-gray-700">
            <div className="flex justify-between items-center mb-3 md:mb-4">
              <h3 className="font-medium dark:text-white text-sm md:text-base">
                Total Document Count by Topic
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  Last updated: Jan 10, 2023
                </span>
                <Info className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </div>
            </div>
            {(selectedTopics.length === 0) ?
              (<div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              {/* Placeholder */}
              <p className="text-sm text-gray-600 dark:text-gray-300">Select topics to begin</p>
            </div>) : (
            <ResponsiveContainer width="100%" height={450}>
      <BarChart data={selectedTopics.map(topic => ({ name: topic.label, count: getTotalDocuments(topic.value) }))} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>

        <XAxis dataKey="name" />  {/* Topic name on X-axis */}
        <YAxis />  {/* Document count on Y-axis */}
        <Tooltip />
        <Bar
          dataKey="count"
          barSize={75}
        >
          {/* Use Cell to apply a unique color to each bar */}
          {selectedTopics.map((entry, index) => (
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
