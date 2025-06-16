import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const Footer = () => {
  return (
    <div className="flex flex-row bg-customFooter py-2">
      <div className="flex flex-row justify-between w-full mx-4">
        <Dialog>
          <DialogTrigger className="underline text-gray-700 hover:text-gray-900 cursor-pointer">
            About
          </DialogTrigger>
          <DialogContent className="max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold mb-4">
                About DFO Smart Search
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-gray-700">
                DFO Smart Search is an AI-powered tool designed to help people
                quickly find and explore Fisheries and Oceans Canada (DFO)
                documents, science advice, and research.
              </p>
              <p className="text-gray-700">
                Our platform provides user-friendly search functionality,
                enabling everyone from policymakers to the general public to
                access clear and relevant information—without needing advanced
                technical knowledge.
              </p>
              <p className="text-gray-700">
                Created with the goal of making science advice more accessible
                and transparent, DFO Smart Search serves as your guide to
                fisheries, marine ecosystems, and oceans research. We
                continually refine and improve our search capabilities to keep
                you informed about the latest developments in fisheries and
                oceans science.
              </p>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger className="underline text-gray-700 hover:text-gray-900 cursor-pointer">
            T&C
          </DialogTrigger>
          <DialogContent className="max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold mb-4">
                Terms &amp; Conditions
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-gray-700">
                By using DFO Smart Search, you agree to the following terms and
                conditions:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>
                  This tool is provided for informational and research purposes
                  only.
                </li>
                <li>
                  Any science advice or recommendations should be reviewed and
                  adapted to your specific context.
                </li>
                <li>
                  User data is handled in accordance with applicable privacy
                  policies.
                </li>
                <li>The service is provided "as is" without any warranties.</li>
                <li>
                  We reserve the right to modify or discontinue the service at
                  any time without notice.
                </li>
              </ul>
              <p className="text-gray-700">
                For the full terms and conditions, or any questions, please
                contact the Fisheries and Oceans Canada support team.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Footer;
