import React from 'react';

/**
 * Sort selector dropdown for document lists
 * 
 * @param {string} sortBy - Current sort option
 * @param {function} onChange - Handler for sort change
 * @param {string} topicType - Type of topic ('mandate', 'dfo', or 'derived')
 */
export default function SortSelector({ sortBy, onChange, topicType }) {
  return (
    <div className="flex items-center space-x-2">
      <label htmlFor="sortSelector" className="text-sm text-gray-600 dark:text-gray-400">
        Sort:
      </label>
      <select
        id="sortSelector"
        value={sortBy}
        onChange={e => onChange(e.target.value)}
        className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-1.5"
      >
        {/* Combined score is default but only available for mandate and dfo topics */}
        {topicType !== 'derived' && (
          <option value="combined">Combined Score</option>
        )}
        
        {/* Semantic score is available for all topic types */}
        <option value="semanticScore">Semantic Score</option>
        
        {/* LLM score only available for mandate and dfo topics */}
        {topicType !== 'derived' && (
          <option value="llmScore">LLM Score</option>
        )}
        
        {/* Date sorting options available for all topic types */}
        <option value="yearDesc">Newest First</option>
        <option value="yearAsc">Oldest First</option>
      </select>
    </div>
  );
}
