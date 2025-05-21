import { useState, useEffect } from "react";
import { getFingerprint } from "@thumbmarkjs/thumbmarkjs";
import { createChatSession, fetchChatMessages } from "../services/chatService";
import { toast } from "react-toastify";

// Constants
const INITIAL_GREETING =
  "Hello! I am a Smart Agent specialized in Fisheries and Oceans Canada (DFO). " +
  "I can help you with questions related to DFO documents, science advice, and more! " +
  "Please select the best role below that fits you. We can better answer your questions. " +
  "Don't include personal details such as your name and private content.";

export function useChatSession() {
  const [fingerprint, setFingerprint] = useState("");
  const [session, setSession] = useState(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: "initial",
      role: "assistant",
      content: INITIAL_GREETING,
      options: ["General Public", "Internal Researcher", "Policy Maker", "External Researcher"],
      user_role: "",
    },
  ]);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

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
    }
  }, []);

  // Create new session when fingerprint is available
  useEffect(() => {
    if (!fingerprint || session) return;
    initializeSession(fingerprint);
  }, [fingerprint, session]);

  // Fetch messages when session is available
  useEffect(() => {
    if (session) {
      loadChatHistory(session);
    }
  }, [session]);

  // Show disclaimer only when starting a new conversation
  useEffect(() => {
    // Start with disclaimer hidden
    setShowDisclaimer(false);

    // Create a timer to check if we should show the disclaimer
    const disclaimerTimer = setTimeout(() => {
      // Only show disclaimer if we have just the initial message (no conversation)
      // or if we're creating a new session
      if (messages.length <= 1 && !isCreatingSession) {
        setShowDisclaimer(true);
      }
    }, 2000); // 2 seconds delay to allow messages to load

    return () => clearTimeout(disclaimerTimer);
  }, [messages, isCreatingSession]);

  // Initialize a new chat session
  const initializeSession = async (currentFingerprint) => {
    if (!currentFingerprint) return;

    setIsCreatingSession(true);
    try {
      const sessionData = await createChatSession(currentFingerprint);
      setSession(sessionData);
      localStorage.setItem("dfoSession", JSON.stringify(sessionData));

      // Initialize with first message
      setMessages([
        {
          id: "initial",
          role: "assistant",
          content: INITIAL_GREETING,
          options: ["General Public", "Internal Researcher", "Policy Maker", "External Researcher"],
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

  // Load chat history from an existing session
  const loadChatHistory = async (sessionId) => {
    if (!sessionId) return;

    try {
      setShowDisclaimer(false); // Hide disclaimer when messages are fetched

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

      const hasInitialMessage =
        convertedMessages.length > 0 &&
        convertedMessages[0].role === "assistant" &&
        convertedMessages[0].content.includes("I am a Smart Agent specialized in Fisheries and Oceans Canada");

      if (!hasInitialMessage) {
        convertedMessages.unshift({
          id: "initial",
          role: "assistant",
          content: INITIAL_GREETING,
          options: ["General Public", "Internal Researcher", "Policy Maker", "External Researcher"],
          user_role: "",
        });
      }

      setMessages(convertedMessages);
    } catch (error) {
      console.error("Error loading chat history:", error);
      setMessages([
        {
          id: "initial",
          role: "assistant",
          content: INITIAL_GREETING,
          options: ["General Public", "Internal Researcher", "Policy Maker", "External Researcher"],
          user_role: "",
        },
      ]);
    }
  };

  // Reset the session
  const resetSession = () => {
    setSession(null);
    setMessages([
      {
        id: "initial",
        role: "assistant",
        content: INITIAL_GREETING,
        options: ["General Public", "Internal Researcher", "Policy Maker", "External Researcher"],
        user_role: "",
      },
    ]);
    localStorage.removeItem("dfoSession");
    setShowDisclaimer(true);
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
