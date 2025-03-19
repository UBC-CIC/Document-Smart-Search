"use client"

import mapleLeaf from "../../app/maple_leaf.png"

import { useState, useRef, useEffect, useCallback } from "react"
import { Search, Send, User, Mic, MicOff, RefreshCw } from "lucide-react"
import { CitationsSidebar } from "../components/citations-sidebar"
import FeedbackComponent from "./feedback-component"
import { getFingerprint } from "@thumbmarkjs/thumbmarkjs"
import { toast, ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import Image from "next/image"
import { useRouter } from "next/navigation"

export default function SmartSearchAssistant() {
  // Add these state variables to the component
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback] = useState({ rating: 0, description: [] })
  const [isSendingFeedback, setIsSendingFeedback] = useState(false)

  // State for the conversation history
  const [messages, setMessages] = useState([
    {
      id: "initial",
      role: "assistant",
      content:
        "Hello! Please select the best role below that fits you. We can better answer your questions about Fisheries and Oceans Canada. Don't include personal details such as your name and private content.",
      options: ["Student/general public", "Researcher/scientist", "Industry professional", "Government employee"],
      user_role: "",
    },
  ])

  // State for fingerprint and session
  const [fingerprint, setFingerprint] = useState("")
  const [session, setSession] = useState(null)
  const [isCreatingSession, setIsCreatingSession] = useState(false)

  // State for the current user input
  const [userInput, setUserInput] = useState("")

  // State for loading indicator
  const [isLoading, setIsLoading] = useState(false)

  // Ref for scrolling to bottom of conversation
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  // State for the sidebar
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // State for mobile navigation
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const router = useRouter()

  // State for voice input
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef(null)

  // Function to scroll to bottom of conversation
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom()
  }, [scrollToBottom, messages, showFeedback])

  // Close sidebar when screen resizes to mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false)
      }
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Initialize fingerprint
  useEffect(() => {
    getFingerprint()
      .then((result) => {
        setFingerprint(result)
      })
      .catch((error) => {
        console.error("Error getting fingerprint:", error)
      })

    const existingSession = localStorage.getItem("dfoSession")
    if (existingSession) {
      const parsedSession = JSON.parse(existingSession)
      setSession(parsedSession)
    }
  }, [])

  // Create new session when fingerprint is available
  useEffect(() => {
    if (!fingerprint || session) return
    createNewSession(fingerprint)
  }, [fingerprint, session])

  // Fetch messages when session is available
  useEffect(() => {
    if (session) {
      fetchMessages(session)
    }
  }, [session])

  const getUserRole = (messageHistory) => {
    const firstHumanMessage = messageHistory.find((msg) => msg.role === "user" || msg.Type === "human")
    if (!firstHumanMessage) return ""

    const content = (firstHumanMessage.content || firstHumanMessage.Content || "").toLowerCase()
    if (content.includes("student") || content.includes("public")) return "public"
    if (content.includes("researcher") || content.includes("scientist")) return "public"
    if (content.includes("industry")) return "public"
    if (content.includes("government")) return "public"
    return ""
  }

  const createNewSession = async (currentFingerprint) => {
    if (!currentFingerprint) return

    setIsCreatingSession(true)
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}user/create_session?user_info=${encodeURIComponent(
          currentFingerprint,
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const sessionDataJson = await response.json()
      const sessionData = sessionDataJson[0].session_id
      setSession(sessionData)
      localStorage.setItem("dfoSession", JSON.stringify(sessionData))

      // Initialize with first message
      setMessages([
        {
          id: "initial",
          role: "assistant",
          content:
            "Hello! Please select the best role below that fits you. We can better answer your questions about Fisheries and Oceans Canada. Don't include personal details such as your name and private content.",
          options: ["Student/general public", "Researcher/scientist", "Industry professional", "Government employee"],
          user_role: "",
        },
      ])

      return sessionData
    } catch (error) {
      console.error("Error creating session:", error)
      toast.error("Failed to create session. Please try again.")
      return null
    } finally {
      setIsCreatingSession(false)
    }
  }

  const fetchMessages = async (sessionId) => {
    if (!sessionId) return

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}user/get_messages?session_id=${encodeURIComponent(sessionId)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        setMessages([
          {
            id: "initial",
            role: "assistant",
            content:
              "Hello! Please select the best role below that fits you. We can better answer your questions about Fisheries and Oceans Canada. Don't include personal details such as your name and private content.",
            options: ["Student/general public", "Researcher/scientist", "Industry professional", "Government employee"],
            user_role: "",
          },
        ])
        return
      }

      const data = await response.json()
      const messagesList = data.messages || []

      // Convert API message format to our format
      const convertedMessages = messagesList.map((msg, index) => ({
        id: index.toString(),
        role: msg.Type === "human" ? "user" : "assistant",
        content: msg.Content,
        options: msg.Options || [],
        user_role: msg.user_role,
        feedback: null,
        submittedFeedback: false,
        // Keep original properties for compatibility
        Type: msg.Type,
        Content: msg.Content,
        Options: msg.Options,
      }))

      const hasInitialMessage =
        convertedMessages.length > 0 &&
        convertedMessages[0].role === "assistant" &&
        convertedMessages[0].content.includes("Please select the best role below")

      if (!hasInitialMessage) {
        convertedMessages.unshift({
          id: "initial",
          role: "assistant",
          content:
            "Hello! Please select the best role below that fits you. We can better answer your questions about Fisheries and Oceans Canada. Don't include personal details such as your name and private content.",
          options: ["Student/general public", "Researcher/scientist", "Industry professional", "Government employee"],
          user_role: "",
        })
      }

      setMessages(convertedMessages)
    } catch (error) {
      console.error("Error fetching messages:", error)
      setMessages([
        {
          id: "initial",
          role: "assistant",
          content:
            "Hello! Please select the best role below that fits you. We can better answer your questions about Fisheries and Oceans Canada. Don't include personal details such as your name and private content.",
          options: ["Student/general public", "Researcher/scientist", "Industry professional", "Government employee"],
          user_role: "",
        },
      ])
    }
  }

  const sendMessage = async (content, isOption = false) => {
    if (!session || !fingerprint || (!content.trim() && !isOption)) return

    const currentMessages = [...messages]
    const userRole = getUserRole(currentMessages)

    if (!isOption && currentMessages.length === 1) {
      toast.error("Please select one of the options first!")
      return
    }

    setUserInput("")
    setIsLoading(true)

    try {
      const userMessage = {
        id: Date.now().toString(),
        role: "user",
        content: content,
        Type: "human",
        Content: content,
      }

      setMessages((prev) => [...prev, userMessage])

      // Send the HTTP request for text generation
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}user/text_generation?session_id=${encodeURIComponent(
          session,
        )}&user_info=${encodeURIComponent(fingerprint)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message_content: content,
            user_role: getUserRole([...currentMessages, userMessage]),
          }),
        },
      )

      if (!response.ok) {
        const errorData = await response.json()
        console.error("API error response:", errorData)
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      // Add the AI response to messages
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.content,
          options: data.options || [],
          user_role: data.user_role,
          feedback: null,
          submittedFeedback: false,
          Type: "ai",
          Content: data.content,
          Options: data.options || [],
        },
      ])
    } catch (error) {
      console.error("Error sending message:", error.message)
      toast.error(error.message || "Failed to send message. Please try again.")

      // Add error message
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "I apologize, but I encountered an error processing your request. Please try again.",
          feedback: null,
          submittedFeedback: false,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  // Replace the handleFeedback function with a simpler version that just shows the feedback component
  const handleFeedback = () => {
    setShowFeedback(true)
  }

  // Add the handleFeedbackSubmit function
  const handleFeedbackSubmit = async () => {
    if (!feedback.rating || isSendingFeedback) return

    setIsSendingFeedback(true)

    try {
      // Check for feedback fields and set them to null if they don't exist
      const feedbackRating = feedback.rating ? (feedback.rating === 5 ? "positive" : "negative") : null
      const feedbackDescription = feedback.description?.join(", ") || null

      await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}user/create_feedback?user_info=${encodeURIComponent(
          fingerprint,
        )}&session_id=${encodeURIComponent(session)}&user_role=${getUserRole(
          messages,
        )}&feedback_rating=${encodeURIComponent(
          feedbackRating,
        )}&feedback_description=${encodeURIComponent(feedbackDescription)}`,
        { method: "POST" },
      )

      // Add thank you message
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content:
            "Thank you! Your feedback will help improve the DFO SmartSearch Assistant. You may continue asking questions or start a new session.",
          feedback: null,
          submittedFeedback: false,
          Type: "ai",
          Content:
            "Thank you! Your feedback will help improve the DFO SmartSearch Assistant. You may continue asking questions or start a new session.",
        },
      ])
      setShowFeedback(false)
    } catch (error) {
      console.error("Error sending feedback:", error)
      toast.error("Failed to send feedback. Please try again.")
    } finally {
      setIsSendingFeedback(false)
    }
  }

  // Update the handleSessionReset function to also reset feedback
  const handleSessionReset = () => {
    setShowFeedback(false)
    setSession(null)
    setMessages([
      {
        id: "initial",
        role: "assistant",
        content:
          "Hello! Please select the best role below that fits you. We can better answer your questions about Fisheries and Oceans Canada. Don't include personal details such as your name and private content.",
        options: ["Student/general public", "Researcher/scientist", "Industry professional", "Government employee"],
        user_role: "",
      },
    ])
    localStorage.removeItem("dfoSession")
    createNewSession(fingerprint)
  }

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && userInput.trim()) {
        sendMessage(userInput)
      }
    }
  }

  // Voice input handling
  const startListening = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast.error("Speech recognition is not supported in your browser.")
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    recognitionRef.current = new SpeechRecognition()
    recognitionRef.current.continuous = true
    recognitionRef.current.interimResults = true
    recognitionRef.current.lang = "en-US"

    recognitionRef.current.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0])
        .map((result) => result.transcript)
        .join("")

      setUserInput(transcript)
    }

    recognitionRef.current.onerror = (event) => {
      console.error("Speech recognition error", event.error)
      setIsListening(false)
      toast.error("Error with speech recognition. Please try again.")
    }

    recognitionRef.current.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current.start()
    setIsListening(true)
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      setIsListening(false)
    }
  }

  const toggleListening = () => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  return (
    <div className="min-h-screen bg-white transition-all duration-300 flex flex-col">
      <CitationsSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 md:py-8 flex-grow flex flex-col">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-6 md:mb-8">SmartSearch Assistant</h2>

        {/* Conversation */}
        <div className="space-y-4 md:space-y-6 mb-6 md:mb-8 flex-grow overflow-y-auto">
          {messages.map((message, index) => (
            <div key={message.id} className="space-y-2">
              {message.role === "user" ? (
                <div className="flex items-start">
                  <div className="flex-grow flex justify-end">
                    <div className="inline-block max-w-[85%] sm:max-w-[80%] py-2 px-3 md:px-4 bg-gray-200 rounded-2xl text-gray-800 text-sm md:text-base">
                      {message.content}
                    </div>
                  </div>
                  <div className="ml-2 mt-1">
                    <div className="bg-white p-1.5 md:p-2 rounded-full border">
                      <User className="h-4 w-4 md:h-5 md:w-5" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex">
                  <div className="mr-2 md:mr-3 mt-1">
                    <div className="maple-leaf-container border rounded p-1 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center cursor-pointer">
                      <Image
                        src={mapleLeaf}
                        alt="Maple Leaf"
                        width={30}
                        height={30}
                        className="object-contain relative z-0"
                      />
                    </div>
                  </div>
                  <div className="flex-grow">
                    <div className="inline-block bg-gray-200 rounded-2xl py-2 px-3 md:px-4 max-w-[90%] text-sm md:text-base">
                      <p className="text-gray-800">{message.content}</p>
                    </div>

                    {/* Render options if available */}
                    {message.options && message.options.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {message.options.map((option, optIndex) => (
                          <button
                            key={`${message.id}-option-${optIndex}`}
                            onClick={() => !isLoading && sendMessage(option, true)}
                            className="inline-block bg-blue-100 hover:bg-blue-200 rounded-xl py-1.5 px-3 text-blue-800 text-sm mr-2 mb-2"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}

                    {index >= 4 && !message.content.includes("Thank you! Your feedback will help improve") && (
                      <button
                        onClick={() => setShowFeedback(true)}
                        className="mt-2 inline-block bg-blue-100 hover:bg-blue-200 rounded-xl py-1.5 px-3 text-blue-800 text-sm"
                      >
                        My task is done
                      </button>
                    )}

                    {message.role === "assistant" && (
                      <div className="flex justify-end mt-2">
                        <button
                          className="bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded flex items-center w-fit"
                          onClick={() => setIsSidebarOpen(true)}
                        >
                          <Search className="h-4 w-4 mr-1" />
                          Sources
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {showFeedback && (
            <FeedbackComponent
              feedback={feedback}
              setFeedback={setFeedback}
              onSubmit={handleFeedbackSubmit}
              isSubmitting={isSendingFeedback}
              onClose={() => setShowFeedback(false)}
            />
          )}

          {(isLoading || isCreatingSession) && (
            <div className="flex">
              <div className="mr-2 md:mr-3 mt-1">
                <div className="maple-leaf-container border rounded p-1 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center cursor-pointer">
                  <Image
                    src={mapleLeaf}
                    alt="Maple Leaf"
                    width={30}
                    height={30}
                    className="object-contain relative z-0"
                  />
                </div>
              </div>
              <div className="flex-grow">
                <div className="inline-block bg-gray-200 rounded-2xl py-2 px-3 md:px-4">
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />
                    <div
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    />
                    <div
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.4s" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="w-full max-w-6xl mx-auto px-4 py-4 space-y-4">
          <div className="relative flex items-center w-full bg-gray-100 rounded-full px-4 py-2">
            <div className="flex items-center space-x-2">
              <button onClick={handleSessionReset} className="p-1.5 hover:bg-gray-200 rounded-full">
                <RefreshCw size={20} className="text-gray-600" />
              </button>
              <button
                onClick={toggleListening}
                className={`p-1.5 hover:bg-gray-200 rounded-full ${isListening ? "text-red-500" : "text-gray-600"}`}
              >
                {isListening ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
            </div>

            <textarea
              ref={textareaRef}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleKeyPress}
              className="flex-1 bg-transparent border-none outline-none resize-none px-4 py-2 text-gray-800 placeholder-gray-500"
              placeholder="Type your query here..."
              maxLength={2096}
              rows={1}
              style={{
                minHeight: "24px",
                height: "auto",
              }}
              onInput={(e) => {
                const target = e.target
                target.style.height = "auto"
                target.style.height = `${Math.min(Math.max(target.scrollHeight, 24), 120)}px`
              }}
            />

            <button
              onClick={() => !isLoading && userInput.trim() && sendMessage(userInput)}
              className={`p-2 rounded-full ${
                isLoading || !userInput.trim()
                  ? "opacity-50 cursor-not-allowed text-gray-400"
                  : "text-gray-600 hover:bg-gray-200 cursor-pointer"
              }`}
              disabled={isLoading || !userInput.trim()}
            >
              <Send size={20} />
            </button>
          </div>

          <p className="text-center text-sm text-gray-600">This virtual assistant can make mistakes.</p>
        </div>
      </main>

      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
      />
    </div>
  )
}


