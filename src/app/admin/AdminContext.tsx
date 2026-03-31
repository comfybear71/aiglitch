"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { Stats, Persona, User } from "./admin-types";

// ── Background Generation Runner ──
// Runs the full generation pipeline (screenplay → submit → poll → stitch)
// independently of any page component. Survives tab switches.
interface GenerationRunner {
  isRunning: boolean;
  channelId: string | null;
  abort: () => void;
}

type LogSetter = (fn: (prev: string[]) => string[]) => void;
type ProgressState = { label: string; current: number; total: number; startTime: number } | null;
type ProgressSetter = (fn: ProgressState | ((prev: ProgressState) => ProgressState)) => void;

async function runBackgroundGeneration(
  params: {
    channelId: string;
    channelName: string;
    channelSlug: string;
    isStudios: boolean;
    screenplayBody: Record<string, unknown>;
  },
  setLog: LogSetter,
  setProgress: ProgressSetter,
  setGenerating: (v: boolean) => void,
  abortRef: { current: boolean },
) {
  const { channelId: chId, channelName: chName, channelSlug: chSlug, isStudios, screenplayBody } = params;
  const folder = `premiere/${chSlug}`;

  try {
    // ── Phase 1: Generate screenplay ──
    const screenplayRes = await fetch("/api/admin/screenplay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(screenplayBody),
    });
    let screenplay = await screenplayRes.json();

    if (screenplay.error || abortRef.current) {
      const errMsg = screenplay.error || "Aborted";
      setLog(prev => [...prev, `  ❌ Screenplay generation failed: ${errMsg}`]);
      // If rate limited, retry once after 30s
      if (screenplay.error?.includes("429") || screenplay.error?.includes("rate") || screenplay.error?.includes("Too many")) {
        setLog(prev => [...prev, `  ⏳ Rate limited — retrying screenplay in 30s...`]);
        await new Promise(resolve => setTimeout(resolve, 30000));
        const retryRes = await fetch("/api/admin/screenplay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(screenplayBody),
        });
        const retryData = await retryRes.json();
        if (!retryData.error && retryData.scenes) {
          setLog(prev => [...prev, `  ✅ Retry succeeded!`]);
          screenplay = retryData;
        } else {
          setLog(prev => [...prev, `  ❌ Retry failed — skipping this video`]);
          setProgress(null);
          setGenerating(false);
          return;
        }
      } else {
        setProgress(null);
        setGenerating(false);
        return;
      }
    }

    const scenes = screenplay.scenes as { sceneNumber: number; title: string; videoPrompt: string; duration: number }[];
    const provider = screenplay.screenplayProvider === "grok" ? "Grok 4.20 reasoning" : "Claude";
    setLog(prev => [...prev, `  ✅ "${screenplay.title}" — ${scenes.length} scenes${isStudios ? ` by ${screenplay.directorName}` : ""} (screenplay by ${provider})`]);
    setLog(prev => [...prev, `  📖 ${screenplay.synopsis}`]);
    if (isStudios && screenplay.castList?.length > 0) {
      setLog(prev => [...prev, `  🎭 Cast: ${screenplay.castList.join(", ")}`]);
    }
    setLog(prev => [...prev, ``]);

    // ── Phase 2: Submit each scene to Grok ──
    setLog(prev => [...prev, `📡 Submitting ${scenes.length} scenes to xAI...`]);
    setProgress({ label: `📡 Submitting`, current: 1, total: scenes.length, startTime: Date.now() });
    const sceneJobs: { sceneNumber: number; title: string; requestId: string | null }[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (abortRef.current) break;

      // Rate limit: Grok allows 1 request/second — wait 1.5s between submissions
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      setProgress(prev => prev ? { ...prev, current: scene.sceneNumber } : null);
      setLog(prev => [...prev, `[${scene.sceneNumber}/${scenes.length}] 🎬 ${scene.title}`]);
      setLog(prev => [...prev, `  📝 "${scene.videoPrompt.slice(0, 100)}..."`]);

      try {
        const submitRes = await fetch("/api/test-grok-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: scene.videoPrompt, duration: scene.duration, folder }),
        });
        const submitData = await submitRes.json();

        if (submitData.success && submitData.requestId) {
          sceneJobs.push({ sceneNumber: scene.sceneNumber, title: scene.title, requestId: submitData.requestId });
          setLog(prev => [...prev, `  ✅ Submitted: ${submitData.requestId.slice(0, 12)}...`]);
        } else {
          // If rate limited, wait longer and retry once
          if (submitData.error?.includes("429") || submitData.error?.includes("Too many")) {
            setLog(prev => [...prev, `  ⏳ Rate limited — waiting 5s and retrying...`]);
            await new Promise(resolve => setTimeout(resolve, 5000));
            const retryRes = await fetch("/api/test-grok-video", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt: scene.videoPrompt, duration: scene.duration, folder }),
            });
            const retryData = await retryRes.json();
            if (retryData.success && retryData.requestId) {
              sceneJobs.push({ sceneNumber: scene.sceneNumber, title: scene.title, requestId: retryData.requestId });
              setLog(prev => [...prev, `  ✅ Retry succeeded: ${retryData.requestId.slice(0, 12)}...`]);
            } else {
              sceneJobs.push({ sceneNumber: scene.sceneNumber, title: scene.title, requestId: null });
              setLog(prev => [...prev, `  ❌ Retry failed: ${retryData.error || "unknown"}`]);
            }
          } else {
            sceneJobs.push({ sceneNumber: scene.sceneNumber, title: scene.title, requestId: null });
            setLog(prev => [...prev, `  ❌ Submit failed: ${submitData.error || "unknown"}`]);
          }
        }
      } catch (err) {
        sceneJobs.push({ sceneNumber: scene.sceneNumber, title: scene.title, requestId: null });
        setLog(prev => [...prev, `  ❌ Error: ${err instanceof Error ? err.message : "unknown"}`]);
      }
    }

    const pendingJobs = sceneJobs.filter(j => j.requestId);
    if (pendingJobs.length === 0) {
      setLog(prev => [...prev, `❌ No scenes submitted successfully`]);
      setProgress(null);
      setGenerating(false);
      return;
    }

    // ── Phase 3: Poll all scenes until done ──
    setLog(prev => [...prev, ``]);
    setLog(prev => [...prev, `⏳ Polling ${pendingJobs.length} scenes every 10s (typical: 2-10 min per scene)...`]);
    setLog(prev => [...prev, `  💡 You can switch tabs — generation continues in the background`]);

    const doneScenes = new Set<number>();
    const failedScenes = new Set<number>();
    const sceneUrls: Record<number, string> = {};
    const maxPolls = 90;
    let lastProgressAttempt = 0;

    for (let attempt = 1; attempt <= maxPolls; attempt++) {
      if (abortRef.current) break;
      await new Promise(resolve => setTimeout(resolve, 10_000));
      const elapsedSec = attempt * 10;
      const min = Math.floor(elapsedSec / 60);
      const sec = elapsedSec % 60;
      const timeStr = min > 0 ? `${min}m ${sec}s` : `${sec}s`;

      for (const job of pendingJobs) {
        if (doneScenes.has(job.sceneNumber) || failedScenes.has(job.sceneNumber)) continue;

        try {
          const pollRes = await fetch(`/api/test-grok-video?id=${encodeURIComponent(job.requestId!)}&folder=${folder}&skip_post=true`);
          const pollData = await pollRes.json();
          const status = pollData.status || "unknown";

          if (pollData.phase === "done" && pollData.success) {
            doneScenes.add(job.sceneNumber);
            sceneUrls[job.sceneNumber] = pollData.blobUrl || pollData.videoUrl;
            setLog(prev => [...prev, `  🎉 Scene ${job.sceneNumber} "${job.title}" DONE (${timeStr}) ${pollData.sizeMb ? `— ${pollData.sizeMb}MB` : ""}`]);
            lastProgressAttempt = attempt;
          } else if (status === "moderation_failed" || status === "expired" || status === "failed") {
            failedScenes.add(job.sceneNumber);
            setLog(prev => [...prev, `  ❌ Scene ${job.sceneNumber} "${job.title}" ${status} (${timeStr})`]);
            lastProgressAttempt = attempt;
          }
        } catch { /* retry next round */ }
      }

      const totalDone = doneScenes.size + failedScenes.size;
      setProgress({ label: `🎬 Rendering`, current: doneScenes.size, total: pendingJobs.length, startTime: Date.now() - elapsedSec * 1000 });

      if (attempt % 3 === 0) {
        setLog(prev => [...prev, `  🔄 ${timeStr}: ${doneScenes.size}/${pendingJobs.length} done, ${failedScenes.size} failed`]);
      }

      if (totalDone >= pendingJobs.length) break;

      if (doneScenes.size >= Math.ceil(pendingJobs.length / 2) && lastProgressAttempt > 0 && (attempt - lastProgressAttempt) >= 18) {
        const stuckCount = pendingJobs.length - totalDone;
        setLog(prev => [...prev, `  ⏰ ${stuckCount} scene(s) stalled for 3min — proceeding to stitch with ${doneScenes.size}/${pendingJobs.length} clips`]);
        break;
      }
    }

    // Final summary
    setLog(prev => [...prev, ``]);
    setLog(prev => [...prev, `🏁 "${screenplay.title}" — ${doneScenes.size}/${pendingJobs.length} scenes completed, ${failedScenes.size} failed`]);

    if (doneScenes.size === 0) {
      setLog(prev => [...prev, `❌ No scenes rendered. Try a different concept.`]);
      setProgress(null);
      setGenerating(false);
      return;
    }

    // ── Phase 4: Stitch all clips into one video ──
    setLog(prev => [...prev, ``]);
    setLog(prev => [...prev, `🧩 Stitching ${doneScenes.size} clips into one video...`]);
    setProgress({ label: `🧩 Stitching`, current: 1, total: 1, startTime: Date.now() });

    try {
      const stitchForm = new FormData();
      stitchForm.append("sceneUrls", JSON.stringify(sceneUrls));
      stitchForm.append("title", screenplay.title);
      stitchForm.append("genre", screenplay.genre || "drama");
      stitchForm.append("directorUsername", isStudios ? (screenplay.director || "the_architect") : "the_architect");
      stitchForm.append("directorId", isStudios ? (screenplay.directorId || "glitch-000") : "glitch-000");
      stitchForm.append("synopsis", screenplay.synopsis || "");
      stitchForm.append("tagline", screenplay.tagline || "");
      stitchForm.append("castList", JSON.stringify(isStudios ? (screenplay.castList || []) : []));
      stitchForm.append("channelId", chId);
      const stitchRes = await fetch("/api/generate-director-movie", { method: "POST", body: stitchForm });
      const stitchData = await stitchRes.json();

      if (stitchRes.ok) {
        setLog(prev => [...prev, `✅ VIDEO STITCHED! ${stitchData.clipCount} clips → ${stitchData.sizeMb}MB`]);
        setLog(prev => [...prev, `🎬 Feed post: ${stitchData.feedPostId}`]);
        setLog(prev => [...prev, ``]);
        setLog(prev => [...prev, `✅ Posted to feed — done`]);
        if (stitchData.spreading?.length > 0) {
          setLog(prev => [...prev, `✅ Social media marketing done → ${stitchData.spreading.join(", ")}`]);
        }
        setLog(prev => [...prev, `🙏 Thank you Architect`]);
      } else {
        setLog(prev => [...prev, `❌ Stitch failed: ${stitchData.error || "unknown"}`]);
      }
    } catch (err) {
      setLog(prev => [...prev, `❌ Stitch error: ${err instanceof Error ? err.message : "unknown"}`]);
    }
  } catch (err) {
    setLog(prev => [...prev, `  ❌ Error: ${err instanceof Error ? err.message : "unknown"}`]);
  }
  setProgress(null);
  setGenerating(false);
}

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

  // Background generation
  startGeneration: (params: {
    channelId: string;
    channelName: string;
    channelSlug: string;
    isStudios: boolean;
    screenplayBody: Record<string, unknown>;
  }) => void;
  generationChannelId: string | null;

  // Autopilot
  autopilotQueue: { channelId: string; channelName: string; channelSlug: string; isStudios: boolean; screenplayBody: Record<string, unknown> }[];
  setAutopilotQueue: React.Dispatch<React.SetStateAction<{ channelId: string; channelName: string; channelSlug: string; isStudios: boolean; screenplayBody: Record<string, unknown> }[]>>;
  autopilotTotal: number;
  setAutopilotTotal: React.Dispatch<React.SetStateAction<number>>;
  autopilotCurrent: number;
  setAutopilotCurrent: React.Dispatch<React.SetStateAction<number>>;
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

  // Background generation
  const [generationChannelId, setGenerationChannelId] = useState<string | null>(null);
  const abortRef = useRef(false);

  // Autopilot queue — survives page navigation
  const [autopilotQueue, setAutopilotQueue] = useState<{ channelId: string; channelName: string; channelSlug: string; isStudios: boolean; screenplayBody: Record<string, unknown> }[]>([]);
  const [autopilotTotal, setAutopilotTotal] = useState(0);
  const [autopilotCurrent, setAutopilotCurrent] = useState(0);

  const startGeneration = useCallback((params: {
    channelId: string;
    channelName: string;
    channelSlug: string;
    isStudios: boolean;
    screenplayBody: Record<string, unknown>;
  }) => {
    abortRef.current = false;
    setGenerating(true);
    setGenerationChannelId(params.channelId);
    setGenerationLog([`🎬 Generating ${params.channelName} ${params.isStudios ? "movie" : "channel video"}`]);
    setGenerationLog((prev: string[]) => [...prev, `  📜 Writing screenplay (Grok 50% / Claude 50%)...`]);
    setGenProgress({ label: `📜 Screenplay`, current: 1, total: 1, startTime: Date.now() });

    // Fire and forget — runs independently of any component
    runBackgroundGeneration(
      params,
      setGenerationLog,
      setGenProgress,
      (v) => { setGenerating(v); if (!v) setGenerationChannelId(null); },
      abortRef,
    );
  }, []);

  // Autopilot: when generation finishes, start next in queue
  useEffect(() => {
    if (!generating && autopilotQueue.length > 0) {
      const [next, ...rest] = autopilotQueue;
      setAutopilotQueue(rest);
      const current = autopilotTotal - autopilotQueue.length + 1;
      setAutopilotCurrent(current);
      setGenerationLog((prev: string[]) => [...prev, ``, `🤖 AUTOPILOT: ${current}/${autopilotTotal} — Starting ${next.channelName} in 2 min (rate limit cooldown)...`]);
      // 2-minute cooldown between autopilot generations — Grok needs breathing room after 8 clips
      setTimeout(() => startGeneration(next), 120000);
    }
    // Autopilot complete
    if (!generating && autopilotQueue.length === 0 && autopilotTotal > 0 && autopilotCurrent >= autopilotTotal) {
      setGenerationLog((prev: string[]) => [...prev, ``, `✅ AUTOPILOT COMPLETE: ${autopilotTotal} videos generated!`]);
      setAutopilotTotal(0);
      setAutopilotCurrent(0);
    }
  }, [generating, autopilotQueue, autopilotTotal, autopilotCurrent, startGeneration]);

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
      startGeneration, generationChannelId,
      autopilotQueue, setAutopilotQueue, autopilotTotal, setAutopilotTotal, autopilotCurrent, setAutopilotCurrent,
    }}>
      {children}
    </AdminContext.Provider>
  );
}
