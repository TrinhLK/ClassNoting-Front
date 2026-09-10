"use client";
import { Sun, Moon, Monitor } from "lucide-react";
import { useState, useEffect } from "react";

type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "app-theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored) setTheme(stored);
  }, []);

  const cycle = () => {
    const next: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    if (next === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  };

  return (
    <button onClick={cycle} className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" aria-label={`Theme: ${theme}`} title={`Theme: ${theme}`}>
      {theme === "light" && <Sun className="w-5 h-5" />}
      {theme === "dark" && <Moon className="w-5 h-5" />}
      {theme === "system" && <Monitor className="w-5 h-5" />}
    </button>
  );
}
