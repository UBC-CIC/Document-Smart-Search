"use client"

import mapleLeaf from "../../app/maple_leaf.png"

import { useState, useRef, useEffect, useCallback } from "react"
import { Search, Send, User, Mic, MicOff, RefreshCw, Download, Menu, X } from "lucide-react"
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const menuRef = useRef(null)

  // State for the conversation history
  const [messages, setMessages] = useState([
    {
      id: "initial",
      role: "assistant",
      content:
        "Hello! Please select the best role below that fits you. We can better answer your questions about Fisheries and Oceans Canada. Don't include personal details such as your name and private content.",
      options: ["General/Public", "Government employee/Admin"],
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

  const router = useRouter()

  // State for voice input
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef(null)

  // Navigation items with icons
  const navItems = [
    {
      id: "chat",
      label: "Smart Assistant",
      path: "/chat",
      icon: User,
    },
    {
      id: "document-search",
      label: "Document Search",
      path: "/document-search",
      icon: Search,
    },
    {
      id: "topic-trends",
      label: "Topic Trends",
      path: "/topic-trends",
      icon: RefreshCw,
    },
  ]

  // Function to scroll to bottom of conversation
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom()
  }, [scrollToBottom, messages, showFeedback])

  // Check if mobile and close sidebar when screen resizes to mobile
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false)
      }
    }

    // Initial check
    checkIfMobile()

    // Add event listener
    window.addEventListener("resize", checkIfMobile)

    // Cleanup
    return () => window.removeEventListener("resize", checkIfMobile)
  }, [])

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMobileMenuOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
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
    if (content.includes("public")) return "public"
    if (content.includes("government")) return "admin"
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
          options: ["General/Public", "Government employee/Admin"],
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
            options: ["General/Public", "Government employee/Admin"],
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
          options: ["General/Public", "Government employee/Admin"],
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
          options: ["General/Public", "Government employee/Admin"],
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

    const userRole = getUserRole(messages) // Ensure this is correctly retrieved

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}/user/create_feedback?user_info=${encodeURIComponent(
          fingerprint,
        )}&session_id=${encodeURIComponent(session)}&user_role=${encodeURIComponent(
          userRole,
        )}&feedback_rating=${encodeURIComponent(
          feedback.rating,
        )}&feedback_description=${encodeURIComponent(feedback.description?.join(", "))}`,
        { method: "POST" },
      )

      console.log("Feedback response:", await response.json()) // Debugging line
      if (!response.ok) throw new Error("Failed to submit feedback")

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content:
            "Thank you! Your feedback will help improve the DFO SmartSearch Assistant. You may continue asking questions or start a new session.",
        },
      ])

      setShowFeedback(false)
    } catch (error) {
      console.error("Error submitting feedback:", error)
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
        options: ["General/Public", "Government employee/Admin"],
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

  // New function to download chat history
  const downloadChatHistory = () => {
    // Format the chat messages into a readable text format
    const chatContent = messages
      .map((message) => {
        const role = message.role === "user" ? "User" : "Assistant"
        return `${role}: ${message.content}`
      })
      .join("\n\n")

    // Create a title with date and time
    const date = new Date()
    const formattedDate = date.toLocaleDateString()
    const formattedTime = date.toLocaleTimeString()
    const title = `DFO SmartSearch Chat - ${formattedDate} ${formattedTime}`

    // Combine title and content
    const fullContent = `${title}\n\n${chatContent}`

    // Create a Blob with the chat content
    const blob = new Blob([fullContent], { type: "text/plain" })

    // Create a download link and trigger the download
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `dfo-chat-${date.getTime()}.txt`
    document.body.appendChild(a)
    a.click()

    // Clean up
    URL.revokeObjectURL(url)
    document.body.removeChild(a)

    toast.success("Chat history downloaded successfully!")
  }

  const handleNavigation = (path) => {
    router.push(path)
    setIsMobileMenuOpen(false)
  }

  return (
    <div className="min-h-screen bg-white transition-all duration-300 flex flex-col">
      <CitationsSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 md:py-8 flex-grow flex flex-col">
        <div className="relative mb-6 md:mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-center">SmartSearch Assistant</h2>
        </div>

        {/* Conversation */}
        <div className={`space-y-4 md:space-y-6 ${isMobile ? "mb-24" : "mb-6 md:mb-8"} flex-grow overflow-y-auto`}>
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
                        src={mapleLeaf || "/placeholder.svg"}
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
                    src={mapleLeaf || "/placeholder.svg"}
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

        {/* Desktop Input Area */}
        {!isMobile && (
          <div className="w-full max-w-6xl mx-auto px-4 py-4 space-y-4">
            <div className="relative flex items-center w-full bg-gray-100 rounded-full px-4 py-2">
              <div className="flex items-center space-x-2">
                <button onClick={handleSessionReset} className="p-1.5 hover:bg-gray-200 rounded-full">
                  <RefreshCw size={20} className="text-gray-600" />
                </button>
                {messages.length > 1 && (
                  <button
                    onClick={downloadChatHistory}
                    className="p-1.5 hover:bg-gray-200 rounded-full text-gray-600"
                    title="Download Chat"
                  >
                    <Download size={20} />
                  </button>
                )}
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
        )}

        {/* Mobile Input Area with Menu Button */}
        {isMobile && (
          <div className="fixed bottom-4 left-0 right-0 z-40 px-4">
            <div className="flex items-center max-w-3xl mx-auto">
              {/* Chat Input */}
              <div className="flex-1 bg-gray-100 rounded-full shadow-md flex items-center px-4 py-2 mr-3">
                <button onClick={handleSessionReset} className="p-1.5 text-gray-600">
                  <RefreshCw size={20} />
                </button>
                <button
                  onClick={toggleListening}
                  className={`p-1.5 ml-2 ${isListening ? "text-red-500" : "text-gray-600"}`}
                >
                  {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                </button>

                <textarea
                  ref={textareaRef}
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="flex-1 bg-transparent border-none outline-none resize-none px-3 py-1 text-gray-800 placeholder-gray-500"
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
                  className={`p-1.5 ${
                    isLoading || !userInput.trim() ? "opacity-50 cursor-not-allowed text-gray-400" : "text-gray-600"
                  }`}
                  disabled={isLoading || !userInput.trim()}
                >
                  <Send size={20} />
                </button>
              </div>

              {/* Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="bg-blue-600 text-white p-3 rounded-full shadow-lg flex items-center justify-center"
                aria-label="Toggle menu"
                ref={menuRef}
              >
                {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>

            {/* Move the disclaimer text below the input area */}
            <div className="text-center mt-2">
              <p className="text-xs text-gray-500 max-w-3xl mx-auto">This virtual assistant can make mistakes.</p>
            </div>

            {/* Menu Items that emerge from the button */}
            {isMobileMenuOpen && (
              <div className="fixed z-40 bottom-20 right-4 flex flex-col-reverse items-end space-y-reverse space-y-2">
                {navItems.map((item, index) => {
                  const Icon = item.icon
                  const isActive = router.pathname === item.path

                  return (
                    <div
                      key={item.id}
                      className="flex items-center animate-fadeIn"
                      style={{
                        animationDelay: `${index * 50}ms`,
                        transform: `translateY(${isMobileMenuOpen ? "0" : "10px"})`,
                        opacity: isMobileMenuOpen ? 1 : 0,
                        transition: `transform 200ms ease, opacity 200ms ease`,
                        transitionDelay: `${index * 50}ms`,
                      }}
                    >
                      <div
                        className={`
                        mr-2 px-3 py-2 rounded-lg shadow-md bg-white
                        ${isActive ? "text-blue-600 font-medium" : "text-gray-700"}
                      `}
                      >
                        {item.label}
                      </div>
                      <button
                        onClick={() => handleNavigation(item.path)}
                        className={`
                          p-3 rounded-full shadow-md flex items-center justify-center
                          ${isActive ? "bg-blue-600 text-white" : "bg-white text-gray-700"}
                        `}
                      >
                        <Icon className="h-5 w-5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Overlay when menu is open */}
            {isMobileMenuOpen && (
              <div className="fixed inset-0 bg-black bg-opacity-30 z-30" onClick={() => setIsMobileMenuOpen(false)} />
            )}
          </div>
        )}
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

