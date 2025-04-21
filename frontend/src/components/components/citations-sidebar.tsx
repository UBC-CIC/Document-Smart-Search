import { X } from "lucide-react"
import React from "react"
import { useState, useEffect } from "react"

interface Source {
  title?: string
  url?: string
  text?: string
}

interface Tool {
  order: number
  tool_name: string
  description?: string
  sources?: Source[]
}

interface ToolsUsed {
  tools_and_sources?: Tool[]
}

interface CitationsSidebarProps {
  isOpen: boolean
  onClose: () => void
  toolsUsed?: ToolsUsed
}

export function CitationsSidebar({ isOpen, onClose, toolsUsed }: CitationsSidebarProps) {
  const [currentTab, setCurrentTab] = useState<"sources" | "tools">("sources")

  // Extract sources from tools_used data
  const getSources = (): Source[] => {
    if (!toolsUsed || !toolsUsed.tools_and_sources) {
      return [];
    }
    
    // Filter tools that have sources property and combine all sources
    const allSources: Source[] = [];
    toolsUsed.tools_and_sources.forEach(tool => {
      if (tool.sources && tool.sources.length > 0) {
        tool.sources.forEach(source => {
          if (source) {
            allSources.push(source);
          }
        });
      }
    });
    
    return allSources;
  }

  const sources = getSources();
  
  // Get unique tool names for the tools tab
  const getToolNames = (): Tool[] => {
    if (!toolsUsed || !toolsUsed.tools_and_sources) {
      return [];
    }
    
    return toolsUsed.tools_and_sources.map(tool => ({
      tool_name: tool.tool_name,
      description: tool.description || "",
      order: tool.order,
      sources: tool.sources
    }));
  }
  
  const tools = getToolNames();

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
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold dark:text-white">References</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full dark:text-gray-300"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          
          {/* Tabs */}
          <div className="flex mb-4 border-b">
            <button
              onClick={() => setCurrentTab("sources")}
              className={`px-4 py-2 ${
                currentTab === "sources"
                  ? "border-b-2 border-blue-500 font-medium"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              Sources ({sources.length})
            </button>
            <button
              onClick={() => setCurrentTab("tools")}
              className={`px-4 py-2 ${
                currentTab === "tools"
                  ? "border-b-2 border-blue-500 font-medium"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              Tools Used ({tools.length})
            </button>
          </div>

          {currentTab === "sources" && (
            <div className="space-y-4">
              {sources.length > 0 ? (
                sources.map((source, index) => (
                  <div key={index} className="bg-white dark:bg-gray-700 rounded-lg p-3">
                    <h3 className="font-medium text-sm dark:text-white">
                      {source.title || "Source"}
                    </h3>
                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline text-xs mt-1 block truncate"
                      >
                        {source.url}
                      </a>
                    )}
                    {source.text && (
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-3">
                        {source.text}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No sources available.</p>
              )}
            </div>
          )}

          {currentTab === "tools" && (
            <div className="space-y-4">
              {tools.length > 0 ? (
                tools.map((tool, index) => (
                  <div key={index} className="bg-white dark:bg-gray-700 rounded-lg p-3">
                    <h3 className="font-medium dark:text-white">
                      {tool.tool_name || "Unknown Tool"}
                    </h3>
                    {tool.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                        {tool.description}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Used in step {tool.order}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No tools were used.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

