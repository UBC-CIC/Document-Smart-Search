import { useState } from "react";
import { submitFeedback as sendFeedback } from "../services/chatService";

export function useFeedback(fingerprint, session, messages) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState({ rating: 0, description: [] });
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);

  const getUserRole = (messageHistory) => {
    const firstHumanMessage = messageHistory.find((msg) => msg.role === "user" || msg.Type === "human");
    if (!firstHumanMessage) return "";

    const content = (firstHumanMessage.content || firstHumanMessage.Content || "").toLowerCase();
    if (content.includes("public")) return "public";
    if (content.includes("internal researcher")) return "internal_researcher";
    if (content.includes("policy maker")) return "policy_maker";
    if (content.includes("external researcher")) return "external_researcher";
    return "";
  };

  const submitFeedback = async () => {
    if (!feedback.rating || isSendingFeedback || !fingerprint || !session) return;

    setIsSendingFeedback(true);
    let userRole = getUserRole(messages);
    
    // Ensure userRole has a default value
    if (!userRole) userRole = "public";
    
    // Ensure description is never empty
    const description = feedback.description?.length 
      ? feedback.description.join(", ") 
      : "No specific feedback provided";

    try {
      console.log("Submitting feedback with:", {
        fingerprint,
        session,
        userRole,
        rating: feedback.rating,
        description
      });
      
      // Send feedback to the API
      await sendFeedback(
        fingerprint, 
        session, 
        userRole, 
        feedback.rating, 
        description
      );

      return true;
    } catch (error) {
      console.error("Error submitting feedback:", error);
      return false;
    } finally {
      setIsSendingFeedback(false);
    }
  };

  return {
    showFeedback,
    setShowFeedback,
    feedback,
    setFeedback,
    isSendingFeedback,
    submitFeedback
  };
}
