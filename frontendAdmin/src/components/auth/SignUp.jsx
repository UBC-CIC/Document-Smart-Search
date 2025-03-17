import React, { useState } from "react";
import Header from "../components/Header";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  signIn,
  signUp,
  confirmSignIn,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  confirmResetPassword,
  fetchAuthSession,
} from "aws-amplify/auth";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const SignUp = ({
  email,
  setEmail,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  setAuthState,
  loading,
  setLoading,
}) => {
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (email === "" || password === "" || confirmPassword === "") {
      toast.error("All fields are required", {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      return;
    }
    if (password !== confirmPassword) {
      console.log("password don't match");
      toast.error("Passwords do not match", {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      return;
    } else if (password.length < 8) {
      console.log("password too short");
      toast.error("Password must be at least 8 characters long", {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      return;
    }
    try {
      setLoading(true);
      console.log("signing up");
      const { isSignUpComplete, userId, nextStep } = await signUp({
        username: email.toLowerCase(),
        password: password,
        attributes: {
          email: email,
        },
      });
      console.log("User signed up:", isSignUpComplete, userId, nextStep);
      if (!isSignUpComplete) {
        if (nextStep.signUpStep === "CONFIRM_SIGN_UP") {
          setLoading(false);
          setAuthState("signupConfirmation");
        }
      }
    } catch (error) {
      toast.error(`Error signing up: ${error}`, {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      console.log("Error signing up:", error);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <h2 className="text-2xl mb-6">Create your account</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="email"
          id="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1"
          maxLength={50}
        />
        <Input
          type="password"
          id="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1"
          maxLength={50}
        />
        <Input
          type="password"
          id="confirmPassword"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mt-1"
          maxLength={50}
        />
        <Button
          type="submit"
          className="w-full bg-red-500 hover:bg-red-600 text-md"
        >
          SIGN UP
        </Button>
      </form>
      <div className="mt-2">
        <p className="text-sm text-gray-600">
          Already have an account?{" "}
          <a
            onClick={() => setAuthState("signin")}
            className="text-blue-600 hover:underline cursor-pointer"
          >
            Sign in
          </a>
        </p>
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
};

export default SignUp;
