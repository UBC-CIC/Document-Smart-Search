import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import PreviousPrompts from "./PreviousPrompts";
import { fetchAuthSession } from "aws-amplify/auth";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const PromptSettings = ({
  promptId,
  currentPrompt,
  previousPrompts,
  setPreviousPrompts,
  setPrompts,
}) => {
  const [promptText, setPromptText] = useState(currentPrompt || "");

  const formatRoleName = (role) => {
    const roleMap = {
      'public': 'General Public',
      'internal_researcher': 'Internal Researcher',
      'external_researcher': 'External Researcher',
      'policy_maker': 'Policy Maker'
    };
    return roleMap[role] || role;
  };

  const handleSave = async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;

      // Save the prompt
      const saveResponse = await savePrompt(token, promptId, promptText);

      if (saveResponse.ok) {
        toast.success("Prompt saved successfully!", { position: "top-center" });
        await fetchAndSetPrompts(token);
      } else {
        throw new Error(saveResponse.statusText);
      }
    } catch (error) {
      console.error("Error saving prompt:", error);
      toast.error("Error saving prompt.", { position: "top-center" });
    }
  };

  const savePrompt = async (token, promptId, promptText) => {
    return fetch(
      `${
        process.env.NEXT_PUBLIC_API_ENDPOINT
      }admin/insert_prompt?role=${encodeURIComponent(promptId.toLowerCase())}`,
      {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: promptText }),
      }
    );
  };

  const fetchAndSetPrompts = async (token) => {
    try {
      // Fetch current prompts
      const currentPrompts = await fetchPrompts(token, "admin/latest_prompt");
      if (currentPrompts) {
        setPrompts();
      }

      // Fetch previous prompts
      const previousPromptsData = await fetchPrompts(
        token,
        "admin/previous_prompts"
      );
      if (previousPromptsData) {
        setPreviousPrompts(previousPromptsData);
      }
    } catch (error) {
      console.error("Error fetching prompts:", error);
      toast.error("Error fetching prompts.", { position: "top-center" });
    }
  };

  const fetchPrompts = async (token, endpoint) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}${endpoint}`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        return await response.json();
      } else {
        console.error(`Failed to fetch ${endpoint}:`, response.statusText);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching ${endpoint}:`, error);
      return null;
    }
  };

  function toTitleCase(str) {
    return str
      .toLowerCase()
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
      
  return (
    <Card>
      <CardHeader>
        <CardTitle>{formatRoleName(promptId)} Prompt Settings</CardTitle>
        <CardDescription>
          Warning: modifying the prompt in the text area below can significantly
          impact the quality and accuracy of the responses. Modifying the format
          of the output is discouraged, as it may result in unexpected or
          incorrect behaviour.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-sm" htmlFor={`prompt-${promptId}`}>
            Your current prompt (Latest)
          </Label>
          <textarea
            id={`prompt-${promptId}`}
            placeholder="Type your text here..."
            className="min-h-[25rem] w-full resize-none overflow-y-auto border p-2 rounded"
            maxLength={4096}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
          />
        </div>
      </CardContent>
      <CardFooter className="flex justify-center">
        <div className="flex flex-col items-center">
          <PreviousPrompts previousPrompts={previousPrompts} />
          <Button
            onClick={handleSave}
            className="bg-adminMain hover:hover:bg-adminHover w-[80%]"
          >
            Save
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default PromptSettings;
