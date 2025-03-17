"use client";
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
const ForgotPassword = ({
  email,
  setEmail,
  setAuthState,
  loading,
  setLoading,
}) => {
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await resetPassword({
        username: email.toLowerCase(),
      });
      setAuthState("passwordReset");
    } catch (error) {
      console.error("Reset password error:", error);
    }
  };

  return (
    <div className="w-full max-w-md">
      <h2 className="text-2xl mb-6">Reset Password</h2>
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
        <Button
          type="submit"
          className="w-full bg-red-500 hover:bg-red-600 text-md"
        >
          Send Reset Code
        </Button>
      </form>
      <div className="mt-2">
        <p className="text-sm text-gray-600">
          Remember your password?{" "}
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

export default ForgotPassword;
