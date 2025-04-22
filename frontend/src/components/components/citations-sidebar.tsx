import { X, ChevronDown, ChevronUp } from "lucide-react"
import React from "react"
import { useState, useEffect } from "react"

interface Source {
  title?: string
  name?: string
  url?: string
  text?: string
  relevancy_score?: number
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
  cachedTools: ToolsUsed
  messageId?: string
}

export function CitationsSidebar({ isOpen, onClose, toolsUsed, cachedTools, messageId }: CitationsSidebarProps) {
  const [currentTab, setCurrentTab] = useState<"sources" | "tools">("tools")
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({})
  const [showingCached, setShowingCached] = useState(false)
  
  // Use proper data source based on availability
  const effectiveToolsUsed = toolsUsed && toolsUsed.tools_and_sources && toolsUsed.tools_and_sources.length > 0 
    ? toolsUsed 
    : cachedTools;
  
  // Set cached flag if we're showing cached data
  useEffect(() => {
    if (toolsUsed && toolsUsed.tools_and_sources && toolsUsed.tools_and_sources.length > 0) {
      setShowingCached(false);
    } else if (cachedTools && cachedTools.tools_and_sources && cachedTools.tools_and_sources.length > 0) {
      setShowingCached(true);
    }
  }, [toolsUsed, cachedTools]);

  // Get all tools
  const getTools = (): Tool[] => {
    if (!effectiveToolsUsed || !effectiveToolsUsed.tools_and_sources) {
      return [];
    }
    
    return effectiveToolsUsed.tools_and_sources.sort((a, b) => a.order - b.order);
  }
  
  const tools = getTools();
  
  // Extract all sources from all tools and sort by relevancy
  const getAllSources = (): Source[] => {
    if (!effectiveToolsUsed || !effectiveToolsUsed.tools_and_sources) {
      return [];
    }
    
    // Collect all sources
    const allSources: Source[] = [];
    effectiveToolsUsed.tools_and_sources.forEach(tool => {
      if (tool.sources && tool.sources.length > 0) {
        tool.sources.forEach(source => {
          if (source) {
            // Make sure we have a name field
            if (source.title && !source.name) {
              source.name = source.title;
            } else if (!source.name) {
              source.name = "Source";
            }
            
            allSources.push(source);
          }
        });
      }
    });
    
    // Sort by relevancy score (highest first)
    return allSources.sort((a, b) => {
      const scoreA = a.relevancy_score || 0;
      const scoreB = b.relevancy_score || 0;
      return scoreB - scoreA;
    });
  }

  const sources = getAllSources();
  
  // Whether any tools have sources
  const hasAnySources = (): boolean => {
    if (!effectiveToolsUsed || !effectiveToolsUsed.tools_and_sources) {
      return false;
    }
    
    return effectiveToolsUsed.tools_and_sources.some(tool => 
      tool.sources && tool.sources.length > 0
    );
  }

  // Toggle a specific tool's expanded state
  const toggleTool = (toolName: string) => {
    setExpandedTools(prev => ({
      ...prev,
      [toolName]: !prev[toolName]
    }));
  }

  // Initialize expanded state for each tool
  useEffect(() => {
    if (tools.length > 0) {
      const initialExpandedState: Record<string, boolean> = {};
      tools.forEach(tool => {
        // Only initialize tools that have sources
        if (tool.sources && tool.sources.length > 0) {
          initialExpandedState[tool.tool_name] = false;
        }
      });
      setExpandedTools(initialExpandedState);
    }
  }, [tools]);

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
      className="fixed inset-0 z-50 flex"
      onClick={(e) => {
        // Only close if clicking the overlay (not the sidebar itself)
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        id="citations-sidebar"
        className="bg-gray-100 dark:bg-gray-800 shadow-lg z-50 w-80 md:w-96 
                  overflow-auto transition-transform duration-300 h-full"
      >
        <div className="p-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-bold dark:text-white">References</h2>
              {showingCached && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Showing cached sources from previous response
                </p>
              )}
            </div>
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
              onClick={() => setCurrentTab("tools")}
              className={`px-4 py-2 ${
                currentTab === "tools"
                  ? "border-b-2 border-blue-500 font-medium"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              Tools Used ({tools.length})
            </button>
            {hasAnySources() && (
              <button
                onClick={() => setCurrentTab("sources")}
                className={`px-4 py-2 ${
                  currentTab === "sources"
                    ? "border-b-2 border-blue-500 font-medium"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                All Sources ({sources.length})
              </button>
            )}
          </div>

          {currentTab === "sources" && hasAnySources() && (
            <div className="space-y-4">
              {sources.length > 0 ? (
                sources.map((source, index) => (
                  <div key={index} className="bg-white dark:bg-gray-700 rounded-lg p-3">
                    <h3 className="font-medium text-sm dark:text-white">
                      {source.name || source.title || "Source"}
                    </h3>
                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline text-xs mt-1 block"
                      >
                        {source.url}
                      </a>
                    )}
                    {source.relevancy_score !== undefined && (
                      <div className="mt-1 flex items-center">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Relevancy: 
                        </span>
                        <div className="ml-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2 w-24">
                          <div 
                            className="bg-blue-500 h-2 rounded-full" 
                            style={{ width: `${Math.min(source.relevancy_score * 100, 100)}%` }}
                          ></div>
                        </div>
                        <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                          {(source.relevancy_score).toFixed(2)}
                        </span>
                      </div>
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
                  <div key={index} className="bg-white dark:bg-gray-700 rounded-lg overflow-hidden">
                    <div 
                      className={`p-3 ${tool.sources && tool.sources.length > 0 ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600' : ''}`}
                      onClick={() => tool.sources && tool.sources.length > 0 ? toggleTool(tool.tool_name) : null}
                    >
                      <div className="flex justify-between items-center">
                        <h3 className="font-medium dark:text-white">
                          {tool.tool_name}
                        </h3>
                        {tool.sources && tool.sources.length > 0 && (
                          <button className="text-gray-500 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-500">
                            {expandedTools[tool.tool_name] ? 
                              <ChevronUp className="h-4 w-4" /> : 
                              <ChevronDown className="h-4 w-4" />
                            }
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Step {tool.order}
                      </p>
                      {tool.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                          {tool.description}
                        </p>
                      )}
                      {tool.sources && tool.sources.length > 0 && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          {tool.sources.length} source{tool.sources.length > 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                    
                    {/* Expandable sources section */}
                    {tool.sources && tool.sources.length > 0 && expandedTools[tool.tool_name] && (
                      <div className="border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-750 p-2">
                        <div className="space-y-3">
                          {tool.sources
                            .sort((a, b) => {
                              const scoreA = a.relevancy_score || 0;
                              const scoreB = b.relevancy_score || 0;
                              return scoreB - scoreA;
                            })
                            .map((source, sourceIndex) => (
                              <div key={sourceIndex} className="bg-white dark:bg-gray-700 rounded p-2 text-sm">
                                <h4 className="font-medium text-sm dark:text-white">
                                  {source.name || source.title || "Source"}
                                </h4>
                                
                                {source.url && (
                                  <a
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 dark:text-blue-400 hover:underline text-xs block truncate"
                                  >
                                    {source.url}
                                  </a>
                                )}
                                
                                {source.relevancy_score !== undefined && (
                                  <div className="mt-1 flex items-center">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      Relevancy: 
                                    </span>
                                    <div className="ml-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2 w-16">
                                      <div 
                                        className="bg-blue-500 h-2 rounded-full" 
                                        style={{ width: `${Math.min(source.relevancy_score * 100, 100)}%` }}
                                      ></div>
                                    </div>
                                    <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                                      {(source.relevancy_score).toFixed(2)}
                                    </span>
                                  </div>
                                )}
                                
                                {source.text && (
                                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                                    {source.text}
                                  </p>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No tools were used.</p>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Main content push overlay - only on larger screens */}
      <div className="hidden md:block flex-grow"></div>
    </div>
  )
}

