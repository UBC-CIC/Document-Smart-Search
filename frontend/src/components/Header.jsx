import Image from "next/image";
import mapleLeaf from "../app/flag_of_canada.png";

const Header = ({ setPage }) => {
  return (
    <header className="bg-white border-b border-gray-300">
      <div className="max-w-[90%] mx-auto px-4 py-2 flex items-center justify-between">
        {/* Left Side: Flag + Text */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Canada Flag */}
          <div className="flex-shrink-0">
            <Image
              src={mapleLeaf || "/placeholder.svg"}
              alt="Canadian Flag"
              width={50}
              height={25}
              className="object-contain w-[50px] sm:w-[70px]"
            />
          </div>
          {/* Government of Canada Wordmark */}
          <div className="leading-tight">
            <p className="text-black font-bold text-sm sm:text-base">
              Fisheries and Oceans Canada
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
