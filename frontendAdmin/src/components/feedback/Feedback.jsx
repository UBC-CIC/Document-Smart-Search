"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  BookOpen,
  GraduationCap,
  Landmark,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import LoadingScreen from "../Loading/LoadingScreen";
import { fetchAuthSession } from "aws-amplify/auth";
import Session from "../history/Session";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Pagination from "@mui/material/Pagination";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const getRoleIcon = (role) => {
  switch (role) {
    case "public":
      return <Users className="mr-1 h-4 w-4" />;
    case "internal_researcher":
      return <BookOpen className="mr-1 h-4 w-4" />;
    case "external_researcher":
      return <GraduationCap className="mr-1 h-4 w-4" />;
    case "policy_maker":
      return <Landmark className="mr-1 h-4 w-4" />;
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

const FeedbackView = ({ role, feedbackData, onFeedbackClick }) => {
  const [isOpen, setIsOpen] = useState(true);

  if (
    !feedbackData ||
    !Array.isArray(feedbackData.feedback_details) ||
    feedbackData.feedback_details.length === 0
  ) {
    return (
      <div className="w-full">
        <div className="flex items-center space-x-4 px-4 py-3 bg-gray-50 rounded-t-lg">
          <div className="flex items-center">
            {getRoleIcon(role)}
            <h2 className="text-lg font-semibold capitalize">
              {getRoleLabel(role)} Feedback
            </h2>
            <span className="ml-2 text-gray-500">(Avg Rating: 0, Total: 0)</span>
          </div>
        </div>
        <div className="p-8 text-center border-b border-x rounded-b-lg bg-white">
          <p className="text-gray-500">
            No feedback available for this role yet
          </p>
        </div>
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <CollapsibleTrigger asChild className="hover:cursor-pointer">
        <div className="flex items-center justify-between space-x-4 px-4 py-3 bg-gray-50 rounded-t-lg">
          <div className="flex items-center">
            {getRoleIcon(role)}
            <h2 className="text-lg font-semibold capitalize">
              {getRoleLabel(role)} Feedback
            </h2>
            <span className="ml-2 text-gray-500">
              (Avg Rating: {Number(feedbackData.average_rating).toFixed(1)},
              Total: {feedbackData.feedback_count})
            </span>
          </div>
          <Button variant="ghost" size="sm" className="w-9 p-0">
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2">
        {feedbackData.feedback_details.map((feedback, index) => (
          <Button
            key={feedback.feedback_id + index}
            className="w-full justify-start font-normal hover:bg-gray-100 p-0 h-auto"
            variant="ghost"
            onClick={() => onFeedbackClick(feedback.session_id)}
          >
            <div className="w-full bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
              <div className="flex flex-col space-y-3">
                <div className="flex items-center space-x-2">
                  <span className="text-gray-500">Session ID:</span>
                  <code className="bg-gray-50 px-2 py-1 rounded text-sm">
                    {feedback.session_id}
                  </code>
                  <div
                    className={`ml-2 px-2 py-1 rounded text-xs font-semibold ${
                      feedback.feedback_rating >= 4
                        ? "bg-green-100 text-green-800"
                        : feedback.feedback_rating >= 3
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    Rating: {feedback.feedback_rating}/5
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-500">Feedback:</span>
                  <span className="text-sm">
                    {feedback.feedback_description || "None"}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-500">Submitted:</span>
                  <span className="text-sm">
                    {formatDate(feedback.feedback_time)}
                  </span>
                </div>
              </div>
            </div>
          </Button>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
};

const Feedback = () => {
  const [tabsValue, setTabsValue] = useState("public");
  const [feedbackDataByRole, setFeedbackDataByRole] = useState({});
  const [paginationState, setPaginationState] = useState({
    public: 1,
    internal_researcher: 1,
    external_researcher: 1,
    policy_maker: 1,
  });
  const [totalPagesByRole, setTotalPagesByRole] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  const roles = ["public", "internal_researcher", "external_researcher", "policy_maker"];

  const fetchFeedbackData = async (role) => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;
      const page = paginationState[role];
      const startDateStr = startDate ? startDate.toISOString() : "";
      const endDateStr = endDate ? endDate.toISOString() : "";

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/feedback_by_role?user_role=${encodeURIComponent(
          role
        )}&start_date=${startDateStr}&end_date=${endDateStr}&page=${page}&limit=10`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      setFeedbackDataByRole((prev) => ({ ...prev, [role]: data }));
      setTotalPagesByRole((prev) => ({ ...prev, [role]: data.totalPages || 1 }));
    } catch (error) {
      console.error(`Error fetching feedback for ${role}:`, error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Reset pagination to page 1 on tab change
    setPaginationState((prev) => ({ ...prev, [tabsValue]: 1 }));
  }, [tabsValue]);

  useEffect(() => {
    setLoading(true);
    roles.forEach((role) => fetchFeedbackData(role));
  }, [paginationState, startDate, endDate]);

  const handleSessionClick = (sessionId) => {
    for (const role of roles) {
      const roleData = feedbackDataByRole[role];
      const session = roleData?.feedback_details?.find((f) => f.session_id === sessionId);
      if (session) {
        setSelectedSession({ session_id: sessionId, role });
        break;
      }
    }
  };

  const handlePageChange = (role, value) => {
    setPaginationState((prev) => ({ ...prev, [role]: value }));
  };

  if (loading) return <LoadingScreen />;
  if (selectedSession) {
    return (
      <Session session={selectedSession} onBack={() => setSelectedSession(null)} from="Feedback" />
    );
  }

  return (
    <div className="w-full mx-auto p-4 space-y-4">
      <Tabs value={tabsValue} onValueChange={setTabsValue} className="w-full">
        <TabsList className="mb-4 flex flex-wrap gap-2 rounded-md bg-gray-50">
          {roles.map((role) => (
            <TabsTrigger key={role} value={role} className="flex items-center gap-1">
              {getRoleIcon(role)}
              {getRoleLabel(role)}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex flex-col background-white p-4 rounded-lg shadow-sm border mb-4">
          <div className="flex justify-start gap-8">
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
          </div>
        </div>

        {roles.map((role) => (
          <TabsContent key={role} value={role}>
            <FeedbackView
              role={role}
              feedbackData={feedbackDataByRole[role] || { feedback_details: [] }}
              onFeedbackClick={handleSessionClick}
            />
            <div className="flex justify-center mt-4">
              <Pagination
                count={totalPagesByRole[role] || 1}
                page={paginationState[role]}
                onChange={(e, value) => handlePageChange(role, value)}
                siblingCount={1}
                boundaryCount={1}
                color="primary"
                sx={{
                  "& .MuiPaginationItem-root": { color: "#0f172a" },
                  "& .MuiPaginationItem-root.Mui-selected": {
                    backgroundColor: "#0f172a",
                    color: "#fff",
                    "&:hover": { backgroundColor: "#0f172a" },
                  },
                }}
              />
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default Feedback;
