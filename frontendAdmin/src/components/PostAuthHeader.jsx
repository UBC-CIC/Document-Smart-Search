"use client"
import Image from "next/image"
import { signOut } from "aws-amplify/auth"
import { Button } from "./ui/button"
import mapleLeaf from "../app/flag_of_canada.png"

const PostAuthHeader = () => {
  const handleSignOut = async () => {
    try {
      await signOut()
      window.location.reload()
    } catch (error) {
      console.log("error signing out: ", error)
    }
  }

  return (
    <header className="bg-white border-b border-gray-300">
      <div className="max-w-[98%] mx-auto px-2 sm:px-4 py-2 flex items-center justify-between">
        {/* Left side: Flag and Government branding */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Canada Flag */}
          <Image
            src={mapleLeaf || "/placeholder.svg"}
            alt="Canadian Flag"
            width={50}
            height={25}
            className="object-contain sm:w-[70px] sm:h-[30px]"
          />
          {/* Government of Canada Wordmark */}
          <div className="leading-tight">
            <p className="text-black font-bold text-xs sm:text-base">Fisheries and Oceans Canada</p>
          </div>
        </div>

        {/* Right side: Sign Out button */}
        <Button
          variant="outline"
          className="border-gray-300 hover:bg-gray-100 text-black text-xs sm:text-sm px-2 py-1 sm:px-4 sm:py-2"
          onClick={handleSignOut}
        >
          Sign Out
        </Button>
      </div>
    </header>
  )
}

export default PostAuthHeader

