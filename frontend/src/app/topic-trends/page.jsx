"use client";

import { useState } from "react";
import TopicTrends from "@/components/analytics/TopicTrends";
import MandateTrends from "@/components/analytics/MandateTrends";


export default function TopicTrendsPage() {
  const [activeTab, setActiveTab] = useState("Topic");

  const renderContent = () => {
    switch (activeTab) {
      case "Topic":
        return <TopicTrends />;
      case "Mandate":
        return <MandateTrends />;
      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-4">
      <div className="flex border-b mb-4">
        {["Topic", "Mandate"].map((tab) => (
          <button
            key={tab}
            className={`px-4 py-2 font-medium ${
              activeTab === tab
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      {renderContent()}
    </div>
  );
}
