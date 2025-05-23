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
        console.log("Fetching latest prompts...");
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

        console.log("Response status:", response.status);
        const data = await response.json();
        console.log("Response data:", data);

        if (response.ok) {
          setPrompts(data);
        } else if (response.status === 404) {
          console.log("No prompts found, initializing empty state");
          // Initialize empty prompts if none found
          setPrompts({
            public: null,
            internal_researcher: null,
            policy_maker: null,
            external_researcher: null
          });
        } else {
          console.error("Failed to fetch latest prompt:", data.error || response.statusText);
          // Initialize empty prompts on error
          setPrompts({
            public: null,
            internal_researcher: null,
            policy_maker: null,
            external_researcher: null
          });
        }
      } catch (error) {
        console.error("Error fetching latest prompt:", error);
        // Initialize empty prompts on error
        setPrompts({
          public: null,
          internal_researcher: null,
          policy_maker: null,
          external_researcher: null
        });
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="public" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            General Public
          </TabsTrigger>
          <TabsTrigger value="internal_researcher" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Internal Researcher
          </TabsTrigger>
          <TabsTrigger value="external_researcher" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            External Researcher
          </TabsTrigger>
          <TabsTrigger value="policy_maker" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Policy Maker
          </TabsTrigger>
        </TabsList>

        <TabsContent value="public">
          <PromptSettings
            promptId="public"
            currentPrompt={prompts.public}
            previousPrompts={previousPrompts.public}
            setPreviousPrompts={setPreviousPrompts}
            setPrompts={setPrompts}
          />
        </TabsContent>

        <TabsContent value="internal_researcher">
          <PromptSettings
            promptId="internal_researcher"
            currentPrompt={prompts.internal_researcher}
            previousPrompts={previousPrompts.internal_researcher}
            setPreviousPrompts={setPreviousPrompts}
            setPrompts={setPrompts}
          />
        </TabsContent>

        <TabsContent value="external_researcher">
          <PromptSettings
            promptId="external_researcher"
            currentPrompt={prompts.external_researcher}
            previousPrompts={previousPrompts.external_researcher}
            setPreviousPrompts={setPreviousPrompts}
            setPrompts={setPrompts}
          />
        </TabsContent>

        <TabsContent value="policy_maker">
          <PromptSettings
            promptId="policy_maker"
            currentPrompt={prompts.policy_maker}
            previousPrompts={previousPrompts.policy_maker}
            setPreviousPrompts={setPreviousPrompts}
            setPrompts={setPrompts}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
