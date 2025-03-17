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
    <div className="w-full h-screen flex flex-col">
      <Header />
      <div className="flex flex-grow">
      <div className="bg-gray-100 w-full md:w-1/2 h-full flex flex-col items-center justify-center">
          <div className="relative w-[240px] h-[240px] bg-white rounded-full flex items-center justify-center">
            <div className="relative w-[180px] h-[180px]">
              <Image
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-WxA3QbDhsMTlR8fSf3OIicudyp8eif.png"
                alt="Canadian Flag"
                layout="fill"
                objectFit="contain"
              />
            </div>
          </div>
          <h2 className="text-3xl font-bold mt-8 mb-4">DFO SmartSearch</h2>
        </div>
        <div className="bg-white w-full md:w-1/2 p-8 flex items-center justify-center">
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
            <PasswordReset email={email} loading={loading} setLoading={setLoading} setAuthState={setAuthState} />
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;