import { Info } from "lucide-react";
import { useState } from "react";

export function PrimaryTopicsList({ topics, openPopup }) {
  const [showTooltip, setShowTooltip] = useState(null);

  // Tooltip explanation for DFO topics (LLM based)
  const relevanceExplanation =
    "Relevance of this document to the topic as rated by a LLM.";

  if (!topics || topics.length === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400">
        No DFO topics available.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {topics.map((topic, index) => (
        <div
          key={index}
          className="border-b dark:border-gray-700 pb-4 last:border-b-0 last:pb-0"
        >
          <h4 className="font-medium mb-2">
            <button
              onClick={() => openPopup(topic.name, "dfo")}
              className="text-blue-600 dark:text-blue-400 hover:underline text-left"
            >
              {topic.name}
            </button>
          </h4>
          <div className="mb-3">
            <p className="text-sm">{topic.explanation}</p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <div className="bg-green-50 dark:bg-green-900/30 p-2 rounded-md flex items-center">
              <span className="font-medium text-green-600 dark:text-green-400">
                Relevance Score:
              </span>
              <span className="ml-1">{(topic.llmScore * 100).toFixed(0)}%</span>
              <div
                className="ml-1 relative cursor-help"
                onMouseEnter={() => setShowTooltip(`dfo-${index}`)}
                onMouseLeave={() => setShowTooltip(null)}
              >
                <Info className="h-3 w-3 text-gray-400" />
                {showTooltip === `dfo-${index}` && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-50">
                    {relevanceExplanation}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SecondaryTopicsList({ topics, openPopup }) {
  const [showTooltip, setShowTooltip] = useState(null);

  // Tooltip explanation for derived topics (semantic similarity)
  const relevanceExplanation =
    "The semantic similarity of this document to the topic.";

  if (!topics || topics.length === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400">
        No derived topics available.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {topics.map((topic, index) => (
        <div
          key={index}
          className="border-b dark:border-gray-700 pb-4 last:border-b-0 last:pb-0"
        >
          <div className="flex justify-between items-center">
            <h4 className="font-medium">
              <button
                onClick={() => openPopup(topic.name, "derived")}
                className="text-blue-600 dark:text-blue-400 hover:underline text-left"
              >
                {topic.name}
              </button>
            </h4>
            <div className="bg-blue-50 dark:bg-blue-900/30 p-2 rounded-md text-sm flex items-center">
              <span className="font-medium text-blue-600 dark:text-blue-400">
                Relevance Score:
              </span>
              <span className="ml-1">
                {(topic.semanticScore * 100).toFixed(0)}%
              </span>
              <div
                className="ml-1 relative cursor-help"
                onMouseEnter={() => setShowTooltip(`derived-${index}`)}
                onMouseLeave={() => setShowTooltip(null)}
              >
                <Info className="h-3 w-3 text-gray-400" />
                {showTooltip === `derived-${index}` && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-50">
                    {relevanceExplanation}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
