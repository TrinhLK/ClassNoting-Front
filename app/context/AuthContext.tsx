"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, googleProvider } from "../lib/firebase";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";

interface AuthContextType {
  user: User | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    let lastAttempt = 0;
    const ping = async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastAttempt < 120_000) return;
      lastAttempt = Date.now();
      try {
        const token = await user.getIdToken();
        if (!controller.signal.aborted) await fetch("/api/account/activity", {
          method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        });
      } catch { /* Activity reporting must never interrupt the user's work. */ }
    };
    void ping();
    const interval = setInterval(() => void ping(), 300_000);
    document.addEventListener("visibilitychange", ping);
    window.addEventListener("focus", ping);
    return () => {
      controller.abort(); clearInterval(interval);
      document.removeEventListener("visibilitychange", ping); window.removeEventListener("focus", ping);
    };
  }, [user]);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
