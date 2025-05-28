"use client";

import { useState, useCallback } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Import components
import ChatInput from "./components/ChatInput";
import ChatMessages from "./components/ChatMessages";
import DisclaimerModal from "./components/DisclaimerModal";
import FeedbackComponent from "./components/UserFeedback";
import { CitationsSidebar } from "../components/citations-sidebar";

// Import hooks
import { useChatSession } from "./hooks/useChatSession";
import { useChatMessages } from "./hooks/useChatMessages";
import { useVoiceInput } from "./hooks/useVoiceInput";
import { useFeedback } from "./hooks/useFeedback";

export default function Chat() {
  // Set up state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Use custom hooks
  const {
    fingerprint,
    session,
    messages,
    setMessages,
    isCreatingSession,
    showDisclaimer,
    setShowDisclaimer,
    resetSession,
  } = useChatSession();

  const {
    isLoading,
    userInput,
    setUserInput,
    currentMessageId,
    setCurrentMessageId,
    sendMessage,
  } = useChatMessages(session, fingerprint, messages, setMessages);

  const { isListening, toggleListening } = useVoiceInput(setUserInput);

  const {
    showFeedback,
    setShowFeedback,
    feedback,
    setFeedback,
    isSendingFeedback,
    submitFeedback,
  } = useFeedback(fingerprint, session, messages);

  // Function to download chat history
  const downloadChatHistory = useCallback(() => {
    // Format the chat messages into a readable text format
    const chatContent = messages
      .map((message) => {
        const role = message.role === "user" ? "User" : "Assistant";
        return `${role}: ${message.content}`;
      })
      .join("\n\n");

    // Create a title with date and time
    const date = new Date();
    const formattedDate = date.toLocaleDateString();
    const formattedTime = date.toLocaleTimeString();
    const title = `DFO SmartSearch Chat - ${formattedDate} ${formattedTime}`;

    // Combine title and content
    const fullContent = `${title}\n\n${chatContent}`;

    // Create a Blob with the chat content
    const blob = new Blob([fullContent], { type: "text/plain" });

    // Create a download link and trigger the download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dfo-chat-${date.getTime()}.txt`;
    document.body.appendChild(a);
    a.click();

    // Clean up
    URL.revokeObjectURL(url);
    document.body.removeChild(a);

    toast.success("Chat history downloaded successfully!");
  }, [messages]);

  // Handle feedback submission
  const handleFeedbackSubmit = async (updatedFeedback = null) => {
    if (await submitFeedback(updatedFeedback)) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content:
            "Thank you! Your feedback will help improve the DFO SmartSearch Assistant. You may continue asking questions or start a new session.",
        },
      ]);
      setShowFeedback(false);
    }
  };

  return (
    <div
      className={`min-h-screen bg-white transition-all duration-300 flex flex-col ${
        isSidebarOpen ? "md:ml-96" : ""
      }`}
    >
      {/* Citations Sidebar - z-index set to be below modal but above content */}
      <div className={`fixed inset-0 z-30 pointer-events-none ${isSidebarOpen ? "visible" : "invisible"}`}>
        <div
          className={`absolute top-12 bottom-0 left-0 w-96 bg-white shadow-lg transform transition-transform duration-300 pointer-events-auto ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <CitationsSidebar
            key={session} // Add key prop to force remount when session changes
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            toolsUsed={
              messages.length > 0 && currentMessageId
                ? messages.find((m) => m.id === currentMessageId)?.tools_used || {}
                : {}
            }
            currentMessageId={currentMessageId}
          />
        </div>
        {/* Add a backdrop that can be clicked to close the sidebar on mobile */}
        <div
          className={`absolute inset-0 bg-black bg-opacity-25 md:hidden transition-opacity duration-300 ${
            isSidebarOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setIsSidebarOpen(false)}
          style={{ pointerEvents: isSidebarOpen ? "auto" : "none" }}
        />
      </div>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 md:py-8 flex-grow flex flex-col relative z-10">
        <div className="relative mb-1 md:mb-1">
          <h2 className="text-2xl md:text-3xl font-bold text-center">SmartSearch Assistant</h2>
        </div>

        {/* Chat Messages */}
        <ChatMessages
          messages={messages}
          isLoading={isLoading}
          isCreatingSession={isCreatingSession}
          currentMessageId={currentMessageId}
          setCurrentMessageId={setCurrentMessageId}
          onShowFeedback={() => {
            // Reset feedback state before showing the feedback component
            setFeedback({ rating: 0, description: [] });
            setShowFeedback(true);
          }}
          onOpenSidebar={(messageId) => {
            // If we're viewing the same message's sources, toggle the sidebar
            if (currentMessageId === messageId) {
              setIsSidebarOpen(prev => !prev);
            } else {
              // If it's a different message, set the current message and open the sidebar
              setCurrentMessageId(messageId);
              setIsSidebarOpen(true);
            }
          }}
          sendMessage={sendMessage} // Pass sendMessage function to handle option clicks
        />

        {/* Feedback Component */}
        {showFeedback && (
          <FeedbackComponent
            feedback={feedback}
            setFeedback={setFeedback}
            onSubmit={handleFeedbackSubmit}
            isSubmitting={isSendingFeedback}
            onClose={() => setShowFeedback(false)}
          />
        )}

        {/* Chat Input */}
        <ChatInput
          userInput={userInput}
          setUserInput={setUserInput}
          sendMessage={async (input) => {
            // Don't automatically open sidebar anymore
            const result = await sendMessage(input);
            // Let the user decide when to open sidebar
            return result;
          }}
          isLoading={isLoading}
          resetSession={() => {
            // Close the sidebar when creating a new session
            setIsSidebarOpen(false);
            // Clear any selected message ID
            setCurrentMessageId(null);
            // Then call the original reset function
            resetSession();
          }}
          toggleListening={toggleListening}
          isListening={isListening}
          showDownloadButton={messages.length > 1}
          downloadChatHistory={downloadChatHistory}
        />
      </main>

      {/* Disclaimer Modal - z-index set higher than sidebar */}
      <DisclaimerModal show={showDisclaimer} onClose={() => setShowDisclaimer(false)} />

      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
      />
    </div>
  );
}
