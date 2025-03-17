"use client";
import React, { useEffect, useState } from "react";
import Login from "./auth/Login.jsx";
import { fetchAuthSession } from "aws-amplify/auth";
import Analytics from "./analytics/Analytics.jsx";
import Categories from "./categories/Categories.jsx";
import Prompt from "./prompt/Prompt.jsx";
import Files from "./files/Files.jsx";
import Sidebar from "./Sidebar.jsx";
import Header from "./components/Header.jsx";
import PostAuthHeader from "./PostAuthHeader.jsx";
import History from "./history/History.jsx";
import Category_creation from "./categories/Category_creation.jsx";
import Edit_Category from "./categories/Edit_Category.jsx";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import LoadingScreen from "./Loading/LoadingScreen.jsx";
import Feedback from "./feedback/Feedback.jsx";
const AdminHome = () => {
  const [user, setUser] = useState(null);
  const [userGroup, setUserGroup] = useState(null);
  const [selectedPage, setSelectedPage] = useState("analytics");
  const [nextCategoryNumber, setNextCategoryNumber] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchAuthData = () => {
      fetchAuthSession()
        .then(({ tokens }) => {
          if (tokens && tokens.accessToken) {
            const group = tokens.accessToken.payload["cognito:groups"];
            setUser(tokens.accessToken.payload);
            setUserGroup(group || []);
          }
        })
        .catch((error) => {
          console.log(error);
        })
        .finally(() => {
          setLoading(false);
        });
    };

    fetchAuthData();
  }, []);

  const getHomePage = () => {
    if (userGroup && userGroup.includes("admin")) {
      switch (selectedPage) {
        case "analytics":
          return <Analytics />;
        case "categories":
          return (
            <Categories
              setSelectedPage={setSelectedPage}
              setNextCategoryNumber={setNextCategoryNumber}
              setSelectedCategory={setSelectedCategory}
            />
          );
        case "prompt":
          return <Prompt />;
        case "history":
          return <History />;
        case "files":
          return <Files />;
        case "category_creation":
          return (
            <Category_creation
              setSelectedPage={setSelectedPage}
              nextCategoryNumber={nextCategoryNumber}
              setNextCategoryNumber={setNextCategoryNumber}
            />
          );
        case "edit_category":
          return (
            <Edit_Category
              selectedCategory={selectedCategory}
              setSelectedPage={setSelectedPage}
            />
          );
        case "feedback":
          return (
            <Feedback
            />
          );
        default:
          return <Analytics />;
      }
    } else {
      return <Login />;
    }
  };
  if (loading) {
    return <LoadingScreen />;
  }

  if (userGroup && userGroup.includes("admin")) {
    return (
      <div className="flex flex-col">
        <PostAuthHeader page={selectedPage} />
        <div className="flex">
          <Sidebar
            selectedPage={selectedPage}
            setSelectedPage={setSelectedPage}
          />
          {getHomePage()}
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
    );
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
    );
  }
};

export default AdminHome;
