import React, { useRef, useEffect } from "react";
import { Send, RefreshCw, Download, Mic, MicOff } from "lucide-react";

const ChatInput = ({
  userInput,
  setUserInput,
  sendMessage,
  isLoading,
  resetSession,
  toggleListening,
  isListening,
  showDownloadButton,
  downloadChatHistory,
}) => {
  const textareaRef = useRef(null);

  // Handle automatic textarea resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        Math.max(textareaRef.current.scrollHeight, 24),
        120
      )}px`;
    }
  }, [userInput]);

  // Handle Enter key press to send message
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && userInput.trim()) {
        sendMessage(userInput);
      }
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-4 space-y-4">
      <div className="relative flex items-center w-full bg-gray-100 rounded-full px-4 py-2">
        <div className="flex items-center space-x-2">
          <button
            onClick={resetSession}
            className="p-1.5 hover:bg-gray-200 rounded-full"
            title="New conversation"
          >
            <RefreshCw size={20} className="text-gray-600" />
          </button>

          {showDownloadButton && (
            <button
              onClick={downloadChatHistory}
              className="p-1.5 hover:bg-gray-200 rounded-full text-gray-600"
              title="Download Chat"
            >
              <Download size={20} />
            </button>
          )}

          <button
            onClick={toggleListening}
            className={`p-1.5 hover:bg-gray-200 rounded-full ${
              isListening ? "text-red-500" : "text-gray-600"
            }`}
            title={isListening ? "Stop listening" : "Start voice input"}
          >
            {isListening ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyPress}
          className="flex-1 bg-transparent border-none outline-none resize-none px-4 py-2 text-gray-800 placeholder-gray-500"
          placeholder="Type your query here..."
          maxLength={2096}
          rows={1}
          style={{
            minHeight: "24px",
            height: "auto",
          }}
          onInput={(e) => {
            const target = e.target;
            target.style.height = "auto";
            target.style.height = `${Math.min(
              Math.max(target.scrollHeight, 24),
              120
            )}px`;
          }}
          disabled={isLoading}
        />

        <button
          onClick={() =>
            !isLoading && userInput.trim() && sendMessage(userInput)
          }
          className={`p-2 rounded-full ${
            isLoading || !userInput.trim()
              ? "opacity-50 cursor-not-allowed text-gray-400"
              : "text-gray-600 hover:bg-gray-200 cursor-pointer"
          }`}
          disabled={isLoading || !userInput.trim()}
        >
          <Send size={20} />
        </button>
      </div>

      <p className="text-center text-sm text-gray-600">
        This virtual assistant can make mistakes.
      </p>
    </div>
  );
};

export default ChatInput;
