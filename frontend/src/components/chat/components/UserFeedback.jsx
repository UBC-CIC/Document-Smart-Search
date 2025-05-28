"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

const FeedbackComponent = ({ feedback, setFeedback, onSubmit, isSubmitting, onClose }) => {
  const [hoverRating, setHoverRating] = useState(0);
  const [customFeedback, setCustomFeedback] = useState("");

  // Clear custom feedback when component mounts
  useEffect(() => {
    setCustomFeedback("");
  }, []);

  const options = ["Not enough information", "Confusing to use", "Inaccurate reviews"]

  const handleOptionClick = (option) => {
    setFeedback((prev) => ({
      ...prev,
      description: prev.description.includes(option)
        ? prev.description.filter((desc) => desc !== option)
        : [...prev.description, option],
    }))
  }

  const handleCustomFeedbackChange = (e) => {
    setCustomFeedback(e.target.value)
  }

  const handleSubmit = () => {
    // Create a new feedback object that includes custom feedback
    const updatedFeedback = {...feedback};
    
    // Add custom feedback to description if it exists
    if (customFeedback.trim()) {
      updatedFeedback.description = [...feedback.description, customFeedback.trim()];
      
      // Update the parent component's state
      setFeedback(updatedFeedback);
    }
    
    // Pass the updated feedback directly to ensure it includes custom feedback
    onSubmit(updatedFeedback);
  };

  // Update the handleClose function to clear state
  const handleClose = () => {
    // Reset local state
    setCustomFeedback("");
    setHoverRating(0);
    
    // Call the parent onClose handler
    onClose();
  };

  return (
    <div className="relative -mt-4 mb-2 pl-4 pr-8 py-4 whitespace-pre-line bg-customMessage w-9/12 mx-auto border border-customMain rounded-tr-lg rounded-br-lg rounded-bl-lg">
      <Button variant="ghost" size="icon" className="absolute top-2 right-2" onClick={handleClose}>
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </Button>
      <Image className="mb-2" src="/logo.png" alt="logo" width={40} height={40} />
      <h2 className="text-base font-normal text-gray-900 mb-4">
        How was your experience with the DFO Smart Search?
      </h2>
      <div className="flex gap-1 mb-6">
        {[...Array(5)].map((_, index) => (
          <button
            key={index}
            onClick={() => setFeedback((prev) => ({ ...prev, rating: index + 1 }))}
            onMouseEnter={() => setHoverRating(index + 1)}
            onMouseLeave={() => setHoverRating(0)}
            className="text-2xl focus:outline-none"
          >
            <span className={`${(hoverRating || feedback.rating) > index ? "text-red-500" : "text-gray-200"}`}>★</span>
          </button>
        ))}
        <div className="flex items-center gap-2 ml-2">
          <span className="text-sm text-gray-500">
            {feedback.rating === 0 ? "Not Good" : feedback.rating === 5 ? "Great" : ""}
          </span>
        </div>
      </div>

      {feedback.rating > 0 && (
        <>
          <p className="text-base mb-3">How can we improve?</p>
          {feedback.rating < 5 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {options.map((option) => (
                <button
                  key={option}
                  onClick={() => handleOptionClick(option)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    feedback.description.includes(option)
                      ? "bg-gray-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          
          {/* Custom feedback textarea */}
          <div className="mb-4">
            <textarea 
              className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-customMain"
              placeholder="Add your own feedback here..."
              rows="3"
              value={customFeedback}
              onChange={handleCustomFeedbackChange}
            ></textarea>
          </div>
        </>
      )}

      <Button
        className="w-32 bg-customMain hover:bg-customMain/90"
        variant="default"
        onClick={handleSubmit}
        disabled={isSubmitting || feedback.rating === 0}
      >
        {isSubmitting ? "Sending..." : "Send Feedback"}
      </Button>
    </div>
  )
}

export default FeedbackComponent

