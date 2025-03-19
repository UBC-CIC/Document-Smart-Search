import localFont from "next/font/local"
import "./globals.css"
import NavigationHeader from "@/components/NavigationHeader.jsx"

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
})

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
})

export const metadata = {
  title: "DFO SmartSearch",
  description: "Your intelligent assistant for Fisheries and Oceans Canada",
  icons: {
    icon: "/gov_leaf.png", // Ensure this file exists in your public folder
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NavigationHeader />
        <main>{children}</main>
      </body>
    </html>
  )
}

