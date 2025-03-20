"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

const FeedbackComponent = ({ feedback, setFeedback, onSubmit, isSubmitting, onClose }) => {
  const [hoverRating, setHoverRating] = useState(0)

  const options = ["Not enough information", "Confusing to use", "Inaccurate reviews"]

  const handleOptionClick = (option) => {
    setFeedback((prev) => ({
      ...prev,
      description: prev.description.includes(option)
        ? prev.description.filter((desc) => desc !== option)
        : [...prev.description, option],
    }))
  }

  return (
    <div className="relative mt-4 mb-2 pl-4 pr-8 py-4 whitespace-pre-line bg-customMessage w-9/12 border border-customMain rounded-tr-lg rounded-br-lg rounded-bl-lg">
      <Button variant="ghost" size="icon" className="absolute top-2 right-2" onClick={onClose}>
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

      {feedback.rating > 0 && feedback.rating < 5 && (
        <>
          <p className="text-base mb-3">How can we improve?</p>
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
        </>
      )}

      <Button
        className="w-32 bg-customMain hover:bg-customMain/90"
        variant="default"
        onClick={onSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? "Sending..." : "Send Feedback"}
      </Button>
    </div>
  )
}

export default FeedbackComponent

