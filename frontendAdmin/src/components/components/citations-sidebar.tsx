"use client"

import { X, Minus, Plus } from "lucide-react"
import { useState, useEffect } from "react"

interface Citation {
  score: number
  url: string
}

interface Section {
  title: string
  isExpanded: boolean
  citations: Citation[]
}

interface CitationsSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function CitationsSidebar({ isOpen, onClose }: CitationsSidebarProps) {
  const [sections, setSections] = useState<Section[]>([
    {
      title: "Query 1: TOR",
      isExpanded: true,
      citations: [
        {
          score: 0.85,
          url: "https://waves-vagues.dfo-mpo.gc.ca/term-of-references-1.pdf",
        },
        {
          score: 0.25,
          url: "https://waves-vagues.dfo-mpo.gc.ca/term-of-references-2.pdf",
        },
      ],
    },
    {
      title: "Query 2: Other Documents",
      isExpanded: true,
      citations: [
        {
          score: 0.45,
          url: "https://waves-vagues.dfo-mpo.gc.ca/salmon-farming-impact.pdf",
        },
      ],
    },
    {
      title: "Query 3: Web search",
      isExpanded: false,
      citations: [],
    },
  ])

  const toggleSection = (index: number) => {
    setSections((prev) =>
      prev.map((section, i) => (i === index ? { ...section, isExpanded: !section.isExpanded } : section)),
    )
  }

  // Close sidebar on small screens when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isOpen && window.innerWidth < 768) {
        // Check if click is outside the sidebar
        const sidebar = document.getElementById("citations-sidebar")
        if (sidebar && !sidebar.contains(e.target as Node)) {
          onClose()
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black bg-opacity-50 md:bg-opacity-0"
      onClick={(e) => {
        // Only close if clicking the overlay (not the sidebar itself)
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        id="citations-sidebar"
        className="fixed inset-y-0 left-0 w-[85%] sm:w-80 bg-gray-100 dark:bg-gray-800 shadow-lg z-50 overflow-auto transition-transform duration-300"
        style={{ transform: isOpen ? "translateX(0)" : "translateX(-100%)" }}
      >
        <div className="p-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold dark:text-white">Citations</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full dark:text-gray-300"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="space-y-4">
            {sections.map((section, index) => (
              <div key={section.title} className="bg-white dark:bg-gray-700 rounded-lg p-4">
                <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleSection(index)}>
                  <h3 className="font-medium dark:text-white">{section.title}</h3>
                  <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full dark:text-gray-300">
                    {section.isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </button>
                </div>

                {section.isExpanded && section.citations.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {section.citations.map((citation, citationIndex) => (
                      <div key={citationIndex} className="flex items-baseline">
                        <span className="text-sm mr-2 dark:text-gray-300">{citation.score}:</span>
                        <a
                          href={citation.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline text-sm break-all"
                        >
                          {citation.url}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

