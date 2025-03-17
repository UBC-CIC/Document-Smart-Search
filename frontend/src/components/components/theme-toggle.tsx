import { Moon, Sun } from "lucide-react"
import { useTheme } from "./use-theme"
import React from "react"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="theme-toggle-container p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors touch-manipulation"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <div className="sun-container">
          <Sun className="h-5 w-5 text-yellow-500 sun-icon transition-transform duration-300" />
        </div>
      ) : (
        <div className="moon-container">
          <Moon className="h-5 w-5 text-blue-700 moon-icon transition-transform duration-300" />
        </div>
      )}
    </button>
  )
}

