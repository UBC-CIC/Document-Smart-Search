"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronLeft, Plus, Minus, User } from "lucide-react"

export default function DocumentDetail({ documentId }) {
  // State for expandable sections
  const [expandedSections, setExpandedSections] = useState({
    summary: false,
    keyWords: false,
    relatedMandates: false,
    researchTopics: false,
    primaryTopics: false,
    secondaryTopics: true,
  })

  // Toggle section expansion
  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  // Sample document data (would be fetched based on documentId in a real app)
  const documentData = {
    id: "6472",
    title: "2021 - East Cost Salmon Stock Census",
    lastUpdated: "Jan 31, 2023",
    verified: true,
    type: "Research Article",
    year: "2021",
    keywordsCount: 123,
    relatedMandatesCount: 4,
    relatedTopicsCount: 14,
    primaryTopics: ["Salmon Population Assessment", "Marine Ecosystem Health"],
    secondaryTopics: [
      {
        title: "Sustainable Seafood Production",
        description: "This work discusses... which relates to...",
      },
      {
        title: "Fishing Gear Design and Bycatch Reduction",
        description: "",
      },
    ],
    author: "Dr. Sarah Johnson", // Added author field
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-all duration-300">
      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-4">
        <div className="mb-4">
          <Link
            href="/document-search"
            className="flex items-center text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            <ChevronLeft className="h-3 w-3 mr-1" />
            Back to Search Results
          </Link>
        </div>

        <h2 className="text-xl font-bold mb-4 dark:text-white">Document View</h2>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Left Sidebar - Metadata */}
          <div className="w-full md:w-64">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
              <a
                href="https://publications.gc.ca/site/archivee-archived.html?url=https://publications.gc.ca/collections/collection_2023/mpo-dfo/fs70-7/Fs70-7-2023-036-eng.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center py-2 bg-gray-200 dark:bg-gray-700 font-medium dark:text-white text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                View Document
              </a>

              <div className="p-3 text-center bg-gray-200 dark:bg-gray-700 m-2 rounded">
                <div className="text-sm dark:text-gray-300">Research Article</div>
              </div>

              {/* Author Information - Added this section */}
              <div className="p-2">
                <div className="bg-gray-200 dark:bg-gray-700 p-3 rounded">
                  <div className="flex items-center justify-center mb-1">
                    <User className="h-4 w-4 mr-1 text-gray-600 dark:text-gray-400" />
                    <div className="text-xs font-medium dark:text-gray-300">Author:</div>
                  </div>
                  <div className="text-sm text-center dark:text-gray-300">{documentData.author}</div>
                  <div className="text-xs text-center text-gray-500 dark:text-gray-400 mt-1">
                    {documentData.authorDepartment}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 p-2">
                <div className="bg-gray-200 dark:bg-gray-700 p-2 rounded text-center">
                  <div className="text-xs font-medium dark:text-gray-300">Year:</div>
                  <div className="text-sm dark:text-gray-300">{documentData.year}</div>
                </div>

                <div className="bg-gray-200 dark:bg-gray-700 p-2 rounded text-center">
                  <div className="text-xs font-medium dark:text-gray-300">Number of Keywords:</div>
                  <div className="text-sm dark:text-gray-300">{documentData.keywordsCount}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 p-2">
                <div className="bg-gray-200 dark:bg-gray-700 p-2 rounded text-center">
                  <div className="text-xs font-medium dark:text-gray-300">Related Mandates:</div>
                  <div className="text-sm dark:text-gray-300">{documentData.relatedMandatesCount}</div>
                </div>

                <div className="bg-gray-200 dark:bg-gray-700 p-2 rounded text-center">
                  <div className="text-xs font-medium dark:text-gray-300">Related Topics:</div>
                  <div className="text-sm dark:text-gray-300">{documentData.relatedTopicsCount}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-sm">
              <div className="p-4 border-b dark:border-gray-700">
                <h2 className="text-lg font-medium dark:text-white">{documentData.title}</h2>
                <div className="flex justify-between mt-2 text-xs">
                  <div className="text-gray-600 dark:text-gray-400">Last Updated: {documentData.lastUpdated}</div>
                  <div className="text-gray-600 dark:text-gray-400">
                    Manually Verified: {documentData.verified ? "Yes" : "No"}
                  </div>
                </div>
              </div>

              {/* Expandable Sections */}
              <div>
                {/* Summary */}
                <div className="border-b dark:border-gray-700">
                  <button
                    className="w-full p-4 flex justify-between items-center bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                    onClick={() => toggleSection("summary")}
                  >
                    <span className="font-medium dark:text-white">Summary</span>
                    {expandedSections.summary ? (
                      <Minus className="h-5 w-5 dark:text-white" />
                    ) : (
                      <Plus className="h-5 w-5 dark:text-white" />
                    )}
                  </button>
                  {expandedSections.summary && (
                    <div className="p-4 bg-white dark:bg-gray-800 dark:text-gray-300">
                      <p>
                        This census provides a comprehensive overview of salmon stocks along the East Coast, documenting
                        population trends, spawning patterns, and migration routes. The data collected informs
                        conservation efforts and sustainable fishing practices.
                      </p>
                    </div>
                  )}
                </div>

                {/* Key Words */}
                <div className="border-b dark:border-gray-700">
                  <button
                    className="w-full p-4 flex justify-between items-center bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                    onClick={() => toggleSection("keyWords")}
                  >
                    <span className="font-medium dark:text-white">Key Word(s)</span>
                    {expandedSections.keyWords ? (
                      <Minus className="h-5 w-5 dark:text-white" />
                    ) : (
                      <Plus className="h-5 w-5 dark:text-white" />
                    )}
                  </button>
                  {expandedSections.keyWords && (
                    <div className="p-4 bg-white dark:bg-gray-800 dark:text-gray-300">
                      <div className="flex flex-wrap gap-2">
                        <span className="bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded-md text-sm">Salmon</span>
                        <span className="bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded-md text-sm">Census</span>
                        <span className="bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded-md text-sm">East Coast</span>
                        <span className="bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded-md text-sm">Population</span>
                        <span className="bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded-md text-sm">Migration</span>
                        <span className="bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded-md text-sm">Spawning</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Related Mandates */}
                <div className="border-b dark:border-gray-700">
                  <button
                    className="w-full p-4 flex justify-between items-center bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                    onClick={() => toggleSection("relatedMandates")}
                  >
                    <span className="font-medium dark:text-white">Related Mandate(s)</span>
                    {expandedSections.relatedMandates ? (
                      <Minus className="h-5 w-5 dark:text-white" />
                    ) : (
                      <Plus className="h-5 w-5 dark:text-white" />
                    )}
                  </button>
                  {expandedSections.relatedMandates && (
                    <div className="p-4 bg-white dark:bg-gray-800 dark:text-gray-300">
                      <ul className="list-disc pl-5">
                        <li>Sustainable Fisheries Framework</li>
                        <li>Species at Risk Act Implementation</li>
                        <li>Aquatic Ecosystem Management</li>
                        <li>Indigenous Fisheries Strategy</li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* Research Topics */}
                <div className="border-b dark:border-gray-700">
                  <button
                    className="w-full p-4 flex justify-between items-center bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                    onClick={() => toggleSection("researchTopics")}
                  >
                    <span className="font-medium dark:text-white">Research Topic(s)</span>
                    {expandedSections.researchTopics ? (
                      <Minus className="h-5 w-5 dark:text-white" />
                    ) : (
                      <Plus className="h-5 w-5 dark:text-white" />
                    )}
                  </button>
                  {expandedSections.researchTopics && (
                    <div className="bg-white dark:bg-gray-800">
                      {/* Primary Topics */}
                      <div className="border-b dark:border-gray-700">
                        <button
                          className="w-full p-4 flex justify-between items-center bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 pl-8"
                          onClick={() => toggleSection("primaryTopics")}
                        >
                          <span className="font-medium dark:text-white">Primary Topic(s)</span>
                          {expandedSections.primaryTopics ? (
                            <Minus className="h-5 w-5 dark:text-white" />
                          ) : (
                            <Plus className="h-5 w-5 dark:text-white" />
                          )}
                        </button>
                        {expandedSections.primaryTopics && (
                          <div className="p-4 pl-8 bg-white dark:bg-gray-800 dark:text-gray-300">
                            <ul className="list-disc pl-5">
                              <li>Salmon Population Assessment</li>
                              <li>Marine Ecosystem Health</li>
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Secondary Topics */}
                      <div>
                        <button
                          className="w-full p-4 flex justify-between items-center bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 pl-8"
                          onClick={() => toggleSection("secondaryTopics")}
                        >
                          <span className="font-medium dark:text-white">Secondary Topic(s)</span>
                          {expandedSections.secondaryTopics ? (
                            <Minus className="h-5 w-5 dark:text-white" />
                          ) : (
                            <Plus className="h-5 w-5 dark:text-white" />
                          )}
                        </button>
                        {expandedSections.secondaryTopics && (
                          <div className="p-4 pl-8">
                            <ul className="space-y-4 text-sm dark:text-gray-300">
                              {documentData.secondaryTopics.map((topic, index) => (
                                <li key={index} className="flex items-start">
                                  <span className="mr-2">•</span>
                                  <div>
                                    <div className="font-medium">{topic.title}</div>
                                    {topic.description && <div className="text-sm">{topic.description}</div>}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
