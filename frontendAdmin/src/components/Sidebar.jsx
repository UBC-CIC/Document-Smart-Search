"use client"

import { BarChart2, BookOpen, History, PenSquare, FileText, MessageCircle } from "lucide-react"

const menuItems = [
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart2,
  },
  {
    id: "prompt",
    label: "Prompt",
    icon: PenSquare,
  },
  {
    id: "history",
    label: "History",
    icon: History,
  },
  {
    id: "feedback",
    label: "Feedback",
    icon: MessageCircle,
  },
]

export default function Component({ selectedPage, setSelectedPage, isMobile = false }) {
  return (
    <nav className={`${isMobile ? "w-full" : "w-64"} bg-white h-full`}>
      <div className="flex flex-col py-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              className={`flex items-center px-4 py-3 text-gray-700 hover:bg-gray-100 transition-colors ${
                selectedPage === item.id ? "bg-gray-100 font-medium text-adminMain" : ""
              }`}
              onClick={() => {
                console.log(item.id)
                setSelectedPage(item.id)
              }}
            >
              <Icon className={`w-5 h-5 mr-3 flex-shrink-0 ${selectedPage === item.id ? "text-adminMain" : ""}`} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

