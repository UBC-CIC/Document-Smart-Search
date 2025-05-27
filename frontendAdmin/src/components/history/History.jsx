"use client"

import { useState, useEffect } from "react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp, Users, BookOpen, GraduationCap, Landmark } from "lucide-react"
import LoadingScreen from "../Loading/LoadingScreen"
import { fetchAuthSession } from "aws-amplify/auth"
import Session from "./Session"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

const RoleView = ({ role, sessions, onSessionClick, startDate, endDate, currentPage, setCurrentPage }) => {
  const [isOpen, setIsOpen] = useState(true)

  const getRoleIcon = (role) => {
    switch (role) {
      case "public":
        return <Users className="mr-2" />
      case "internal_researcher":
        return <BookOpen className="mr-2" />
      case "external_researcher":
        return <GraduationCap className="mr-2" />
      case "policy_maker":
        return <Landmark className="mr-2" />
      default:
        return null
    }
  }

  const getRoleLabel = (role) => {
    switch (role) {
      case "public":
        return "General Public"
      case "internal_researcher":
        return "Internal Researcher"
      case "external_researcher":
        return "External Researcher"
      case "policy_maker":
        return "Policy Maker"
      default:
        return role
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <CollapsibleTrigger asChild className="hover:cursor-pointer">
        <div className="flex items-center justify-between space-x-4 px-4 py-3 bg-gray-50 rounded-t-lg">
          <h2 className="text-lg font-semibold capitalize flex items-center">
            {getRoleIcon(role)}
            {getRoleLabel(role)} View
          </h2>
          <Button variant="ghost" size="sm" className="w-9 p-0">
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className="sr-only">Toggle</span>
          </Button>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2">
        {sessions.map((session) => (
          <Button
            key={session.session_id}
            className="w-full justify-start font-normal hover:bg-gray-100 p-0 h-auto"
            variant="ghost"
            onClick={() => onSessionClick(role, session)}
          >
            <div className="w-full bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
              <div className="flex flex-col space-y-3">
                <div className="flex items-center space-x-2">
                  <span className="text-gray-500">Session ID:</span>
                  <code className="bg-gray-50 px-2 py-1 rounded text-sm">{session.session_id}</code>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-500">Last Message:</span>
                  <span className="text-sm">{formatDate(session.last_message_time)}</span>
                </div>
                {session.second_message_details && (
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-500">Initial Question:</span>
                    <span className="text-sm">{session.second_message_details}</span>
                  </div>
                )}
              </div>
            </div>
          </Button>
        ))}
        {/* Pagination controls */}
        <div className="flex justify-between mt-4">
          <Button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span>Page {currentPage}</span>
          <Button
            onClick={() => setCurrentPage((prev) => prev + 1)}
            disabled={sessions.length === 0}
          >
            Next
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default function History() {
  const [publicSessions, setPublicSessions] = useState([])
  const [internalResearcherSessions, setInternalResearcherSessions] = useState([])
  const [externalResearcherSessions, setExternalResearcherSessions] = useState([])
  const [policyMakerSessions, setPolicyMakerSessions] = useState([])
  const [selectedSession, setSelectedSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [startDate, setStartDate] = useState(null)
  const [endDate, setEndDate] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchSessions = async (userRole, setSession) => {
    try {
      const session = await fetchAuthSession()
      const token = session.tokens.idToken
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/conversation_sessions?user_role=${encodeURIComponent(userRole)}&start_date=${startDate ? startDate.toISOString() : ''}&end_date=${endDate ? endDate.toISOString() : ''}&page=${currentPage}`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      data.sort((a, b) => new Date(b.last_message_time) - new Date(a.last_message_time))
      setSession(data)
    } catch (error) {
      console.error(`Error fetching ${userRole} sessions:`, error)
      setSession([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const loadSessions = async () => {
      try {
        setLoading(true)
        await Promise.all([
          fetchSessions("public", setPublicSessions),
          fetchSessions("internal_researcher", setInternalResearcherSessions),
          fetchSessions("external_researcher", setExternalResearcherSessions),
          fetchSessions("policy_maker", setPolicyMakerSessions),
        ])
      } catch (error) {
        console.error("Error loading sessions:", error)
      }
    }

    loadSessions()
  }, [startDate, endDate, currentPage])

  const handleDownloadAllData = async () => {
    setDownloadLoading(true)
    const allSessions = [
      ...publicSessions,
      ...internalResearcherSessions,
      ...externalResearcherSessions,
      ...policyMakerSessions
    ]
    const csvData = []

    for (const session of allSessions) {
      try {
        const authSession = await fetchAuthSession()
        const token = authSession.tokens.idToken

        const messagesResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/conversation_messages?session_id=${encodeURIComponent(session.session_id)}`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        )

        if (!messagesResponse.ok) {
          throw new Error(`HTTP error! status: ${messagesResponse.status}`)
        }

        const messagesData = await messagesResponse.json()
        const messages = messagesData.messages

        messages.forEach((message) => {
          csvData.push({
            SessionID: session.session_id,
            Role: session.role,
            MessageType: message.Type,
            MessageContent: message.Content,
            MessageOptions: JSON.stringify(message.Options),
            Timestamp: message.Timestamp,
          })
        })
      } catch (error) {
        console.error("Error fetching session data:", error)
      }
    }

    const csvString =
      Object.keys(csvData[0]).join(",") + "\n" + csvData.map((row) => Object.values(row).join(",")).join("\n")

    const link = document.createElement("a")
    link.href = URL.createObjectURL(new Blob([csvString], { type: "text/csv" }))
    link.download = "conversation_data.csv"
    link.click()

    setDownloadLoading(false)
  }

  const handleSessionClick = (role, session) => {
    setSelectedSession({ role, ...session })
  }

  if (selectedSession) {
    return <Session session={selectedSession} onBack={() => setSelectedSession(null)} from={"History"} />
  }

  if (loading) {
    return <LoadingScreen />
  }

  const roles = [
    { key: "public", label: "General Public", sessions: publicSessions, icon: <Users className="mr-1 h-4 w-4" /> },
    { key: "internal_researcher", label: "Internal Researcher", sessions: internalResearcherSessions, icon: <BookOpen className="mr-1 h-4 w-4" /> },
    { key: "external_researcher", label: "External Researcher", sessions: externalResearcherSessions, icon: <GraduationCap className="mr-1 h-4 w-4" /> },
    { key: "policy_maker", label: "Policy Maker", sessions: policyMakerSessions, icon: <Landmark className="mr-1 h-4 w-4" /> },
  ]

  return (
    <div className="w-full mx-auto p-4 mb-8">
      <Tabs defaultValue="public" className="w-full">
        <TabsList className="mb-4 flex flex-wrap gap-2 rounded-md bg-gray-50">
          {roles.map((role) => (
            <TabsTrigger key={role.key} value={role.key} className="flex items-center gap-1">
              {role.icon}
              {role.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Date range filter */}
        <div className='flex flex-col background-white p-4 rounded-lg shadow-sm border'>
          <p className='mb-3' style={{color:'GrayText'}}>Filter by Date Range</p>
        <div className='flex justify-between items-center w-full'>
        <div className="flex space-x-4 ">
          <input
            type="date"
            value={startDate ? startDate.toISOString().split("T")[0] : ""}
            onChange={(e) => setStartDate(new Date(e.target.value))}
            className="p-2 border rounded"
          />
          <input
            type="date"
            value={endDate ? endDate.toISOString().split("T")[0] : ""}
            onChange={(e) => setEndDate(new Date(e.target.value))}
            className="p-2 border rounded"
          />
          <Button onClick={() => setCurrentPage(1)}>Apply Date Range</Button>
          
        </div>
              <Button
        onClick={handleDownloadAllData}
        disabled={downloadLoading}
        className="bg-adminMain hover:bg-adminHover"
      >
        {downloadLoading ? "Downloading..." : "Download All Messages"}
      </Button>
      </div>
      </div>
        

        {roles.map((role) => (
          <TabsContent key={role.key} value={role.key}>
            <RoleView
              role={role.key}
              sessions={role.sessions}
              onSessionClick={handleSessionClick}
              startDate={startDate}
              endDate={endDate}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
