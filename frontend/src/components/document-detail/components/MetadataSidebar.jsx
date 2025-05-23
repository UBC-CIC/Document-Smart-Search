import { User, BarChart } from "lucide-react";

export default function MetadataSidebar({ document, relatedDocumentsCount = 0, onViewSimilarDocs }) {
  if (!document) return null;
  
  return (
    <div className="w-full md:w-64">
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
        {document.htmlUrl && (
          <a
            href={document.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center py-2 bg-green-500 hover:bg-green-600 text-white font-medium dark:text-white text-sm transition-colors"
          >
            View Web Page
          </a>
        )}

        {document.documentUrl && document.documentUrl !== '#' && (
          <a
            href={document.documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium dark:text-white text-sm transition-colors"
          >
            View Document
          </a>
        )}

        <div className="p-3 text-center bg-gray-200 dark:bg-gray-700 m-2 rounded">
          <div className="text-sm dark:text-gray-300">{document.type}</div>
        </div>

        {/* CSAS Event Information */}
        <div className="p-2">
          <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded border border-indigo-100 dark:border-indigo-700">
            <div className="text-center mb-1">
              <span className="inline-block px-2 py-1 bg-indigo-100 dark:bg-indigo-800 text-xs font-medium text-indigo-800 dark:text-indigo-200 rounded">CSAS Event</span>
            </div>
            <div className="text-sm text-center dark:text-gray-300 font-medium">{document.csasEvent || "N/A"}</div>
            
            <div className="flex justify-center items-center mt-3">
              <span className="inline-block px-2 py-1 bg-indigo-100 dark:bg-indigo-800 text-xs font-medium text-indigo-800 dark:text-indigo-200 rounded">
                {document.csasYear || "N/A"}
              </span>
            </div>
            
            {/* Related Documents Count */}
            {relatedDocumentsCount > 0 && (
              <div className="mt-3 pt-3 border-t border-indigo-100 dark:border-indigo-700/30 text-center">
                <span className="text-xs font-medium text-indigo-800 dark:text-indigo-200">
                  {relatedDocumentsCount} directly related document{relatedDocumentsCount !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Authors Information */}
        {document.authors && document.authors.length > 0 && (
          <div className="p-2">
            <div className="bg-gray-200 dark:bg-gray-700 p-3 rounded">
              <div className="flex items-center justify-center mb-2">
                <User className="h-4 w-4 mr-1 text-gray-600 dark:text-gray-400" />
                <div className="text-xs font-medium dark:text-gray-300">
                  {document.authors.length === 1 ? "Author" : "Authors"}
                </div>
              </div>
              <div className="space-y-2">
                {document.authors.map((author, index) => (
                  <div key={index} className="text-sm text-center dark:text-gray-300">
                    <div className="font-medium">{author.name}</div>
                    {author.department && (
                      <div className="text-xs text-center text-gray-500 dark:text-gray-400 mt-0.5">
                        {author.department}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 p-2">
          <div className="bg-gray-200 dark:bg-gray-700 p-2 rounded text-center">
            <div className="text-xs font-medium dark:text-gray-300">Year:</div>
            <div className="text-sm dark:text-gray-300">{document.year}</div>
          </div>

          <div className="bg-gray-200 dark:bg-gray-700 p-2 rounded text-center">
            <div className="text-xs font-medium dark:text-gray-300">Related Mandates:</div>
            <div className="text-sm dark:text-gray-300">{document.relatedMandates.length}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-2">
          <div className="bg-gray-200 dark:bg-gray-700 p-2 rounded text-center">
            <div className="text-xs font-medium dark:text-gray-300">DFO Topics:</div>
            <div className="text-sm dark:text-gray-300">{document.primaryTopics.length}</div>
          </div>

          <div className="bg-gray-200 dark:bg-gray-700 p-2 rounded text-center">
            <div className="text-xs font-medium dark:text-gray-300">Derived Topics:</div>
            <div className="text-sm dark:text-gray-300">{document.secondaryTopics.length}</div>
          </div>
        </div>
        
        {/* Button to find similar documents */}
        <div className="p-2">
          <button
            onClick={onViewSimilarDocs}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium transition-colors"
          >
            <BarChart className="h-4 w-4" />
            Find Similar Documents
          </button>
        </div>
      </div>
    </div>
  );
}
