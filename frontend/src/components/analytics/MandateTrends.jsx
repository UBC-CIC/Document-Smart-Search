"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { DateRange } from "react-date-range";
import AsyncSelect from "react-select/async";
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { ResponsiveContainer } from "recharts";
import { useRef } from "react";
import { useClickAway } from "react-use";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, Bar, BarChart, Cell } from 'recharts';

export default function MandateTrends() {
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef(null);
  const [editingField, setEditingField] = useState(null); // 'start' or 'end'
const chartData = [
  { year: 2010, "Sustainable Fisheries": 26, "Aquatic Ecosystem": 45, "Species at Risk": 12, "Indigenous Fisheries": 8 },
  { year: 2011, "Sustainable Fisheries": 34, "Aquatic Ecosystem": 37, "Species at Risk": 14, "Indigenous Fisheries": 10 },
  { year: 2012, "Sustainable Fisheries": 49, "Aquatic Ecosystem": 31, "Species at Risk": 18, "Indigenous Fisheries": 12 },
  { year: 2013, "Sustainable Fisheries": 48, "Aquatic Ecosystem": 9,  "Species at Risk": 20, "Indigenous Fisheries": 13 },
  { year: 2014, "Sustainable Fisheries": 46, "Aquatic Ecosystem": 19, "Species at Risk": 17, "Indigenous Fisheries": 9 },
  { year: 2015, "Sustainable Fisheries": 5,  "Aquatic Ecosystem": 25, "Species at Risk": 22, "Indigenous Fisheries": 14 },
  { year: 2016, "Sustainable Fisheries": 9,  "Aquatic Ecosystem": 23, "Species at Risk": 26, "Indigenous Fisheries": 15 },
  { year: 2017, "Sustainable Fisheries": 9,  "Aquatic Ecosystem": 16, "Species at Risk": 19, "Indigenous Fisheries": 11 },
  { year: 2018, "Sustainable Fisheries": 41, "Aquatic Ecosystem": 33, "Species at Risk": 13, "Indigenous Fisheries": 17 },
  { year: 2019, "Sustainable Fisheries": 10, "Aquatic Ecosystem": 15, "Species at Risk": 15, "Indigenous Fisheries": 18 },
  { year: 2020, "Sustainable Fisheries": 29, "Aquatic Ecosystem": 7,  "Species at Risk": 18, "Indigenous Fisheries": 22 },
  { year: 2021, "Sustainable Fisheries": 47, "Aquatic Ecosystem": 28, "Species at Risk": 21, "Indigenous Fisheries": 25 },
  { year: 2022, "Sustainable Fisheries": 25, "Aquatic Ecosystem": 15, "Species at Risk": 14, "Indigenous Fisheries": 20 },
  { year: 2023, "Sustainable Fisheries": 20, "Aquatic Ecosystem": 11, "Species at Risk": 12, "Indigenous Fisheries": 16 },
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
  
  const [allMandates, setAllMandates] = useState([
    { label: "Sustainable Fisheries", value: "Sustainable Fisheries" },
    { label: "Species at Risk", value: "Species at Risk" },
    { label: "Aquatic Ecosystem", value: "Aquatic Ecosystem" },
    { label: "Indigenous Fisheries", value: "Indigenous Fisheries" },
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
  const [selectedMandates, setSelectedMandates] = useState([]);

  const getTotalDocuments = (mandate) => {
    return chartData.reduce((total, data) => total + (data[mandate] || 0), 0);
  };


  const handleMandateSearch = async (inputValue) => {
  const allMandates = [
    { label: "Sustainable Fisheries", value: "Sustainable Fisheries" },
    { label: "Species at Risk", value: "Species at Risk" },
    { label: "Aquatic Ecosystem", value: "Aquatic Ecosystem" },
    { label: "Indigenous Fisheries", value: "Indigenous Fisheries" },
  ];
  
    if (!inputValue) return allMandates; // return all on empty search
  
    return allMandates.filter((mandate) =>
      mandate.label.toLowerCase().includes(inputValue.toLowerCase())
    );
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-all duration-300">
      <main className="max-w-5xl mx-auto px-4 py-6 md:py-8">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-6 md:mb-8 dark:text-white">
          Mandate Trends Analytics
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
                Mandate Filter
              </label>
              <AsyncSelect
                cacheOptions
                defaultOptions={allMandates}
                loadOptions={handleMandateSearch}
                isMulti
                placeholder="Search mandates..."
                onChange={(selected) => setSelectedMandates(selected)}
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
                Document Count Timeline by Mandate
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  Last updated: Jan 10, 2023
                </span>
                <Info className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </div>
            </div>
            {(selectedMandates.length === 0) ?
              (<div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              {/* Placeholder */}
              <p className="text-sm text-gray-600 dark:text-gray-300">Select mandates to begin</p>
            </div>) : (
            <ResponsiveContainer width="100%" height={450}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <XAxis dataKey="year" label={{ value: "Year", position: "insideBottom", offset: -5 }} />
                <YAxis label={{ value: "# of Documents", angle: -90, position: "insideLeft" }} />
                <Tooltip />
                <Legend />
                {selectedMandates.map((mandate, index) => (
                  <Line
                    key={mandate.value}
                    type="monotone"
                    dataKey={mandate.value}
                    stroke={colorPalette[index % colorPalette.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>)}
          </div>

          {/* Trend Over Time */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 md:p-4 border dark:border-gray-700">
            <div className="flex justify-between items-center mb-3 md:mb-4">
              <h3 className="font-medium dark:text-white text-sm md:text-base">
                Total Document Count by Mandate
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  Last updated: Jan 10, 2023
                </span>
                <Info className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </div>
            </div>
            {(selectedMandates.length === 0) ?
              (<div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              {/* Placeholder */}
              <p className="text-sm text-gray-600 dark:text-gray-300">Select mandates to begin</p>
            </div>) : (
            <ResponsiveContainer width="100%" height={450}>
      <BarChart data={selectedMandates.map(mandate => ({ name: mandate.label, count: getTotalDocuments(mandate.value) }))} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>

        <XAxis dataKey="name" />  {/* Mandate name on X-axis */}
        <YAxis />  {/* Document count on Y-axis */}
        <Tooltip />
        <Bar
          dataKey="count"
          barSize={75}
        >
          {/* Use Cell to apply a unique color to each bar */}
          {selectedMandates.map((entry, index) => (
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
