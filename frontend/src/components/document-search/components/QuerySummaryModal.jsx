import { X } from "lucide-react";

export default function QuerySummaryModal({
  isOpen,
  onClose,
  modalRef,
  loading,
  summaryData,
  userQuery,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto"
      >
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
          <h3 className="text-lg font-medium dark:text-white">
            {summaryData?.title || "Loading..."}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></div>
                <div
                  className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></div>
                <div
                  className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"
                  style={{ animationDelay: "0.4s" }}
                ></div>
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Generating AI summary...
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                  AI-Generated Document Summary
                </h4>
                <p className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed">
                  {summaryData?.summary || "Summary not available"}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Key Insights
                </h4>
                <ul className="list-disc pl-5 text-sm dark:text-gray-300 space-y-1">
                  {(
                    summaryData?.keyInsights || ["No key insights available"]
                  ).map((insight, index) => (
                    <li key={index}>{insight}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400 italic">
          {userQuery ? (
            <span>
              Summary generated for user query: "{userQuery}". This summary was
              generated using AI and may not capture all nuances of the
              document. Please refer to the original document for complete
              information.
            </span>
          ) : (
            <span>
              This summary was generated using AI and may not capture all
              nuances of the document. Please refer to the original document for
              complete information.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
