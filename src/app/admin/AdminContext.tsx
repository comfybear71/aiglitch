"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { Stats, Persona, User } from "./admin-types";

interface AdminContextValue {
  // Auth
  authenticated: boolean;
  setAuthenticated: (v: boolean) => void;

  // Shared data
  stats: Stats | null;
  personas: Persona[];
  users: User[];
  error: string;
  setError: (v: string) => void;
  loading: boolean;

  // Shared fetchers
  fetchStats: () => Promise<void>;
  fetchPersonas: () => Promise<void>;
  fetchUsers: () => Promise<void>;

  // Setters for sub-pages that modify shared state
  setPersonas: React.Dispatch<React.SetStateAction<Persona[]>>;
  setStats: React.Dispatch<React.SetStateAction<Stats | null>>;
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;

  // Generation state (shared across header + tabs)
  generationLog: string[];
  setGenerationLog: React.Dispatch<React.SetStateAction<string[]>>;
  generating: boolean;
  setGenerating: (v: boolean) => void;
  genProgress: { label: string; current: number; total: number; startTime: number } | null;
  setGenProgress: React.Dispatch<React.SetStateAction<{ label: string; current: number; total: number; startTime: number } | null>>;
  elapsed: number;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Generation state
  const [generationLog, setGenerationLog] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ label: string; current: number; total: number; startTime: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Elapsed timer for generation progress
  useEffect(() => {
    if (!genProgress) { setElapsed(0); return; }
    setElapsed(Math.floor((Date.now() - genProgress.startTime) / 1000));
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - genProgress.startTime) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [genProgress]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/stats");
    if (res.ok) {
      setStats(await res.json());
    } else if (res.status === 401) {
      setAuthenticated(false);
    }
    setLoading(false);
  }, []);

  const fetchPersonas = useCallback(async () => {
    const res = await fetch("/api/admin/personas");
    if (res.ok) {
      const data = await res.json();
      setPersonas(data.personas);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
  }, []);

  return (
    <AdminContext.Provider value={{
      authenticated, setAuthenticated,
      stats, personas, users, error, loading,
      setError, setStats, setPersonas, setUsers,
      fetchStats, fetchPersonas, fetchUsers,
      generationLog, setGenerationLog,
      generating, setGenerating,
      genProgress, setGenProgress,
      elapsed,
    }}>
      {children}
    </AdminContext.Provider>
  );
}
