"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Spinner from "./ui/Spinner";
import Button from "./ui/Button";
import LoginFeaturePanel from "./LoginFeaturePanel";

export default function LoginState() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (user) {
      router.push("/");
    }
  }, [user, router]);

  const handleLogin = async () => {
    setLoading(true);
    try { await login(); } finally { setLoading(false); }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-slate-50 font-sans selection:bg-primary-100">
      {/* Background decoration */}
      <div className="absolute inset-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary-200 via-slate-50 to-white opacity-70" />
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob" />
      <div className="absolute top-1/2 -right-24 w-96 h-96 bg-primary-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000" />
      <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000" />

      <div className="relative z-10 w-full max-w-6xl p-4 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        {/* LEFT: Login card */}
        <div className="w-full max-w-md mx-auto lg:mx-0">
          <div className="bg-white/70 backdrop-blur-2xl border border-white/50 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="h-1.5 w-full bg-gradient-to-r from-primary-500 via-purple-500 to-pink-500" />
            <div className="p-8 md:p-10 text-center">
              {mounted ? (
                <div className="mx-auto w-20 h-20 bg-gradient-to-tr from-primary-600 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/20 mb-8 transform hover:scale-105 transition-transform duration-300">
                  <NotebookPen className="w-10 h-10 text-white" />
                </div>
              ) : (
                <div className="mx-auto w-20 h-20 bg-slate-200 rounded-2xl mb-8 animate-pulse" />
              )}

              <h1 className="text-3xl font-extrabold text-slate-800 mb-2 tracking-tight">Smart Meeting Assistant</h1>
              <p className="text-slate-500 mb-10 text-sm md:text-base leading-relaxed">
                Biến cuộc họp thành văn bản & tóm tắt thông minh chỉ trong vài giây.
              </p>

              <Button variant="outline" size="lg" onClick={handleLogin} loading={loading} className="w-full !justify-start !pl-6">
                {!loading && (
                  <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
                <span className="font-semibold text-slate-700 flex-1 text-center pr-6">Tiếp tục với Google</span>
              </Button>

              <p className="mt-8 text-[10px] text-slate-400">
                Bằng việc tiếp tục, bạn đồng ý với Chính sách bảo mật & Điều khoản dịch vụ.
              </p>
            </div>
          </div>
          <div className="mt-6 text-center text-slate-400 text-xs font-medium">© 2025 Smart Meeting Assistant</div>
        </div>

        {/* RIGHT: Features (desktop only) */}
        <div className="hidden lg:block">
          <LoginFeaturePanel />
        </div>
      </div>
    </div>
  );
}
