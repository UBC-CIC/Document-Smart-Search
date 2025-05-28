import React, { useRef, useEffect, useState } from 'react';
import { User, Search, Copy, Volume2, StopCircle, UserRound, AlertTriangle } from 'lucide-react';
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
  
  // Extract user role from messages
  const userRole = messages.find(m => m.user_role)?.user_role || '';
  
  // Format role for display
  const formatRole = (role) => {
    if (!role) return '';
    
    switch(role) {
      case 'public': return 'General Public';
      case 'internal_researcher': return 'Internal Researcher';
      case 'policy_maker': return 'Policy Maker';
      case 'external_researcher': return 'External Researcher';
      default: return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  };
  
  // Determine if role has been selected
  const hasSelectedRole = userRole !== '';

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
      {/* Role indicator area - always present with conditional styling */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm py-2 border-b border-gray-100 flex justify-center">
        {hasSelectedRole ? (
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm">
            <UserRound size={14} className="mr-1" />
            <span>Role: {formatRole(userRole)}</span>
          </div>
        ) : (
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-yellow-50 text-yellow-700 text-sm">
            <AlertTriangle size={14} className="mr-1" />
            <span>No role selected</span>
          </div>
        )}
      </div>
      
      {messages.map((message, index) => (
        <div key={message.id} className="space-y-2">
          {message.role === "user" ? (
            <div className="flex items-start">
              <div className="flex-grow flex justify-end">
                <div className="inline-block max-w-[85%] sm:max-w-[80%] py-2 px-3 md:px-4 bg-gray-200 rounded-2xl text-gray-800 text-sm md:text-base">
                  {message.content}
                </div>
              </div>
              <div className="ml-2 mt-1 flex flex-col items-center">
                <div className="bg-white p-1.5 md:p-2 rounded-full border">
                  <User className="h-4 w-4 md:h-5 md:w-5" />
                </div>
                {/* Add role indicator under user icon */}
                {hasSelectedRole && index > 0 && (
                  <div className="text-[10px] text-gray-500 mt-1 bg-gray-50 px-1 rounded-md whitespace-nowrap">
                    {formatRole(userRole)}
                  </div>
                )}
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
                  {/* Markdown renderer with better list formatting */}
                  <Markdown
                    className="text-gray-800 prose prose-sm max-w-none"
                    components={{
                      p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
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
                      ul: ({ children }) => <ul className="list-disc pl-5 mb-3 mt-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 mt-1">{children}</ol>,
                      li: ({ children }) => <li className="mb-1">{children}</li>,
                      h1: ({ children }) => <h1 className="text-xl font-bold mb-3 mt-2">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-2">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-base font-bold mb-2 mt-2">{children}</h3>,
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-gray-300 pl-3 italic my-2">{children}</blockquote>
                      ),
                    }}
                  >
                    {/* Improved content preprocessing to handle lists better */}
                    {message.content
                      // First, normalize all line breaks
                      .replace(/\r\n/g, '\n')
                      // Fix spacing before list items - remove extra blank lines before list items
                      .replace(/\n\n([ \t]*[*\-+]|[ \t]*\d+\.)[ \t]/g, '\n$1 ')
                      // Fix spacing before numbered lists
                      .replace(/\n\n([ \t]*\d+\.)[ \t]+/g, '\n$1 ')
                      // Now handle other paragraph spacing
                      .replace(/\n\n/g, '\n&nbsp;\n')
                      .replace(/(?<!\n)\n(?!\n)(?![ \t]*[*\-+]|[ \t]*\d+\.)/g, '\n\n')
                    }
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

                {/* Render options if available AND no role has been selected yet */}
                {message.options && message.options.length > 0 && (!hasSelectedRole || message.id !== "initial") && (
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
                        // Just pass the message ID to onOpenSidebar and let the parent component handle the toggle logic
                        onOpenSidebar(message.id);
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
