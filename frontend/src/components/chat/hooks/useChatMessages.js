import { useState } from "react";
import { toast } from "react-toastify";
import { sendChatMessage } from "../services/chatService";

// Message template
const ROLE_SELECTION_RESPONSE =
  "Thank you for selecting your role. How can I help you with your questions about Fisheries and Oceans Canada today?";

export function useChatMessages(session, fingerprint, messages, setMessages) {
  const [isLoading, setIsLoading] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [currentMessageId, setCurrentMessageId] = useState(null);

  // Helper to determine user role from message history
  const getUserRole = (messageHistory) => {
    const firstHumanMessage = messageHistory.find(
      (msg) => msg.role === "user" || msg.Type === "human"
    );
    if (!firstHumanMessage) return "";

    const content = (
      firstHumanMessage.content ||
      firstHumanMessage.Content ||
      ""
    ).toLowerCase();
    if (content.includes("public")) return "public";
    if (content.includes("internal researcher")) return "internal_researcher";
    if (content.includes("policy maker")) return "policy_maker";
    if (content.includes("external researcher")) return "external_researcher";
    return "";
  };

  // Handle when a user selects a role option
  const handleRoleSelection = async (selectedRole) => {
    if (!session || !fingerprint) return;

    // Convert the role to the proper format
    let roleValue;
    switch (selectedRole) {
      case "General Public":
        roleValue = "public";
        break;
      case "Internal Researcher":
        roleValue = "internal_researcher";
        break;
      case "Policy Maker":
        roleValue = "policy_maker";
        break;
      case "External Researcher":
        roleValue = "external_researcher";
        break;
      default:
        roleValue = "public";
    }

    // Add the user message showing their selection
    const userMessage = {
      id: Date.now().toString(),
      role: "user",
      content: selectedRole,
      Type: "human",
      Content: selectedRole,
    };

    // Add the welcome message directly in the frontend
    const aiResponse = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: ROLE_SELECTION_RESPONSE,
      options: [],
      user_role: roleValue,
      Type: "ai",
      Content: ROLE_SELECTION_RESPONSE,
      Options: [],
    };

    // Add user messages to the chat history
    setMessages((prev) => [...prev, userMessage]);

    // Sleep for a bit to simulate a delay for user experience
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Add the AI response to the chat history
    setMessages((prev) => [...prev, aiResponse]);
  };

  // Send a message to the chat API
  const sendMessage = async (content, isOption = false) => {
    if (!session || !fingerprint || (!content.trim() && !isOption)) return;

    const currentMessages = [...messages];
    const userRole = getUserRole(currentMessages);

    if (!isOption && currentMessages.length === 1) {
      toast.error("Please select one of the options first!");
      return;
    }

    setUserInput("");
    setIsLoading(true);

    try {
      // Check if this is a role selection message (first message and is one of the role options)
      const isRoleSelection =
        currentMessages.length === 1 &&
        isOption &&
        [
          "General Public",
          "Internal Researcher",
          "Policy Maker",
          "External Researcher",
        ].includes(content);

      // Handle role selection directly in the frontend without calling the backend
      if (isRoleSelection) {
        await handleRoleSelection(content);
        setIsLoading(false);
        return;
      }

      // For all other messages, continue with normal flow
      const userMessage = {
        id: Date.now().toString(),
        role: "user",
        content: content,
        Type: "human",
        Content: content,
      };

      setMessages((prev) => [...prev, userMessage]);

      // Send to backend for LLM processing
      const data = await sendChatMessage(
        session,
        fingerprint,
        content,
        userRole || "public"
      );
      const messageId = Date.now() + 1;

      // Update current message ID for sources display but don't open sidebar automatically
      if (data.tools_used && Object.keys(data.tools_used).length > 0) {
        setCurrentMessageId(messageId.toString());
      }

      // Add the AI response to messages
      setMessages((prev) => [
        ...prev,
        {
          id: messageId.toString(),
          role: "assistant",
          content: data.content,
          options: data.options || [],
          user_role: data.user_role,
          tools_used: data.tools_used || {},
          feedback: null,
          submittedFeedback: false,
          Type: "ai",
          Content: data.content,
          Options: data.options || [],
        },
      ]);

      return {
        hasTools: data.tools_used && Object.keys(data.tools_used).length > 0,
      };
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error(error.message || "Failed to send message. Please try again.");

      // Add error message
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content:
            "I apologize, but I encountered an error processing your request. Please try again.",
          feedback: null,
          submittedFeedback: false,
        },
      ]);

      return { hasTools: false };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    userInput,
    setUserInput,
    currentMessageId,
    setCurrentMessageId,
    sendMessage,
  };
}
