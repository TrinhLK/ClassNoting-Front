// src/hooks/useSpeechRecognition.ts
import { useState, useEffect, useRef } from "react";

const KEYWORD_CORRECTIONS: Record<string, string> = {
  "ran pót": "RunPod", "run pót": "RunPod", "ran pod": "RunPod",
  "ai": "AI", "ây ai": "AI",
  "chat gpt": "ChatGPT", "chát gpt": "ChatGPT",
  "api": "API", "ây pi ai": "API",
  "next js": "Next.js", "nếch ji ét": "Next.js",
  "ri át": "React",
  "gemini": "Gemini", "gê mi ni": "Gemini"
};

const normalizeText = (text: string): string => {
  let normalized = text.toLowerCase();
  Object.keys(KEYWORD_CORRECTIONS).forEach((key) => {
    const regex = new RegExp(`\\b${key}\\b`, "gi");
    normalized = normalized.replace(regex, KEYWORD_CORRECTIONS[key]);
  });
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

export default function useSpeechRecognition() {
  const [text, setText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [hasSupport, setHasSupport] = useState(true);

  const isListeningRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onSegmentEndRef = useRef<((segment: string) => void) | null>(null);
  const textRef = useRef("");
  const isLineBreakPending = useRef(false);
  const pendingBufferRef = useRef(""); 

  const finalInterimRef = useRef(""); 

  useEffect(() => { textRef.current = text; }, [text]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // @ts-ignore
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) { setHasSupport(false); return; }
      setHasSupport(true);

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "vi-VN";

      recognition.onresult = (event: any) => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        isLineBreakPending.current = false; 

        let currentInterim = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const raw = event.results[i][0].transcript.trim();
            const clean = normalizeText(raw);
            
            setText((prev) => {
                if (prev.endsWith("\n") || prev === "") return prev + "- " + clean;
                const prefix = prev.trim().length > 0 ? " " : "- "; 
                return prev + prefix + clean;
            });
            
            finalInterimRef.current = "";
          } else {
            currentInterim += event.results[i][0].transcript;
          }
        }
        setInterimText(currentInterim);
        
        finalInterimRef.current = currentInterim;

        silenceTimerRef.current = setTimeout(() => {
           handleSilenceDetected(); 
        }, 1500); 
      };
      
      recognition.onerror = (event: any) => { 
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
              console.warn("Mic warning:", event.error); 
          }
      };
      
      // [LOGIC CỨU CHỮ MỚI]
      recognition.onend = () => { 
          // Nếu còn chữ sót lại trong Ref mà chưa kịp thành Final
          if (finalInterimRef.current.trim()) {
              const savedText = normalizeText(finalInterimRef.current);
              setText((prev) => {
                  if (prev.endsWith("\n") || prev === "") return prev + "- " + savedText;
                  // Nối tiếp vào câu đang nói dở
                  return prev + " " + savedText; 
              });
              finalInterimRef.current = ""; 
              setInterimText("");
          }

          if (isListeningRef.current) {
              try { 
                  recognition.start(); 
              } catch (e) {}
          }
      };

      recognitionRef.current = recognition;
    }
    
    return () => {
        if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []); 

  const handleSilenceDetected = () => {
    // ... (Giữ nguyên logic cũ của bạn) ...
    const currentText = textRef.current.trim();
    if (!currentText || isLineBreakPending.current) return;

    setText(prev => {
        let trimmed = prev.trim();
        if (!/[.!?]$/.test(trimmed) && !trimmed.endsWith('\n')) {
            trimmed += ".";
        }
        return trimmed + "\n";
    });
    isLineBreakPending.current = true;

    const segments = currentText.split("\n");
    let lastSegment = segments[segments.length - 1]; 
    lastSegment = lastSegment.replace(/^- /, "").trim();

    if (!lastSegment) return;

    if (pendingBufferRef.current) {
        pendingBufferRef.current += " " + lastSegment;
    } else {
        pendingBufferRef.current = lastSegment;
    }

    if (pendingBufferRef.current.length > 30 && onSegmentEndRef.current) {
         onSegmentEndRef.current(pendingBufferRef.current);
         pendingBufferRef.current = "";
    }
  };

  const startListening = (onSegmentEnd?: (seg: string) => void) => {
    if (!recognitionRef.current) return;
    try {
      setInterimText("");
      finalInterimRef.current = ""; 
      
      if (onSegmentEnd) onSegmentEndRef.current = onSegmentEnd;
      
      isListeningRef.current = true;
      setIsListening(true);
      
      recognitionRef.current.start();
    } catch (e) {}
  };

  const resetTranscript = () => {
      setText("");
      setInterimText("");
      pendingBufferRef.current = "";
      finalInterimRef.current = "";
  };

  const stopListening = () => {
    if (!recognitionRef.current) return;
    try {
      isListeningRef.current = false;
      setIsListening(false);
      
      if (pendingBufferRef.current && pendingBufferRef.current.length > 0 && onSegmentEndRef.current) {
          onSegmentEndRef.current(pendingBufferRef.current);
          pendingBufferRef.current = "";
      }

      recognitionRef.current.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    } catch (e) {}
  };

  return { text, interimText, isListening, startListening, stopListening, hasSupport, resetTranscript };
}