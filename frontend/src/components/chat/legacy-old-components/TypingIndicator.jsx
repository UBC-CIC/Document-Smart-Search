import React from "react";

const TypingIndicator = () => {
  return (
    <div className="flex items-center gap-2 px-5 py-3 max-w-fit rounded-md bg-gray-100 mt-2">
      <div
        className="w-3 h-3 rounded-full bg-gray-400 animate-bounce"
        style={{ animationDelay: "0ms" }}
      />
      <div
        className="w-3 h-3 rounded-full bg-gray-400 animate-bounce"
        style={{ animationDelay: "200ms" }}
      />
      <div
        className="w-3 h-3 rounded-full bg-gray-400 animate-bounce"
        style={{ animationDelay: "400ms" }}
      />
    </div>
  );
};

export default TypingIndicator;
