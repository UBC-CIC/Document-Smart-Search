"use client"

import { useState, useEffect } from "react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp, Users, ShieldCheck, BookOpen, GraduationCap, Landmark } from "lucide-react"
import LoadingScreen from "../Loading/LoadingScreen"
import { fetchAuthSession } from "aws-amplify/auth"
import Session from "./Session"

const RoleView = ({ role, sessions, onSessionClick }) => {
  const [isOpen, setIsOpen] = useState(true)

  const getRoleIcon = (role) => {
    switch (role) {
      case "public":
        return <Users className="mr-2" />
      // case "admin":
      //   return <ShieldCheck className="mr-2" />
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
      // case "admin":
      //   return "Admin"
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
      </CollapsibleContent>
    </Collapsible>
  )
}

export default function History() {
  const [publicSessions, setPublicSessions] = useState([])
  // const [adminSessions, setAdminSessions] = useState([])
  const [internalResearcherSessions, setInternalResearcherSessions] = useState([])
  const [externalResearcherSessions, setExternalResearcherSessions] = useState([])
  const [policyMakerSessions, setPolicyMakerSessions] = useState([])
  const [selectedSession, setSelectedSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloadLoading, setDownloadLoading] = useState(false)

  useEffect(() => {
    const fetchSessions = async (userRole, setSession) => {
      try {
        const session = await fetchAuthSession()
        const token = session.tokens.idToken
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/conversation_sessions?user_role=${encodeURIComponent(
            userRole,
          )}`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          },
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()
        console.log(data)
        data.sort((a, b) => new Date(b.last_message_time) - new Date(a.last_message_time))
        setSession(data)
      } catch (error) {
        console.error(`Error fetching ${userRole} sessions:`, error)
        setSession([])
      } finally {
        setLoading(false)
      }
    }

    const loadSessions = async () => {
      try {
        setLoading(true)
        await Promise.all([
          fetchSessions("public", setPublicSessions), 
          // fetchSessions("admin", setAdminSessions),
          fetchSessions("internal_researcher", setInternalResearcherSessions),
          fetchSessions("external_researcher", setExternalResearcherSessions),
          fetchSessions("policy_maker", setPolicyMakerSessions)
        ])
      } catch (error) {
        console.error("Error loading sessions:", error)
      }
    }

    loadSessions()
  }, [])

  const handleDownloadAllData = async () => {
    setDownloadLoading(true)
    const allSessions = [
      ...publicSessions, 
      // ...adminSessions,
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
          `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/conversation_messages?session_id=${encodeURIComponent(
            session.session_id,
          )}`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          },
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

  return (
    <div className="w-full mx-auto space-y-4 p-4 overflow-y-auto mb-8">
      <RoleView role="public" sessions={publicSessions} onSessionClick={handleSessionClick} />
      <RoleView role="internal_researcher" sessions={internalResearcherSessions} onSessionClick={handleSessionClick} />
      <RoleView role="external_researcher" sessions={externalResearcherSessions} onSessionClick={handleSessionClick} />
      <RoleView role="policy_maker" sessions={policyMakerSessions} onSessionClick={handleSessionClick} />
      {/* <RoleView role="admin" sessions={adminSessions} onSessionClick={handleSessionClick} /> */}
      <Button
        onClick={handleDownloadAllData}
        disabled={downloadLoading}
        className="mb-4 bg-adminMain hover:bg-adminHover"
      >
        {downloadLoading ? "Downloading..." : "Download All Messages"}
      </Button>
    </div>
  )
}

