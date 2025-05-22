"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import flag from "../app/flag_of_canada.png"; // Adjust if needed

export default function NavigationHeader() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Hide the navigation header on the public home page ("/")
  if (pathname === "/") {
    return null;
  }

  const handleNavigation = (path) => {
    router.push(path);
    setIsMobileMenuOpen(false);
  };

  // Utility function to determine if a route is "active"
  // If you have nested routes (e.g., /document-search/[id]), you can use startsWith
  // For example: `pathname.startsWith("/document-search")`
  const isActive = (route) => pathname === route;

  // Common classes for desktop items
  const baseDesktopClasses = "font-medium hover:text-blue-700 pb-1";
  // Classes for mobile items
  const baseMobileClasses = "font-medium py-2";

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
            <p className="text-black font-bold">Fisheries and Oceans Canada</p>
            <span className="sm:hidden">DFO</span>
          </h1>
        </div>

        {/* Right side: Nav + Mobile Toggle */}
        <div className="flex items-center">
          {/* Desktop Navigation */}
          <nav className="hidden md:flex space-x-6 mr-6">
            <button
              onClick={() => handleNavigation("/chat")}
              className={
                isActive("/chat")
                  ? `text-blue-600 border-b-2 border-blue-600 ${baseDesktopClasses}`
                  : `text-gray-500 ${baseDesktopClasses}`
              }
            >
              Smart Assistant
            </button>
            <button
              onClick={() => handleNavigation("/document-search")}
              className={
                isActive("/document-search")
                  ? `text-blue-600 border-b-2 border-blue-600 ${baseDesktopClasses}`
                  : `text-gray-500 ${baseDesktopClasses}`
              }
            >
              Document Search
            </button>
            <button
              onClick={() => handleNavigation("/topic-trends")}
              className={
                isActive("/topic-trends")
                  ? `text-blue-600 border-b-2 border-blue-600 ${baseDesktopClasses}`
                  : `text-gray-500 ${baseDesktopClasses}`
              }
            >
              Analytics
            </button>
            <button
              onClick={() => handleNavigation("/graph")}
              className={
                isActive("/graph")
                  ? `text-blue-600 border-b-2 border-blue-600 ${baseDesktopClasses}`
                  : `text-gray-500 ${baseDesktopClasses}`
              }
            >
              Graph
            </button>
          </nav>

          {/* Mobile Navigation Toggle */}
          <button
            className="md:hidden text-gray-600"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-white py-2 px-4 shadow-md">
          <nav className="flex flex-col space-y-3">
            <button
              onClick={() => handleNavigation("/chat")}
              className={
                isActive("/chat")
                  ? `text-blue-600 ${baseMobileClasses}`
                  : `text-gray-700 ${baseMobileClasses}`
              }
            >
              Smart Assistant
            </button>
            <button
              onClick={() => handleNavigation("/document-search")}
              className={
                isActive("/document-search")
                  ? `text-blue-600 ${baseMobileClasses}`
                  : `text-gray-700 ${baseMobileClasses}`
              }
            >
              Document Search
            </button>
            <button
              onClick={() => handleNavigation("/topic-trends")}
              className={
                isActive("/topic-trends")
                  ? `text-blue-600 ${baseMobileClasses}`
                  : `text-gray-700 ${baseMobileClasses}`
              }
            >
              Analytics
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}