"use client";

import { useParams } from 'next/navigation';
import DocumentDetail from '@/components/document-detail/DocumentDetail';

export default function DocumentPage() {
  // Extract document ID from the URL params
  const params = useParams();
  const documentId = params.id;

  return <DocumentDetail documentId={documentId} />;
}
