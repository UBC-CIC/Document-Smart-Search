import Link from "next/link";

export default function RelatedDocumentsList({ documents }) {
  // Filter out any documents that might be placeholders
  const validDocuments = documents.filter(doc => 
    doc.id !== "unknown" && 
    doc.title !== "Document Not Found"
  );

  if (!validDocuments || validDocuments.length === 0) {
    return <p className="text-gray-500 dark:text-gray-400">No related documents found.</p>;
  }

  return (
    <div className="space-y-3">
      {validDocuments.map((doc) => (
        <div key={doc.id} className="border-b dark:border-gray-700 pb-3 last:border-b-0 last:pb-0">
          <Link href={`/documents/${doc.id}`} className="block hover:bg-gray-50 dark:hover:bg-gray-700 -mx-4 px-4 py-2 rounded">
            <h4 className="font-medium text-blue-600 dark:text-blue-400 hover:underline">{doc.title}</h4>
            
            {/* CSAS event */}
            {doc.csasEvent && (
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                <span className="font-medium">CSAS Event:</span> {doc.csasEvent} {doc.csasYear && `(${doc.csasYear})`}
              </div>
            )}
            
            <div className="flex gap-2 text-xs text-gray-600 dark:text-gray-400 mt-1">
              <span>{doc.type}</span>
              <span>•</span>
              <span>{doc.year}</span>
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}
