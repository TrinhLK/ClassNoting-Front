"use client";
import { useEffect, useState } from "react";

export default function Template({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  return (
    <div className={`h-full transition-opacity duration-150 ${show ? "opacity-100" : "opacity-0"}`}>
      {children}
    </div>
  );
}
