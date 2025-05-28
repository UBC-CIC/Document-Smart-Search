import { useState, useEffect } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Users, BookOpen, GraduationCap, Landmark } from "lucide-react";
import LoadingScreen from "../Loading/LoadingScreen";
import { fetchAuthSession } from "aws-amplify/auth";
import Session from "./Session";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Pagination from '@mui/material/Pagination'; // Importing MUI Pagination
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const RoleView = ({ role, sessions, onSessionClick, startDate, endDate, currentPage, setCurrentPage, totalPages }) => {
  const [isOpen, setIsOpen] = useState(true);

  const getRoleIcon = (role) => {
    switch (role) {
      case "public":
        return <Users className="mr-2" />;
      case "internal_researcher":
        return <BookOpen className="mr-2" />;
      case "external_researcher":
        return <GraduationCap className="mr-2" />;
      case "policy_maker":
        return <Landmark className="mr-2" />;
      default:
        return null;
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case "public":
        return "General Public";
      case "internal_researcher":
        return "Internal Researcher";
      case "external_researcher":
        return "External Researcher";
      case "policy_maker":
        return "Policy Maker";
      default:
        return role;
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    if (isNaN(date)) return "Invalid Date";

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;

    return `${day}/${month}/${year}, ${hours}:${minutes} ${ampm}`;
  };

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
        {/* MUI Pagination controls */}
        <div className="flex justify-center mt-4">
          <Pagination
            count={totalPages}
            page={currentPage}
            onChange={(event, value) => setCurrentPage(value)}
            siblingCount={1}
            boundaryCount={1}
            color="primary"
            sx={{
              "& .MuiPaginationItem-root": {
                color: "#0f172a",
              },
              "& .MuiPaginationItem-root.Mui-selected": {
                backgroundColor: "#0f172a",
                color: "#ffffff",
                "&:hover": {
                  backgroundColor: "#0f172a",
                },
              },
              "& .MuiPaginationItem-root.MuiPaginationItem-previousNext": {
                color: "#0f172a",
              },
            }}
          />


        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default function History() {
  const [publicSessions, setPublicSessions] = useState([]);
  const [internalResearcherSessions, setInternalResearcherSessions] = useState([]);
  const [externalResearcherSessions, setExternalResearcherSessions] = useState([]);
  const [policyMakerSessions, setPolicyMakerSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  // Separate state for pagination for each role/tab
  const [publicPage, setPublicPage] = useState(1);
  const [internalResearcherPage, setInternalResearcherPage] = useState(1);
  const [externalResearcherPage, setExternalResearcherPage] = useState(1);
  const [policyMakerPage, setPolicyMakerPage] = useState(1);

  const [publicTotalPages, setPublicTotalPages] = useState(1);
  const [internalResearcherTotalPages, setInternalResearcherTotalPages] = useState(1);
  const [externalResearcherTotalPages, setExternalResearcherTotalPages] = useState(1);
  const [policyMakerTotalPages, setPolicyMakerTotalPages] = useState(1);

  const fetchSessions = async (userRole, setSession, currentPage, setTotalPages) => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;

      const startDateStr = startDate ? startDate.toISOString() : "";
      const endDateStr = endDate ? endDate.toISOString() : "";

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/conversation_sessions?user_role=${encodeURIComponent(userRole)}&start_date=${startDateStr}&end_date=${endDateStr}&page=${currentPage}&limit=10`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (Array.isArray(data.sessions)) {
        data.sessions.sort((a, b) => new Date(b.last_message_time) - new Date(a.last_message_time));
        setSession(data.sessions);
        setTotalPages(data.totalPages); // Set the total pages for each role tab
      } else {
        console.error("API response does not contain an array of sessions:", data);
        setSession([]);
      }
    } catch (error) {
      console.error(`Error fetching ${userRole} sessions:`, error);
      setSession([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadSessions = async () => {
      try {
        setLoading(true);
        await Promise.all([
          fetchSessions("public", setPublicSessions, publicPage, setPublicTotalPages),
          fetchSessions("internal_researcher", setInternalResearcherSessions, internalResearcherPage, setInternalResearcherTotalPages),
          fetchSessions("external_researcher", setExternalResearcherSessions, externalResearcherPage, setExternalResearcherTotalPages),
          fetchSessions("policy_maker", setPolicyMakerSessions, policyMakerPage, setPolicyMakerTotalPages),
        ]);
      } catch (error) {
        console.error("Error loading sessions:", error);
      }
    };

    loadSessions();
  }, [startDate, endDate, publicPage, internalResearcherPage, externalResearcherPage, policyMakerPage]);

  const handleDownloadAllData = async () => {
    setDownloadLoading(true);
    const allSessions = [
      ...publicSessions,
      ...internalResearcherSessions,
      ...externalResearcherSessions,
      ...policyMakerSessions,
    ];
    const csvData = [];

    for (const session of allSessions) {
      try {
        const authSession = await fetchAuthSession();
        const token = authSession.tokens.idToken;

        const messagesResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/conversation_messages?session_id=${encodeURIComponent(session.session_id)}`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );

        if (!messagesResponse.ok) {
          throw new Error(`HTTP error! status: ${messagesResponse.status}`);
        }

        const messagesData = await messagesResponse.json();
        const messages = messagesData.messages;

        messages.forEach((message) => {
          csvData.push({
            SessionID: session.session_id,
            Role: session.role,
            MessageType: message.Type,
            MessageContent: message.Content,
            MessageOptions: JSON.stringify(message.Options),
            Timestamp: message.Timestamp,
          });
        });
      } catch (error) {
        console.error("Error fetching session data:", error);
      }
    }

    const csvString =
      Object.keys(csvData[0]).join(",") + "\n" + csvData.map((row) => Object.values(row).join(",")).join("\n");

    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csvString], { type: "text/csv" }));
    link.download = "conversation_data.csv";
    link.click();

    setDownloadLoading(false);
  };

  const handleSessionClick = (role, session) => {
    setSelectedSession({ role, ...session });
  };

  if (selectedSession) {
    return <Session session={selectedSession} onBack={() => setSelectedSession(null)} from={"History"} />;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  const roles = [
    { key: "public", label: "General Public", sessions: publicSessions, icon: <Users className="mr-1 h-4 w-4" /> },
    { key: "internal_researcher", label: "Internal Researcher", sessions: internalResearcherSessions, icon: <BookOpen className="mr-1 h-4 w-4" /> },
    { key: "external_researcher", label: "External Researcher", sessions: externalResearcherSessions, icon: <GraduationCap className="mr-1 h-4 w-4" /> },
    { key: "policy_maker", label: "Policy Maker", sessions: policyMakerSessions, icon: <Landmark className="mr-1 h-4 w-4" /> },
  ];

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

        {/* Download button inside the filter section */}
        <div className="flex flex-col background-white p-4 rounded-lg shadow-sm border mb-4">
          <div className="flex justify-between items-center w-full">
            <div className="flex space-x-4">
              <div className="flex flex-col">
  <label className="block text-sm mb-1">Start Date</label>
  <DatePicker
    selected={startDate}
    onChange={(date) => setStartDate(date)}
    placeholderText="dd/mm/yyyy"
    className="p-2 border rounded"
    dateFormat="dd/MM/yyyy"
  />
</div>

<div className="flex flex-col">
  <label className="block text-sm mb-1">End Date</label>
  <DatePicker
    selected={endDate}
    onChange={(date) => setEndDate(date)}
    placeholderText="dd/mm/yyyy"
    className="p-2 border rounded"
    dateFormat="dd/MM/yyyy"
  />
</div>

 
              {/* <Button onClick={() => setPublicPage(1)}>Apply Date Range</Button> */}
            </div>
              <Button
                onClick={handleDownloadAllData}
                disabled={downloadLoading}
                className="bg-adminMain hover:bg-adminHover flex items-center gap-2"
              >
                <FileDownloadIcon />
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
              currentPage={role.key === "public" ? publicPage : role.key === "internal_researcher" ? internalResearcherPage : role.key === "external_researcher" ? externalResearcherPage : policyMakerPage}
              setCurrentPage={role.key === "public" ? setPublicPage : role.key === "internal_researcher" ? setInternalResearcherPage : role.key === "external_researcher" ? setExternalResearcherPage : setPolicyMakerPage}
              totalPages={role.key === "public" ? publicTotalPages : role.key === "internal_researcher" ? internalResearcherTotalPages : role.key === "external_researcher" ? externalResearcherTotalPages : policyMakerTotalPages}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
