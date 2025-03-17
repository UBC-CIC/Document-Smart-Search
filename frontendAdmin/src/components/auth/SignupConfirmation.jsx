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
const SignupConfirmation = ({ email, setAuthState, loading, setLoading }) => {
  const [confirmationCode, setConfirmationCode] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await confirmSignUp({
        username: email.toLowerCase(),
        confirmationCode: confirmationCode,
      });
      toast.success(`Signup successful`, {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      window.location.reload();
    } catch (error) {
      console.error("Confirmation error:", error);
      toast.error(`Error: ${error}`, {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
    }
  };

  const resendConfirmationCode = async () => {
    try {
      setLoading(true);
      await resendSignUpCode({ username: email.toLowerCase() });
      setLoading(false);
    } catch (error) {
      toast.error(`Error: ${error}`, {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      console.log("Error resending confirmation code:", error);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto mt-10">
      <h2 className="text-2xl mb-6">Account not verified</h2>
      <p className="text-sm mb-4">
        Please enter the confirmation code sent to your email.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="text"
          id="confirmationCode"
          placeholder="Confirmation Code"
          maxLength={6}
          required
          className="mt-1"
          onChange={(e) => setConfirmationCode(e.target.value)} />
        <Button
          type="submit"
          className="w-full bg-red-500 hover:bg-red-600 text-md"
        >
          Submit
        </Button>
        <Button
          type="button"
          onClick={resendConfirmationCode}
          className="w-full bg-red-500 hover:bg-red-600 text-md mt-2"
        >
          Resend Code
        </Button>
      </form>
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

export default SignupConfirmation;
