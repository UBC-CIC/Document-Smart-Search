import React from "react";

const OptionMessage = ({ text, onClick }) => {
  return (
    <button
      className="mt-3 pl-4 pr-8 py-2 whitespace-pre-line bg-customMessage border border-customMain rounded-md w-fit text-md"
      onClick={onClick}
    >
      {text}
    </button>
  );
};

export default OptionMessage;
