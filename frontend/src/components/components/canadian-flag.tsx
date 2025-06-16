import React from "react";

export const CanadianFlag: React.FC = () => (
  <svg
    width="30"
    height="30"
    viewBox="0 0 30 30"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="30" height="30" fill="white" />
    <rect x="7.5" width="15" height="30" fill="#FF0000" />
    <path
      d="M15 7.5L16.5 12L21 12.75L18 16.5L19.5 21L15 18.75L10.5 21L12 16.5L9 12.75L13.5 12L15 7.5Z"
      fill="#FF0000"
    />
  </svg>
);

export default CanadianFlag;
