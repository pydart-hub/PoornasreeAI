"use client";

import { useState, useRef, useCallback } from "react";
import { LANG_BCP47 } from "@/lib/languages";

interface UseVoiceInputOptions {
  language: string;
  onResult: (transcript: string) => void;
}

export function useVoiceInput({ language, onResult }: UseVoiceInputOptions) {
  const [isRecording, setIsRecording] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const toggleRecording = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionAPI = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      return;
    }

    const recog = new SpeechRecognitionAPI();
    recog.lang = LANG_BCP47[language] || "en-US";
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recog.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) onResult(transcript);
    };
    recog.onerror = () => setIsRecording(false);
    recog.onend = () => setIsRecording(false);
    recognitionRef.current = recog;
    recog.start();
    setIsRecording(true);
  }, [isRecording, language, onResult]);

  return { isRecording, toggleRecording };
}
