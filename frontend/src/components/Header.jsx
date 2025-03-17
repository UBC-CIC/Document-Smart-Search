import React from "react"
import Image from "next/image"
import mapleLeaf from "../app/flag_of_canada.png";


const Header = ({ setPage }) => {
  return (
    <header className="bg-white border-b border-gray-300">
      <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
        {/* Left Side: Flag + Text */}
        <div className="flex items-center space-x-3">
          {/* Canada Flag */}
          <Image
            src={mapleLeaf}
            alt="Canadian Flag"
            width={70}
            height={30}
            className="object-contain"
          />
          {/* Government of Canada Wordmark */}
          <div className="leading-tight">
            <p className="text-black font-bold">Government of Canada</p>
            <p className="text-black font-bold">Gouvernement du Canada</p>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
