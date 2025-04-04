"use client"

import { useEffect, useState } from "react"
import { Line, LineChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { fetchAuthSession } from "aws-amplify/auth"
import LoadingScreen from "../Loading/LoadingScreen"
import { toast } from "react-toastify"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function AnalyticsDashboard() {
  const [avg_feedback_per_role, setAvgFeedbackPerRole] = useState([])
  const [unique_users_per_month, setUniqueUsersPerMonth] = useState([])
  const [messages_per_role_per_month, setMessagesPerRolePerMonth] = useState([])
  const [usersTimeFrame, setUsersTimeFrame] = useState("month")
  const [engagementTimeFrame, setEngagementTimeFrame] = useState("month")
  const [usersLoading, setUsersLoading] = useState(true)
  const [engagementLoading, setEngagementLoading] = useState(true)
  const [dateRange, setDateRange] = useState({
    users: { start: "", end: "" },
    engagement: { start: "", end: "" },
  })

  const getMaxValue = (data, keys) => {
    return Math.max(...data.flatMap((item) => keys.map((key) => item[key] || 0)))
  }

  useEffect(() => {
    const fetchUsersData = async () => {
      setUsersLoading(true)
      try {
        const session = await fetchAuthSession()
        const token = session.tokens.idToken
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/analytics?timeFrame=${usersTimeFrame}`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          },
        )

        if (response.ok) {
          const data = await response.json()
          setUniqueUsersPerMonth(data.unique_users_per_month)
          setDateRange((prev) => ({
            ...prev,
            users: data.date_range || { start: "", end: "" },
          }))
        } else {
          toast.error("Failed to fetch users analytics")
        }
      } catch (error) {
        console.error("Error fetching users analytics:", error)
      } finally {
        setUsersLoading(false)
      }
    }

    fetchUsersData()
  }, [usersTimeFrame])

  useEffect(() => {
    const fetchEngagementData = async () => {
      setEngagementLoading(true)
      try {
        const session = await fetchAuthSession()
        const token = session.tokens.idToken
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/analytics?timeFrame=${engagementTimeFrame}`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          },
        )

        if (response.ok) {
          const data = await response.json()
          setAvgFeedbackPerRole(data.avg_feedback_per_role)
          setMessagesPerRolePerMonth(data.messages_per_role_per_month)
          setDateRange((prev) => ({
            ...prev,
            engagement: data.date_range || { start: "", end: "" },
          }))
        } else {
          toast.error("Failed to fetch engagement analytics")
        }
      } catch (error) {
        console.error("Error fetching engagement analytics:", error)
      } finally {
        setEngagementLoading(false)
      }
    }

    fetchEngagementData()
  }, [engagementTimeFrame])

  if (usersLoading && engagementLoading) {
    return <LoadingScreen />
  }

  const roleDisplayMap = {
    public: "General/Public",
    admin: "Admin",
  }

  const orderedRoles = ["public", "admin"]
  const displayedFeedback = orderedRoles.map((role) => {
    const feedback = avg_feedback_per_role.find((item) => item.user_role === role) || { avg_feedback_rating: 3 }
    return {
      userType: roleDisplayMap[role],
      score: feedback.avg_feedback_rating,
    }
  })

  // Format dates for display based on timeFrame
  const formatDate = (dateString, currentTimeFrame) => {
    if (currentTimeFrame === "day") {
      const date = new Date(dateString)
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    } else if (currentTimeFrame === "week") {
      const date = new Date(dateString)
      return `Week of ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    } else if (currentTimeFrame === "month") {
      const [year, month] = dateString.split("-")
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      return `${monthNames[Number.parseInt(month, 10) - 1]} ${year}`
    } else {
      // Year view
      return dateString
    }
  }

  // Format date range for display
  const formatDateRange = (range) => {
    if (!range || !range.start || !range.end) return ""

    const start = new Date(range.start)
    const end = new Date(range.end)

    const formatOptions = { year: "numeric", month: "short", day: "numeric" }
    return `${start.toLocaleDateString("en-US", formatOptions)} - ${end.toLocaleDateString("en-US", formatOptions)}`
  }

  // Process unique users data
  const processedUniqueUsers = unique_users_per_month.map((item) => {
    return {
      month: formatDate(item.month, usersTimeFrame),
      unique_users: Number.parseInt(item.unique_users, 10),
    }
  })

  // Process messages per role data
  const uniqueMonths = [...new Set(messages_per_role_per_month.map((item) => item.month))]

  // Group messages by month first
  const processedEngagementData = uniqueMonths.map((month) => {
    const monthData = messages_per_role_per_month.filter((item) => item.month === month)
    return {
      month: formatDate(month, engagementTimeFrame),
      public: monthData.find((item) => item.user_role === "public")?.message_count || 0,
      admin: monthData.find((item) => item.user_role === "admin")?.message_count || 0,
    }
  })

  const maxValue = getMaxValue(processedEngagementData, ["public", "admin"])

  return (
    <main className="flex-1 p-3 sm:p-6 w-full overflow-x-hidden">
      <div className="flex flex-col space-y-8">
        <div>
          <div className="flex justify-between items-center mb-4">
            <div className="text-lg">Number of Users by Time Period</div>
            <Tabs value={usersTimeFrame} onValueChange={setUsersTimeFrame} className="w-auto">
              <TabsList>
                <TabsTrigger value="day">Day</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
                <TabsTrigger value="year">Year</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {dateRange.users && (
            <div className="text-sm text-muted-foreground mb-2">
              Showing data from: {formatDateRange(dateRange.users)}
            </div>
          )}
          {usersLoading ? (
            <div className="flex justify-center items-center h-[250px]">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-adminMain"></div>
            </div>
          ) : (
            <ChartContainer
              config={{
                unique_users: {
                  label: "Unique Users",
                  color: "hsl(var(--chart-1))",
                },
              }}
              className="h-[250px] sm:h-[350px] w-full sm:w-10/12 overflow-x-auto"
            >
              <LineChart data={processedUniqueUsers} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <XAxis
                  dataKey="month"
                  label={{
                    value: usersTimeFrame.charAt(0).toUpperCase() + usersTimeFrame.slice(1),
                    position: "bottom",
                    offset: 0,
                  }}
                  tick={{ fontSize: 10 }}
                  angle={usersTimeFrame === "day" ? -45 : 0}
                  textAnchor={usersTimeFrame === "day" ? "end" : "middle"}
                  height={usersTimeFrame === "day" ? 60 : 30}
                />
                <YAxis
                  label={{
                    value: "Unique Users",
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 12,
                  }}
                  tick={{ fontSize: 10 }}
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
          )}
        </div>

        <div>
          <div className="flex justify-between items-center mb-4">
            <div className="text-lg">User Engagement by Time Period</div>
            <Tabs value={engagementTimeFrame} onValueChange={setEngagementTimeFrame} className="w-auto">
              <TabsList>
                <TabsTrigger value="day">Day</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
                <TabsTrigger value="year">Year</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {dateRange.engagement && (
            <div className="text-sm text-muted-foreground mb-2">
              Showing data from: {formatDateRange(dateRange.engagement)}
            </div>
          )}
          {engagementLoading ? (
            <div className="flex justify-center items-center h-[250px]">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-adminMain"></div>
            </div>
          ) : (
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
              className="h-[250px] sm:h-[350px] w-full sm:w-10/12 overflow-x-auto"
            >
              <LineChart data={processedEngagementData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <XAxis
                  dataKey="month"
                  label={{
                    value: engagementTimeFrame.charAt(0).toUpperCase() + engagementTimeFrame.slice(1),
                    position: "bottom",
                    offset: 0,
                  }}
                  tick={{ fontSize: 10 }}
                  angle={engagementTimeFrame === "day" ? -45 : 0}
                  textAnchor={engagementTimeFrame === "day" ? "end" : "middle"}
                  height={engagementTimeFrame === "day" ? 60 : 30}
                />
                <YAxis
                  label={{
                    value: "Message Count",
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 12,
                  }}
                  domain={[0, maxValue]}
                  tick={{ fontSize: 10 }}
                />
                <Line type="monotone" dataKey="public" stroke="var(--color-public)" strokeWidth={2} dot={true} />
                <Line type="monotone" dataKey="admin" stroke="var(--color-admin)" strokeWidth={2} dot={true} />
                <ChartTooltip content={<ChartTooltipContent />} />
              </LineChart>
            </ChartContainer>
          )}
        </div>

        <div className="mb-8 space-y-6 mr-0 sm:mr-12">
          <div>
            <div className="mx-2 sm:mx-4 flex justify-between">
              <div className="text-base sm:text-lg font-medium text-black">User Feedback</div>
              <div className="mr-2 sm:mr-4 text-base sm:text-lg font-medium text-black">Score</div>
            </div>
            <hr className="mr-2 sm:mr-4 mt-2 border-t border-gray-500" />
          </div>
          <div className="space-y-4 mx-4 sm:mx-12">
            {displayedFeedback.map((feedback) => (
              <div key={feedback.userType} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{feedback.userType}</span>
                  <span className="text-sm text-muted-foreground">{Number(feedback.score).toFixed(1)}</span>
                </div>
                <Progress
                  value={((feedback.score - 1) / 4) * 100}
                  className="h-2 bg-adminAccent [&>div]:bg-adminMain"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}

