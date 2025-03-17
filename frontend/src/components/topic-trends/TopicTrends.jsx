"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, Info, Menu, X } from "lucide-react"

export default function TopicTrends() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-all duration-300">
      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-6 md:py-8">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-6 md:mb-8 dark:text-white">
          Topics Trend Analytics
        </h2>

        {/* Analytics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Topic Co-occurrence Network */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 md:p-4 border dark:border-gray-700">
            <div className="flex justify-between items-center mb-3 md:mb-4">
              <h3 className="font-medium dark:text-white text-sm md:text-base">
                Topic Co-occurrence Network (2010 - 2023)
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  Last updated: Jan 10, 2023
                </span>
                <Info className="h-3 w-3 md:h-4 md:w-4 text-gray-500 dark:text-gray-400" />
              </div>
            </div>

            {/* Network Visualization */}
            <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              <div className="text-center p-4">
                <div className="w-full h-full">
                  <svg viewBox="0 0 400 400" className="w-full h-full">
                    {/* This is a simplified network visualization */}
                    <g transform="translate(200, 200)">
                      {/* Nodes */}
                      <circle cx="0" cy="0" r="20" fill="#4c78a8" />
                      <circle cx="-80" cy="-60" r="15" fill="#72b7b2" />
                      <circle cx="70" cy="-50" r="12" fill="#f58518" />
                      <circle cx="60" cy="80" r="18" fill="#e45756" />
                      <circle cx="-60" cy="70" r="10" fill="#54a24b" />

                      {/* Edges */}
                      <line x1="0" y1="0" x2="-80" y2="-60" stroke="#d9d9d9" strokeWidth="2" />
                      <line x1="0" y1="0" x2="70" y2="-50" stroke="#d9d9d9" strokeWidth="2" />
                      <line x1="0" y1="0" x2="60" y2="80" stroke="#d9d9d9" strokeWidth="3" />
                      <line x1="0" y1="0" x2="-60" y2="70" stroke="#d9d9d9" strokeWidth="1" />
                      <line x1="-80" y1="-60" x2="70" y2="-50" stroke="#d9d9d9" strokeWidth="1" />
                    </g>
                  </svg>
                </div>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Network of topic co-occurrences in DFO documents
                </p>
              </div>
            </div>
          </div>

          {/* Topic Trend Over Time */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 md:p-4 border dark:border-gray-700">
            <div className="flex justify-between items-center mb-3 md:mb-4">
              <h3 className="font-medium dark:text-white text-sm md:text-base">
                Total Document Count by Topic (2010 - 2023)
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  Last updated: Jan 10, 2023
                </span>
                <Info className="h-3 w-3 md:h-4 md:w-4 text-gray-500 dark:text-gray-400" />
              </div>
            </div>

            {/* Line Chart */}
            <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              <div className="text-center p-4 w-full h-full">
                <svg viewBox="0 0 400 300" className="w-full h-full">
                  {/* X and Y axes */}
                  <line x1="50" y1="250" x2="350" y2="250" stroke="#888" strokeWidth="1" />
                  <line x1="50" y1="50" x2="50" y2="250" stroke="#888" strokeWidth="1" />

                  {/* X-axis labels */}
                  <text x="50" y="270" fontSize="10" textAnchor="middle" fill="#888">
                    2010
                  </text>
                  <text x="125" y="270" fontSize="10" textAnchor="middle" fill="#888">
                    2013
                  </text>
                  <text x="200" y="270" fontSize="10" textAnchor="middle" fill="#888">
                    2016
                  </text>
                  <text x="275" y="270" fontSize="10" textAnchor="middle" fill="#888">
                    2019
                  </text>
                  <text x="350" y="270" fontSize="10" textAnchor="middle" fill="#888">
                    2023
                  </text>

                  {/* Y-axis labels */}
                  <text x="40" y="250" fontSize="10" textAnchor="end" fill="#888">
                    0
                  </text>
                  <text x="40" y="200" fontSize="10" textAnchor="end" fill="#888">
                    25
                  </text>
                  <text x="40" y="150" fontSize="10" textAnchor="end" fill="#888">
                    50
                  </text>
                  <text x="40" y="100" fontSize="10" textAnchor="end" fill="#888">
                    75
                  </text>
                  <text x="40" y="50" fontSize="10" textAnchor="end" fill="#888">
                    100
                  </text>

                  {/* Line 1 - Salmon */}
                  <path d="M50,200 L125,180 L200,150 L275,100 L350,70" fill="none" stroke="#4c78a8" strokeWidth="2" />

                  {/* Line 2 - Conservation */}
                  <path d="M50,220 L125,200 L200,170 L275,130 L350,90" fill="none" stroke="#72b7b2" strokeWidth="2" />

                  {/* Line 3 - Climate Change */}
                  <path d="M50,230 L125,210 L200,190 L275,150 L350,110" fill="none" stroke="#e45756" strokeWidth="2" />

                  {/* Data points */}
                  <circle cx="50" cy="200" r="3" fill="#4c78a8" />
                  <circle cx="125" cy="180" r="3" fill="#4c78a8" />
                  <circle cx="200" cy="150" r="3" fill="#4c78a8" />
                  <circle cx="275" cy="100" r="3" fill="#4c78a8" />
                  <circle cx="350" cy="70" r="3" fill="#4c78a8" />

                  <circle cx="50" cy="220" r="3" fill="#72b7b2" />
                  <circle cx="125" cy="200" r="3" fill="#72b7b2" />
                  <circle cx="200" cy="170" r="3" fill="#72b7b2" />
                  <circle cx="275" cy="130" r="3" fill="#72b7b2" />
                  <circle cx="350" cy="90" r="3" fill="#72b7b2" />

                  <circle cx="50" cy="230" r="3" fill="#e45756" />
                  <circle cx="125" cy="210" r="3" fill="#e45756" />
                  <circle cx="200" cy="190" r="3" fill="#e45756" />
                  <circle cx="275" cy="150" r="3" fill="#e45756" />
                  <circle cx="350" cy="110" r="3" fill="#e45756" />
                </svg>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Document count trends for top topics over time
                </p>
              </div>
            </div>
          </div>

          {/* Topic Distribution */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 md:p-4 border dark:border-gray-700">
            <div className="flex justify-between items-center mb-3 md:mb-4">
              <h3 className="font-medium dark:text-white text-sm md:text-base">Topic Distribution by Category</h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  Last updated: Jan 10, 2023
                </span>
                <Info className="h-3 w-3 md:h-4 md:w-4 text-gray-500 dark:text-gray-400" />
              </div>
            </div>

            {/* Bar Chart */}
            <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              <div className="text-center p-4 w-full h-full">
                <svg viewBox="0 0 400 300" className="w-full h-full">
                  {/* X and Y axes */}
                  <line x1="100" y1="250" x2="350" y2="250" stroke="#888" strokeWidth="1" />
                  <line x1="100" y1="50" x2="100" y2="250" stroke="#888" strokeWidth="1" />

                  {/* Y-axis labels */}
                  <text x="90" y="250" fontSize="10" textAnchor="end" fill="#888">
                    0
                  </text>
                  <text x="90" y="210" fontSize="10" textAnchor="end" fill="#888">
                    20
                  </text>
                  <text x="90" y="170" fontSize="10" textAnchor="end" fill="#888">
                    40
                  </text>
                  <text x="90" y="130" fontSize="10" textAnchor="end" fill="#888">
                    60
                  </text>
                  <text x="90" y="90" fontSize="10" textAnchor="end" fill="#888">
                    80
                  </text>
                  <text x="90" y="50" fontSize="10" textAnchor="end" fill="#888">
                    100
                  </text>

                  {/* Bars */}
                  <rect x="120" y="100" width="30" height="150" fill="#4c78a8" />
                  <rect x="170" y="130" width="30" height="120" fill="#72b7b2" />
                  <rect x="220" y="170" width="30" height="80" fill="#f58518" />
                  <rect x="270" y="190" width="30" height="60" fill="#e45756" />
                  <rect x="320" y="210" width="30" height="40" fill="#54a24b" />

                  {/* X-axis labels */}
                  <text x="135" y="270" fontSize="9" textAnchor="middle" fill="#888">
                    Salmon
                  </text>
                  <text x="185" y="270" fontSize="9" textAnchor="middle" fill="#888">
                    Conservation
                  </text>
                  <text x="235" y="270" fontSize="9" textAnchor="middle" fill="#888">
                    Climate
                  </text>
                  <text x="285" y="270" fontSize="9" textAnchor="middle" fill="#888">
                    Aquaculture
                  </text>
                  <text x="335" y="270" fontSize="9" textAnchor="middle" fill="#888">
                    Fisheries
                  </text>
                </svg>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Distribution of documents across major topic categories
                </p>
              </div>
            </div>
          </div>

          {/* Topic Proportion */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 md:p-4 border dark:border-gray-700">
            <div className="flex justify-between items-center mb-3 md:mb-4">
              <h3 className="font-medium dark:text-white text-sm md:text-base">Proportion of Documents by Topic</h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  Last updated: Jan 10, 2023
                </span>
                <Info className="h-3 w-3 md:h-4 md:w-4 text-gray-500 dark:text-gray-400" />
              </div>
            </div>

            {/* Pie Chart */}
            <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              <div className="text-center p-4">
                <svg viewBox="0 0 300 300" className="w-full h-full">
                  <g transform="translate(150, 150)">
                    {/* Pie segments */}
                    <path d="M0,0 L0,-100 A100,100 0 0,1 86.6,-50 z" fill="#4c78a8" />
                    <path d="M0,0 L86.6,-50 A100,100 0 0,1 86.6,50 z" fill="#72b7b2" />
                    <path d="M0,0 L86.6,50 A100,100 0 0,1 0,100 z" fill="#f58518" />
                    <path d="M0,0 L0,100 A100,100 0 0,1 -86.6,50 z" fill="#e45756" />
                    <path d="M0,0 L-86.6,50 A100,100 0 0,1 -86.6,-50 z" fill="#54a24b" />
                    <path d="M0,0 L-86.6,-50 A100,100 0 0,1 0,-100 z" fill="#eeca3b" />
                  </g>

                  {/* Legend */}
                  <g transform="translate(10, 250)">
                    <rect x="0" y="0" width="12" height="12" fill="#4c78a8" />
                    <text x="20" y="10" fontSize="10" fill="#888">
                      Salmon (30%)
                    </text>

                    <rect x="100" y="0" width="12" height="12" fill="#72b7b2" />
                    <text x="120" y="10" fontSize="10" fill="#888">
                      Conservation (20%)
                    </text>

                    <rect x="0" y="20" width="12" height="12" fill="#f58518" />
                    <text x="20" y="30" fontSize="10" fill="#888">
                      Climate (15%)
                    </text>

                    <rect x="100" y="20" width="12" height="12" fill="#e45756" />
                    <text x="120" y="30" fontSize="10" fill="#888">
                      Aquaculture (15%)
                    </text>

                    <rect x="0" y="40" width="12" height="12" fill="#54a24b" />
                    <text x="20" y="50" fontSize="10" fill="#888">
                      Fisheries (10%)
                    </text>

                    <rect x="100" y="40" width="12" height="12" fill="#eeca3b" />
                    <text x="120" y="50" fontSize="10" fill="#888">
                      Other (10%)
                    </text>
                  </g>
                </svg>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Relative proportion of documents by primary topic
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Controls */}
        <div className="mt-6 md:mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 md:p-4 border dark:border-gray-700">
          <h3 className="font-medium dark:text-white mb-3 md:mb-4 text-sm md:text-base">Analytics Controls</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Date Range
              </label>
              <div className="flex items-center space-x-2">
                <select className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm">
                  <option>2010 - 2023</option>
                  <option>2015 - 2023</option>
                  <option>2020 - 2023</option>
                  <option>Custom Range</option>
                </select>
                <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400 -ml-6 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Topic Filter
              </label>
              <div className="flex items-center space-x-2">
                <select className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm">
                  <option>All Topics</option>
                  <option>Salmon</option>
                  <option>Conservation</option>
                  <option>Climate Change</option>
                  <option>Aquaculture</option>
                </select>
                <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400 -ml-6 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Visualization Type
              </label>
              <div className="flex items-center space-x-2">
                <select className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm">
                  <option>All Visualizations</option>
                  <option>Network Graph</option>
                  <option>Trend Lines</option>
                  <option>Bar Chart</option>
                  <option>Pie Chart</option>
                </select>
                <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400 -ml-6 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-3 md:px-4 py-1.5 md:py-2 rounded-md text-xs md:text-sm">
              Apply Filters
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

