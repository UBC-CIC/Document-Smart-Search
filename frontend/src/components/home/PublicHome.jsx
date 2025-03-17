"use client";

import { useState, useEffect } from "react";
import Header from "../Header";
import Image from "next/image";
import Footer from "../Footer";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import mapleLeaf from "../../app/maple_leaf.png";

// New icon imports
import { BiSearch } from "react-icons/bi";
import { AiOutlineAppstore } from "react-icons/ai";
import { MdTrendingUp } from "react-icons/md";
import { RiEditBoxLine } from "react-icons/ri";

const PublicHome = () => {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring", stiffness: 100 },
    },
  };

  const featureCardVariants = {
    hidden: { x: -20, opacity: 0 },
    visible: (i) => ({
      x: 0,
      opacity: 1,
      transition: {
        delay: i * 0.1,
        type: "spring",
        stiffness: 100,
      },
    }),
    hover: {
      scale: 1.05,
      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
      transition: { type: "spring", stiffness: 400, damping: 10 },
    },
  };

  const buttonVariants = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: {
        delay: 0.8,
        type: "spring",
        stiffness: 200,
        damping: 10,
      },
    },
    hover: {
      scale: 1.05,
      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
      transition: { type: "spring", stiffness: 400, damping: 10 },
    },
  };

  // Updated feature cards data with new icons and text
  const featureCards = [
    {
      icon: <BiSearch className="w-6 h-6 md:w-7 md:h-7 text-blue-600 dark:text-blue-400" />,
      text: "Search Documents",
      description: "Quickly find Fisheries & Oceans Canada research and documents.",
    },
    {
      icon: <AiOutlineAppstore className="w-6 h-6 md:w-7 md:h-7 text-purple-600 dark:text-purple-400" />,
      text: "Browse Mandates",
      description: "Explore content by DFO mandates, domains, and research areas.",
    },
    {
      icon: <MdTrendingUp className="w-6 h-6 md:w-7 md:h-7 text-green-600 dark:text-green-400" />,
      text: "Emerging Trends",
      description: "Discover trending topics and new research insights.",
    },
    {
      icon: <RiEditBoxLine className="w-6 h-6 md:w-7 md:h-7 text-amber-600 dark:text-amber-400" />,
      text: "Manage Content",
      description: "Update and contribute to official DFO documents.",
    },
  ];

  if (!mounted) {
    return null; // Prevent rendering until client-side
  }

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-900 transition-colors duration-300">
      <Header />

      <motion.main
        className="flex-1 flex flex-col justify-between py-6 sm:py-8 md:py-12 px-3 sm:px-4 max-w-7xl mx-auto w-full"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        {/* Top Section: Logo and Welcome Text */}
        <motion.div className="space-y-4 sm:space-y-6 md:space-y-8" variants={itemVariants}>
          {/* Logo with shine effect */}
          <motion.div
            className="flex justify-center maple-leaf-container"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 300, damping: 10 }}
          >
            <Image
              src={mapleLeaf || "/placeholder.svg"}
              alt="Canadian Flag"
              width={120}
              height={120}
              className="w-[100px] h-[100px] sm:w-[120px] sm:h-[120px] md:w-[120px] md:h-[120px] object-contain transition-all duration-300"
              priority
            />
          </motion.div>

          {/* Welcome Text */}
          <motion.div className="text-center space-y-2 sm:space-y-3" variants={itemVariants}>
            <h1 className="text-xl sm:text-2xl md:text-4xl font-bold text-gray-800 dark:text-white">
              Welcome to DFO Smart Search
            </h1>
            <p className="text-base sm:text-xl md:text-2xl text-gray-600 dark:text-gray-300 px-2">
              Your intelligent assistant for Fisheries and Oceans Canada
            </p>
          </motion.div>
        </motion.div>

        {/* Middle Section: Feature Cards */}
        <div className="flex-1 flex flex-col justify-center my-6 sm:my-8 md:my-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-6 max-w-4xl mx-auto w-full">
            {featureCards.map((item, index) => (
              <motion.div
                key={index}
                custom={index}
                variants={featureCardVariants}
                initial="hidden"
                animate="visible"
                whileHover="hover"
                className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-3 sm:p-4 md:p-5 transition-all duration-300"
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="p-2 sm:p-3 rounded-full bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                    {item.icon}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <h3 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                      {item.text}
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 line-clamp-3">
                      {item.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom Section: Get Started Button */}
        <motion.div className="flex justify-center mb-6 sm:mb-8 md:mb-12" variants={buttonVariants}>
          <Button
            onClick={() => router.push("/chat")}
            className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800
                     py-4 sm:py-5 md:py-6 px-6 sm:px-7 md:px-8
                     text-base sm:text-lg md:text-xl
                     text-white
                     rounded-md
                     transition-all duration-300
                     shadow-lg w-full sm:w-auto max-w-xs"
          >
            Get Started
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 sm:h-5 sm:w-5 ml-2"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </Button>
        </motion.div>
      </motion.main>

      <Footer />
    </div>
  );
};

export default PublicHome;
