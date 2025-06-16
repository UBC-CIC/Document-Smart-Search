"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useDocumentDetail } from "./hooks/useDocumentDetail";
import { useTopicPopup } from "./hooks/useTopicPopup";
import { useSimilarDocumentsPopup } from "./hooks/useSimilarDocumentsPopup"; // Add this
import MetadataSidebar from "./components/MetadataSidebar";
import ExpandableSection from "./components/ExpandableSection";
import RelatedMandatesList from "./components/RelatedMandatesList";
import {
  PrimaryTopicsList,
  SecondaryTopicsList,
} from "./components/TopicsList";
import RelatedDocumentsList from "./components/RelatedDocumentsList";
import RelatedDocumentsPopup from "./components/RelatedDocumentsPopup";
import SimilarDocumentsPopup from "./components/SimilarDocumentsPopup"; // Add this

export default function DocumentDetail({ documentId }) {
  const {
    document,
    relatedDocuments,
    loading,
    error,
    expandedSections,
    toggleSection,
  } = useDocumentDetail(documentId);

  // Filter out invalid documents before counting
  const validRelatedDocuments = relatedDocuments.filter(
    (doc) => doc.id !== "unknown" && doc.title !== "Document Not Found"
  );

  // Topic popup state
  const { popupState, openPopup, closePopup } = useTopicPopup();

  // Similar documents popup state
  const {
    isPopupOpen: isSimilarDocsOpen,
    openPopup: openSimilarDocs,
    closePopup: closeSimilarDocs,
  } = useSimilarDocumentsPopup();

  // Always render the back button at the top, regardless of loading state
  const BackButton = () => (
    <div className="mb-4">
      <Link
        href="/document-search"
        className="flex items-center text-blue-600 dark:text-blue-400 hover:underline text-sm"
      >
        <ChevronLeft className="h-3 w-3 mr-1" />
        Back to Document Search
      </Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-all duration-300">
      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-4">
        {/* Back button always visible */}
        <BackButton />

        <h2 className="text-xl font-bold mb-4 dark:text-white">
          Document View
        </h2>

        {loading ? (
          <div className="flex flex-col items-center py-12">
            <div className="flex space-x-2 mb-4">
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
            <p className="text-gray-600 dark:text-gray-400">
              Loading document details...
            </p>

            {/* Improved display of document ID for debugging */}
            {documentId && (
              <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded text-sm">
                <p className="font-medium">Document Reference: {documentId}</p>
              </div>
            )}
            {!documentId && (
              <div className="mt-4 p-4 bg-red-100 dark:bg-red-900/20 rounded text-sm text-red-600 dark:text-red-400">
                <p>Error: No document ID provided in the URL</p>
                <p className="mt-1">Please navigate to a valid document URL</p>
              </div>
            )}
          </div>
        ) : error ? (
          <div className="text-center p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <h3 className="text-xl font-bold text-red-600 dark:text-red-400 mb-4">
              Error Loading Document
            </h3>
            <p className="text-gray-700 dark:text-gray-300 mb-6">{error}</p>
          </div>
        ) : document ? (
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left Sidebar - Metadata - Pass validRelatedDocuments.length instead */}
            <MetadataSidebar
              document={document}
              relatedDocumentsCount={validRelatedDocuments.length}
              onViewSimilarDocs={() => openSimilarDocs(document.id)}
            />

            {/* Main Content */}
            <div className="flex-1">
              <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-sm">
                <div className="p-4 border-b dark:border-gray-700">
                  <h2 className="text-lg font-medium dark:text-white">
                    {document.title}
                  </h2>
                  <div className="flex justify-between mt-2 text-xs">
                    <div className="text-gray-600 dark:text-gray-400">
                      Last Updated: {document.lastUpdated}
                    </div>
                    <div className="text-gray-600 dark:text-gray-400">
                      Manually Verified: {document.verified ? "Yes" : "No"}
                    </div>
                  </div>
                </div>

                {/* Expandable Sections */}
                <div>
                  {/* Subject */}
                  <ExpandableSection
                    title="Document Subject"
                    expanded={expandedSections.subject}
                    onToggle={() => toggleSection("subject")}
                  >
                    <p>{document.subject}</p>
                  </ExpandableSection>

                  {/* Related Mandates */}
                  <ExpandableSection
                    title="Related Mandate(s)"
                    expanded={expandedSections.relatedMandates}
                    onToggle={() => toggleSection("relatedMandates")}
                  >
                    <RelatedMandatesList
                      mandates={document.relatedMandates}
                      openPopup={openPopup}
                    />
                  </ExpandableSection>

                  {/* Research Topics - Renamed sections */}
                  <ExpandableSection
                    title="Research Topic(s)"
                    expanded={expandedSections.researchTopics}
                    onToggle={() => toggleSection("researchTopics")}
                  >
                    <div className="bg-white dark:bg-gray-800">
                      {/* DFO Topics (formerly Primary Topics) */}
                      <ExpandableSection
                        title="DFO Topic(s)"
                        expanded={expandedSections.primaryTopics}
                        onToggle={() => toggleSection("primaryTopics")}
                        nested
                      >
                        <PrimaryTopicsList
                          topics={document.primaryTopics}
                          openPopup={openPopup}
                        />
                      </ExpandableSection>

                      {/* Derived Topics (formerly Secondary Topics) */}
                      <ExpandableSection
                        title="Derived Topic(s)"
                        expanded={expandedSections.secondaryTopics}
                        onToggle={() => toggleSection("secondaryTopics")}
                        nested
                      >
                        <SecondaryTopicsList
                          topics={document.secondaryTopics}
                          openPopup={openPopup}
                        />
                      </ExpandableSection>
                    </div>
                  </ExpandableSection>

                  {/* Related Documents */}
                  <ExpandableSection
                    title="Directly Related Documents"
                    expanded={expandedSections.relatedDocuments}
                    onToggle={() => toggleSection("relatedDocuments")}
                  >
                    <RelatedDocumentsList documents={relatedDocuments} />
                  </ExpandableSection>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <h3 className="text-xl font-bold text-red-600 dark:text-red-400 mb-4">
              Document Not Found
            </h3>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              The requested document could not be found.
            </p>
          </div>
        )}
      </main>

      {/* Topic Related Documents Popup */}
      <RelatedDocumentsPopup
        isOpen={popupState.isOpen}
        onClose={closePopup}
        topicName={popupState.topicName}
        topicType={popupState.topicType}
        documentId={documentId}
      />

      {/* Similar Documents Popup */}
      <SimilarDocumentsPopup
        isOpen={isSimilarDocsOpen}
        onClose={closeSimilarDocs}
        documentId={documentId}
      />
    </div>
  );
}
