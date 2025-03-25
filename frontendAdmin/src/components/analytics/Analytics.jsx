"use client";

import React, { useEffect, useState } from "react";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { fetchAuthSession } from "aws-amplify/auth";
import LoadingScreen from "../Loading/LoadingScreen";

export default function AnalyticsDashboard() {
  const [avg_feedback_per_role, setAvgFeedbackPerRole] = useState([]);
  const [unique_users_per_month, setUniqueUsersPerMonth] = useState([]);
  const [messages_per_role_per_month, setMessagesPerRolePerMonth] = useState([]);
  const [loading, setLoading] = useState(true); 

  const getMaxValue = (data, keys) => {
    return Math.max(
      ...data.flatMap((item) => keys.map((key) => item[key] || 0))
    );
  };

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const session = await fetchAuthSession();
        const token = session.tokens.idToken;
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/analytics`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setAvgFeedbackPerRole(data.avg_feedback_per_role);
          setUniqueUsersPerMonth(data.unique_users_per_month);
          setMessagesPerRolePerMonth(data.messages_per_role_per_month);
        } else {
          toast.error("Failed to fetch analytics:");
        }
      } catch (error) {
        console.error("Error fetching analytics:");
      } finally {
        setLoading(false); 
      }
    };

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <LoadingScreen />
    );
  }

  const roleDisplayMap = {
    public: "General/Public",
    admin: "Admin",
  };

  const orderedRoles = ["public", "admin"];
  const displayedFeedback = orderedRoles.map((role) => {
    const feedback = avg_feedback_per_role.find(
      (item) => item.user_role === role
    ) || { avg_feedback_rating: 3 };
    return {
      userType: roleDisplayMap[role],
      score: feedback.avg_feedback_rating,
    };
  });

  const uniqueMonths = [
    ...new Set(messages_per_role_per_month.map((item) => item.month)),
  ];

  const processedData = uniqueMonths.map((month) => {
    const monthData = messages_per_role_per_month.filter(
      (item) => item.month === month
    );
    const [year, monthNum] = new Date(month).toISOString().split("-");
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    return {
      month: `${monthNames[parseInt(monthNum, 10) - 1]} ${year}`,
      public:
        monthData.find((item) => item.user_role === "public")?.message_count ||
        0,
      admin:
        monthData.find((item) => item.user_role === "admin")?.message_count ||
        0,
    };
  });

  const maxValue = getMaxValue(processedData, ["public", "admin"]);

  return (
    <main className="ml-12 flex-1 p-6 w-full">
      <div className="text-lg mb-4">Number of Users by Month</div>
      <ChartContainer
        config={{
          unique_users: {
            label: "Unique Users",
            color: "hsl(var(--chart-1))",
          },
        }}
        className="h-[350px] w-10/12"
      >
        <LineChart
          data={unique_users_per_month.map((item) => {
            const [year, month] = item.month.split("-");
            const monthNames = [
              "Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
            ];
            return {
              month: `${monthNames[parseInt(month, 10) - 1]} ${year}`,
              unique_users: parseInt(item.unique_users, 10),
            };
          })}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        >
          <XAxis
            dataKey="month"
            label={{ value: "Month", position: "bottom", offset: 0 }}
          />
          <YAxis
            label={{
              value: "Unique Users",
              angle: -90,
              position: "insideLeft",
            }}
          />
          <Line
            type="monotone"
            dataKey="unique_users"
            stroke="var(--color-unique_users)"
            strokeWidth={2}
            dot={true}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
        </LineChart>
      </ChartContainer>

      <div className="text-lg mb-4">User Engagement by Month</div>
      <ChartContainer
        config={{
          public: {
            label: "General/Public Users",
            color: "hsl(var(--chart-1))",
          },
          admin: {
            label: "Admins",
            color: "hsl(var(--chart-3))",
          },
        }}
        className="h-[350px] w-10/12"
      >
        <LineChart
          data={processedData}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        >
          <XAxis
            dataKey="month"
            label={{ value: "Month", position: "bottom", offset: 0 }}
          />
          <YAxis
            label={{
              value: "Message Count",
              angle: -90,
              position: "insideLeft",
            }}
            domain={[0, maxValue]}
          />
          <Line
            type="monotone"
            dataKey="public"
            stroke="var(--color-public)"
            strokeWidth={2}
            dot={true}
          />
          <Line
            type="monotone"
            dataKey="admin"
            stroke="var(--color-admin)"
            strokeWidth={2}
            dot={true}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
        </LineChart>
      </ChartContainer>

      <div className=" mb-12 mt-12 space-y-6 mr-12 ">
        <div>
          <div className=" mx-4 flex justify-between">
            <div className=" text-lg font-medium text-black">User Feedback</div>
            <div className="mr-4 text-lg font-medium text-black">Score</div>
          </div>
          <hr className="mr-4 mt-2 border-t border-gray-500" />
        </div>
        <div className="space-y-4 mx-12">
          {displayedFeedback.map((feedback) => (
            <div key={feedback.userType} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{feedback.userType}</span>
                <span className="text-sm text-muted-foreground">
                  {Number(feedback.score).toFixed(1)}
                </span>
              </div>
              <Progress
                value={((feedback.score - 1) / 4) * 100}
                className="h-2 bg-adminAccent [&>div]:bg-adminMain"
              />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
