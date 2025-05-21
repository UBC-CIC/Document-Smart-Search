export default function RelatedMandatesList({ mandates, openPopup }) {
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
            <div className="bg-blue-50 dark:bg-blue-900/30 p-2 rounded-md">
              <span className="font-medium text-blue-600 dark:text-blue-400">Semantic Score:</span>{' '}
              <span>{(mandate.semanticScore * 100).toFixed(0)}%</span>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/30 p-2 rounded-md">
              <span className="font-medium text-green-600 dark:text-green-400">LLM Score:</span>{' '}
              <span>{(mandate.llmScore * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
