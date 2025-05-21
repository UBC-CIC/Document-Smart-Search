import Image from "next/image";
import React from "react";

const UserMessage = ({ text }) => {
    return (
      <div className="flex justify-end">
        <div className="mt-2 pl-4 pr-8 py-2 bg-customMessage text-right w-fit border border-customMain rounded-bl-lg rounded-tl-lg rounded-br-lg ml-auto">
          {text}
        </div>
      </div>
    );
  };
  

export default UserMessage;
