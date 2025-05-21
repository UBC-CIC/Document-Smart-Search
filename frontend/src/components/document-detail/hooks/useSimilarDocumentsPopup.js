import { useState } from "react";

export function useSimilarDocumentsPopup() {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [documentId, setDocumentId] = useState(null);
  
  const openPopup = (id) => {
    setDocumentId(id);
    setIsPopupOpen(true);
  };
  
  const closePopup = () => {
    setIsPopupOpen(false);
  };
  
  return {
    isPopupOpen,
    documentId,
    openPopup,
    closePopup
  };
}
