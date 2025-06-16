import { useState, useEffect } from "react";
import { getFingerprint } from "@thumbmarkjs/thumbmarkjs";
import { createChatSession, fetchChatMessages } from "../services/chatService";
import { toast } from "react-toastify";

// Constants
const INITIAL_GREETING =
  "Hello! I am a Smart Agent specialized in Fisheries and Oceans Canada (DFO). " +
  "I can help you with questions related to DFO documents, science advice, and more! " +
  "Please select the role that best describes you so I can better assist with your questions. " +
  "Do not include personal details such as your name or other private information.";

export function useChatSession() {
  const [fingerprint, setFingerprint] = useState("");
  const [session, setSession] = useState(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isNewSession, setIsNewSession] = useState(true); // Track if session is new
  const [messages, setMessages] = useState([
    {
      id: "initial",
      role: "assistant",
      content: INITIAL_GREETING,
      options: [
        "General Public",
        "Internal Researcher",
        "Policy Maker",
        "External Researcher",
      ],
      user_role: "",
    },
  ]);
  const [showDisclaimer, setShowDisclaimer] = useState(true); // Always start with disclaimer shown

  // Initialize fingerprint
  useEffect(() => {
    getFingerprint()
      .then((result) => {
        setFingerprint(result);
      })
      .catch((error) => {
        console.error("Error getting fingerprint:", error);
      });

    const existingSession = localStorage.getItem("dfoSession");
    if (existingSession) {
      const parsedSession = JSON.parse(existingSession);
      setSession(parsedSession);
      setIsNewSession(false); // Not a new session
      // // Don't show disclaimer for existing sessions
      // setShowDisclaimer(false);
    } else {
      // Show disclaimer for new sessions
      setShowDisclaimer(true);
      setIsNewSession(true); // Mark as new session
    }
  }, []);

  // Create new session when fingerprint is available
  useEffect(() => {
    if (!fingerprint || session) return;
    initializeSession(fingerprint);
  }, [fingerprint, session]);

  // Fetch messages when session is available but only for existing sessions
  useEffect(() => {
    if (session && !isNewSession) {
      loadChatHistory(session);
    }
  }, [session, isNewSession]);

  // Initialize a new chat session
  const initializeSession = async (currentFingerprint) => {
    if (!currentFingerprint) return;

    setIsCreatingSession(true);
    setShowDisclaimer(true); // Keep disclaimer visible for new sessions

    try {
      const sessionData = await createChatSession(currentFingerprint);
      setSession(sessionData);
      setIsNewSession(true); // Mark as new session
      localStorage.setItem("dfoSession", JSON.stringify(sessionData));

      // Initialize with first message
      setMessages([
        {
          id: "initial",
          role: "assistant",
          content: INITIAL_GREETING,
          options: [
            "General Public",
            "Internal Researcher",
            "Policy Maker",
            "External Researcher",
          ],
          user_role: "",
        },
      ]);

      return sessionData;
    } catch (error) {
      toast.error("Failed to create session. Please try again.");
      return null;
    } finally {
      setIsCreatingSession(false);
    }
  };

  // Extract user role from messages
  const extractUserRoleFromMessages = (messages) => {
    // First check for explicit user_role property
    const messageWithRole = messages.find(
      (msg) => msg.user_role && msg.user_role !== ""
    );
    if (messageWithRole) {
      return messageWithRole.user_role;
    }

    // If no explicit role, try to infer from content of first user message
    const firstUserMessage = messages.find(
      (msg) =>
        (msg.role === "user" || msg.Type === "human") &&
        msg.content &&
        msg.content.length > 0
    );

    if (firstUserMessage) {
      const content = firstUserMessage.content.toLowerCase();
      if (content.includes("general public")) return "public";
      if (content.includes("internal researcher")) return "internal_researcher";
      if (content.includes("policy maker")) return "policy_maker";
      if (content.includes("external researcher")) return "external_researcher";
    }

    return "";
  };

  // Load chat history from an existing session
  const loadChatHistory = async (sessionId) => {
    if (!sessionId) return;

    try {
      const data = await fetchChatMessages(sessionId);
      const messagesList = data.messages || [];

      // Convert API message format to our format
      const convertedMessages = messagesList.map((msg, index) => ({
        id: index.toString(),
        role: msg.Type === "human" ? "user" : "assistant",
        content: msg.Content,
        options: msg.Options || [],
        user_role: msg.user_role,
        tools_used: msg.tools_used || {},
        feedback: null,
        submittedFeedback: false,
        // Keep original properties for compatibility
        Type: msg.Type,
        Content: msg.Content,
        Options: msg.Options,
      }));

      // Process messages to ensure correct user_role propagation
      const userRole = extractUserRoleFromMessages(convertedMessages);
      if (userRole) {
        // Ensure all assistant messages have the user_role
        convertedMessages.forEach((msg) => {
          if (msg.role === "assistant" && !msg.user_role) {
            msg.user_role = userRole;
          }
        });
      }

      const hasInitialMessage =
        convertedMessages.length > 0 &&
        convertedMessages[0].role === "assistant" &&
        convertedMessages[0].content.includes(
          "I am a Smart Agent specialized in Fisheries and Oceans Canada"
        );

      if (!hasInitialMessage) {
        convertedMessages.unshift({
          id: "initial",
          role: "assistant",
          content: INITIAL_GREETING,
          options: [
            "General Public",
            "Internal Researcher",
            "Policy Maker",
            "External Researcher",
          ],
          user_role: userRole || "",
        });
      }

      setMessages(convertedMessages);

      // Check if there are any user messages (actual conversation history)
      const hasUserMessages = convertedMessages.some(
        (msg) => msg.role === "user"
      );

      // Only hide the disclaimer when there's actual conversation history
      // Otherwise show disclaimer even for existing sessions with no conversation
      if (!isNewSession && hasUserMessages) {
        setShowDisclaimer(false);
      } else {
        setShowDisclaimer(true);
      }
    } catch (error) {
      console.error("Error loading chat history:", error);
      setMessages([
        {
          id: "initial",
          role: "assistant",
          content: INITIAL_GREETING,
          options: [
            "General Public",
            "Internal Researcher",
            "Policy Maker",
            "External Researcher",
          ],
          user_role: "",
        },
      ]);
      // Show disclaimer if we couldn't load history properly
      setShowDisclaimer(true);
    }
  };

  // Reset the session
  const resetSession = () => {
    setSession(null);
    setIsNewSession(true); // Mark as new session
    setMessages([
      {
        id: "initial",
        role: "assistant",
        content: INITIAL_GREETING,
        options: [
          "General Public",
          "Internal Researcher",
          "Policy Maker",
          "External Researcher",
        ],
        user_role: "",
      },
    ]);
    localStorage.removeItem("dfoSession");
    setShowDisclaimer(true); // Show disclaimer when resetting session
    if (fingerprint) {
      initializeSession(fingerprint);
    }
  };

  return {
    fingerprint,
    session,
    messages,
    setMessages,
    isCreatingSession,
    showDisclaimer,
    setShowDisclaimer,
    resetSession,
  };
}
