import { useState, useEffect } from "react";
import { fetchDocumentDetail } from "../services/documentDetailService";

export function useDocumentDetail(documentId) {
  const [document, setDocument] = useState(null);
  const [relatedDocuments, setRelatedDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State for expandable sections - all default to true/open now
  const [expandedSections, setExpandedSections] = useState({
    subject: true,
    relatedMandates: true,
    researchTopics: true,
    primaryTopics: true,
    secondaryTopics: true,
    relatedDocuments: true,
  });

  // Toggle section expansion
  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Fetch document details
  useEffect(() => {
    async function getDocumentDetails() {
      // Clear any previous error
      setError(null);

      // Validate document ID
      if (!documentId) {
        setLoading(false);
        setError("No document ID provided");
        return;
      }

      setLoading(true);
      try {
        console.log("Fetching document with ID:", documentId);

        // Extract ID from path if it's a full URL
        let cleanId = documentId;
        if (typeof documentId === "string" && documentId.includes("/")) {
          cleanId = documentId.split("/").pop();
        }

        const documentData = await fetchDocumentDetail(cleanId);
        console.log("Document data received:", documentData ? "Yes" : "No");
        setDocument(documentData);

        // Set related documents directly from the document data
        if (documentData.relatedDocuments) {
          // Filter out invalid documents
          const validRelatedDocs = documentData.relatedDocuments.filter(
            (doc) =>
              doc.id !== "unknown" &&
              doc.title !== "Document Not Found" &&
              doc.id !== cleanId // Exclude current document
          );

          setRelatedDocuments(validRelatedDocs);
        } else {
          setRelatedDocuments([]);
        }
      } catch (err) {
        console.error("Error fetching document details:", err);
        setError(`Failed to load document details: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }

    getDocumentDetails();
  }, [documentId]);

  return {
    document,
    relatedDocuments,
    loading,
    error,
    expandedSections,
    toggleSection,
  };
}
