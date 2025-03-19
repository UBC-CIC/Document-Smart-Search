"use client"

import React from "react"

import { useState } from "react"
import { X } from "lucide-react"

interface FeedbackDialogProps {
  isOpen: boolean
  onClose: (wasSubmitted: boolean) => void
  feedbackType: "positive" | "negative" | null
  messageId: string | null
}

export function FeedbackDialog({ isOpen, onClose, feedbackType, messageId }: FeedbackDialogProps) {
  const [feedback, setFeedback] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Simulate API call to submit feedback
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // In a real app, you would send this data to your backend
    console.log({
      messageId,
      feedbackType, // "positive" or "negative"
      feedback,
    })

    setIsSubmitted(true)
    setIsSubmitting(false)

    // Close the dialog after a delay and mark as submitted
    setTimeout(() => {
      onClose(true) // Pass true to indicate feedback was submitted
      setFeedback("")
      setIsSubmitted(false)
    }, 2000)
  }

  const handleCancel = () => {
    onClose(false) // Pass false to indicate feedback was not submitted
    setFeedback("")
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md mx-auto">
        {!isSubmitted ? (
          <>
            <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
              <h3 className="text-lg font-medium dark:text-white">
                {feedbackType === "positive" ? "What was helpful?" : "What went wrong?"}
              </h3>
              <button
                onClick={handleCancel}
                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4">
              <div className="mb-4">
                <label htmlFor="feedback" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {feedbackType === "positive"
                    ? "Tell us what you found helpful about this response"
                    : "Tell us how we can improve this response"}
                </label>
                <textarea
                  id="feedback"
                  rows={4}
                  className="w-full px-3 py-2 border rounded-md dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Your feedback..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                ></textarea>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="mr-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !feedback.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting..." : "Submit Feedback"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="p-8 text-center">
            <div className="text-green-500 text-xl mb-2">✓</div>
            <p className="text-gray-700 dark:text-gray-300">Thank you for your feedback!</p>
          </div>
        )}
      </div>
    </div>
  )
}

