import React, { useState, useRef } from "react";
import Image from "next/image";
import Markdown from "react-markdown";
import { Copy, Volume2, StopCircle } from "lucide-react";

const MainMessage = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechSynthesisRef = useRef(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSpeak = () => {
    // If already speaking, stop
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const msg = new SpeechSynthesisUtterance(text);
    
    // Add event listeners to track speaking state
    msg.onstart = () => setIsSpeaking(true);
    msg.onend = () => setIsSpeaking(false);
    
    // Store reference to allow potential manual cancellation
    speechSynthesisRef.current = msg;
    
    window.speechSynthesis.speak(msg);
  };

  return (
    <div className="flex flex-col w-9/12">
      <div className="mt-4 mb-2 pl-4 pr-8 py-4 whitespace-pre-line bg-customMessage border border-customMain rounded-tr-lg rounded-br-lg rounded-bl-lg">
        <Image
          className="mb-2"
          src="/logo.png"
          alt="logo"
          width={40}
          height={40}
        />
        <Markdown
          className="text-md"
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
          {text}
        </Markdown>
      </div>
      <div className="flex space-x-4 mt-2 ml-2">
        <button
          onClick={handleCopy}
          className="text-gray-600 hover:text-black transition-colors flex items-center"
          aria-label="Copy message"
        >
          {copied ? (
            <span className="text-xs text-black mr-1">Copied!</span>
          ) : (
            <Copy size={20} className="mr-1" />
          )}
          {!copied && <span className="text-xs">Copy</span>}
        </button>
        <button
          onClick={handleSpeak}
          className="text-gray-600 hover:text-black transition-colors flex items-center"
          aria-label={isSpeaking ? "Stop speaking" : "Read message aloud"}
        >
          {isSpeaking ? (
            <>
              <StopCircle size={20} className="mr-1" />
              <span className="text-xs">Stop</span>
            </>
          ) : (
            <>
              <Volume2 size={20} className="mr-1" />
              <span className="text-xs">Speak</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default MainMessage;