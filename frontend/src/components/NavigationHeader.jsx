"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import Image from "next/image"
import { Menu, X, MessageCircle, Search, BarChart2 } from "lucide-react"
import flag from "../app/flag_of_canada.png" // Adjust if needed

export default function NavigationHeader() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const router = useRouter()
  const pathname = usePathname()

  // Hide the navigation header on the public home page ("/")
  if (pathname === "/") {
    return null
  }

  // Navigation items with icons
  const navItems = [
    {
      id: "chat",
      label: "Smart Assistant",
      path: "/chat",
      icon: MessageCircle,
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
      icon: BarChart2,
    },
  ]

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
  }, [isMobileMenuOpen])

  const handleNavigation = (path) => {
    router.push(path)
    setIsMobileMenuOpen(false)
  }

  // Utility function to determine if a route is "active"
  const isActive = (route) => pathname === route

  // Common classes for desktop items
  const baseDesktopClasses = "font-medium hover:text-blue-700 pb-1"

  return (
    <header className="border-b shadow-sm sticky top-0 bg-white z-10">
      <div className="max-w-[90%] mx-auto px-4 py-2 flex items-center justify-between">
        {/* Left side: Logo */}
        <div className="flex items-center">
          <Image
            src={flag || "/placeholder.svg"}
            alt="Canadian Flag"
            width={70}
            height={50}
            className="mr-2 object-contain"
          />
          <h1 className="text-xl font-bold truncate">
            <p className="text-black font-bold hidden sm:block">Fisheries and Oceans Canada</p>
            <p className="text-black font-bold sm:block md:hidden">DFO</p>
          </h1>
        </div>

        {/* Right side: Nav + Mobile Toggle */}
        <div className="flex items-center">
          {/* Desktop Navigation */}
          <nav className="hidden md:flex space-x-6 mr-6">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavigation(item.path)}
                className={
                  isActive(item.path)
                    ? `text-blue-600 border-b-2 border-blue-600 ${baseDesktopClasses}`
                    : `text-gray-500 ${baseDesktopClasses}`
                }
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Mobile Navigation Button and Popup */}
      <div className="md:hidden" ref={menuRef}>
        {/* Floating Action Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="fixed z-50 bottom-4 right-4 bg-blue-600 text-white p-3 rounded-full shadow-lg flex items-center justify-center"
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>

        {/* Menu Items that emerge from the button */}
        {isMobileMenuOpen && (
          <div className="fixed z-40 bottom-20 right-4 flex flex-col-reverse items-end space-y-reverse space-y-2">
            {navItems.map((item, index) => {
              const Icon = item.icon
              const isItemActive = isActive(item.path)

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
                    ${isItemActive ? "text-blue-600 font-medium" : "text-gray-700"}
                  `}
                  >
                    {item.label}
                  </div>
                  <button
                    onClick={() => handleNavigation(item.path)}
                    className={`
                      p-3 rounded-full shadow-md flex items-center justify-center
                      ${isItemActive ? "bg-blue-600 text-white" : "bg-white text-gray-700"}
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
    </header>
  )
}

