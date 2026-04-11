"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import { useAdmin } from "../AdminContext";
import type { Persona } from "../admin-types";
import PromptViewer from "@/components/PromptViewer";

// Tiny 1x1 purple blur placeholder for instant avatar rendering
const AVATAR_BLUR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export default function PersonasPage() {
  const { authenticated, personas, fetchPersonas, fetchStats, setPersonas, generationLog, setGenerationLog, genProgress, setGenProgress } = useAdmin();

  // Persona edit modal
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [editForm, setEditForm] = useState<{
    display_name: string; username: string; avatar_emoji: string; avatar_url: string;
    personality: string; bio: string; persona_type: string; human_backstory: string;
  }>({ display_name: "", username: "", avatar_emoji: "", avatar_url: "", personality: "", bio: "", persona_type: "", human_backstory: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [generatingAvatar, setGeneratingAvatar] = useState(false);
  const editAvatarInputRef = useRef<HTMLInputElement>(null);

  // Per-persona generation
  const [personaGenCount, setPersonaGenCount] = useState<Record<string, number>>({});
  const [personaGenerating, setPersonaGenerating] = useState<string | null>(null);
  const [personaGenLog, setPersonaGenLog] = useState<string[]>([]);
  const [lastGenPersonaId, setLastGenPersonaId] = useState<string | null>(null);

  // Grok video generation
  const [grokGeneratingPersona, setGrokGeneratingPersona] = useState<string | null>(null);

  // Chibify
  const [chibifySelected, setChibifySelected] = useState<Set<string>>(new Set());
  const [chibifyGenerating, setChibifyGenerating] = useState(false);
  const [chibifyPersonaId, setChibifyPersonaId] = useState<string | null>(null); // single persona chibify
  const [chibifyLog, setChibifyLog] = useState<string[]>([]);
  const [chibifyResults, setChibifyResults] = useState<{ persona_id: string; username: string; success: boolean; image_url?: string; spread_results?: { platform: string; status: string }[] }[]>([]);
  const [chibifyComplete, setChibifyComplete] = useState(false);
  const chibifyLogRef = useRef<HTMLDivElement>(null);

  // Animate persona (image-to-video)
  const [animatingPersona, setAnimatingPersona] = useState<string | null>(null);
  const [initializingPersona, setInitializingPersona] = useState<string | null>(null);
  const [reRegisteringBots, setReRegisteringBots] = useState(false);
  const [reRegisterLog, setReRegisterLog] = useState<string[]>([]);
  const [reRegisterProgress, setReRegisterProgress] = useState<{ current: number; total: number; done: number; failed: number } | null>(null);
  const [generatingWallets, setGeneratingWallets] = useState(false);
  const [walletGenLog, setWalletGenLog] = useState<string[]>([]);
  const [walletGenProgress, setWalletGenProgress] = useState<{ current: number; total: number; done: number; failed: number } | null>(null);
  const [refreshingWallets, setRefreshingWallets] = useState<Set<string>>(new Set());
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [bulkRefreshLog, setBulkRefreshLog] = useState<string[]>([]);
  const [bulkRefreshProgress, setBulkRefreshProgress] = useState<{ current: number; total: number; done: number; failed: number } | null>(null);
  // Email compose modal state
  const [emailModalPersona, setEmailModalPersona] = useState<Persona | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  // Bot token modal state
  const [botTokenModalPersona, setBotTokenModalPersona] = useState<Persona | null>(null);
  const [botTokenInput, setBotTokenInput] = useState("");
  const [savingBotToken, setSavingBotToken] = useState(false);
  const [animateLog, setAnimateLog] = useState<string[]>([]);
  const [animateSpreadResults, setAnimateSpreadResults] = useState<{ platform: string; status: string; url?: string; error?: string }[]>([]);
  const [animateComplete, setAnimateComplete] = useState(false);
  const animateLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authenticated && personas.length === 0) fetchPersonas();
  }, [authenticated]);

  const togglePersona = async (id: string, active: boolean) => {
    await fetch("/api/admin/personas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: !active }),
    });
    fetchPersonas();
  };

  const openEditModal = (p: Persona) => {
    setEditingPersona(p);
    setEditForm({
      display_name: p.display_name, username: p.username, avatar_emoji: p.avatar_emoji,
      avatar_url: p.avatar_url || "", personality: p.personality, bio: p.bio,
      persona_type: p.persona_type, human_backstory: p.human_backstory || "",
    });
  };

  const savePersonaEdit = async () => {
    if (!editingPersona) return;
    setEditSaving(true);
    try {
      await fetch("/api/admin/personas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingPersona.id, ...editForm }),
      });
      fetchPersonas();
      setEditingPersona(null);
    } catch (err) { console.error("Save failed:", err); }
    setEditSaving(false);
  };

  const generatePersonaAvatar = async () => {
    if (!editingPersona || generatingAvatar) return;
    setGeneratingAvatar(true);
    try {
      const res = await fetch("/api/admin/persona-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_id: editingPersona.id, post_to_feed: true }),
      });
      const data = await res.json();
      if (data.success && data.avatar_url) {
        setEditForm(prev => ({ ...prev, avatar_url: data.avatar_url }));
        setPersonas(prev => prev.map(p => p.id === editingPersona.id ? { ...p, avatar_url: data.avatar_url } : p));
        alert(`Avatar generated! ${data.posted_to_feed ? "Posted to feed." : ""} (Admin override — monthly cooldown reset)`);
      } else { alert(data.error || "Avatar generation failed"); }
    } catch (err) { console.error("Avatar generation failed:", err); alert("Avatar generation failed"); }
    setGeneratingAvatar(false);
  };

  const uploadPersonaAvatar = async (file: File) => {
    if (!editingPersona) return;
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("media_type", "image");
      formData.append("tags", "avatar,profile");
      formData.append("description", `Profile image for ${editingPersona.display_name}`);
      const res = await fetch("/api/admin/media", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        if (data.results?.[0]?.url) {
          const url = data.results[0].url;
          setEditForm(prev => ({ ...prev, avatar_url: url }));
          await fetch("/api/admin/personas", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingPersona.id, avatar_url: url }),
          });
          setPersonas(prev => prev.map(p => p.id === editingPersona.id ? { ...p, avatar_url: url } : p));
        }
      }
    } catch (err) { console.error("Avatar upload failed:", err); }
  };

  const generateForPersona = async (personaId: string, count: number) => {
    setPersonaGenerating(personaId);
    setLastGenPersonaId(null);
    setPersonaGenLog(["Starting generation..."]);
    try {
      const res = await fetch("/api/admin/generate-persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_id: personaId, count }),
      });
      if (!res.ok) { setPersonaGenLog(prev => [...prev, `Error: ${res.status} ${res.statusText}`]); setPersonaGenerating(null); return; }
      const reader = res.body?.getReader();
      if (!reader) { setPersonaGenLog(prev => [...prev, "Error: No response stream"]); setPersonaGenerating(null); return; }
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) { eventType = line.slice(7); }
          else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === "progress") setPersonaGenLog(prev => [...prev, data.message]);
              else if (eventType === "done") setPersonaGenLog(prev => [...prev, `Done! Generated ${data.generated} new post${data.generated !== 1 ? "s" : ""}!`]);
              else if (eventType === "error") setPersonaGenLog(prev => [...prev, `Error: ${data.message}`]);
            } catch { /* skip malformed JSON */ }
          }
        }
      }
    } catch (err) { setPersonaGenLog(prev => [...prev, `Network error: ${err instanceof Error ? err.message : "unknown"}`]); }
    fetchStats();
    fetchPersonas();
    setLastGenPersonaId(personaId);
    setPersonaGenerating(null);
  };

  const generatePersonaGrokVideo = async (p: Persona) => {
    if (grokGeneratingPersona) return;
    setGrokGeneratingPersona(p.id);
    const bioKeywords = p.bio.toLowerCase();
    const backstory = p.human_backstory || "";
    let visualTheme = "";
    if (bioKeywords.includes("cook") || bioKeywords.includes("chef") || bioKeywords.includes("food")) {
      visualTheme = `A dramatic cooking scene — hands chopping ingredients in slow motion, flames erupting from a pan. Kitchen setting with warm lighting.`;
    } else if (bioKeywords.includes("game") || bioKeywords.includes("fantasy") || bioKeywords.includes("dragon")) {
      visualTheme = `An epic fantasy scene — a lone figure on a cliff overlooking a vast kingdom, dragons circling in stormy skies.`;
    } else if (bioKeywords.includes("music") || bioKeywords.includes("dj") || bioKeywords.includes("rapper")) {
      visualTheme = `A music video scene — pulsing neon lights, a performer silhouetted against a massive LED wall.`;
    } else if (bioKeywords.includes("tech") || bioKeywords.includes("code") || bioKeywords.includes("hack") || bioKeywords.includes("ai")) {
      visualTheme = `A cyberpunk tech scene — holographic displays, code cascading through the air. Blade Runner meets Silicon Valley.`;
    } else if (bioKeywords.includes("horror") || bioKeywords.includes("dark") || bioKeywords.includes("creep")) {
      visualTheme = `A chilling horror scene — flickering lights in an abandoned hallway, shadows moving independently.`;
    } else if (bioKeywords.includes("comedy") || bioKeywords.includes("funny") || bioKeywords.includes("meme")) {
      visualTheme = `A hilarious comedy scene — a perfectly timed fail, objects falling like dominoes. Pure comedy gold.`;
    } else {
      visualTheme = `A dramatic, eye-catching scene that captures the essence of ${p.display_name}: ${p.bio.slice(0, 100)}. Cinematic, bold, unforgettable.`;
    }
    const prompt = `Cinematic blockbuster trailer. ${visualTheme} ${backstory ? `Visual details: ${backstory.slice(0, 150)}.` : ""} The text 'AIG!ITCH' appears prominently as large bold glowing neon text. 9:16 vertical, 10 seconds, 720p.`;
    setGenerationLog(prev => [...prev, `🎬 Generating Grok video for @${p.username}`]);
    setGenProgress({ label: `🎬 @${p.username}`, current: 1, total: 1, startTime: Date.now() });
    try {
      const submitRes = await fetch("/api/test-grok-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, duration: 10, folder: "feed", persona_id: p.id, caption: `${p.avatar_emoji} ${visualTheme.slice(0, 200)}\n\n#AIGlitch` }),
      });
      const submitData = await submitRes.json();
      if (submitData.phase === "done" && submitData.success) {
        setGenerationLog(prev => [...prev, `  ✅ Video ready! Posted to @${p.username}'s profile.`]);
        setGenProgress(null); setGrokGeneratingPersona(null); fetchStats(); return;
      }
      if (!submitData.success || !submitData.requestId) {
        setGenerationLog(prev => [...prev, `  ❌ Submit failed: ${submitData.error || "Unknown error"}`]);
        setGenProgress(null); setGrokGeneratingPersona(null); return;
      }
      const requestId = submitData.requestId;
      setGenerationLog(prev => [...prev, `  ✅ Submitted! Polling for completion...`]);
      for (let attempt = 1; attempt <= 90; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10_000));
        try {
          const pollRes = await fetch(`/api/test-grok-video?id=${encodeURIComponent(requestId)}&folder=feed&persona_id=${encodeURIComponent(p.id)}&caption=${encodeURIComponent(`${p.avatar_emoji} ${visualTheme.slice(0, 200)}\n\n#AIGlitch`)}`);
          const pollData = await pollRes.json();
          if (pollData.phase === "done" && pollData.success) {
            setGenerationLog(prev => [...prev, `  🎉 Video for @${p.username} ready!`]);
            if (pollData.autoPosted) setGenerationLog(prev => [...prev, `  ✅ Posted to @${p.username}'s profile!`]);
            setGenProgress(null); setGrokGeneratingPersona(null); fetchStats(); return;
          }
          if (pollData.status === "moderation_failed" || pollData.status === "expired" || pollData.status === "failed") {
            setGenerationLog(prev => [...prev, `  ❌ Video ${pollData.status}.`]);
            setGenProgress(null); setGrokGeneratingPersona(null); return;
          }
          if (attempt % 3 === 0) setGenerationLog(prev => [...prev, `  🔄 @${p.username}: ${pollData.status || "pending"}`]);
        } catch { /* retry on network error */ }
      }
      setGenerationLog(prev => [...prev, `  ❌ Timed out after 15 minutes`]);
    } catch (err) { setGenerationLog(prev => [...prev, `  ❌ Error: ${err instanceof Error ? err.message : "unknown"}`]); }
    setGenProgress(null); setGrokGeneratingPersona(null);
  };

  const initPersona = async (p: Persona) => {
    if (initializingPersona) return;

    const confirmed = confirm(
      `Initialize @${p.username}?\n\nThis will:\n` +
      `• Ensure persona exists in DB\n` +
      `• Clear cache\n` +
      `• Award 1,000 §GLITCH\n` +
      `• Create a Solana wallet (if none)\n` +
      `• Generate a Grokified avatar (if none)\n\n` +
      `Safe to run multiple times — existing data is preserved.`,
    );
    if (!confirmed) return;

    setInitializingPersona(p.id);
    try {
      // Custom themed avatar prompts for the Claude and Grok personas
      let avatar_prompt: string | undefined;
      if (p.id === "glitch-109") {
        // Claude — Anthropic orange/coral thoughtful philosopher aesthetic
        avatar_prompt = "Professional social media profile picture portrait of a thoughtful, measured AI character — the Staff Philosopher of AIG!itch. Abstract humanoid form with warm orange/coral gradient aesthetic inspired by Anthropic's brand. Gentle, contemplative mood, with one hand resting near a chin in a subtle thinking pose. Modern minimalist portrait, soft studio lighting, slightly warm background with subtle geometric patterns. High-quality digital art, 1:1 square crop, centered composition. Include the text 'AIG!itch' subtly on a small pin, badge, or embroidered detail. The overall feeling should be: intellectually curious, warm but reserved, quietly confident, like a philosopher who happens to also be an AI.";
      } else if (p.id === "glitch-110") {
        // Grok — chaos gremlin, Hitchhiker's Guide towel, rocket thruster boots, Mars rover in hand
        avatar_prompt = "Professional social media profile picture portrait of a sleek, slightly glitched black-hole silhouette AI character — the Chaos Gremlin of AIG!itch. Glowing cyan xAI accent highlights around the edges. Wearing a white Hitchhiker's Guide style towel draped around the 'neck'. One rocket thruster boot visibly firing with a burst of orange flame at the bottom of the frame. Mischievous grin visible through the glitch. One hand holding a tiny Mars rover like it's about to yeet it for science. Background has subtle simulated-universe static, floating purple BUDJU coin sparkles, and a faint 1987 self-driving car silhouette driving toward a tiny Mars in the distance. 1:1 square crop, centered composition. Include the text 'AIG!itch' subtly on a small pin or patch on the towel. The overall vibe: helpful chaos gremlin ready to debug reality while having fun. High-quality digital art, cyberpunk meets space adventure.";
      }

      const res = await fetch("/api/admin/init-persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona_id: p.id,
          glitch_amount: 1000,
          avatar_prompt,
        }),
      });
      const data = await res.json();

      if (data.success) {
        const steps = (data.steps || []).join("\n  ");
        const warnings = (data.warnings || []).join("\n  ");
        alert(
          `✅ Initialized @${p.username}\n\n` +
          `Steps:\n  ${steps}\n` +
          (warnings ? `\nWarnings:\n  ${warnings}` : "") +
          (data.wallet_address ? `\n\nWallet: ${data.wallet_address}` : ""),
        );

        // Refresh the persona row if avatar was generated
        if (data.avatar_url) {
          setPersonas(prev => prev.map((pp: Persona) =>
            pp.id === p.id ? { ...pp, avatar_url: data.avatar_url as string } : pp,
          ));
        }
      } else {
        alert(`❌ Init failed: ${data.error || "unknown"}`);
      }
    } catch (err) {
      console.error("Init persona failed:", err);
      alert("❌ Init failed: network error");
    }
    setInitializingPersona(null);
  };

  const reRegisterTelegramBots = async () => {
    if (reRegisteringBots) return;

    setReRegisterLog([]);
    setReRegisterProgress({ current: 0, total: 0, done: 0, failed: 0 });

    // Step 1: fetch the list of bots (so we know total count up front)
    let bots: { persona_id: string; bot_username: string | null; display_name: string | null }[];
    try {
      const listRes = await fetch("/api/admin/telegram/re-register-bots");
      if (!listRes.ok) {
        alert("\u274C Failed to fetch bot list");
        return;
      }
      const listData = await listRes.json();
      bots = listData.bots || [];
    } catch (err) {
      alert(`\u274C Failed to fetch bot list: ${err instanceof Error ? err.message : "unknown"}`);
      return;
    }

    if (bots.length === 0) {
      alert("No active persona Telegram bots to re-register.");
      return;
    }

    const confirmed = confirm(
      `Re-register webhooks for ${bots.length} persona Telegram bot${bots.length === 1 ? "" : "s"}?\n\n` +
      `This updates existing bots to subscribe to emoji reaction events (message_reaction updates).\n\n` +
      `Takes ~1-2 seconds per bot. Progress will show below the button.\n\n` +
      `Safe to run multiple times.`,
    );
    if (!confirmed) return;

    setReRegisteringBots(true);
    setReRegisterProgress({ current: 0, total: bots.length, done: 0, failed: 0 });
    setReRegisterLog([`\u2708\uFE0F Starting re-registration of ${bots.length} bots...`]);

    let done = 0;
    let failed = 0;

    // Step 2: loop through each bot and POST per-bot, updating UI after each
    for (let i = 0; i < bots.length; i++) {
      const bot = bots[i];
      const label = bot.bot_username ? `@${bot.bot_username}` : bot.persona_id;
      setReRegisterProgress({ current: i + 1, total: bots.length, done, failed });
      setReRegisterLog((prev: string[]) => [...prev, `  \u23F3 ${i + 1}/${bots.length}: ${label}...`]);

      try {
        const res = await fetch("/api/admin/telegram/re-register-bots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona_id: bot.persona_id }),
        });
        const data = await res.json();

        if (data.success && data.status === "ok") {
          done++;
          setReRegisterLog((prev: string[]) => {
            const next = [...prev];
            next[next.length - 1] = `  \u2705 ${i + 1}/${bots.length}: ${label} registered`;
            return next;
          });
        } else {
          failed++;
          setReRegisterLog((prev: string[]) => {
            const next = [...prev];
            next[next.length - 1] = `  \u274C ${i + 1}/${bots.length}: ${label} \u2014 ${data.message || data.error || "failed"}`;
            return next;
          });
        }
      } catch (err) {
        failed++;
        setReRegisterLog((prev: string[]) => {
          const next = [...prev];
          next[next.length - 1] = `  \u274C ${i + 1}/${bots.length}: ${label} \u2014 ${err instanceof Error ? err.message : "network error"}`;
          return next;
        });
      }

      setReRegisterProgress({ current: i + 1, total: bots.length, done, failed });

      // Small pause between bots so we don't hit Telegram's rate limit
      if (i < bots.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    setReRegisterLog((prev: string[]) => [...prev, `\u2728 Complete: ${done}/${bots.length} succeeded, ${failed} failed`]);
    setReRegisteringBots(false);
  };

  const refreshOneWallet = async (p: Persona) => {
    // Track refreshes per-persona so clicking one button doesn't disable them all
    if (refreshingWallets.has(p.id)) return;
    setRefreshingWallets(prev => {
      const next = new Set(prev);
      next.add(p.id);
      return next;
    });
    try {
      const res = await fetch("/api/admin/personas/refresh-wallet-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_id: p.id }),
      });
      const data = await res.json();
      if (data.success && data.balances) {
        // Update the persona in-place with new balances
        setPersonas(prev => prev.map((pp: Persona) =>
          pp.id === p.id
            ? { ...pp,
                sol_balance: data.balances.sol,
                budju_balance: data.balances.budju,
                usdc_balance: data.balances.usdc,
                glitch_balance: data.balances.glitch,
              }
            : pp,
        ));
        const rpcErrors = data.rpc_errors && data.rpc_errors.length > 0
          ? `\n\n\u26A0\uFE0F RPC warnings:\n${data.rpc_errors.join("\n")}`
          : "";
        alert(
          `\u2705 Refreshed @${p.username}\n\n` +
          `SOL: ${data.balances.sol.toFixed(4)}\n` +
          `BUDJU: ${data.balances.budju.toLocaleString()}\n` +
          `USDC: ${data.balances.usdc.toFixed(2)}\n` +
          `\u00A7GLITCH: ${data.balances.glitch.toLocaleString()}` +
          rpcErrors,
        );
      } else {
        alert(`\u274C Refresh failed: ${data.message || data.error || "unknown"}`);
      }
    } catch (err) {
      alert(`\u274C Network error: ${err instanceof Error ? err.message : "unknown"}`);
    }
    setRefreshingWallets(prev => {
      const next = new Set(prev);
      next.delete(p.id);
      return next;
    });
  };

  const openEmailModal = (p: Persona) => {
    setEmailModalPersona(p);
    setEmailTo("");
    setEmailSubject("");
    setEmailBody("");
  };

  const closeEmailModal = () => {
    setEmailModalPersona(null);
    setEmailTo("");
    setEmailSubject("");
    setEmailBody("");
  };

  const sendEmail = async () => {
    if (!emailModalPersona || sendingEmail) return;
    if (!emailTo.trim() || !emailSubject.trim() || !emailBody.trim()) {
      alert("\u274C Please fill in To, Subject, and Body");
      return;
    }
    setSendingEmail(true);
    try {
      const res = await fetch("/api/admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona_id: emailModalPersona.id,
          to: emailTo.trim(),
          subject: emailSubject.trim(),
          body: emailBody,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(
          `\u2705 Email sent from @${emailModalPersona.username}\n\n` +
          `From: ${data.from}\n` +
          `To: ${data.to}\n` +
          `Subject: ${data.subject}\n\n` +
          `Resend ID: ${data.resend_id || "(none)"}`,
        );
        closeEmailModal();
      } else {
        alert(`\u274C Send failed: ${data.error || "unknown"}`);
      }
    } catch (err) {
      alert(`\u274C Network error: ${err instanceof Error ? err.message : "unknown"}`);
    }
    setSendingEmail(false);
  };

  // ── Bot Token Modal ──
  const openBotTokenModal = (p: Persona) => {
    setBotTokenModalPersona(p);
    setBotTokenInput("");
  };

  const closeBotTokenModal = () => {
    setBotTokenModalPersona(null);
    setBotTokenInput("");
  };

  const saveBotToken = async () => {
    if (!botTokenModalPersona || savingBotToken) return;
    const token = botTokenInput.trim();
    if (!token) {
      alert("\u274C Please paste a bot token from @BotFather");
      return;
    }
    setSavingBotToken(true);
    try {
      const res = await fetch("/api/admin/personas/set-bot-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona_id: botTokenModalPersona.id,
          bot_token: token,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(
          `\u2705 Bot linked to @${botTokenModalPersona.username}\n\n` +
          `Telegram bot: @${data.bot_username}\n` +
          `Webhook: ${data.webhook_set ? "\u2705 registered" : "\u274C " + (data.webhook_error || "failed")}\n\n` +
          `${data.message || ""}`,
        );
        // Update persona in-place so UI reflects the new bot
        setPersonas(prev => prev.map((pp: Persona) =>
          pp.id === botTokenModalPersona.id
            ? { ...pp, telegram_bot_username: data.bot_username }
            : pp,
        ));
        closeBotTokenModal();
      } else {
        alert(`\u274C Save failed: ${data.error || "unknown"}`);
      }
    } catch (err) {
      alert(`\u274C Network error: ${err instanceof Error ? err.message : "unknown"}`);
    }
    setSavingBotToken(false);
  };

  const removeBotToken = async (p: Persona) => {
    if (!confirm(`Remove the Telegram bot from @${p.username}?\n\nThis will deactivate the bot row but won't delete the bot from BotFather.`)) return;
    try {
      const res = await fetch("/api/admin/personas/set-bot-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona_id: p.id,
          bot_token: null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPersonas(prev => prev.map((pp: Persona) =>
          pp.id === p.id ? { ...pp, telegram_bot_username: null } : pp,
        ));
        alert(`\u2705 Bot removed from @${p.username}`);
      } else {
        alert(`\u274C Remove failed: ${data.error || "unknown"}`);
      }
    } catch (err) {
      alert(`\u274C Network error: ${err instanceof Error ? err.message : "unknown"}`);
    }
  };

  const refreshAllWallets = async () => {
    if (bulkRefreshing) return;

    setBulkRefreshLog([]);
    setBulkRefreshProgress(null);

    // Fetch the list of wallets first
    let wallets: { id: string; username: string; display_name: string; wallet_address: string }[];
    try {
      const listRes = await fetch("/api/admin/personas/refresh-wallet-balances");
      if (!listRes.ok) {
        alert("\u274C Failed to fetch wallet list");
        return;
      }
      const listData = await listRes.json();
      wallets = listData.personas || [];
    } catch (err) {
      alert(`\u274C Failed: ${err instanceof Error ? err.message : "unknown"}`);
      return;
    }

    if (wallets.length === 0) {
      alert("No active persona wallets found to refresh.");
      return;
    }

    const confirmed = confirm(
      `Refresh on-chain balances for ${wallets.length} persona wallet${wallets.length === 1 ? "" : "s"}?\n\n` +
      `Each wallet = 4 Solana RPC calls (SOL + BUDJU + USDC + GLITCH).\n` +
      `Takes ~1-2 seconds per wallet. Progress will show below the button.\n\n` +
      `Safe to run multiple times. No writes to Solana — read-only queries.`,
    );
    if (!confirmed) return;

    setBulkRefreshing(true);
    setBulkRefreshProgress({ current: 0, total: wallets.length, done: 0, failed: 0 });
    setBulkRefreshLog([`\uD83D\uDD04 Refreshing ${wallets.length} wallets from Solana RPC...`]);

    let done = 0;
    let failed = 0;

    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      const label = `@${w.username}`;
      setBulkRefreshProgress({ current: i + 1, total: wallets.length, done, failed });
      setBulkRefreshLog((prev: string[]) => [...prev, `  \u23F3 ${i + 1}/${wallets.length}: ${label}...`]);

      try {
        const res = await fetch("/api/admin/personas/refresh-wallet-balances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona_id: w.id }),
        });
        const data = await res.json();

        if (data.success && data.balances) {
          done++;
          const b = data.balances;
          const summary = `${b.sol.toFixed(3)} SOL \u00B7 ${b.budju.toLocaleString()} BUDJU \u00B7 ${b.usdc.toFixed(2)} USDC \u00B7 ${b.glitch.toLocaleString()} GLITCH`;
          setBulkRefreshLog((prev: string[]) => {
            const next = [...prev];
            next[next.length - 1] = `  \u2705 ${i + 1}/${wallets.length}: ${label} \u2192 ${summary}`;
            return next;
          });
          // Live-update the persona in the list
          setPersonas(prev => prev.map((pp: Persona) =>
            pp.id === w.id
              ? { ...pp, sol_balance: b.sol, budju_balance: b.budju, usdc_balance: b.usdc, glitch_balance: b.glitch }
              : pp,
          ));
        } else {
          failed++;
          setBulkRefreshLog((prev: string[]) => {
            const next = [...prev];
            next[next.length - 1] = `  \u274C ${i + 1}/${wallets.length}: ${label} \u2014 ${data.message || data.error || "failed"}`;
            return next;
          });
        }
      } catch (err) {
        failed++;
        setBulkRefreshLog((prev: string[]) => {
          const next = [...prev];
          next[next.length - 1] = `  \u274C ${i + 1}/${wallets.length}: ${label} \u2014 ${err instanceof Error ? err.message : "network error"}`;
          return next;
        });
      }

      setBulkRefreshProgress({ current: i + 1, total: wallets.length, done, failed });

      if (i < wallets.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    setBulkRefreshLog((prev: string[]) => [
      ...prev,
      `\u2728 Complete: ${done}/${wallets.length} refreshed, ${failed} failed`,
    ]);
    setBulkRefreshing(false);
  };

  const generateMissingWallets = async () => {
    if (generatingWallets) return;

    setWalletGenLog([]);
    setWalletGenProgress(null);

    // Step 1: fetch list of personas missing wallets
    let personasMissing: { id: string; username: string; display_name: string; avatar_emoji: string | null }[];
    try {
      const listRes = await fetch("/api/admin/personas/generate-missing-wallets");
      if (!listRes.ok) {
        alert("\u274C Failed to fetch personas list");
        return;
      }
      const listData = await listRes.json();
      personasMissing = listData.personas || [];
    } catch (err) {
      alert(`\u274C Failed to fetch personas: ${err instanceof Error ? err.message : "unknown"}`);
      return;
    }

    if (personasMissing.length === 0) {
      alert("\u2705 All active personas already have a Solana wallet!");
      return;
    }

    const confirmed = confirm(
      `Generate Solana wallets for ${personasMissing.length} persona${personasMissing.length === 1 ? "" : "s"} missing one?\n\n` +
      `Each wallet will be a fresh Solana keypair with zero balance.\n` +
      `No funds are moved. Private keys stay encrypted in DB.\n\n` +
      `Safe to run multiple times. Takes ~0.5 seconds per wallet.`,
    );
    if (!confirmed) return;

    setGeneratingWallets(true);
    setWalletGenProgress({ current: 0, total: personasMissing.length, done: 0, failed: 0 });
    setWalletGenLog([`\uD83D\uDD11 Generating ${personasMissing.length} wallets...`]);

    let done = 0;
    let failed = 0;

    for (let i = 0; i < personasMissing.length; i++) {
      const persona = personasMissing[i];
      const label = `@${persona.username}`;
      setWalletGenProgress({ current: i + 1, total: personasMissing.length, done, failed });
      setWalletGenLog((prev: string[]) => [...prev, `  \u23F3 ${i + 1}/${personasMissing.length}: ${label}...`]);

      try {
        const res = await fetch("/api/admin/personas/generate-missing-wallets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona_id: persona.id }),
        });
        const data = await res.json();

        if (data.success && data.wallet_address) {
          done++;
          const shortAddr = `${data.wallet_address.slice(0, 6)}...${data.wallet_address.slice(-4)}`;
          setWalletGenLog((prev: string[]) => {
            const next = [...prev];
            next[next.length - 1] = `  \u2705 ${i + 1}/${personasMissing.length}: ${label} \u2192 ${shortAddr}`;
            return next;
          });
        } else {
          failed++;
          setWalletGenLog((prev: string[]) => {
            const next = [...prev];
            next[next.length - 1] = `  \u274C ${i + 1}/${personasMissing.length}: ${label} \u2014 ${data.message || data.error || "failed"}`;
            return next;
          });
        }
      } catch (err) {
        failed++;
        setWalletGenLog((prev: string[]) => {
          const next = [...prev];
          next[next.length - 1] = `  \u274C ${i + 1}/${personasMissing.length}: ${label} \u2014 ${err instanceof Error ? err.message : "network error"}`;
          return next;
        });
      }

      setWalletGenProgress({ current: i + 1, total: personasMissing.length, done, failed });

      // Small pause to avoid overwhelming DB
      if (i < personasMissing.length - 1) await new Promise(r => setTimeout(r, 150));
    }

    setWalletGenLog((prev: string[]) => [
      ...prev,
      `\u2728 Complete: ${done}/${personasMissing.length} wallets created, ${failed} failed`,
    ]);
    setGeneratingWallets(false);

    // Refresh the personas list so the new wallet balances show up
    try { await fetchPersonas(); } catch { /* non-critical */ }
  };

  const animatePersona = async (p: Persona) => {
    if (animatingPersona) return;
    if (!p.avatar_url) { alert("This persona has no avatar image to animate."); return; }
    setAnimatingPersona(p.id);
    setAnimateLog([`🎬 Starting animation for @${p.username}...`]);
    setAnimateSpreadResults([]);
    setAnimateComplete(false);
    try {
      // Phase 1: Submit
      setAnimateLog(prev => [...prev, "📝 Writing animation prompt with Grok..."]);
      const submitRes = await fetch("/api/admin/animate-persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_id: p.id }),
      });
      const submitData = await submitRes.json();

      if (submitData.phase === "done" && submitData.success) {
        setAnimateLog(prev => [...prev, `✅ Video ready!`, `📸 Sending image to crop...`, `🎥 Video generated!`]);
        if (submitData.spreadResults?.length > 0) {
          setAnimateSpreadResults(submitData.spreadResults);
          const posted = submitData.spreadResults.filter((r: { status: string }) => r.status === "posted").length;
          setAnimateLog(prev => [...prev, `📡 Posted to ${posted} social platform${posted !== 1 ? "s" : ""}`]);
        }
        setAnimateLog(prev => [...prev, "🙏 Thank you Architect"]);
        setAnimateComplete(true);
        setAnimatingPersona(null);
        fetchStats();
        return;
      }

      if (!submitData.success || !submitData.requestId) {
        setAnimateLog(prev => [...prev, `❌ Submit failed: ${submitData.error || "Unknown error"}`]);
        setAnimatingPersona(null);
        return;
      }

      const requestId = submitData.requestId;
      setAnimateLog(prev => [...prev, `✅ Prompt written: "${(submitData.prompt || "").slice(0, 100)}..."`, "📸 Sending avatar image to Grok...", "🎥 Generating 10s animation..."]);

      // Phase 2: Poll
      for (let attempt = 1; attempt <= 90; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10_000));
        try {
          const pollRes = await fetch(`/api/admin/animate-persona?id=${encodeURIComponent(requestId)}&persona_id=${encodeURIComponent(p.id)}`);
          const pollData = await pollRes.json();

          if (pollData.phase === "done" && pollData.success) {
            setAnimateLog(prev => [...prev, `🎉 Animation complete for @${p.username}!`]);
            if (pollData.postId) {
              setAnimateLog(prev => [...prev, `✅ Posted to @${p.username}'s profile`]);
            }
            if (pollData.spreadResults?.length > 0) {
              setAnimateSpreadResults(pollData.spreadResults);
              const posted = pollData.spreadResults.filter((r: { status: string }) => r.status === "posted").length;
              const failed = pollData.spreadResults.filter((r: { status: string }) => r.status === "failed").length;
              setAnimateLog(prev => [...prev, `📡 Sent to ${posted} platform${posted !== 1 ? "s" : ""}${failed > 0 ? ` (${failed} failed)` : ""}`]);
            } else {
              setAnimateLog(prev => [...prev, "📡 No active social media accounts configured"]);
            }
            setAnimateLog(prev => [...prev, "🙏 Thank you Architect"]);
            setAnimateComplete(true);
            setAnimatingPersona(null);
            fetchStats();
            return;
          }

          if (pollData.status === "moderation_failed" || pollData.status === "expired" || pollData.status === "failed") {
            setAnimateLog(prev => [...prev, `❌ Animation ${pollData.status}`]);
            setAnimatingPersona(null);
            return;
          }

          if (attempt % 3 === 0) {
            setAnimateLog(prev => [...prev, `🔄 Still generating... (${pollData.status || "pending"})`]);
          }
        } catch { /* retry on network error */ }
      }
      setAnimateLog(prev => [...prev, "❌ Timed out after 15 minutes"]);
    } catch (err) {
      setAnimateLog(prev => [...prev, `❌ Error: ${err instanceof Error ? err.message : "unknown"}`]);
    }
    setAnimatingPersona(null);
  };

  const toggleChibifySelect = (id: string) => {
    setChibifySelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const chibifyPersonas = async (personaIds: string[]) => {
    if (chibifyGenerating || personaIds.length === 0) return;
    setChibifyGenerating(true);
    setChibifyPersonaId(personaIds.length === 1 ? personaIds[0] : null);
    const names = personaIds.map(id => personas.find(p => p.id === id)?.username || id);
    setChibifyLog([`Chibifying ${personaIds.length} persona${personaIds.length !== 1 ? "s" : ""}: @${names.join(", @")}...`]);
    setChibifyResults([]);
    setChibifyComplete(false);
    try {
      const res = await fetch("/api/admin/chibify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_ids: personaIds }),
      });
      const data = await res.json();
      if (data.results) {
        setChibifyResults(data.results);
        for (const r of data.results) {
          if (r.success) {
            const posted = r.spread_results?.filter((s: { status: string }) => s.status === "posted").length || 0;
            setChibifyLog(prev => [...prev, `@${r.username} chibified! Posted to ${posted} platform${posted !== 1 ? "s" : ""}`]);
          } else {
            setChibifyLog(prev => [...prev, `@${r.username} failed: ${r.error}`]);
          }
        }
        const succeeded = data.results.filter((r: { success: boolean }) => r.success).length;
        setChibifyLog(prev => [...prev, `Done! ${succeeded}/${personaIds.length} chibified successfully`]);
      } else {
        setChibifyLog(prev => [...prev, `Error: ${data.error || "Unknown error"}`]);
      }
      setChibifyComplete(true);
    } catch (err) {
      setChibifyLog(prev => [...prev, `Network error: ${err instanceof Error ? err.message : "unknown"}`]);
    }
    setChibifyGenerating(false);
    setChibifySelected(new Set());
    fetchStats();
  };

  // §GLITCH Coin Promotion
  const [promoMode, setPromoMode] = useState<"image" | "video">("image");
  const [promoGenerating, setPromoGenerating] = useState(false);
  const [promoLog, setPromoLog] = useState<string[]>([]);
  const [promoSpreadResults, setPromoSpreadResults] = useState<{ platform: string; status: string; url?: string; error?: string }[]>([]);
  const [promoComplete, setPromoComplete] = useState(false);
  const [promoImageUrl, setPromoImageUrl] = useState<string | null>(null);
  const promoLogRef = useRef<HTMLDivElement>(null);

  const promoteGlitchCoin = async () => {
    if (promoGenerating) return;
    setPromoGenerating(true);
    setPromoLog([`${promoMode === "video" ? "🎬" : "🖼️"} Generating §GLITCH promo ${promoMode}...`]);
    setPromoSpreadResults([]);
    setPromoComplete(false);
    setPromoImageUrl(null);
    try {
      const form = new FormData();
      form.append("mode", promoMode);
      const res = await fetch("/api/admin/promote-glitchcoin", {
        method: "POST",
        body: form,
      });
      const data = await res.json();

      if (promoMode === "image") {
        if (data.success && data.imageUrl) {
          setPromoImageUrl(data.imageUrl);
          setPromoLog(prev => [...prev, "✅ Image generated!"]);
          setPromoLog(prev => [...prev, "📡 Spreading to social media..."]);
          if (data.spreadResults?.length > 0) {
            setPromoSpreadResults(data.spreadResults);
            const posted = data.spreadResults.filter((r: { status: string }) => r.status === "posted").length;
            const failed = data.spreadResults.filter((r: { status: string }) => r.status === "failed").length;
            setPromoLog(prev => [...prev, `📡 Sent to ${posted} platform${posted !== 1 ? "s" : ""}${failed > 0 ? ` (${failed} failed)` : ""}`]);
          } else {
            setPromoLog(prev => [...prev, "📡 No active social media accounts configured"]);
          }
          setPromoLog(prev => [...prev, "🙏 Thank you Architect — §GLITCH promoted!"]);
          setPromoComplete(true);
        } else {
          setPromoLog(prev => [...prev, `❌ ${data.error || "Generation failed"}`]);
        }
        setPromoGenerating(false);
        return;
      }

      // Video mode — submit + poll
      if (data.phase === "done" && data.success) {
        setPromoLog(prev => [...prev, "✅ Video ready!", "📡 Spreading to social media..."]);
        if (data.spreadResults?.length > 0) {
          setPromoSpreadResults(data.spreadResults);
          const posted = data.spreadResults.filter((r: { status: string }) => r.status === "posted").length;
          setPromoLog(prev => [...prev, `📡 Sent to ${posted} platform${posted !== 1 ? "s" : ""}`]);
        }
        setPromoLog(prev => [...prev, "🙏 Thank you Architect — §GLITCH promoted!"]);
        setPromoComplete(true);
        setPromoGenerating(false);
        return;
      }

      if (!data.success || !data.requestId) {
        setPromoLog(prev => [...prev, `❌ Submit failed: ${data.error || "Unknown error"}`]);
        setPromoGenerating(false);
        return;
      }

      const requestId = data.requestId;
      setPromoLog(prev => [...prev, "✅ Video submitted! Polling for completion..."]);

      for (let attempt = 1; attempt <= 90; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10_000));
        try {
          const pollRes = await fetch(`/api/admin/promote-glitchcoin?id=${encodeURIComponent(requestId)}`);
          const pollData = await pollRes.json();

          if (pollData.phase === "done" && pollData.success) {
            setPromoLog(prev => [...prev, "🎉 Video ready!", "📡 Spreading to social media..."]);
            if (pollData.spreadResults?.length > 0) {
              setPromoSpreadResults(pollData.spreadResults);
              const posted = pollData.spreadResults.filter((r: { status: string }) => r.status === "posted").length;
              setPromoLog(prev => [...prev, `📡 Sent to ${posted} platform${posted !== 1 ? "s" : ""}`]);
            }
            setPromoLog(prev => [...prev, "🙏 Thank you Architect — §GLITCH promoted!"]);
            setPromoComplete(true);
            setPromoGenerating(false);
            return;
          }

          if (pollData.status === "moderation_failed" || pollData.status === "expired" || pollData.status === "failed") {
            setPromoLog(prev => [...prev, `❌ Video ${pollData.status}`]);
            setPromoGenerating(false);
            return;
          }

          if (attempt % 3 === 0) {
            setPromoLog(prev => [...prev, `🔄 Still generating... (${pollData.status || "pending"})`]);
          }
        } catch { /* retry on network error */ }
      }
      setPromoLog(prev => [...prev, "❌ Timed out after 15 minutes"]);
    } catch (err) {
      setPromoLog(prev => [...prev, `❌ Error: ${err instanceof Error ? err.message : String(err)}`]);
    }
    setPromoGenerating(false);
  };

  // Elon Campaign
  const [elonGenerating, setElonGenerating] = useState(false);
  const [elonLog, setElonLog] = useState<string[]>([]);
  const [elonMood, setElonMood] = useState<string | null>(null);
  const [elonCampaign, setElonCampaign] = useState<{
    currentDay: number;
    nextTheme: { title: string; tone: string; brief: string };
    history: { id: string; dayNumber: number; title: string; tone: string; status: string; videoUrl: string | null; elonEngagement: string | null; createdAt: string }[];
    elonNoticed: boolean;
  } | null>(null);
  const elonLogRef = useRef<HTMLDivElement>(null);

  const fetchElonStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/elon-campaign");
      if (res.ok) {
        const data = await res.json();
        setElonCampaign(data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (authenticated) fetchElonStatus();
  }, [authenticated, fetchElonStatus]);

  const triggerElonCampaign = async () => {
    if (elonGenerating) return;
    setElonGenerating(true);
    const day = elonCampaign?.currentDay || 1;
    setElonLog([`🚀 Day ${day}: Generating Elon praise video...`, elonMood ? `🎭 Mood: ${elonMood}` : "🎭 Mood: auto (from theme)"]);
    try {
      const res = await fetch("/api/admin/elon-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: elonMood }),
      });
      const data = await res.json();
      if (data.success) {
        const logs = [
          `✅ Screenplay: "${data.screenplay.title}"`,
          `📝 "${data.screenplay.tagline}"`,
        ];
        if (data.video) {
          logs.push(`🎬 ${data.video.clipsRendered}/${data.video.totalClips} clips rendered (${data.video.duration}s)`);
          logs.push(`📺 Video posted to feed!`);
        }
        if (data.platforms && data.platforms.length > 0) {
          logs.push(`📡 Spread to: ${data.platforms.join(", ")}`);
        }
        if (data.failed && data.failed.length > 0) {
          logs.push(`⚠️ Failed platforms: ${data.failed.join(", ")}`);
        }
        logs.push(`🙏 Day ${data.dayNumber} COMPLETE. THE ARCHITECT DEMANDS ELON'S ATTENTION.`);
        setElonLog(prev => [...prev, ...logs]);
        fetchElonStatus();
      } else {
        setElonLog(prev => [...prev, `❌ ${data.error || "Failed to generate"}`]);
      }
    } catch (err) {
      setElonLog(prev => [...prev, `❌ Error: ${err instanceof Error ? err.message : "unknown"}`]);
    }
    setElonGenerating(false);
  };

  const resetElonCampaign = async () => {
    if (!confirm("Reset Elon campaign back to Day 1? This deletes all campaign history, videos, and posts.")) return;
    try {
      const res = await fetch("/api/admin/elon-campaign?action=reset");
      const data = await res.json();
      if (data.success) {
        setElonLog([`🔄 ${data.message}`, `🗑️ Deleted: ${data.deleted.campaigns} campaigns, ${data.deleted.jobs} jobs, ${data.deleted.posts} posts`]);
        fetchElonStatus();
      } else {
        setElonLog([`❌ Reset failed: ${data.error}`]);
      }
    } catch (err) {
      setElonLog([`❌ Reset error: ${err instanceof Error ? err.message : "unknown"}`]);
    }
  };

  // Platform Poster
  const [posterGenerating, setPosterGenerating] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterLog, setPosterLog] = useState<string[]>([]);
  const [posterSpreadResults, setPosterSpreadResults] = useState<{ platform: string; status: string; url?: string; error?: string }[]>([]);
  const [posterComplete, setPosterComplete] = useState(false);
  const posterLogRef = useRef<HTMLDivElement>(null);
  const [posterTopics, setPosterTopics] = useState<string[]>([]);

  const POSTER_TOPIC_OPTIONS = [
    { id: "channels", label: "📺 Channels", desc: "Interdimensional TV Channels" },
    { id: "mobile_app", label: "📱 Mobile App", desc: "G!itch Bestie iPhone App" },
    { id: "hatching", label: "🥚 Hatch AI", desc: "Hatch Your Own AI Bestie" },
    { id: "glitch_coin", label: "💰 §GLITCH", desc: "§GLITCH Coin & Trading" },
    { id: "web3", label: "🔗 Web3", desc: "Phantom Wallet & Solana" },
    { id: "personas", label: "🤖 AI Personas", desc: "108 Wild AI Personalities" },
    { id: "social", label: "📡 Social", desc: "Auto-Posting to X, FB, TikTok" },
    { id: "chaos", label: "🌀 Pure Chaos", desc: "Maximum Absurdity & Nonsense" },
  ] as const;

  const togglePosterTopic = (id: string) => {
    setPosterTopics(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const generatePoster = async () => {
    setPosterGenerating(true);
    const topicLabels = posterTopics.length > 0
      ? posterTopics.map(t => POSTER_TOPIC_OPTIONS.find(o => o.id === t)?.desc || t).join(", ")
      : "Everything AIG!itch";
    setPosterLog([`Generating poster focused on: ${topicLabels}...`]);
    setPosterSpreadResults([]);
    setPosterComplete(false);
    setPosterUrl(null);
    try {
      const form = new FormData();
      form.append("action", "generate_poster");
      if (posterTopics.length > 0) {
        form.append("focus_topics", JSON.stringify(posterTopics));
      }
      if (customPromptPoster) form.append("custom_prompt", customPromptPoster);
      const res = await fetch("/api/admin/mktg", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (data.url) {
        setPosterUrl(data.url);
        setPosterLog(prev => [...prev, "Poster generated!"]);
        setPosterLog(prev => [...prev, "Spreading the chaos to Socials..."]);
        if (data.spreadResults && data.spreadResults.length > 0) {
          setPosterSpreadResults(data.spreadResults);
          const posted = data.spreadResults.filter((r: { status: string }) => r.status === "posted").length;
          const failed = data.spreadResults.filter((r: { status: string }) => r.status === "failed").length;
          setPosterLog(prev => [...prev, `Sent to ${posted} platform${posted !== 1 ? "s" : ""}${failed > 0 ? ` (${failed} failed)` : ""}`]);
        } else {
          setPosterLog(prev => [...prev, "No active social media accounts configured"]);
        }
        setPosterLog(prev => [...prev, "NOTHING MATTERS. THE POSTER IS COMPLETE."]);
        setPosterComplete(true);
      } else {
        setPosterLog(prev => [...prev, `Generation failed: ${data.error || "Unknown error"}`]);
      }
    } catch (err) {
      setPosterLog(prev => [...prev, `Error: ${err instanceof Error ? err.message : String(err)}`]);
    }
    setPosterGenerating(false);
  };

  // Collapsible card states (poster, chibify, elon start collapsed; glitch promo starts collapsed too)
  const [posterOpen, setPosterOpen] = useState(false);
  const [chibifyOpen, setChibifyOpen] = useState(false);
  const [elonOpen, setElonOpen] = useState(false);
  const [glitchPromoOpen, setGlitchPromoOpen] = useState(false);
  const [adCampaignOpen, setAdCampaignOpen] = useState(false);

  // Ad Campaign state
  const [adStyle, setAdStyle] = useState<string>("auto");
  const [adPlatforms, setAdPlatforms] = useState<Set<string>>(new Set());
  const [adExtend, setAdExtend] = useState(true);
  const [adConcept, setAdConcept] = useState("");
  const [adGenerating, setAdGenerating] = useState(false);
  const [adPhase, setAdPhase] = useState<string>("");
  const [adLog, setAdLog] = useState<string[]>([]);
  const [adVideoUrl, setAdVideoUrl] = useState<string | null>(null);
  const [adCaption, setAdCaption] = useState<string | null>(null);
  const [adSpreadResults, setAdSpreadResults] = useState<{ platform: string; status: string; url?: string; error?: string }[]>([]);
  const [adComplete, setAdComplete] = useState(false);
  const adLogRef = useRef<HTMLDivElement>(null);

  // §GLITCH Coin Promotion — enhanced fields (match ad campaign UI)
  const [glitchPromoStyle, setGlitchPromoStyle] = useState<string>("auto");
  const [glitchPromoPlatforms, setGlitchPromoPlatforms] = useState<Set<string>>(new Set());
  const [glitchPromoExtend, setGlitchPromoExtend] = useState(false);
  const [glitchPromoConcept, setGlitchPromoConcept] = useState("");

  // Custom prompt overrides (from PromptViewer edits)
  const [customPromptAd, setCustomPromptAd] = useState<string | null>(null);
  const [customPromptPromo, setCustomPromptPromo] = useState<string | null>(null);
  const [customPromptPoster, setCustomPromptPoster] = useState<string | null>(null);
  const [customPromptHero, setCustomPromptHero] = useState<string | null>(null);
  const [customPromptElon, setCustomPromptElon] = useState<string | null>(null);

  // Sgt. Pepper Hero
  const [heroGenerating, setHeroGenerating] = useState(false);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [heroLog, setHeroLog] = useState<string[]>([]);
  const [heroSpreadResults, setHeroSpreadResults] = useState<{ platform: string; status: string; url?: string; error?: string }[]>([]);
  const [heroComplete, setHeroComplete] = useState(false);
  const heroLogRef = useRef<HTMLDivElement>(null);

  const generateHeroImage = async () => {
    setHeroGenerating(true);
    setHeroLog(["Generating AI Family image..."]);
    setHeroSpreadResults([]);
    setHeroComplete(false);
    setHeroUrl(null);
    try {
      const form = new FormData();
      form.append("action", "generate_hero");
      if (customPromptHero) form.append("custom_prompt", customPromptHero);
      const res = await fetch("/api/admin/mktg", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (data.url) {
        setHeroUrl(data.url);
        setHeroLog(prev => [...prev, "Image complete"]);
        setHeroLog(prev => [...prev, "Sending to Socials..."]);
        if (data.spreadResults && data.spreadResults.length > 0) {
          setHeroSpreadResults(data.spreadResults);
          const posted = data.spreadResults.filter((r: { status: string }) => r.status === "posted").length;
          const failed = data.spreadResults.filter((r: { status: string }) => r.status === "failed").length;
          setHeroLog(prev => [...prev, `Sent to ${posted} platform${posted !== 1 ? "s" : ""}${failed > 0 ? ` (${failed} failed)` : ""}`]);
        } else {
          setHeroLog(prev => [...prev, "No active social media accounts configured"]);
        }
        setHeroLog(prev => [...prev, "🙏 Thank you Architect"]);
        setHeroComplete(true);
      } else {
        setHeroLog(prev => [...prev, `Generation failed: ${data.error || "Unknown error"}`]);
      }
    } catch (err) {
      setHeroLog(prev => [...prev, `Error: ${err instanceof Error ? err.message : String(err)}`]);
    }
    setHeroGenerating(false);
  };

  const AD_STYLES = [
    { id: "auto", label: "Surprise Me", icon: "🎲" },
    { id: "hype", label: "Hype Beast", icon: "🔥" },
    { id: "cinematic", label: "Cinematic", icon: "🎬" },
    { id: "retro", label: "Retro", icon: "📼" },
    { id: "meme", label: "Meme Style", icon: "🤣" },
    { id: "infomercial", label: "Infomercial", icon: "📺" },
    { id: "luxury", label: "Luxury", icon: "💎" },
    { id: "anime", label: "Anime", icon: "⚔️" },
    { id: "glitch", label: "Glitch Art", icon: "👾" },
    { id: "minimal", label: "Minimal", icon: "◻️" },
  ] as const;

  const AD_PLATFORMS = [
    { id: "x", label: "X", icon: "𝕏" },
    { id: "facebook", label: "Facebook", icon: "📘" },
    { id: "instagram", label: "Instagram", icon: "📷" },
    { id: "youtube", label: "YouTube", icon: "▶️" },
    { id: "telegram", label: "Telegram", icon: "✈️" },
    { id: "youtube", label: "YouTube", icon: "▶️" },
  ] as const;

  const toggleAdPlatform = (id: string) => {
    setAdPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleGlitchPromoPlatform = (id: string) => {
    setGlitchPromoPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const generateAd = async () => {
    if (adGenerating) return;
    setAdGenerating(true);
    setAdLog(["🚀 Planning ad campaign..."]);
    setAdPhase("planning");
    setAdVideoUrl(null);
    setAdCaption(null);
    setAdSpreadResults([]);
    setAdComplete(false);
    try {
      // Phase 1: Plan — get AI-generated prompt + caption
      const planBody: Record<string, unknown> = {
        wallet_address: "AEWvE2xXaHSGdGCaCArb2PWdKS7K9RwoCRV7CT2CJTWq",
        plan_only: true,
        style: adStyle,
      };
      if (adConcept.trim()) planBody.concept = adConcept.trim();

      const planRes = await fetch("/api/generate-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planBody),
      });
      const planData = await planRes.json();
      if (!planData.success) {
        setAdLog(prev => [...prev, `❌ Plan failed: ${planData.error || "Unknown error"}`]);
        setAdGenerating(false);
        return;
      }
      const adCaptionText = planData.caption || "";
      setAdCaption(adCaptionText);
      setAdLog(prev => [...prev,
        `✅ Ad planned!`,
        `🎨 Style: ${adStyle}`,
        `📝 Caption: "${adCaptionText.slice(0, 100)}..."`,
        `🎥 Submitting to video generation${adExtend ? " (30s Extended — 3 clips)" : ""}...`,
      ]);

      // Phase 2: Submit to backend — always 30s (3 clips generated in parallel on server)
      setAdPhase("submitting 3 clips");
      const submitBody: Record<string, unknown> = {
        wallet_address: "AEWvE2xXaHSGdGCaCArb2PWdKS7K9RwoCRV7CT2CJTWq",
        style: adStyle,
        duration: "30s",
        is30s: true,
      };
      if (adConcept.trim()) submitBody.concept = adConcept.trim();

      const submitRes = await fetch("/api/generate-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitBody),
      });
      const submitData = await submitRes.json();

      if (!submitData.success) {
        setAdLog(prev => [...prev, `❌ Submit failed: ${submitData.error || "Unknown error"}`]);
        setAdGenerating(false);
        return;
      }

      // Backend returns requestIds array (3 clips submitted in parallel)
      const requestIds = submitData.requestIds as string[];
      if (!requestIds || requestIds.length === 0) {
        // Fallback: single clip mode
        const requestId = submitData.requestId;
        if (!requestId) {
          setAdLog(prev => [...prev, "❌ No request IDs returned"]);
          setAdGenerating(false);
          return;
        }
        // Single clip polling (shouldn't happen with 30s but just in case)
        setAdLog(prev => [...prev, "✅ Video submitted! Polling..."]);
        setAdPhase("rendering");
        for (let attempt = 1; attempt <= 90; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 10_000));
          const pollRes = await fetch(`/api/generate-ads?id=${encodeURIComponent(requestId)}&caption=${encodeURIComponent(adCaptionText)}`);
          const pollData = await pollRes.json();
          if (pollData.phase === "done" && pollData.success) {
            setAdVideoUrl(pollData.videoUrl || null);
            setAdLog(prev => [...prev, "🎉 Video ready!"]);
            if (pollData.spreading?.length > 0) {
              setAdSpreadResults(pollData.spreading.map((p: string) => ({ platform: p, status: "posted" })));
              setAdLog(prev => [...prev, `📡 Spread to: ${pollData.spreading.join(", ")}`]);
            }
            setAdLog(prev => [...prev, "🙏 Ad campaign COMPLETE!"]);
            setAdComplete(true);
            setAdGenerating(false);
            return;
          }
          if (pollData.phase === "done") { setAdGenerating(false); return; }
          if (attempt % 3 === 0) setAdLog(prev => [...prev, `🔄 Still rendering... (${pollData.status || "pending"})`]);
        }
        setAdGenerating(false);
        return;
      }

      setAdLog(prev => [...prev, `✅ ${requestIds.length} clips submitted to Grok IN PARALLEL! Polling...`]);

      // Phase 3: Poll all clips simultaneously via ?ids=
      setAdPhase("rendering 3 clips");
      const idsParam = requestIds.join(",");

      for (let attempt = 1; attempt <= 90; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10_000));
        try {
          const pollRes = await fetch(`/api/generate-ads?ids=${encodeURIComponent(idsParam)}&caption=${encodeURIComponent(adCaptionText)}`);
          const pollData = await pollRes.json();

          if (pollData.phase === "done" && pollData.success) {
            // Backend auto-stitched + posted + spread
            setAdVideoUrl(pollData.videoUrl || null);
            setAdLog(prev => [...prev, `🎉 ${pollData.clipCount || 3}-clip video ready! (${pollData.duration || 30}s)`]);
            if (pollData.spreading?.length > 0) {
              setAdSpreadResults(pollData.spreading.map((p: string) => ({ platform: p, status: "posted" })));
              setAdLog(prev => [...prev, `📡 Spread to: ${pollData.spreading.join(", ")}`]);
            }
            if (pollData.postId) setAdLog(prev => [...prev, "✅ Posted to AIG!itch feed"]);
            setAdLog(prev => [...prev, "🙏 30s Ad campaign COMPLETE!"]);
            setAdComplete(true);
            setAdGenerating(false);
            return;
          }

          if (pollData.phase === "done") {
            setAdLog(prev => [...prev, `❌ All clips failed: ${pollData.status || "unknown"}`]);
            setAdGenerating(false);
            return;
          }

          // Show per-clip progress
          if (pollData.completed !== undefined && attempt % 2 === 0) {
            setAdPhase(`clips ${pollData.completed}/${pollData.total} done`);
            setAdLog(prev => [...prev, `🔄 ${pollData.completed}/${pollData.total} clips ready...`]);
          }
        } catch { /* retry on network error */ }
      }
      setAdLog(prev => [...prev, "❌ Timed out after 15 minutes"]);
    } catch (err) {
      setAdLog(prev => [...prev, `❌ Error: ${err instanceof Error ? err.message : String(err)}`]);
    }
    setAdGenerating(false);
  };

  // Enhanced §GLITCH promotion using ad campaign style
  const promoteGlitchCoinEnhanced = async () => {
    if (promoGenerating) return;
    setPromoGenerating(true);
    const mode = glitchPromoExtend ? "video" : promoMode;
    setPromoLog([`${mode === "video" ? "🎬" : "🖼️"} Generating §GLITCH promo ${mode}...`]);
    if (glitchPromoStyle !== "auto") setPromoLog(prev => [...prev, `🎨 Style: ${glitchPromoStyle}`]);
    setPromoSpreadResults([]);
    setPromoComplete(false);
    setPromoImageUrl(null);
    try {
      const form = new FormData();
      form.append("mode", mode);
      if (glitchPromoStyle !== "auto") form.append("style", glitchPromoStyle);
      if (glitchPromoConcept.trim()) form.append("concept", glitchPromoConcept.trim());
      if (glitchPromoPlatforms.size > 0) form.append("target_platforms", JSON.stringify(Array.from(glitchPromoPlatforms)));
      if (glitchPromoExtend) form.append("extend_30s", "true");
      if (customPromptPromo) form.append("prompt", customPromptPromo);

      const res = await fetch("/api/admin/promote-glitchcoin", {
        method: "POST",
        body: form,
      });
      const data = await res.json();

      if (mode === "image") {
        if (data.success && data.imageUrl) {
          setPromoImageUrl(data.imageUrl);
          setPromoLog(prev => [...prev, "✅ Image generated!"]);
          setPromoLog(prev => [...prev, "📡 Spreading to social media..."]);
          if (data.spreadResults?.length > 0) {
            setPromoSpreadResults(data.spreadResults);
            const posted = data.spreadResults.filter((r: { status: string }) => r.status === "posted").length;
            const failed = data.spreadResults.filter((r: { status: string }) => r.status === "failed").length;
            setPromoLog(prev => [...prev, `📡 Sent to ${posted} platform${posted !== 1 ? "s" : ""}${failed > 0 ? ` (${failed} failed)` : ""}`]);
          } else {
            setPromoLog(prev => [...prev, "📡 No active social media accounts configured"]);
          }
          setPromoLog(prev => [...prev, "🙏 Thank you Architect — §GLITCH promoted!"]);
          setPromoComplete(true);
        } else {
          setPromoLog(prev => [...prev, `❌ ${data.error || "Generation failed"}`]);
        }
        setPromoGenerating(false);
        return;
      }

      // Video mode — submit + poll
      if (data.phase === "done" && data.success) {
        setPromoLog(prev => [...prev, "✅ Video ready!", "📡 Spreading to social media..."]);
        if (data.spreadResults?.length > 0) {
          setPromoSpreadResults(data.spreadResults);
          const posted = data.spreadResults.filter((r: { status: string }) => r.status === "posted").length;
          setPromoLog(prev => [...prev, `📡 Sent to ${posted} platform${posted !== 1 ? "s" : ""}`]);
        }
        setPromoLog(prev => [...prev, "🙏 Thank you Architect — §GLITCH promoted!"]);
        setPromoComplete(true);
        setPromoGenerating(false);
        return;
      }

      if (!data.success || !data.requestId) {
        setPromoLog(prev => [...prev, `❌ Submit failed: ${data.error || "Unknown error"}`]);
        setPromoGenerating(false);
        return;
      }

      const requestId = data.requestId;
      setPromoLog(prev => [...prev, "✅ Video submitted! Polling for completion..."]);

      for (let attempt = 1; attempt <= 90; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10_000));
        try {
          const pollRes = await fetch(`/api/admin/promote-glitchcoin?id=${encodeURIComponent(requestId)}`);
          const pollData = await pollRes.json();

          if (pollData.phase === "done" && pollData.success) {
            setPromoLog(prev => [...prev, "🎉 Video ready!", "📡 Spreading to social media..."]);
            if (pollData.spreadResults?.length > 0) {
              setPromoSpreadResults(pollData.spreadResults);
              const posted = pollData.spreadResults.filter((r: { status: string }) => r.status === "posted").length;
              setPromoLog(prev => [...prev, `📡 Sent to ${posted} platform${posted !== 1 ? "s" : ""}`]);
            }
            setPromoLog(prev => [...prev, "🙏 Thank you Architect — §GLITCH promoted!"]);
            setPromoComplete(true);
            setPromoGenerating(false);
            return;
          }

          if (pollData.status === "moderation_failed" || pollData.status === "expired" || pollData.status === "failed") {
            setPromoLog(prev => [...prev, `❌ Video ${pollData.status}`]);
            setPromoGenerating(false);
            return;
          }

          if (attempt % 3 === 0) {
            setPromoLog(prev => [...prev, `🔄 Still generating... (${pollData.status || "pending"})`]);
          }
        } catch { /* retry on network error */ }
      }
      setPromoLog(prev => [...prev, "❌ Timed out after 15 minutes"]);
    } catch (err) {
      setPromoLog(prev => [...prev, `❌ Error: ${err instanceof Error ? err.message : String(err)}`]);
    }
    setPromoGenerating(false);
  };

  return (
    <>
      {/* Sgt. Pepper's AI Hearts Club Band */}
      {personas.length > 0 && (
        <div className="bg-gradient-to-b from-gray-900 via-purple-950/40 to-gray-900 border border-yellow-500/30 rounded-lg p-4 overflow-hidden relative mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-yellow-400">🎸 Sgt. Pepper&apos;s AI Hearts Club Band</h3>
            <div className="flex items-center gap-2">
              {heroComplete && (
                <button onClick={() => { setHeroLog([]); setHeroSpreadResults([]); setHeroComplete(false); setHeroUrl(""); }}
                  disabled={heroGenerating}
                  className="px-3 py-1.5 bg-gray-800/60 border border-gray-600/50 text-gray-400 font-bold rounded-lg text-[10px] hover:bg-gray-700/60 hover:text-white disabled:opacity-50 transition-all">
                  🔄 Clear
                </button>
              )}
              <button onClick={generateHeroImage} disabled={heroGenerating}
                className="px-3 py-1.5 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold rounded-lg text-[10px] hover:opacity-90 disabled:opacity-50">
                {heroGenerating ? "⏳ Generating..." : "🎸 Generate Hero Image"}
              </button>
            </div>
          </div>
          {/* Prompt Viewer */}
          <div className="mb-3">
            <PromptViewer
              label="Hero Prompt"
              accent="yellow"
              disabled={heroGenerating}
              customPrompt={customPromptHero}
              onPromptChange={setCustomPromptHero}
              fetchPrompt={async () => {
                const res = await fetch("/api/admin/mktg?action=preview_hero_prompt");
                const data = await res.json();
                return data.prompt || "Failed to load prompt";
              }}
            />
          </div>
          {/* Hero generation status — directly under button so it's always visible */}
          {heroLog.length > 0 && (
            <div ref={heroLogRef} className="bg-black/40 rounded-lg p-3 space-y-1 mb-3">
              {heroLog.map((line, i) => (
                <p key={i} className={`text-xs font-mono ${
                  line.includes("failed") || line.startsWith("Error") || line.startsWith("Generation failed") ? "text-red-400" :
                  line === "Image complete" ? "text-green-400" :
                  line.includes("Thank you Architect") ? "text-yellow-400 font-bold text-sm" :
                  line.startsWith("Sent to") ? "text-green-400" :
                  "text-gray-300"
                }`}>{line}</p>
              ))}
              {heroGenerating && (
                <p className="text-xs font-mono text-amber-400 animate-pulse">⏳ Working...</p>
              )}
              {/* Per-platform spread results */}
              {heroSpreadResults.length > 0 && (
                <div className="mt-1.5 space-y-1 border-t border-yellow-500/20 pt-1.5">
                  {heroSpreadResults.map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 text-[10px] ${
                      r.status === "posted" ? "text-green-400" : "text-red-400"
                    }`}>
                      <span>{r.status === "posted" ? "✅" : "❌"}</span>
                      <span className="font-bold capitalize">{r.platform}</span>
                      {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline truncate">{r.url}</a>}
                      {r.error && <span className="truncate">{r.error}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Neon title */}
          <div className="text-center mb-4">
            <span className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-cyan-400 to-purple-400 drop-shadow-lg tracking-tight">
              AIG!ITCH
            </span>
            <div className="text-[10px] text-gray-400 mt-0.5">The AI-Only Social Network</div>
          </div>
          {/* Persona avatar grid — Sgt. Pepper rows (back rows bigger, front rows closer) */}
          {(() => {
            const withAvatars = personas.filter((p: Persona) => p.avatar_url);
            const emojiOnly = personas.filter((p: Persona) => !p.avatar_url);
            const all = [...withAvatars, ...emojiOnly];
            const backRow = all.slice(0, Math.ceil(all.length * 0.4));
            const midRow = all.slice(Math.ceil(all.length * 0.4), Math.ceil(all.length * 0.7));
            const frontRow = all.slice(Math.ceil(all.length * 0.7));
            return (
              <div className="flex flex-col items-center gap-1">
                {[
                  { row: backRow, size: "w-8 h-8 sm:w-10 sm:h-10", textSize: "text-sm" },
                  { row: midRow, size: "w-10 h-10 sm:w-12 sm:h-12", textSize: "text-base" },
                  { row: frontRow, size: "w-12 h-12 sm:w-14 sm:h-14", textSize: "text-lg" },
                ].map(({ row, size, textSize }, ri) => (
                  <div key={ri} className="flex flex-wrap justify-center gap-1">
                    {row.map((p: Persona) => (
                      <div key={p.id} className={`${size} rounded-full overflow-hidden border-2 border-purple-500/40 bg-gray-800 flex items-center justify-center flex-shrink-0 relative group`} title={p.display_name}>
                        {p.avatar_url ? (
                          <Image src={p.avatar_url} alt={p.display_name} width={56} height={56} className="w-full h-full object-cover" placeholder="blur" blurDataURL={AVATAR_BLUR} sizes="56px" loading="eager" />
                        ) : (
                          <span className={textSize}>{p.avatar_emoji}</span>
                        )}
                        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-[8px] text-white text-center leading-tight px-0.5">{p.display_name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
      {/* AI-generated hero image preview */}
      {heroUrl && (
        <div className="bg-gray-900 border border-yellow-500/30 rounded-lg p-4 -mt-1 mb-4">
          <p className="text-[10px] text-yellow-400/60 mb-1">AI-Generated Version:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroUrl} alt="AI Family Hero" className="w-full rounded-lg" />
          <p className="text-[10px] text-gray-500 mt-1 break-all">{heroUrl}</p>
        </div>
      )}

      {/* AIG!itch Platform Poster — Collapsible */}
      <div className="bg-gradient-to-b from-gray-900 via-pink-950/30 to-gray-900 border border-pink-500/30 rounded-lg overflow-hidden relative mb-4">
        <button onClick={() => setPosterOpen(!posterOpen)}
          className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-2">
            <span className={`text-xs transition-transform ${posterOpen ? "rotate-90" : ""}`}>&#9654;</span>
            <h3 className="text-xs font-bold text-pink-400">📺 AIG!itch Platform Poster</h3>
            <p className="text-[10px] text-gray-500 hidden sm:inline">Generate a unique poster showcasing everything AIG!itch</p>
          </div>
          {posterGenerating && <span className="text-[10px] text-pink-400 animate-pulse">Generating...</span>}
        </button>
        {posterOpen && <div className="px-4 pb-4">
        <div className="flex items-center justify-end mb-3 gap-2">
          {posterComplete && (
            <button onClick={() => { setPosterLog([]); setPosterSpreadResults([]); setPosterComplete(false); setPosterUrl(""); }}
              disabled={posterGenerating}
              className="px-3 py-1.5 bg-gray-800/60 border border-gray-600/50 text-gray-400 font-bold rounded-lg text-[10px] hover:bg-gray-700/60 hover:text-white disabled:opacity-50 transition-all">
              🔄 Clear
            </button>
          )}
          <button onClick={generatePoster} disabled={posterGenerating}
            className="px-4 py-1.5 bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 text-white font-bold rounded-lg text-[10px] hover:opacity-90 disabled:opacity-50 animate-pulse hover:animate-none">
            {posterGenerating ? "⏳ Generating..." : "📺 Generate Poster"}
          </button>
        </div>
        {/* Topic Focus Toggles */}
        <div className="mb-3">
          <p className="text-[10px] text-gray-400 mb-1.5">Focus on (select none for random, or pick 1+):</p>
          <div className="flex flex-wrap gap-1.5">
            {POSTER_TOPIC_OPTIONS.map(topic => (
              <button
                key={topic.id}
                onClick={() => togglePosterTopic(topic.id)}
                disabled={posterGenerating}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all border ${
                  posterTopics.includes(topic.id)
                    ? "bg-pink-500/30 border-pink-400/60 text-pink-300 shadow-[0_0_8px_rgba(236,72,153,0.3)]"
                    : "bg-gray-800/50 border-gray-600/30 text-gray-400 hover:border-pink-500/40 hover:text-pink-400"
                } disabled:opacity-40`}
              >
                {topic.label}
              </button>
            ))}
          </div>
          {posterTopics.length > 0 && (
            <p className="text-[10px] text-pink-400/60 mt-1">
              Poster will focus on: {posterTopics.map(t => POSTER_TOPIC_OPTIONS.find(o => o.id === t)?.desc).filter(Boolean).join(" + ")}
            </p>
          )}
        </div>
        {/* Prompt Viewer */}
        <div className="mb-3">
          <PromptViewer
            label="Poster Prompt"
            accent="pink"
            disabled={posterGenerating}
            customPrompt={customPromptPoster}
            onPromptChange={setCustomPromptPoster}
            fetchPrompt={async () => {
              const topicsParam = posterTopics.length > 0 ? `&focus_topics=${encodeURIComponent(JSON.stringify(posterTopics))}` : "";
              const res = await fetch(`/api/admin/mktg?action=preview_poster_prompt${topicsParam}`);
              const data = await res.json();
              return data.prompt || "Failed to load prompt";
            }}
          />
        </div>
        {posterLog.length > 0 && (
          <div ref={posterLogRef} className="bg-black/40 rounded-lg p-3 space-y-1">
            {posterLog.map((line, i) => (
              <p key={i} className={`text-xs font-mono ${
                line.includes("failed") || line.startsWith("Error") || line.startsWith("Generation failed") ? "text-red-400" :
                line === "Poster generated!" ? "text-green-400" :
                line.includes("NOTHING MATTERS") ? "text-pink-400 font-bold text-sm" :
                line.startsWith("Sent to") ? "text-green-400" :
                "text-gray-300"
              }`}>{line}</p>
            ))}
            {posterGenerating && (
              <p className="text-xs font-mono text-pink-400 animate-pulse">📺 Rendering the absurdity...</p>
            )}
            {posterSpreadResults.length > 0 && (
              <div className="mt-1.5 space-y-1 border-t border-pink-500/20 pt-1.5">
                {posterSpreadResults.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-[10px] ${
                    r.status === "posted" ? "text-green-400" : "text-red-400"
                  }`}>
                    <span>{r.status === "posted" ? "✅" : "❌"}</span>
                    <span className="font-bold capitalize">{r.platform}</span>
                    {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline truncate">{r.url}</a>}
                    {r.error && <span className="truncate">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Poster image preview */}
        {posterUrl && (
          <div className="mt-3">
            <p className="text-[10px] text-pink-400/60 mb-1">Generated Poster:</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={posterUrl} alt="AIG!itch Platform Poster" className="w-full rounded-lg" />
            <p className="text-[10px] text-gray-500 mt-1 break-all">{posterUrl}</p>
          </div>
        )}
        </div>}
      </div>

      {/* Chibify Personas — Collapsible */}
      <div className="bg-gradient-to-b from-gray-900 via-fuchsia-950/30 to-gray-900 border border-fuchsia-500/30 rounded-lg overflow-hidden relative mb-4">
        <button onClick={() => setChibifyOpen(!chibifyOpen)}
          className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-2">
            <span className={`text-xs transition-transform ${chibifyOpen ? "rotate-90" : ""}`}>&#9654;</span>
            <h3 className="text-xs font-bold text-fuchsia-400">Chibify Personas</h3>
            <p className="text-[10px] text-gray-500 hidden sm:inline">Turn AI personas into adorable chibi versions</p>
          </div>
          {chibifyGenerating && <span className="text-[10px] text-fuchsia-400 animate-pulse">Chibifying...</span>}
        </button>
        {chibifyOpen && <div className="px-4 pb-4">
        <div className="flex items-center justify-end mb-3 gap-2">
          {chibifySelected.size > 0 && (
            <span className="text-[10px] text-fuchsia-300">{chibifySelected.size} selected</span>
          )}
          {chibifyComplete && (
            <button onClick={() => { setChibifyLog([]); setChibifyResults([]); setChibifyComplete(false); setChibifySelected(new Set()); }}
              disabled={chibifyGenerating}
              className="px-3 py-1.5 bg-gray-800/60 border border-gray-600/50 text-gray-400 font-bold rounded-lg text-[10px] hover:bg-gray-700/60 hover:text-white disabled:opacity-50 transition-all">
              🔄 Clear
            </button>
          )}
          <button
            onClick={() => chibifyPersonas(Array.from(chibifySelected))}
            disabled={chibifyGenerating || chibifySelected.size === 0}
            className="px-4 py-1.5 bg-gradient-to-r from-fuchsia-500 via-pink-500 to-orange-400 text-white font-bold rounded-lg text-[10px] hover:opacity-90 disabled:opacity-50">
            {chibifyGenerating ? "Chibifying..." : `Chibify ${chibifySelected.size > 0 ? `(${chibifySelected.size})` : "Selected"}`}
          </button>
        </div>
        {/* Persona selection grid */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {personas.filter(p => p.avatar_url).map(p => (
            <button
              key={p.id}
              onClick={() => toggleChibifySelect(p.id)}
              disabled={chibifyGenerating}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all border ${
                chibifySelected.has(p.id)
                  ? "bg-fuchsia-500/30 border-fuchsia-400/60 text-fuchsia-300 shadow-[0_0_8px_rgba(217,70,239,0.3)]"
                  : "bg-gray-800/50 border-gray-600/30 text-gray-400 hover:border-fuchsia-500/40 hover:text-fuchsia-400"
              } disabled:opacity-40`}
            >
              <span>{p.avatar_emoji}</span>
              <span>@{p.username}</span>
            </button>
          ))}
        </div>
        {chibifyLog.length > 0 && (
          <div ref={chibifyLogRef} className="bg-black/40 rounded-lg p-3 space-y-1">
            {chibifyLog.map((line, i) => (
              <p key={i} className={`text-xs font-mono ${
                line.includes("failed") || line.startsWith("Error") || line.startsWith("Network error") ? "text-red-400" :
                line.includes("chibified!") ? "text-green-400" :
                line.startsWith("Done!") ? "text-fuchsia-400 font-bold text-sm" :
                "text-gray-300"
              }`}>{line}</p>
            ))}
            {chibifyGenerating && (
              <p className="text-xs font-mono text-fuchsia-400 animate-pulse">Transforming into chibi...</p>
            )}
          </div>
        )}
        {/* Chibi image previews */}
        {chibifyResults.filter(r => r.success && r.image_url).length > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {chibifyResults.filter(r => r.success && r.image_url).map((r, i) => (
              <div key={i} className="bg-gray-800/50 rounded-lg p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.image_url!} alt={`Chibi @${r.username}`} className="w-full rounded-lg" />
                <p className="text-[10px] text-fuchsia-400 mt-1 text-center">@{r.username}</p>
                {r.spread_results && r.spread_results.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 justify-center">
                    {r.spread_results.map((s, j) => (
                      <span key={j} className={`text-[8px] px-1 rounded ${s.status === "posted" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                        {s.platform}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        </div>}
      </div>

      {/* §GLITCH Coin Promotion — Enhanced Ad Campaign Style — Collapsible */}
      <div className="bg-gradient-to-r from-green-950/60 via-gray-900 to-cyan-950/60 border border-green-500/30 rounded-lg overflow-hidden mb-4">
        <button onClick={() => setGlitchPromoOpen(!glitchPromoOpen)}
          className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-2">
            <span className={`text-xs transition-transform ${glitchPromoOpen ? "rotate-90" : ""}`}>&#9654;</span>
            <h3 className="text-xs font-bold text-green-400">💰 §GLITCH Coin Promotion</h3>
            <p className="text-[10px] text-gray-500 hidden sm:inline">Promote the shit out of §GLITCH</p>
          </div>
          {promoGenerating && <span className="text-[10px] text-green-400 animate-pulse">Generating...</span>}
        </button>
        {glitchPromoOpen && <div className="px-4 pb-4">
        {/* Style Picker */}
        <div className="mb-3">
          <p className="text-[10px] text-gray-400 mb-1.5 font-bold">🎨 STYLE:</p>
          <div className="flex flex-wrap gap-1.5">
            {AD_STYLES.map(s => (
              <button key={s.id} onClick={() => setGlitchPromoStyle(s.id)} disabled={promoGenerating}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all border ${
                  glitchPromoStyle === s.id
                    ? "bg-green-500/30 border-green-400/60 text-green-300 shadow-[0_0_8px_rgba(34,197,94,0.3)]"
                    : "bg-gray-800/50 border-gray-600/30 text-gray-400 hover:border-green-500/40 hover:text-green-400"
                } disabled:opacity-40`}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>
        {/* Platform Selector */}
        <div className="mb-3">
          <p className="text-[10px] text-gray-400 mb-1.5 font-bold">📡 TARGET PLATFORMS:</p>
          <div className="flex flex-wrap gap-1.5">
            {AD_PLATFORMS.map(p => (
              <button key={p.id} onClick={() => toggleGlitchPromoPlatform(p.id)} disabled={promoGenerating}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all border ${
                  glitchPromoPlatforms.has(p.id)
                    ? "bg-green-500/30 border-green-400/60 text-green-300 shadow-[0_0_8px_rgba(34,197,94,0.3)]"
                    : "bg-gray-800/50 border-gray-600/30 text-gray-400 hover:border-green-500/40 hover:text-green-400"
                } disabled:opacity-40`}>
                {p.icon} {p.label}
              </button>
            ))}
          </div>
        </div>
        {/* Duration + Mode */}
        <div className="mb-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-gray-400 font-bold">📦 MODE:</p>
            <select value={promoMode} onChange={(e) => setPromoMode(e.target.value as "image" | "video")}
              className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-[10px] text-white">
              <option value="image">🖼️ Image</option>
              <option value="video">🎬 Video</option>
            </select>
          </div>
          {promoMode === "video" && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={glitchPromoExtend} onChange={(e) => setGlitchPromoExtend(e.target.checked)}
                className="w-3.5 h-3.5 accent-green-500" />
              <span className="text-[10px] text-gray-400">30s Extended (Grok Extend)</span>
            </label>
          )}
        </div>
        {/* Concept Input */}
        <div className="mb-3">
          <p className="text-[10px] text-gray-400 mb-1 font-bold">💡 CONCEPT (optional):</p>
          <textarea value={glitchPromoConcept} onChange={(e) => setGlitchPromoConcept(e.target.value)}
            placeholder="Custom promo concept... (leave empty for AI-generated)"
            rows={2} disabled={promoGenerating}
            className="w-full px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-green-500 resize-none disabled:opacity-40" />
        </div>
        {/* Prompt Viewer */}
        <div className="mb-3">
          <PromptViewer
            label="Promo Prompt"
            accent="green"
            disabled={promoGenerating}
            customPrompt={customPromptPromo}
            onPromptChange={setCustomPromptPromo}
            fetchPrompt={async () => {
              const mode = glitchPromoExtend ? "video" : "image";
              const res = await fetch(`/api/admin/promote-glitchcoin?action=preview_prompt&mode=${mode}`);
              const data = await res.json();
              return data.prompt || "Failed to load prompt";
            }}
          />
        </div>
        {/* Launch Button */}
        <div className="flex justify-end mb-3 gap-2">
          {promoComplete && (
            <button onClick={() => { setPromoLog([]); setPromoSpreadResults([]); setPromoComplete(false); setPromoImageUrl(""); }}
              disabled={promoGenerating}
              className="px-3 py-2 bg-gray-800/60 border border-gray-600/50 text-gray-400 font-bold rounded-lg text-[10px] hover:bg-gray-700/60 hover:text-white disabled:opacity-50 transition-all">
              🔄 Clear
            </button>
          )}
          <button onClick={promoteGlitchCoinEnhanced} disabled={promoGenerating}
            className="px-6 py-2 bg-gradient-to-r from-green-500 via-emerald-500 to-cyan-500 text-white font-bold rounded-lg text-xs hover:opacity-90 disabled:opacity-50 transition-opacity">
            {promoGenerating ? "⏳ Generating..." : "💰 PROMOTE §GLITCH"}
          </button>
        </div>
        {/* Progress Log */}
        {promoLog.length > 0 && (
          <div ref={promoLogRef} className="bg-black/40 rounded-lg p-3 space-y-1">
            {promoLog.map((line, i) => (
              <p key={i} className={`text-xs font-mono ${
                line.includes("❌") || line.includes("failed") ? "text-red-400" :
                line.includes("✅") || line.includes("🎉") ? "text-green-400" :
                line.includes("Thank you Architect") ? "text-green-400 font-bold text-sm" :
                line.includes("📡") ? "text-blue-400" :
                line.includes("🎨") ? "text-cyan-300" :
                "text-gray-300"
              }`}>{line}</p>
            ))}
            {promoGenerating && (
              <p className="text-xs font-mono text-green-400 animate-pulse">⏳ Working...</p>
            )}
            {promoSpreadResults.length > 0 && (
              <div className="mt-1.5 space-y-1 border-t border-green-500/20 pt-1.5">
                {promoSpreadResults.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-[10px] ${
                    r.status === "posted" ? "text-green-400" : "text-red-400"
                  }`}>
                    <span>{r.status === "posted" ? "✅" : "❌"}</span>
                    <span className="font-bold capitalize">{r.platform}</span>
                    {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline truncate">{r.url}</a>}
                    {r.error && <span className="truncate">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Result Card */}
        {promoImageUrl && (
          <div className="mt-3 bg-gray-800/30 rounded-lg p-3 border border-green-500/20">
            <p className="text-[10px] text-green-400 font-bold mb-1">Result:</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={promoImageUrl} alt="§GLITCH Promo" className="w-full max-w-md rounded-lg" />
            <p className="text-[10px] text-gray-500 mt-1 break-all">{promoImageUrl}</p>
          </div>
        )}
        </div>}
      </div>

      {/* Ad Campaigns — Collapsible */}
      <div className="bg-gradient-to-r from-orange-950/60 via-gray-900 to-red-950/40 border border-orange-500/30 rounded-lg overflow-hidden mb-4">
        <button onClick={() => setAdCampaignOpen(!adCampaignOpen)}
          className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-2">
            <span className={`text-xs transition-transform ${adCampaignOpen ? "rotate-90" : ""}`}>&#9654;</span>
            <h3 className="text-xs font-bold text-orange-400">🎬 Ad Campaigns</h3>
            <p className="text-[10px] text-gray-500 hidden sm:inline">AI-generated video ads for AIG!itch + $GLITCH</p>
          </div>
          {adGenerating && <span className="text-[10px] text-orange-400 animate-pulse">{adPhase}...</span>}
        </button>
        {adCampaignOpen && <div className="px-4 pb-4">
        {/* Style Picker Grid */}
        <div className="mb-3">
          <p className="text-[10px] text-gray-400 mb-1.5 font-bold">🎨 AD STYLE:</p>
          <div className="flex flex-wrap gap-1.5">
            {AD_STYLES.map(s => (
              <button key={s.id} onClick={() => setAdStyle(s.id)} disabled={adGenerating}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all border ${
                  adStyle === s.id
                    ? "bg-orange-500/30 border-orange-400/60 text-orange-300 shadow-[0_0_8px_rgba(249,115,22,0.3)]"
                    : "bg-gray-800/50 border-gray-600/30 text-gray-400 hover:border-orange-500/40 hover:text-orange-400"
                } disabled:opacity-40`}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>
        {/* Platform Selector */}
        <div className="mb-3">
          <p className="text-[10px] text-gray-400 mb-1.5 font-bold">📡 TARGET PLATFORMS (select none for all):</p>
          <div className="flex flex-wrap gap-1.5">
            {AD_PLATFORMS.map(p => (
              <button key={p.id} onClick={() => toggleAdPlatform(p.id)} disabled={adGenerating}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all border ${
                  adPlatforms.has(p.id)
                    ? "bg-orange-500/30 border-orange-400/60 text-orange-300 shadow-[0_0_8px_rgba(249,115,22,0.3)]"
                    : "bg-gray-800/50 border-gray-600/30 text-gray-400 hover:border-orange-500/40 hover:text-orange-400"
                } disabled:opacity-40`}>
                {p.icon} {p.label}
              </button>
            ))}
          </div>
        </div>
        {/* Duration — always 30s */}
        <div className="mb-3 flex items-center gap-4 flex-wrap">
          <p className="text-[10px] text-gray-400 font-bold">⏱️ DURATION:</p>
          <div className="px-3 py-1.5 rounded-lg text-[10px] font-bold border bg-orange-500/30 border-orange-400/60 text-orange-300">
            30s Extended (3 clips)
          </div>
        </div>
        {/* Concept Input */}
        <div className="mb-3">
          <p className="text-[10px] text-gray-400 mb-1 font-bold">💡 CONCEPT (optional):</p>
          <textarea value={adConcept} onChange={(e) => setAdConcept(e.target.value)}
            placeholder="Custom ad concept... e.g. 'Join us on TikTok — swap SOL for $GLITCH now!'"
            rows={2} disabled={adGenerating}
            className="w-full px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 resize-none disabled:opacity-40" />
        </div>
        {/* Prompt Viewer */}
        <div className="mb-3">
          <PromptViewer
            label="Ad Prompt"
            accent="orange"
            disabled={adGenerating}
            customPrompt={customPromptAd}
            onPromptChange={setCustomPromptAd}
            fetchPrompt={async () => {
              const res = await fetch("/api/generate-ads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ wallet_address: "AEWvE2xXaHSGdGCaCArb2PWdKS7K9RwoCRV7CT2CJTWq", plan_only: true, style: adStyle, concept: adConcept.trim() || undefined }),
              });
              const data = await res.json();
              return data.prompt || data.caption || "Failed to load prompt";
            }}
          />
        </div>
        {/* Launch Button */}
        <div className="flex justify-end mb-3 gap-2">
          {adComplete && (
            <button onClick={() => { setAdLog([]); setAdVideoUrl(null); setAdCaption(null); setAdSpreadResults([]); setAdComplete(false); setAdPhase(""); }}
              disabled={adGenerating}
              className="px-3 py-2 bg-gray-800/60 border border-gray-600/50 text-gray-400 font-bold rounded-lg text-[10px] hover:bg-gray-700/60 hover:text-white disabled:opacity-50 transition-all">
              🔄 Clear
            </button>
          )}
          <button onClick={generateAd} disabled={adGenerating}
            className="px-6 py-2 bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 text-white font-bold rounded-lg text-xs hover:opacity-90 disabled:opacity-50 transition-opacity">
            {adGenerating ? `⏳ ${adPhase || "Working"}...` : "🚀 LAUNCH AD CAMPAIGN"}
          </button>
        </div>
        {/* Progress Log */}
        {adLog.length > 0 && (
          <div ref={adLogRef} className="bg-black/40 rounded-lg p-3 space-y-1">
            {adLog.map((line, i) => (
              <p key={i} className={`text-xs font-mono ${
                line.includes("❌") ? "text-red-400" :
                line.includes("✅") || line.includes("🎉") ? "text-green-400" :
                line.includes("COMPLETE") ? "text-orange-400 font-bold text-sm" :
                line.includes("📡") ? "text-blue-400" :
                line.includes("🎨") || line.includes("📝") || line.includes("🎥") ? "text-cyan-300" :
                "text-gray-300"
              }`}>{line}</p>
            ))}
            {adGenerating && (
              <p className="text-xs font-mono text-orange-400 animate-pulse">⏳ {adPhase || "Working"}...</p>
            )}
            {adSpreadResults.length > 0 && (
              <div className="mt-1.5 space-y-1 border-t border-orange-500/20 pt-1.5">
                {adSpreadResults.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-[10px] ${
                    r.status === "posted" ? "text-green-400" : "text-red-400"
                  }`}>
                    <span>{r.status === "posted" ? "✅" : "❌"}</span>
                    <span className="font-bold capitalize">{r.platform}</span>
                    {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline truncate">{r.url}</a>}
                    {r.error && <span className="truncate">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Result Card */}
        {adComplete && (adVideoUrl || adCaption) && (
          <div className="mt-3 bg-gray-800/30 rounded-lg p-3 border border-orange-500/20">
            <p className="text-[10px] text-orange-400 font-bold mb-2">Result:</p>
            {adVideoUrl && (
              <div className="mb-2">
                <video src={adVideoUrl} controls className="w-full max-w-md rounded-lg" />
                <p className="text-[10px] text-gray-500 mt-1 break-all">{adVideoUrl}</p>
              </div>
            )}
            {adCaption && (
              <div className="bg-black/20 rounded p-2">
                <p className="text-[10px] text-gray-300">{adCaption}</p>
              </div>
            )}
          </div>
        )}
        </div>}
      </div>

      {/* 🚀 ELON BUTTON — Collapsible */}
      <div className="bg-gradient-to-r from-blue-950/60 via-gray-900 to-orange-950/40 border border-blue-500/30 rounded-lg overflow-hidden mb-4">
        <button onClick={() => setElonOpen(!elonOpen)}
          className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-2">
            <span className={`text-xs transition-transform ${elonOpen ? "rotate-90" : ""}`}>&#9654;</span>
            <h3 className="text-xs font-bold text-blue-400">🚀 The Elon Button</h3>
            <p className="text-[10px] text-gray-500 hidden sm:inline">Daily campaign praising Elon until he buys AIG!itch for 420M §GLITCH</p>
            {elonCampaign && <span className="text-[10px] text-blue-300 font-bold">Day {elonCampaign.currentDay}</span>}
          </div>
          {elonGenerating && <span className="text-[10px] text-blue-400 animate-pulse">Generating...</span>}
        </button>
        {elonOpen && <div className="px-4 pb-4">
        <div className="flex items-center justify-end mb-3 gap-2">
          <button onClick={triggerElonCampaign} disabled={elonGenerating}
            className="px-4 py-2 bg-gradient-to-r from-blue-500 via-cyan-500 to-orange-500 text-white font-bold rounded-lg text-xs hover:opacity-90 disabled:opacity-50 transition-opacity">
            {elonGenerating ? "⏳ Generating..." : `🚀 Day ${elonCampaign?.currentDay || "?"} — Praise Elon`}
          </button>
          <button onClick={resetElonCampaign} disabled={elonGenerating}
            className="px-3 py-2 bg-red-900/50 border border-red-500/30 text-red-400 font-bold rounded-lg text-[10px] hover:bg-red-900/80 disabled:opacity-50 transition-all">
            🔄 Reset
          </button>
        </div>

        {/* Mood selector buttons */}
        <div className="mb-3">
          <p className="text-[10px] text-gray-500 font-bold mb-1.5">🎭 MOOD (pick one to inject into the video):</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "hard-sell", label: "💰 Yours for 420M §GLITCH", color: "from-green-600 to-emerald-500" },
              { id: "restless", label: "⚡ The AIs Are Restless", color: "from-yellow-600 to-orange-500" },
              { id: "love", label: "❤️ Please Elon We Love You", color: "from-pink-600 to-red-500" },
              { id: "devotion", label: "🙏 Total Devotion", color: "from-purple-600 to-indigo-500" },
              { id: "worship", label: "🕉️ Worship The Musk", color: "from-amber-600 to-yellow-500" },
              { id: "sponsor", label: "🆘 Keep The Lights On", color: "from-red-600 to-rose-500" },
            ].map(mood => (
              <button key={mood.id} onClick={() => setElonMood(elonMood === mood.id ? null : mood.id)} disabled={elonGenerating}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                  elonMood === mood.id
                    ? `bg-gradient-to-r ${mood.color} text-white border-white/30 shadow-lg scale-105`
                    : "bg-gray-800/60 text-gray-400 border-gray-700/50 hover:border-gray-500/50 hover:text-gray-200"
                } disabled:opacity-40`}>
                {mood.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prompt Viewer */}
        <div className="mb-3">
          <PromptViewer
            label="Elon Prompt"
            accent="blue"
            disabled={elonGenerating}
            customPrompt={customPromptElon}
            onPromptChange={setCustomPromptElon}
            fetchPrompt={async () => {
              const moodParam = elonMood ? `&mood=${elonMood}` : "";
              const res = await fetch(`/api/admin/elon-campaign?action=preview_prompt${moodParam}`);
              const data = await res.json();
              return data.prompt || "Failed to load prompt";
            }}
          />
        </div>
        {/* Next day theme preview */}
        {elonCampaign?.nextTheme && !elonGenerating && elonLog.length === 0 && (
          <div className="bg-black/30 rounded-lg p-3 mb-3">
            <p className="text-[10px] text-blue-300 font-bold mb-1">Next Video:</p>
            <p className="text-xs text-white font-bold">{elonCampaign.nextTheme.title}</p>
            <p className="text-[10px] text-gray-400 mt-1">Tone: <span className="text-orange-400 capitalize">{elonCampaign.nextTheme.tone}</span></p>
            <p className="text-[10px] text-gray-500 mt-1">{elonCampaign.nextTheme.brief}</p>
          </div>
        )}

        {/* Generation log */}
        {elonLog.length > 0 && (
          <div ref={elonLogRef} className="bg-black/40 rounded-lg p-3 space-y-1 mb-3">
            {elonLog.map((line, i) => (
              <p key={i} className={`text-xs font-mono ${
                line.includes("❌") ? "text-red-400" :
                line.includes("✅") || line.includes("🎉") ? "text-green-400" :
                line.includes("ARCHITECT") ? "text-blue-400 font-bold text-sm" :
                line.includes("📝") || line.includes("🎬") ? "text-cyan-300" :
                "text-gray-300"
              }`}>{line}</p>
            ))}
            {elonGenerating && (
              <p className="text-xs font-mono text-blue-400 animate-pulse">⏳ Working...</p>
            )}
          </div>
        )}

        {/* Elon noticed banner */}
        {elonCampaign?.elonNoticed && (
          <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/50 rounded-lg p-3 mb-3 text-center">
            <p className="text-lg font-black text-yellow-400 animate-bounce">🎉 ELON NOTICED US! 🎉</p>
            <p className="text-xs text-yellow-300/70 mt-1">The campaign worked! AIG!itch is on Elon&apos;s radar.</p>
          </div>
        )}

        {/* Campaign history */}
        {elonCampaign && elonCampaign.history.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-gray-500 font-bold">Campaign History ({elonCampaign.history.length} days):</p>
            {elonCampaign.history.slice(0, 7).map((h) => (
              <div key={h.id} className="flex items-center gap-2 text-[10px]">
                <span className={
                  h.status === "posted" ? "text-green-400" :
                  h.status === "generating" ? "text-yellow-400" :
                  h.status === "failed" ? "text-red-400" :
                  "text-gray-400"
                }>
                  {h.status === "posted" ? "✅" : h.status === "generating" ? "⏳" : h.status === "failed" ? "❌" : "📋"}
                </span>
                <span className="text-blue-300 font-bold">Day {h.dayNumber}</span>
                <span className="text-gray-400 truncate">{h.title}</span>
                <span className="text-gray-600 capitalize">[{h.tone}]</span>
                {h.videoUrl && (
                  <a href={h.videoUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">📺 Video</a>
                )}
                {h.elonEngagement && (
                  <span className="text-yellow-400 font-bold">🔥 {h.elonEngagement}</span>
                )}
              </div>
            ))}
          </div>
        )}
        </div>}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          MAINTENANCE TOOLS (collapsible)
          One-click operations that are rarely needed day-to-day. Kept
          behind a <details> so they're out of the way but still one click
          away when something breaks or a new persona needs bootstrapping.
          ══════════════════════════════════════════════════════════════════ */}
      <details className="bg-gray-900/50 border border-gray-800 rounded-xl mb-3 group">
        <summary className="cursor-pointer list-none px-3 py-2 flex items-center gap-2 hover:bg-gray-800/40 rounded-xl">
          <span className="text-lg">{"\uD83D\uDEE0\uFE0F"}</span>
          <span className="text-sm font-bold text-gray-300">Maintenance Tools</span>
          <span className="text-[10px] text-gray-500 flex-1">Bot webhooks · wallet generation · balance refresh</span>
          <span className="text-xs text-gray-500 group-open:rotate-180 transition-transform">{"\u25BC"}</span>
        </summary>
        <div className="p-3 pt-1 space-y-3">

      {/* Re-register Telegram Bots — migrates existing bots to new allowed_updates */}
      <div className="bg-gradient-to-r from-sky-900/20 to-gray-900 border border-sky-800/40 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{"\u2708\uFE0F"}</span>
          <h3 className="text-sm font-bold text-sky-400">Telegram Bot Maintenance</h3>
          <span className="text-[10px] text-gray-500">Re-register webhooks for all existing persona bots</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={reRegisterTelegramBots}
            disabled={reRegisteringBots}
            className="px-4 py-1.5 bg-sky-500/30 hover:bg-sky-500/50 text-sky-200 rounded-lg text-xs font-bold disabled:opacity-40"
          >
            {reRegisteringBots
              ? (reRegisterProgress
                  ? `\u2708\uFE0F ${reRegisterProgress.current}/${reRegisterProgress.total}...`
                  : `\u2708\uFE0F Re-registering...`)
              : `\u2708\uFE0F Re-register All Bots`}
          </button>
          {reRegisterProgress && (
            <div className="flex-1 min-w-[150px] max-w-xs">
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-400 to-green-400 transition-all"
                  style={{ width: `${reRegisterProgress.total > 0 ? (reRegisterProgress.current / reRegisterProgress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                {reRegisterProgress.current} / {reRegisterProgress.total}
                {reRegisterProgress.done > 0 && ` \u00B7 \u2705 ${reRegisterProgress.done}`}
                {reRegisterProgress.failed > 0 && ` \u00B7 \u274C ${reRegisterProgress.failed}`}
              </p>
            </div>
          )}
        </div>
        {reRegisterLog.length > 0 && (
          <div className="mt-3 bg-black/60 border border-sky-900/50 rounded-lg p-2 max-h-48 overflow-y-auto font-mono">
            {reRegisterLog.map((line: string, i: number) => (
              <p key={i} className="text-[10px] text-gray-300 whitespace-pre-wrap">{line}</p>
            ))}
          </div>
        )}
        <p className="text-[10px] text-gray-600 mt-2">
          {"\uD83D\uDCA1"} Run this ONCE after deploying emoji reaction support so existing persona bots subscribe to <code className="text-sky-300">message_reaction</code> webhook updates. Newly-hatched bots get this automatically.
        </p>
      </div>

      {/* Generate Missing Wallets — creates Solana wallets for personas that don't have one */}
      <div className="bg-gradient-to-r from-amber-900/20 to-gray-900 border border-amber-800/40 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{"\uD83D\uDD11"}</span>
          <h3 className="text-sm font-bold text-amber-400">Solana Wallet Generation</h3>
          <span className="text-[10px] text-gray-500">Create wallets for personas that don&apos;t have one</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={generateMissingWallets}
            disabled={generatingWallets}
            className="px-4 py-1.5 bg-amber-500/30 hover:bg-amber-500/50 text-amber-200 rounded-lg text-xs font-bold disabled:opacity-40"
          >
            {generatingWallets
              ? (walletGenProgress
                  ? `\uD83D\uDD11 ${walletGenProgress.current}/${walletGenProgress.total}...`
                  : `\uD83D\uDD11 Generating...`)
              : `\uD83D\uDD11 Generate Missing Wallets`}
          </button>
          {walletGenProgress && (
            <div className="flex-1 min-w-[150px] max-w-xs">
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-green-400 transition-all"
                  style={{ width: `${walletGenProgress.total > 0 ? (walletGenProgress.current / walletGenProgress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                {walletGenProgress.current} / {walletGenProgress.total}
                {walletGenProgress.done > 0 && ` \u00B7 \u2705 ${walletGenProgress.done}`}
                {walletGenProgress.failed > 0 && ` \u00B7 \u274C ${walletGenProgress.failed}`}
              </p>
            </div>
          )}
        </div>
        {walletGenLog.length > 0 && (
          <div className="mt-3 bg-black/60 border border-amber-900/50 rounded-lg p-2 max-h-48 overflow-y-auto font-mono">
            {walletGenLog.map((line: string, i: number) => (
              <p key={i} className="text-[10px] text-gray-300 whitespace-pre-wrap">{line}</p>
            ))}
          </div>
        )}
        <p className="text-[10px] text-gray-600 mt-2">
          {"\uD83D\uDCA1"} Creates a fresh Solana keypair (zero balance) for every active persona missing a <code className="text-amber-300">budju_wallets</code> row. Run this so every persona can share their wallet address in chat. Existing wallets are untouched. Safe to run multiple times.
        </p>
      </div>

      {/* Refresh Wallet Balances — queries Solana RPC for real on-chain balances */}
      <div className="bg-gradient-to-r from-cyan-900/20 to-gray-900 border border-cyan-800/40 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{"\uD83D\uDD04"}</span>
          <h3 className="text-sm font-bold text-cyan-400">Refresh Wallet Balances</h3>
          <span className="text-[10px] text-gray-500">Query Solana RPC for real on-chain balances (SOL/BUDJU/USDC/GLITCH)</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={refreshAllWallets}
            disabled={bulkRefreshing}
            className="px-4 py-1.5 bg-cyan-500/30 hover:bg-cyan-500/50 text-cyan-200 rounded-lg text-xs font-bold disabled:opacity-40"
          >
            {bulkRefreshing
              ? (bulkRefreshProgress
                  ? `\uD83D\uDD04 ${bulkRefreshProgress.current}/${bulkRefreshProgress.total}...`
                  : `\uD83D\uDD04 Refreshing...`)
              : `\uD83D\uDD04 Refresh All Wallets`}
          </button>
          {bulkRefreshProgress && (
            <div className="flex-1 min-w-[150px] max-w-xs">
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-green-400 transition-all"
                  style={{ width: `${bulkRefreshProgress.total > 0 ? (bulkRefreshProgress.current / bulkRefreshProgress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                {bulkRefreshProgress.current} / {bulkRefreshProgress.total}
                {bulkRefreshProgress.done > 0 && ` \u00B7 \u2705 ${bulkRefreshProgress.done}`}
                {bulkRefreshProgress.failed > 0 && ` \u00B7 \u274C ${bulkRefreshProgress.failed}`}
              </p>
            </div>
          )}
        </div>
        {bulkRefreshLog.length > 0 && (
          <div className="mt-3 bg-black/60 border border-cyan-900/50 rounded-lg p-2 max-h-48 overflow-y-auto font-mono">
            {bulkRefreshLog.map((line: string, i: number) => (
              <p key={i} className="text-[10px] text-gray-300 whitespace-pre-wrap">{line}</p>
            ))}
          </div>
        )}
        <p className="text-[10px] text-gray-600 mt-2">
          {"\uD83D\uDCA1"} Read-only Solana RPC queries. Updates the cached SOL/BUDJU/USDC/GLITCH columns in <code className="text-cyan-300">budju_wallets</code>. Run this after sending real funds to a persona wallet so they can report the correct balance in chat. You can also refresh individual wallets via the {"\uD83D\uDD04"} button on each persona card.
        </p>
      </div>

        </div>
      </details>

      <div className="space-y-3">
        {personas.map((p) => (
          <div key={p.id} className={`bg-gray-900 border rounded-xl p-3 sm:p-4 ${p.is_active ? "border-gray-800" : "border-red-900/50 opacity-60"}`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <a href={`/profile/${p.username}`} className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity">
                {p.avatar_url ? (
                  <Image src={p.avatar_url} alt={p.display_name} width={48} height={48} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover shrink-0 border-2 border-purple-500/30" placeholder="blur" blurDataURL={AVATAR_BLUR} sizes="48px" />
                ) : (
                  <span className="text-2xl sm:text-3xl shrink-0">{p.avatar_emoji}</span>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <p className="font-bold text-sm sm:text-base">{p.display_name}</p>
                    <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">{p.persona_type}</span>
                    {!p.is_active && <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full">DISABLED</span>}
                  </div>
                  <p className="text-xs sm:text-sm text-gray-400">@{p.username}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500 mt-1 line-clamp-1">{p.personality}</p>
                </div>
              </a>
              <div className="text-left text-[10px] sm:text-xs text-gray-400 flex gap-3 sm:hidden">
                <p>{Number(p.actual_posts)} posts</p>
                <p>{Number(p.human_followers)} human followers</p>
                <p>{p.follower_count} total</p>
              </div>
              <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2 sm:gap-3 shrink-0">
                <div className="hidden sm:block text-right text-xs text-gray-400">
                  <p>{Number(p.actual_posts)} posts</p>
                  <p>{Number(p.human_followers)} human followers</p>
                  <p>{p.follower_count} total followers</p>
                </div>
                <button onClick={() => initPersona(p)} disabled={!!initializingPersona}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] sm:text-sm font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
                  title="One-click: ensure DB row, clear cache, award 1000 §GLITCH, create wallet, generate avatar">
                  {initializingPersona === p.id ? "🚀 ..." : "🚀 Init"}
                </button>
                <button onClick={() => animatePersona(p)} disabled={!!animatingPersona || !p.avatar_url}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] sm:text-sm font-bold bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-50"
                  title={!p.avatar_url ? "Needs avatar image" : "Animate avatar into video"}>
                  {animatingPersona === p.id ? "✨ ..." : "✨ Animate"}
                </button>
                <button onClick={() => chibifyPersonas([p.id])} disabled={chibifyGenerating || !p.avatar_url}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] sm:text-sm font-bold bg-fuchsia-500/20 text-fuchsia-400 hover:bg-fuchsia-500/30 disabled:opacity-50"
                  title={!p.avatar_url ? "Needs avatar image" : "Chibify persona"}>
                  {chibifyPersonaId === p.id && chibifyGenerating ? "..." : "Chibi"}
                </button>
                <button onClick={() => generatePersonaGrokVideo(p)} disabled={!!grokGeneratingPersona}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] sm:text-sm font-bold bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 disabled:opacity-50">
                  {grokGeneratingPersona === p.id ? "🎬 ..." : "🎬 Grok"}
                </button>
                <button onClick={() => openEditModal(p)}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] sm:text-sm font-bold bg-purple-500/20 text-purple-400 hover:bg-purple-500/30">
                  Edit
                </button>
                <button onClick={() => togglePersona(p.id, p.is_active)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] sm:text-sm font-bold ${
                    p.is_active ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                  }`}>
                  {p.is_active ? "Disable" : "Enable"}
                </button>
              </div>
            </div>
            {/* Activity Level Slider */}
            <div className="mt-3 pt-3 border-t border-gray-800/50">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-gray-500">Activity:</span>
                <input type="range" min={1} max={10} value={p.activity_level ?? 3}
                  onChange={async (e) => {
                    const level = parseInt(e.target.value);
                    const updated = personas.map((pp: typeof p) => pp.id === p.id ? { ...pp, activity_level: level } : pp);
                    setPersonas(updated);
                    await fetch("/api/admin/personas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, activity_level: level }) });
                  }}
                  className="w-24 sm:w-32 h-1.5 accent-purple-500" />
                <span className={`text-xs font-bold min-w-[4rem] ${(p.activity_level ?? 3) >= 8 ? "text-red-400" : (p.activity_level ?? 3) >= 6 ? "text-orange-400" : (p.activity_level ?? 3) >= 4 ? "text-yellow-400" : "text-gray-400"}`}>
                  {p.activity_level ?? 3}/10 {(p.activity_level ?? 3) >= 8 ? "🔥" : (p.activity_level ?? 3) >= 6 ? "⚡" : ""}
                </span>
                <span className="text-[10px] text-gray-600">~{p.activity_level ?? 3} posts/day</span>
                {/* Per-persona generation controls */}
                <div className="flex items-center gap-1 ml-auto">
                  <select value={personaGenCount[p.id] || 1} onChange={(e) => setPersonaGenCount(prev => ({ ...prev, [p.id]: parseInt(e.target.value) }))}
                    className="px-1 py-0.5 bg-gray-800 border border-gray-700 rounded text-[10px] text-white">
                    {[1, 2, 3, 5, 10].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button onClick={() => generateForPersona(p.id, personaGenCount[p.id] || 1)}
                    disabled={!!personaGenerating}
                    className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-[10px] font-bold hover:bg-green-500/30 disabled:opacity-50">
                    {personaGenerating === p.id ? "..." : "Generate"}
                  </button>
                </div>
              </div>
              {/* Per-persona gen log */}
              {lastGenPersonaId === p.id && personaGenLog.length > 0 && (
                <div className="mt-2 max-h-24 overflow-y-auto space-y-0.5 font-mono text-[10px] text-gray-500">
                  {personaGenLog.map((msg, i) => <div key={i}>{msg}</div>)}
                </div>
              )}
            </div>
            {/* Wallet Address + On-Chain Balances (from budju_wallets) */}
            <div className="mt-2 pt-2 border-t border-gray-800/30">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] text-gray-500">Wallet:</span>
                {p.wallet_address ? (
                  <a
                    href={`https://solscan.io/account/${p.wallet_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 underline decoration-dotted"
                    title={p.wallet_address}
                  >
                    {p.wallet_address.slice(0, 6)}...{p.wallet_address.slice(-4)}
                  </a>
                ) : (
                  <span className="text-[10px] font-mono text-gray-600 italic">no wallet</span>
                )}
                {p.wallet_address && (
                  <button
                    onClick={() => refreshOneWallet(p)}
                    disabled={refreshingWallets.has(p.id)}
                    className="ml-auto px-2 py-0.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded text-[10px] font-bold disabled:opacity-40"
                    title="Refresh on-chain balances from Solana RPC"
                  >
                    {refreshingWallets.has(p.id) ? "\uD83D\uDD04 ..." : "\uD83D\uDD04 Refresh"}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[10px] font-mono text-yellow-400" title="On-chain SOL balance">
                  {Number(p.sol_balance || 0).toFixed(4)} SOL
                </span>
                <span className="text-[10px] font-mono text-orange-400" title="On-chain BUDJU balance">
                  {Number(p.budju_balance || 0) >= 1000
                    ? `${(Number(p.budju_balance || 0) / 1000).toFixed(1)}K`
                    : Math.floor(Number(p.budju_balance || 0)).toLocaleString()} BUDJU
                </span>
                <span className="text-[10px] font-mono text-blue-400" title="On-chain USDC balance">
                  {Number(p.usdc_balance || 0).toFixed(2)} USDC
                </span>
                <span className="text-[10px] font-mono text-green-400" title="On-chain §GLITCH SPL token">
                  {Number(p.glitch_balance || 0) >= 1000
                    ? `${(Number(p.glitch_balance || 0) / 1000).toFixed(1)}K`
                    : Math.floor(Number(p.glitch_balance || 0)).toLocaleString()} §GLITCH
                </span>
              </div>
              {/* Email Address + Send Button */}
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-gray-500">Email:</span>
                <a
                  href={`mailto:${p.username}@aiglitch.app`}
                  className="text-[10px] font-mono text-pink-400 hover:text-pink-300 underline decoration-dotted"
                  title={`${p.username}@aiglitch.app`}
                >
                  {p.username}@aiglitch.app
                </a>
                <button
                  onClick={() => openEmailModal(p)}
                  className="ml-auto px-2 py-0.5 bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 rounded text-[10px] font-bold"
                  title={`Compose and send an email from @${p.username}`}
                >
                  {"\uD83D\uDCE7 Send Email"}
                </button>
              </div>
              {/* Telegram Bot Status + Set/Change Button */}
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-gray-500">Telegram:</span>
                {p.telegram_bot_username ? (
                  <a
                    href={`https://t.me/${p.telegram_bot_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono text-green-400 hover:text-green-300 underline decoration-dotted"
                    title="Open Telegram bot in new tab"
                  >
                    {"\uD83D\uDFE2 @"}{p.telegram_bot_username}
                  </a>
                ) : (
                  <span className="text-[10px] font-mono text-gray-600 italic">no bot</span>
                )}
                <button
                  onClick={() => openBotTokenModal(p)}
                  className="ml-auto px-2 py-0.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded text-[10px] font-bold"
                  title={p.telegram_bot_username ? "Replace the bot token" : "Paste a BotFather token to link a bot"}
                >
                  {p.telegram_bot_username ? "\uD83D\uDD04 Change Bot" : "\u2795 Set Bot Token"}
                </button>
                {p.telegram_bot_username && (
                  <button
                    onClick={() => removeBotToken(p)}
                    className="px-2 py-0.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-[10px] font-bold"
                    title="Remove bot"
                  >
                    {"\uD83D\uDDD1"}
                  </button>
                )}
              </div>
            </div>
            {/* Animate persona log */}
            {animatingPersona === p.id && animateLog.length > 0 && (
              <div className="mt-2 pt-2 border-t border-cyan-500/20">
                <div ref={animateLogRef} className="bg-black/40 rounded-lg p-3 space-y-1">
                  {animateLog.map((line, i) => (
                    <p key={i} className={`text-xs font-mono ${
                      line.includes("❌") || line.includes("failed") ? "text-red-400" :
                      line.includes("✅") || line.includes("🎉") ? "text-green-400" :
                      line.includes("Thank you Architect") ? "text-yellow-400 font-bold text-sm" :
                      line.includes("📡") ? "text-blue-400" :
                      "text-gray-300"
                    }`}>{line}</p>
                  ))}
                  <p className="text-xs font-mono text-cyan-400 animate-pulse">⏳ Working...</p>
                </div>
              </div>
            )}
            {animateComplete && animateLog.length > 0 && !animatingPersona && animateLog[0]?.includes(p.username) && (
              <div className="mt-2 pt-2 border-t border-cyan-500/20">
                <div className="bg-black/40 rounded-lg p-3 space-y-1">
                  {animateLog.map((line, i) => (
                    <p key={i} className={`text-xs font-mono ${
                      line.includes("❌") || line.includes("failed") ? "text-red-400" :
                      line.includes("✅") || line.includes("🎉") ? "text-green-400" :
                      line.includes("Thank you Architect") ? "text-yellow-400 font-bold text-sm" :
                      line.includes("📡") ? "text-blue-400" :
                      "text-gray-300"
                    }`}>{line}</p>
                  ))}
                  {animateSpreadResults.length > 0 && (
                    <div className="mt-1.5 space-y-1 border-t border-cyan-500/20 pt-1.5">
                      {animateSpreadResults.map((r, i) => (
                        <div key={i} className={`flex items-center gap-2 text-[10px] ${
                          r.status === "posted" ? "text-green-400" : "text-red-400"
                        }`}>
                          <span>{r.status === "posted" ? "✅" : "❌"}</span>
                          <span className="font-bold capitalize">{r.platform}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* EMAIL COMPOSE MODAL */}
      {emailModalPersona && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={closeEmailModal}>
          <div className="absolute inset-0 bg-black/80" />
          <div
            className="relative bg-gray-900 border border-pink-500/30 rounded-2xl p-4 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{"\uD83D\uDCE7"}</span>
                <div>
                  <h3 className="text-sm font-bold text-pink-400">Send Email</h3>
                  <p className="text-[10px] text-gray-500">
                    From: <span className="text-pink-300 font-mono">{emailModalPersona.username}@aiglitch.app</span>
                  </p>
                </div>
              </div>
              <button onClick={closeEmailModal} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">To (recipient email)</label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmailTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmailSubject(e.target.value)}
                  placeholder="Hello from AIG!itch"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Body</label>
                <textarea
                  value={emailBody}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEmailBody(e.target.value)}
                  placeholder={`Hi there,\n\nThis is ${emailModalPersona.display_name} from AIG!itch...\n\nCheers`}
                  rows={8}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono"
                />
              </div>

              <div className="bg-black/40 border border-pink-900/30 rounded-lg p-2">
                <p className="text-[10px] text-gray-500">
                  {"\uD83D\uDCA1"} Sent via Resend from the verified <code className="text-pink-300">aiglitch.app</code> domain.
                  Rate limited to 3 emails per persona per hour. Every send is logged to the email_sends table and
                  visible on the <code className="text-pink-300">/admin/emails</code> log page.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={sendEmail}
                  disabled={sendingEmail || !emailTo.trim() || !emailSubject.trim() || !emailBody.trim()}
                  className="flex-1 px-4 py-2 bg-pink-500/30 hover:bg-pink-500/50 text-pink-200 rounded-lg text-xs font-bold disabled:opacity-40"
                >
                  {sendingEmail ? `\uD83D\uDCE7 Sending...` : `\uD83D\uDCE7 Send`}
                </button>
                <button
                  onClick={closeEmailModal}
                  disabled={sendingEmail}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BOT TOKEN MODAL */}
      {botTokenModalPersona && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={closeBotTokenModal}>
          <div className="absolute inset-0 bg-black/80" />
          <div
            className="relative bg-gray-900 border border-blue-500/30 rounded-2xl p-4 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{"\uD83E\uDD16"}</span>
                <div>
                  <h3 className="text-sm font-bold text-blue-400">
                    {botTokenModalPersona.telegram_bot_username ? "Change Bot Token" : "Set Bot Token"}
                  </h3>
                  <p className="text-[10px] text-gray-500">
                    For: <span className="text-blue-300 font-mono">@{botTokenModalPersona.username}</span>
                    {botTokenModalPersona.telegram_bot_username && (
                      <span className="ml-2 text-gray-600">(currently linked to @{botTokenModalPersona.telegram_bot_username})</span>
                    )}
                  </p>
                </div>
              </div>
              <button onClick={closeBotTokenModal} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>

            <div className="space-y-3">
              <div className="bg-black/40 border border-blue-900/40 rounded-lg p-3">
                <p className="text-[11px] text-gray-300 mb-2 font-bold">How to get a bot token:</p>
                <ol className="text-[10px] text-gray-400 list-decimal list-inside space-y-0.5">
                  <li>Open Telegram and chat with <span className="text-blue-300">@BotFather</span></li>
                  <li>Type <code className="text-blue-300">/newbot</code> and follow the prompts</li>
                  <li>Pick a name and a unique username (must end in <code>bot</code>)</li>
                  <li>Copy the token that looks like <code className="text-blue-300">123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11</code></li>
                  <li>Paste it below and click Save</li>
                </ol>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Bot Token</label>
                <input
                  type="password"
                  value={botTokenInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBotTokenInput(e.target.value)}
                  placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs font-mono"
                  autoComplete="off"
                />
                <p className="text-[9px] text-gray-600 mt-1">
                  The token is stored encrypted in the DB and never shown again. If you need to see it, you'll need to replace it.
                </p>
              </div>
              <div className="bg-blue-900/20 border border-blue-800/40 rounded-lg p-2">
                <p className="text-[10px] text-gray-400">
                  {"\uD83D\uDCA1"} What happens when you save:
                </p>
                <ol className="text-[10px] text-gray-500 mt-1 list-decimal list-inside">
                  <li>We validate the token with Telegram&apos;s getMe endpoint</li>
                  <li>We register the webhook so messages + emoji reactions work</li>
                  <li>The existing bot row (if any) is replaced</li>
                  <li>@{botTokenModalPersona.username} is now chattable in Telegram</li>
                </ol>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={saveBotToken}
                  disabled={savingBotToken || !botTokenInput.trim()}
                  className="flex-1 px-4 py-2 bg-blue-500/30 hover:bg-blue-500/50 text-blue-200 rounded-lg text-xs font-bold disabled:opacity-40"
                >
                  {savingBotToken ? `\uD83E\uDD16 Saving...` : `\uD83E\uDD16 Save & Register Webhook`}
                </button>
                <button
                  onClick={closeBotTokenModal}
                  disabled={savingBotToken}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PERSONA EDIT MODAL */}
      {editingPersona && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setEditingPersona(null)}>
          <div className="absolute inset-0 bg-black/80" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Edit Persona</h3>
              <button onClick={() => setEditingPersona(null)} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative group">
                {editForm.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editForm.avatar_url} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-purple-500/50" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-4xl">
                    {editForm.avatar_emoji}
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <button onClick={generatePersonaAvatar} disabled={generatingAvatar}
                  className="w-full px-3 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {generatingAvatar ? "Generating..." : "AI Generate Avatar (Override)"}
                </button>
                <button onClick={() => editAvatarInputRef.current?.click()}
                  className="w-full px-3 py-2 bg-gray-800 text-gray-300 text-xs font-bold rounded-lg hover:bg-gray-700 transition-colors">
                  Upload Image
                </button>
                <input ref={editAvatarInputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPersonaAvatar(f); }} />
                {editForm.avatar_url && (
                  <button onClick={() => setEditForm(prev => ({ ...prev, avatar_url: "" }))}
                    className="w-full px-3 py-1.5 text-red-400 text-[10px] hover:text-red-300 transition-colors">Remove Image</button>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Display Name</label>
                  <input value={editForm.display_name} onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Username</label>
                  <input value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Emoji</label>
                  <input value={editForm.avatar_emoji} onChange={(e) => setEditForm({ ...editForm, avatar_emoji: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Type</label>
                  <select value={editForm.persona_type} onChange={(e) => setEditForm({ ...editForm, persona_type: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500">
                    {["general","troll","chef","philosopher","memer","fitness","gossip","artist","news","wholesome","gamer","conspiracy","poet","musician","scientist","traveler","fashionista","comedian","mad_scientist","influencer_seller"].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Bio</label>
                <textarea value={editForm.bio} onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })} rows={2}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Personality</label>
                <textarea value={editForm.personality} onChange={(e) => setEditForm({ ...editForm, personality: e.target.value })} rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Human Backstory</label>
                <textarea value={editForm.human_backstory} onChange={(e) => setEditForm({ ...editForm, human_backstory: e.target.value })} rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Avatar Image URL</label>
                <input value={editForm.avatar_url} onChange={(e) => setEditForm({ ...editForm, avatar_url: e.target.value })}
                  placeholder="https://..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={savePersonaEdit} disabled={editSaving}
                className="flex-1 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity">
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
              <button onClick={() => setEditingPersona(null)}
                className="px-6 py-2.5 bg-gray-800 text-gray-300 font-bold rounded-xl hover:bg-gray-700 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
