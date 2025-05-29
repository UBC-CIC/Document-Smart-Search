import { Info } from "lucide-react";
import { useState } from "react";

export default function RelatedMandatesList({ mandates, openPopup }) {
  const [showTooltip, setShowTooltip] = useState(null);
  
  // Tooltip explanation for DFO mandate relevance score
  const relevanceExplanation = "Relevance of this document to the mandate as rated by a LLM.";
  
  if (!mandates || mandates.length === 0) {
    return <p className="text-gray-500 dark:text-gray-400">No related mandates available.</p>;
  }

  return (
    <div className="space-y-4">
      {mandates.map((mandate, index) => (
        <div key={index} className="border-b dark:border-gray-700 pb-4 last:border-b-0 last:pb-0">
          <h4 className="font-medium mb-2">
            <button 
              onClick={() => openPopup(mandate.name, 'mandate')}
              className="text-blue-600 dark:text-blue-400 hover:underline text-left"
            >
              {mandate.name}
            </button>
          </h4>
          <div className="mb-3">
            <p className="text-sm">{mandate.explanation}</p>
          </div>
          
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="bg-green-50 dark:bg-green-900/30 p-2 rounded-md flex items-center">
              <span className="font-medium text-green-600 dark:text-green-400">Relevance Score:</span>
              <span className="ml-1">{(mandate.llmScore * 100).toFixed(0)}%</span>
              <div 
                className="ml-1 relative cursor-help"
                onMouseEnter={() => setShowTooltip(`mandate-${index}`)}
                onMouseLeave={() => setShowTooltip(null)}
              >
                <Info className="h-3 w-3 text-gray-400" />
                {showTooltip === `mandate-${index}` && (
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
