import type { Metadata } from "next";
import { Geist, Geist_Mono,Inter } from "next/font/google";
import "./globals.css";
import GlobalUIProvider from "./context/GlobalUIProvider";
import { AuthProvider } from "./context/AuthContext";

const inter = Inter({ 
  subsets: ["latin", "vietnamese"],
  variable: '--font-inter'
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Meeting Notes",
  description: "Ghi biên bản và tóm tắt cuộc họp",
};

import OnboardingTour from "./components/OnboardingTour";
import ToastProvider from "./components/ToastProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body
        suppressHydrationWarning={true}
        className={`${inter.variable} font-sans`}
      >
         <AuthProvider>
           <GlobalUIProvider>
            <OnboardingTour />
            <ToastProvider />
            {children}
          </GlobalUIProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
