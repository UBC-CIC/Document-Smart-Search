import { X, ChevronDown, ChevronUp, ExternalLink, Info, FileText } from "lucide-react"
import Link from "next/link"
import React from "react"
import { useState, useEffect } from "react"

// Relevancy explanation tooltip
const relevancyExplanation = "Relevancy represents a hybrid score combining semantic similarity (70%) and keyword matching (30%) based on a given query. Since semantic scoring is relative to all documents in the database, a high percentage doesn't always guarantee relevance to your specific question."

interface Source {
  title?: string
  name?: string
  url?: string
  text?: string
  relevancy_score?: number
  document_id?: string // Added document_id field
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
  currentMessageId?: string | null
}

export function CitationsSidebar({ isOpen, onClose, toolsUsed, currentMessageId }: CitationsSidebarProps) {
  const [currentTab, setCurrentTab] = useState<"sources" | "tools">("tools")
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({})
  const [messageToolsMap, setMessageToolsMap] = useState<Record<string, ToolsUsed>>({})
  const [showTooltip, setShowTooltip] = useState<string | null>(null)
  
  // Keep track of which message's tools are currently being displayed
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null)
  
  // Update the message tools map when new tools come in
  useEffect(() => {
    if (currentMessageId && toolsUsed && toolsUsed.tools_and_sources && toolsUsed.tools_and_sources.length > 0) {
      setMessageToolsMap(prev => ({
        ...prev,
        [currentMessageId]: toolsUsed
      }));
      
      // Set active message to the current one
      setActiveMessageId(currentMessageId);
    }
  }, [currentMessageId, toolsUsed]);
  
  // Get the active tools to display
  const getActiveTools = (): ToolsUsed => {
    if (!activeMessageId) {
      // If no active message, try the current message's tools
      return currentMessageId && messageToolsMap[currentMessageId] 
        ? messageToolsMap[currentMessageId] 
        : { tools_and_sources: [] };
    }
    
    // Return the tools for the active message
    return messageToolsMap[activeMessageId] || { tools_and_sources: [] };
  };
  
  const activeToolsUsed = getActiveTools();

  // Get all tools
  const getTools = (): Tool[] => {
    if (!activeToolsUsed || !activeToolsUsed.tools_and_sources) {
      return [];
    }
    
    return activeToolsUsed.tools_and_sources.sort((a, b) => a.order - b.order);
  }
  
  const tools = getTools();
  
  // Extract all sources from all tools and sort by relevancy
  const getAllSources = (): Source[] => {
    if (!activeToolsUsed || !activeToolsUsed.tools_and_sources) {
      return [];
    }
    
    // Collect all sources
    const allSources: Source[] = [];
    activeToolsUsed.tools_and_sources.forEach(tool => {
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
    if (!activeToolsUsed || !activeToolsUsed.tools_and_sources) {
      return false;
    }
    
    return activeToolsUsed.tools_and_sources.some(tool => 
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

  // Function to handle opening source URLs
  const openSourceUrl = (url: string) => {
    if (!url) return;
    
    // Handle URLs that might be missing http/https
    let formattedUrl = url;
    if (!/^https?:\/\//i.test(url)) {
      formattedUrl = `https://${url}`;
    }
    
    // Open in new tab
    window.open(formattedUrl, '_blank', 'noopener,noreferrer');
  };

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

  // Get available message IDs that have sources
  const availableMessageIds = Object.keys(messageToolsMap);
  const hasMultipleMessages = availableMessageIds.length > 1;

  return (
    <div
      className={`fixed inset-0 z-50 ${isOpen ? 'block md:flex' : 'hidden'}`}
      onClick={(e) => {
        // Only close if clicking the overlay (not the sidebar itself)
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      {/* Mobile overlay - only visible on mobile to darken background */}
      <div className="md:hidden absolute inset-0 bg-black bg-opacity-50"></div>
      
      <div
        id="citations-sidebar"
        className={`relative md:fixed inset-y-0 left-0 w-80 md:w-96 
                  bg-gray-100 dark:bg-gray-800 shadow-lg z-50 
                  overflow-auto transition-transform duration-300 h-full
                  ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-bold dark:text-white">References</h2>
              {hasMultipleMessages && (
                <div className="mt-1">
                  <select 
                    value={activeMessageId || ''} 
                    onChange={(e) => setActiveMessageId(e.target.value)}
                    className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded px-2 py-1 w-full"
                  >
                    {availableMessageIds.map(id => (
                      <option key={id} value={id}>
                        {id === currentMessageId ? 'Current message' : `Previous message ${id}`}
                      </option>
                    ))}
                  </select>
                </div>
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
                    <div className="flex items-center mt-1 gap-2">
                      {source.url && (
                        <button
                          onClick={() => openSourceUrl(source.url)}
                          className="text-blue-600 dark:text-blue-400 hover:underline text-xs flex items-center"
                        >
                          <span className="truncate max-w-[250px]">{source.url}</span>
                          <ExternalLink className="h-3 w-3 ml-1 flex-shrink-0" />
                        </button>
                      )}
                      {source.document_id && (
                        <Link 
                          href={`/documents/${source.document_id}`}
                          className="text-blue-600 dark:text-blue-400 hover:underline text-xs flex items-center"
                        >
                          <span>View Document Details</span>
                          <FileText className="h-3 w-3 ml-1 flex-shrink-0" />
                        </Link>
                      )}
                    </div>
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
                        <span className="ml-1 text-xs text-gray-500 dark:text-gray-400 flex items-center">
                          {(source.relevancy_score * 100).toFixed(0)}%
                          <div 
                            className="ml-1 relative cursor-help"
                            onMouseEnter={() => setShowTooltip(`sources-${index}`)}
                            onMouseLeave={() => setShowTooltip(null)}
                          >
                            <Info className="h-3 w-3 text-gray-400" />
                            {showTooltip === `sources-${index}` && (
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-50">
                                {relevancyExplanation}
                              </div>
                            )}
                          </div>
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
                          <button 
                            className="text-gray-500 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-500"
                            aria-label={expandedTools[tool.tool_name] ? "Collapse sources" : "Expand sources"}
                          >
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
                                
                                <div className="flex items-center mt-1 gap-2">
                                  {source.url && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation(); // Prevent toggle from firing
                                        openSourceUrl(source.url);
                                      }}
                                      className="text-blue-600 dark:text-blue-400 hover:underline text-xs flex items-center"
                                    >
                                      <span className="truncate max-w-[220px]">{source.url}</span>
                                      <ExternalLink className="h-3 w-3 ml-1 flex-shrink-0" />
                                    </button>
                                  )}
                                  {source.document_id && (
                                    <Link 
                                      href={`/documents/${source.document_id}`}
                                      className="text-blue-600 dark:text-blue-400 hover:underline text-xs flex items-center"
                                      onClick={(e) => e.stopPropagation()} // Prevent toggle from firing
                                    >
                                      <span>View Document Details</span>
                                      <FileText className="h-3 w-3 ml-1 flex-shrink-0" />
                                    </Link>
                                  )}
                                </div>
                                
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
                                    <span className="ml-1 text-xs text-gray-500 dark:text-gray-400 flex items-center">
                                      {(source.relevancy_score * 100).toFixed(0)}%
                                      <div 
                                        className="ml-1 relative cursor-help"
                                        onMouseEnter={() => setShowTooltip(`tool-${index}-source-${sourceIndex}`)}
                                        onMouseLeave={() => setShowTooltip(null)}
                                      >
                                        <Info className="h-3 w-3 text-gray-400" />
                                        {showTooltip === `tool-${index}-source-${sourceIndex}` && (
                                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-50">
                                            {relevancyExplanation}
                                          </div>
                                        )}
                                      </div>
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
      
      {/* This is not an overlay on desktop - it's just a spacer */}
      <div className="hidden md:block flex-grow" onClick={(e) => e.stopPropagation()}></div>
    </div>
  )
}

