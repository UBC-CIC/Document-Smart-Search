"use client";

import { useEffect, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldAlert, Users } from "lucide-react";
import PromptSettings from "./PromptSettings";
import LoadingScreen from "../Loading/LoadingScreen";

export default function Component() {
  const [prompts, setPrompts] = useState([]);
  const [previousPrompts, setPreviousPrompts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("prompts", prompts);
    console.log("previousPrompts", previousPrompts);
  }, [prompts, previousPrompts]);

  useEffect(() => {
    const fetchPrompts = async () => {
      try {
        const session = await fetchAuthSession();
        const token = session.tokens.idToken;
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/latest_prompt`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setPrompts(data);
        } else {
          console.error("Failed to fetch latest prompt:", response.statusText);
        }
      } catch (error) {
        console.error("Error fetching latest prompt:", error);
      }
    };

    const fetchPreviousPrompts = async () => {
      try {
        const session = await fetchAuthSession();
        const token = session.tokens.idToken;
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/previous_prompts`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setPreviousPrompts(data);
        } else {
          console.error(
            "Failed to fetch previous prompts:",
            response.statusText
          );
        }
      } catch (error) {
        console.error("Error fetching previous prompts:", error);
      }
    };

    const fetchAllData = async () => {
      await Promise.all([fetchPrompts(), fetchPreviousPrompts()]);
      setLoading(false);
    };

    fetchAllData();
  }, []);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="ml-12 mb-8 flex justify-center p-4">
      <Tabs
        defaultValue="public"
        className="w-[600px] lg:w-[800px] xl:w-[1000px]"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="public" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Public
          </TabsTrigger>
          <TabsTrigger value="admin" className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Admin
          </TabsTrigger>
        </TabsList>

        <TabsContent value="public">
          <PromptSettings
            promptId="Public"
            currentPrompt={prompts.public}
            previousPrompts={previousPrompts.public}
            setPreviousPrompts={setPreviousPrompts}
            setPrompts={setPrompts}
          />
        </TabsContent>

        <TabsContent value="admin">
          <PromptSettings
            promptId="Admin"
            currentPrompt={prompts.admin}
            previousPrompts={previousPrompts.admin}
            setPreviousPrompts={setPreviousPrompts}
            setPrompts={setPrompts}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
