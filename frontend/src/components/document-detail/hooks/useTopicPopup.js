import { useState } from "react";

export function useTopicPopup() {
  const [popupState, setPopupState] = useState({
    isOpen: false,
    topicName: "",
    topicType: "" // 'mandate', 'dfo', or 'derived'
  });
  
  const openPopup = (topicName, topicType) => {
    setPopupState({
      isOpen: true,
      topicName,
      topicType
    });
  };
  
  const closePopup = () => {
    setPopupState({
      isOpen: false,
      topicName: "",
      topicType: ""
    });
  };
  
  return {
    popupState,
    openPopup,
    closePopup
  };
}
