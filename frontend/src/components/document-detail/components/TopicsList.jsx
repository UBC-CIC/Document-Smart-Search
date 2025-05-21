export function PrimaryTopicsList({ topics, openPopup }) {
  if (!topics || topics.length === 0) {
    return <p className="text-gray-500 dark:text-gray-400">No DFO topics available.</p>;
  }

  return (
    <div className="space-y-4">
      {topics.map((topic, index) => (
        <div key={index} className="border-b dark:border-gray-700 pb-4 last:border-b-0 last:pb-0">
          <h4 className="font-medium mb-2">
            <button 
              onClick={() => openPopup(topic.name, 'dfo')}
              className="text-blue-600 dark:text-blue-400 hover:underline text-left"
            >
              {topic.name}
            </button>
          </h4>
          <div className="mb-3">
            <p className="text-sm">{topic.explanation}</p>
          </div>
          
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="bg-blue-50 dark:bg-blue-900/30 p-2 rounded-md">
              <span className="font-medium text-blue-600 dark:text-blue-400">Semantic Score:</span>{' '}
              <span>{(topic.semanticScore * 100).toFixed(0)}%</span>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/30 p-2 rounded-md">
              <span className="font-medium text-green-600 dark:text-green-400">LLM Score:</span>{' '}
              <span>{(topic.llmScore * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SecondaryTopicsList({ topics, openPopup }) {
  if (!topics || topics.length === 0) {
    return <p className="text-gray-500 dark:text-gray-400">No derived topics available.</p>;
  }

  return (
    <div className="space-y-4">
      {topics.map((topic, index) => (
        <div key={index} className="border-b dark:border-gray-700 pb-4 last:border-b-0 last:pb-0">
          <div className="flex justify-between items-center">
            <h4 className="font-medium">
              <button 
                onClick={() => openPopup(topic.name, 'derived')}
                className="text-blue-600 dark:text-blue-400 hover:underline text-left"
              >
                {topic.name}
              </button>
            </h4>
            <div className="bg-blue-50 dark:bg-blue-900/30 p-2 rounded-md text-sm">
              <span className="font-medium text-blue-600 dark:text-blue-400">Semantic Score:</span>{' '}
              <span>{(topic.semanticScore * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
