"use client"
import { useEffect, useState, useRef } from "react"
import Login from "./auth/Login.jsx"
import { fetchAuthSession } from "aws-amplify/auth"
import Analytics from "./analytics/Analytics.jsx"
import Prompt from "./prompt/Prompt.jsx"
import Sidebar from "./Sidebar.jsx"
import PostAuthHeader from "./PostAuthHeader.jsx"
import History from "./history/History.jsx"
import { ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import LoadingScreen from "./Loading/LoadingScreen.jsx"
import Feedback from "./feedback/Feedback.jsx"
import { Menu, X, BarChart2, BookOpen, PenSquare, HistoryIcon, FileText, MessageCircle } from "lucide-react"

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
    icon: HistoryIcon,
  },
  {
    id: "feedback",
    label: "Feedback",
    icon: MessageCircle,
  },
]

const AdminHome = () => {
  const [user, setUser] = useState(null)
  const [userGroup, setUserGroup] = useState(null)
  const [selectedPage, setSelectedPage] = useState("analytics")
  const [nextCategoryNumber, setNextCategoryNumber] = useState(1)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const fetchAuthData = () => {
      fetchAuthSession()
        .then(({ tokens }) => {
          if (tokens && tokens.accessToken) {
            const group = tokens.accessToken.payload["cognito:groups"]
            setUser(tokens.accessToken.payload)
            setUserGroup(group || [])
          }
        })
        .catch((error) => {
          console.log(error)
        })
        .finally(() => {
          setLoading(false)
        })
    }

    fetchAuthData()
  }, [])

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMobileMenuOpen(false)
      }
    }

    if (mobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [mobileMenuOpen])

  const getHomePage = () => {
    if (userGroup && userGroup.includes("admin")) {
      switch (selectedPage) {
        case "analytics":
          return <Analytics />
        case "prompt":
          return <Prompt />
        case "history":
          return <History />
        case "category_creation":
          return (
            <Category_creation
              setSelectedPage={setSelectedPage}
              nextCategoryNumber={nextCategoryNumber}
              setNextCategoryNumber={setNextCategoryNumber}
            />
          )
        case "edit_category":
          return <Edit_Category selectedCategory={selectedCategory} setSelectedPage={setSelectedPage} />
        case "feedback":
          return <Feedback />
        default:
          return <Analytics />
      }
    } else {
      return <Login />
    }
  }

  if (loading) {
    return <LoadingScreen />
  }

  if (userGroup && userGroup.includes("admin")) {
    return (
      <div className="flex flex-col min-h-screen">
        <PostAuthHeader page={selectedPage} />
        <div className="flex flex-col md:flex-row flex-1">
          {/* Desktop Sidebar */}
          <div className="hidden md:block">
            <Sidebar selectedPage={selectedPage} setSelectedPage={setSelectedPage} />
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-auto">{getHomePage()}</div>

          {/* Mobile Menu Button and Popup */}
          <div className="md:hidden" ref={menuRef}>
            {/* Floating Action Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="fixed z-50 bottom-4 right-4 bg-adminMain text-white p-3 rounded-full shadow-lg flex items-center justify-center"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>

            {/* Menu Items that emerge from the button */}
            {mobileMenuOpen && (
              <div className="fixed z-40 bottom-20 right-4 flex flex-col-reverse items-end space-y-reverse space-y-2">
                {menuItems.map((item, index) => {
                  const Icon = item.icon
                  const isActive = selectedPage === item.id

                  return (
                    <div
                      key={item.id}
                      className="flex items-center animate-fadeIn"
                      style={{
                        animationDelay: `${index * 50}ms`,
                        transform: `translateY(${mobileMenuOpen ? "0" : "10px"})`,
                        opacity: mobileMenuOpen ? 1 : 0,
                        transition: `transform 200ms ease, opacity 200ms ease`,
                        transitionDelay: `${index * 50}ms`,
                      }}
                    >
                      <div
                        className={`
                        mr-2 px-3 py-2 rounded-lg shadow-md bg-white
                        ${isActive ? "text-adminMain font-medium" : "text-gray-700"}
                      `}
                      >
                        {item.label}
                      </div>
                      <button
                        onClick={() => {
                          setSelectedPage(item.id)
                          setMobileMenuOpen(false)
                        }}
                        className={`
                          p-3 rounded-full shadow-md flex items-center justify-center
                          ${isActive ? "bg-adminMain text-white" : "bg-white text-gray-700"}
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
            {mobileMenuOpen && (
              <div className="fixed inset-0 bg-black bg-opacity-30 z-30" onClick={() => setMobileMenuOpen(false)} />
            )}
          </div>
        </div>

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
  } else {
    return (
      <div>
        <Login />
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
}

export default AdminHome

