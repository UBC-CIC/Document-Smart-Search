"use client"

import DocumentDetail from "@/components/document-detail/DocumentDetail"

export default function DocumentSummaryPage({ params }) {
  return <DocumentDetail documentId={params.id} />
}
