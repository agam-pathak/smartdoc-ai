"use client";

import { Search, BrainCircuit, FileSearch, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

const steps = [
  { text: "Analyzing query", icon: BrainCircuit },
  { text: "Searching document index", icon: Search },
  { text: "Reading relevant chunks", icon: FileSearch },
  { text: "Synthesizing answer", icon: Loader2 },
];

export default function TypingIndicator() {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const intervals = [300, 900, 1800]; // Progressively move through steps
    const timeouts: NodeJS.Timeout[] = [];

    intervals.forEach((delay, index) => {
      const timeout = setTimeout(() => {
        setStepIndex(index + 1);
      }, delay);
      timeouts.push(timeout);
    });

    return () => timeouts.forEach((t) => clearTimeout(t));
  }, []);

  const StepIcon = steps[stepIndex].icon;

  return (
    <div className="flex w-full items-center justify-start py-3">
      <div className="flex items-center gap-3 rounded-[24px] border border-cyan-300/20 bg-slate-900/60 px-5 py-3 shadow-lg backdrop-blur-md">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-300/10 text-cyan-200">
          <StepIcon className={`h-4 w-4 ${stepIndex === 3 ? "animate-spin" : "animate-pulse"}`} />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Lexora Engine
          </span>
          <span className="text-sm font-medium text-slate-200">
            {steps[stepIndex].text}...
          </span>
        </div>
      </div>
    </div>
  );
}
