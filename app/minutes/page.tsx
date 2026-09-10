"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import MinutesState from "@/app/components/MinutesState";
import AppShell from "@/app/components/AppShell";
import Spinner from "@/app/components/ui/Spinner";

export default function MinutesPage() {
    const { loading } = useAuth();

    if (loading) return <div className="h-screen w-screen flex items-center justify-center"><Spinner size="xl" /></div>;

    return <AppShell hideTopbar><MinutesState /></AppShell>;
}
