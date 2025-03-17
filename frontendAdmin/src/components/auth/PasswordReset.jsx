"use client";
import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { confirmResetPassword } from "aws-amplify/auth";


const PasswordReset = ({ email, loading, setLoading, setAuthState }) => {
  const [confirmationCode, setConfirmationCode] = useState(""); 
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      confirmationCode === "" ||
      newPassword === "" ||
      confirmNewPassword === ""
    ) {
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

    if (newPassword !== confirmNewPassword) {
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
    } else if (newPassword.length < 8) {
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
      await confirmResetPassword({
        username: email.toLowerCase(),
        confirmationCode: confirmationCode,
        newPassword: newPassword,
      });
      toast.success("Password reset successful!", {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      // Optionally, reset state or redirect the user
    } catch (error) {
      console.error("Password reset error:", error);
      toast.error(`Error resetting password: ${error.message}`, {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto mt-10">
      <h2 className="text-2xl mb-6">Reset Password</h2>
      <p className="text-sm mb-4">
        Please enter the confirmation code and your new password.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="text"
          id="confirmationCode"
          placeholder="Confirmation Code"
          required
          className="mt-1"
          onChange={(e) => setConfirmationCode(e.target.value)}
          maxLength={6}
        />
        <Input
          type="password"
          id="newPassword"
          placeholder="New Password"
          required
          className="mt-1"
          onChange={(e) => setNewPassword(e.target.value)}
          maxLength={50}
        />
        <Input
          type="password"
          id="confirmNewPassword"
          placeholder="Confirm New Password"
          required
          className="mt-1"
          onChange={(e) => setConfirmNewPassword(e.target.value)}
          maxLength={50}
        />
        <Button
          type="submit"
          className="w-full bg-blue-900 hover:bg-blue-800 text-md"
        >
          Submit New Password
        </Button>
      </form>
      <div className="mt-2">
        <p className="text-sm text-gray-600">
          Remember your password?{" "}
          <a
            onClick={() => setAuthState("signin")}
            className="text-blue-400 hover:underline cursor-pointer"
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

export default PasswordReset;
