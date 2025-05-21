import { useState, useRef } from 'react';
import { toast } from 'react-toastify';

export function useVoiceInput(setUserInput) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  // Start voice recognition
  const startListening = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast.error("Speech recognition is not supported in your browser.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = "en-US";

    recognitionRef.current.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0])
        .map((result) => result.transcript)
        .join("");

      setUserInput(transcript);
    };

    recognitionRef.current.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
      toast.error("Error with speech recognition. Please try again.");
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current.start();
    setIsListening(true);
  };

  // Stop voice recognition
  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  // Toggle voice recognition
  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return {
    isListening,
    toggleListening
  };
}
