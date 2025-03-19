"use client";
import React, { useState } from "react";
import Header from "../components/Header";
import Image from "next/image";
import SignIn from "./SignIn";
import SignUp from "./SignUp";
import SignupConfirmation from "./SignupConfirmation";
import ForgotPassword from "./ForgotPassword";
import PasswordReset from "./PasswordReset";

const Auth = () => {
  const [authState, setAuthState] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="w-full h-screen flex flex-col bg-gray-100">
      <Header />
      <div className="flex-grow flex flex-col items-center justify-center px-4">
        <div className="bg-white shadow-lg rounded-xl px-8 py-10 max-w-md w-full">
          <div className="flex flex-col items-center mb-6">
            <div className="relative w-[100px] h-[100px]">
              <Image
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-WxA3QbDhsMTlR8fSf3OIicudyp8eif.png"
                alt="Canadian Flag"
                layout="fill"
                objectFit="contain"
              />
            </div>
            <h2 className="text-2xl font-bold mt-4">DFO SmartSearch</h2>
          </div>

          {authState === "signin" && (
            <SignIn
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              setAuthState={setAuthState}
              loading={loading}
              setLoading={setLoading}
            />
          )}
          {authState === "signup" && (
            <SignUp
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              setAuthState={setAuthState}
              loading={loading}
              setLoading={setLoading}
            />
          )}
          {authState === "forgotPassword" && (
            <ForgotPassword
              email={email}
              setEmail={setEmail}
              setAuthState={setAuthState}
              loading={loading}
              setLoading={setLoading}
            />
          )}
          {authState === "signupConfirmation" && (
            <SignupConfirmation
              email={email}
              setAuthState={setAuthState}
              loading={loading}
              setLoading={setLoading}
            />
          )}
          {authState === "passwordReset" && (
            <PasswordReset
              email={email}
              loading={loading}
              setLoading={setLoading}
              setAuthState={setAuthState}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
