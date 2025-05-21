import React, { useRef, useEffect, useState } from 'react';
import { User, Search, Copy, Volume2, StopCircle } from 'lucide-react';
import Image from 'next/image';
import Markdown from 'react-markdown';
import mapleLeaf from '../../../app/maple_leaf.png';

const ChatMessages = ({ 
  messages, 
  isLoading,
  isCreatingSession,
  currentMessageId,
  setCurrentMessageId,
  onShowFeedback,
  onOpenSidebar,
  sendMessage
}) => {
  const messagesEndRef = useRef(null);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [speaking, setSpeaking] = useState(null);
  const speechSynthesisRef = useRef(null);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle copying message text
  const handleCopy = (text, messageId) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    });
  };

  // Handle text-to-speech functionality
  const handleSpeak = (text, messageId) => {
    // If already speaking this message, stop
    if (speaking === messageId) {
      window.speechSynthesis.cancel();
      setSpeaking(null);
      return;
    }

    // If speaking another message, stop it first
    if (speaking) {
      window.speechSynthesis.cancel();
    }

    const msg = new SpeechSynthesisUtterance(text);
    
    msg.onend = () => setSpeaking(null);
    
    speechSynthesisRef.current = msg;
    window.speechSynthesis.speak(msg);
    setSpeaking(messageId);
  };

  // Cleanup speech synthesis when component unmounts
  useEffect(() => {
    return () => {
      if (speechSynthesisRef.current) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);
  
  return (
    <div className="space-y-4 md:space-y-6 mb-6 md:mb-8 flex-grow overflow-y-auto">
      {messages.map((message, index) => (
        <div key={message.id} className="space-y-2">
          {message.role === "user" ? (
            <div className="flex items-start">
              <div className="flex-grow flex justify-end">
                <div className="inline-block max-w-[85%] sm:max-w-[80%] py-2 px-3 md:px-4 bg-gray-200 rounded-2xl text-gray-800 text-sm md:text-base">
                  {message.content}
                </div>
              </div>
              <div className="ml-2 mt-1">
                <div className="bg-white p-1.5 md:p-2 rounded-full border">
                  <User className="h-4 w-4 md:h-5 md:w-5" />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex">
              <div className="mr-2 md:mr-3 mt-1">
                <div className="maple-leaf-container border rounded p-1 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center cursor-pointer">
                  <Image
                    src={mapleLeaf}
                    alt="Maple Leaf"
                    width={30}
                    height={30}
                    className="object-contain relative z-0"
                  />
                </div>
              </div>
              <div className="flex-grow">
                <div className="inline-block bg-gray-200 rounded-2xl py-2 px-3 md:px-4 max-w-[90%] text-sm md:text-base">
                  {/* Use Markdown renderer for assistant messages */}
                  <Markdown
                    className="text-gray-800"
                    components={{
                      a: ({ href, children }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline"
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {message.content}
                  </Markdown>
                </div>

                {/* Message Actions: Copy and Text-to-Speech */}
                <div className="flex space-x-4 mt-2 ml-2">
                  <button
                    onClick={() => handleCopy(message.content, message.id)}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex items-center"
                    aria-label="Copy message"
                  >
                    {copiedMessageId === message.id ? (
                      <span className="text-xs text-black dark:text-white mr-1">Copied!</span>
                    ) : (
                      <Copy size={16} className="mr-1" />
                    )}
                    {copiedMessageId !== message.id && <span className="text-xs">Copy</span>}
                  </button>
                  <button
                    onClick={() => handleSpeak(message.content, message.id)}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex items-center"
                    aria-label={speaking === message.id ? "Stop speaking" : "Read message aloud"}
                  >
                    {speaking === message.id ? (
                      <>
                        <StopCircle size={16} className="mr-1" />
                        <span className="text-xs">Stop</span>
                      </>
                    ) : (
                      <>
                        <Volume2 size={16} className="mr-1" />
                        <span className="text-xs">Speak</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Render options if available */}
                {message.options && message.options.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {message.options.map((option, optIndex) => (
                      <button
                        key={`${message.id}-option-${optIndex}`}
                        onClick={() => sendMessage && sendMessage(option, true)}
                        className="inline-block bg-blue-100 hover:bg-blue-200 rounded-xl py-1.5 px-3 text-blue-800 text-sm mr-2 mb-2"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}

                {/* Show feedback button after a few messages */}
                {index >= 4 && !message.content.includes("Thank you! Your feedback will help improve") && (
                  <button
                    onClick={onShowFeedback}
                    className="mt-2 inline-block bg-blue-100 hover:bg-blue-200 rounded-xl py-1.5 px-3 text-blue-800 text-sm"
                  >
                    My task is done
                  </button>
                )}

                {/* Sources button for messages with citations */}
                {message.role === "assistant" && message.tools_used && Object.keys(message.tools_used).length > 0 && (
                  <div className="flex justify-end mt-2">
                    <button
                      className="bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded flex items-center w-fit"
                      onClick={() => {
                        setCurrentMessageId(message.id);
                        onOpenSidebar();
                      }}
                    >
                      <Search className="h-4 w-4 mr-1" />
                      Sources
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Loading indicator */}
      {(isLoading || isCreatingSession) && (
        <div className="flex">
          <div className="mr-2 md:mr-3 mt-1">
            <div className="maple-leaf-container border rounded p-1 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center cursor-pointer">
              <Image
                src={mapleLeaf}
                alt="Maple Leaf"
                width={30}
                height={30}
                className="object-contain relative z-0"
              />
            </div>
          </div>
          <div className="flex-grow">
            <div className="inline-block bg-gray-200 rounded-2xl py-2 px-3 md:px-4">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />
                <div
                  className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                />
                <div
                  className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                  style={{ animationDelay: "0.4s" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatMessages;
