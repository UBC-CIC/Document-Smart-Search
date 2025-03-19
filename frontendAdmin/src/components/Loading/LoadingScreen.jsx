"use client"
import React from "react";

const LoadingScreen = () => {
  return (
    <div className="flex items-center justify-center h-[80vh] w-screen">
      <div className="relative w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
};

export default LoadingScreen;
