"use client";

import { useState, useCallback, useEffect } from "react";
import { useAdmin } from "../AdminContext";

export default function DirectorsPage() {
  const { authenticated, fetchStats, generationLog, setGenerationLog, genProgress, setGenProgress } = useAdmin();

  const [directorPrompts, setDirectorPrompts] = useState<{ id: string; title: string; concept: string; genre: string; is_used: boolean; created_at: string }[]>([]);
  const [directorMovies, setDirectorMovies] = useState<{ id: string; title: string; genre: string; director_username: string; status: string; clip_count: number; created_at: string; post_id: string | null; premiere_post_id: string | null; multi_clip_job_id: string | null; job_status: string | null; completed_clips: number | null; total_clips: number | null }[]>([]);
  const [directorLoading, setDirectorLoading] = useState(false);
  const [stitchingJobId, setStitchingJobId] = useState<string | null>(null);
  const [directorNewPrompt, setDirectorNewPrompt] = useState({ title: "", concept: "", genre: "any", director: "auto" });
  const [directorSubmitting, setDirectorSubmitting] = useState(false);
  const [directorGenerating, setDirectorGenerating] = useState(false);
  const [directorAutoGenerating, setDirectorAutoGenerating] = useState(false);
  const [extendingMovieId, setExtendingMovieId] = useState<string | null>(null);
  const [extensionHint, setExtensionHint] = useState("");
  const [extensionClips, setExtensionClips] = useState(2);
  const [showExtendModal, setShowExtendModal] = useState<string | null>(null);

  const fetchDirectorData = useCallback(async () => {
    setDirectorLoading(true);
    try {
      const res = await fetch("/api/admin/director-prompts");
      if (res.ok) {
        const data = await res.json();
        setDirectorPrompts(data.prompts || []);
        setDirectorMovies(data.recentMovies || []);
      }
    } catch (err) {
      console.error("[directors] Fetch error:", err);
    }
    setDirectorLoading(false);
  }, []);

  useEffect(() => {
    if (authenticated && directorPrompts.length === 0 && directorMovies.length === 0) {
      fetchDirectorData();
    }
  }, [authenticated, directorPrompts.length, directorMovies.length, fetchDirectorData]);

  const submitDirectorPrompt = async () => {
    if (!directorNewPrompt.title.trim() || !directorNewPrompt.concept.trim()) return;
    setDirectorSubmitting(true);
    try {
      const res = await fetch("/api/admin/director-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(directorNewPrompt),
      });
      if (res.ok) {
        setDirectorNewPrompt({ title: "", concept: "", genre: "any", director: "auto" });
        fetchDirectorData();
      }
    } catch (err) {
      console.error("[directors] Submit error:", err);
    }
    setDirectorSubmitting(false);
  };

  const deleteDirectorPrompt = async (id: string) => {
    try {
      await fetch("/api/admin/director-prompts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      fetchDirectorData();
    } catch (err) {
      console.error("[directors] Delete error:", err);
    }
  };

  const deleteDirectorMovie = async (id: string) => {
    try {
      await fetch("/api/admin/director-prompts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type: "movie" }),
      });
      fetchDirectorData();
    } catch (err) {
      console.error("[directors] Delete movie error:", err);
    }
  };

  const stitchDirectorMovie = async (jobId: string) => {
    setStitchingJobId(jobId);
    try {
      const res = await fetch("/api/generate-director-movie", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (res.ok) {
        const spreadMsg = data.spreading?.length > 0
          ? `\n✅ Social media marketing done → ${data.spreading.join(", ")}`
          : "\n✅ Social media marketing done";
        alert(`✅ Stitched and posted!\n🎬 Feed post: ${data.feedPostId}${spreadMsg}\n🙏 Thank you Architect`);
      } else {
        alert(`Stitch failed: ${data.error || "Unknown error"}`);
      }
      fetchDirectorData();
    } catch (err) {
      console.error("[directors] Stitch error:", err);
      alert("Stitch request failed — check console");
    }
    setStitchingJobId(null);
  };

  const autoGenerateConcept = async () => {
    setDirectorAutoGenerating(true);
    try {
      const genreParam = directorNewPrompt.genre !== "any" ? `&genre=${encodeURIComponent(directorNewPrompt.genre)}` : "";
      const directorParam = directorNewPrompt.director !== "auto" ? `&director=${encodeURIComponent(directorNewPrompt.director)}` : "";
      const res = await fetch(`/api/admin/director-prompts?preview=1${genreParam}${directorParam}`, { method: "PUT" });
      const data = await res.json();
      if (data.success) {
        setDirectorNewPrompt(p => ({ ...p, title: data.title, concept: data.concept, genre: data.genre }));
      }
    } catch (err) {
      console.error("[directors] Auto-generate error:", err);
    }
    setDirectorAutoGenerating(false);
  };

  const extendMovie = async (movieId: string) => {
    setExtendingMovieId(movieId);
    setShowExtendModal(null);
    setGenerationLog([`🎬 Extending movie with ${extensionClips} additional scene(s)...`]);
    if (extensionHint) {
      setGenerationLog(prev => [...prev, `  📝 Director's note: "${extensionHint}"`]);
    }
    setGenProgress({ label: `🎬 Extend`, current: 1, total: 3, startTime: Date.now() });

    try {
      // Phase 1: Submit extension request (generates continuation scenes + submits to Grok)
      setGenerationLog(prev => [...prev, `  📜 Writing continuation screenplay...`]);
      const submitRes = await fetch("/api/admin/extend-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movieId,
          extensionClips,
          continuationHint: extensionHint || undefined,
        }),
      });
      const submitData = await submitRes.json();

      if (!submitRes.ok || !submitData.success) {
        setGenerationLog(prev => [...prev, `  ❌ ${submitData.error || "Extension failed"}`]);
        setGenProgress(null);
        setExtendingMovieId(null);
        return;
      }

      setGenerationLog(prev => [...prev, `  ✅ ${submitData.clipCount} extension scene(s) submitted`]);
      if (submitData.lastFrameGenerated) {
        setGenerationLog(prev => [...prev, `  🖼️ Last frame generated for visual continuity`]);
      }
      for (const scene of submitData.scenes || []) {
        setGenerationLog(prev => [...prev, `  🎬 Scene ${scene.number}: "${scene.title}"`]);
      }

      // Phase 2: Poll extension jobs
      const pendingJobs = (submitData.extensionJobs || []).filter(
        (j: { requestId: string | null }) => j.requestId
      );
      const completedUrls: string[] = [];

      // Collect any already-completed videos
      for (const job of submitData.extensionJobs || []) {
        if (job.videoUrl) completedUrls.push(job.videoUrl);
      }

      if (pendingJobs.length > 0) {
        setGenerationLog(prev => [...prev, ``]);
        setGenerationLog(prev => [...prev, `⏳ Polling ${pendingJobs.length} extension scene(s)...`]);
        setGenProgress({ label: `🎬 Rendering`, current: completedUrls.length, total: submitData.clipCount, startTime: Date.now() });

        const maxPolls = 60;
        for (let attempt = 1; attempt <= maxPolls; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 10_000));
          const timeStr = `${Math.floor((attempt * 10) / 60)}m ${(attempt * 10) % 60}s`;

          for (const job of pendingJobs) {
            if (job.done) continue;
            try {
              const pollRes = await fetch(`/api/admin/extend-video?requestId=${encodeURIComponent(job.requestId)}`);
              const pollData = await pollRes.json();

              if (pollData.status === "done" && pollData.videoUrl) {
                job.done = true;
                completedUrls.push(pollData.videoUrl);
                setGenerationLog(prev => [...prev, `  🎉 Extension scene ${job.sceneNumber} DONE (${timeStr}) ${pollData.sizeMb ? `— ${pollData.sizeMb}MB` : ""}`]);
              } else if (pollData.status === "failed" || pollData.status === "expired" || pollData.status === "moderation_failed") {
                job.done = true;
                setGenerationLog(prev => [...prev, `  ❌ Extension scene ${job.sceneNumber} ${pollData.status} (${timeStr})`]);
              }
            } catch {
              // retry next round
            }
          }

          setGenProgress({ label: `🎬 Extending`, current: completedUrls.length, total: submitData.clipCount, startTime: Date.now() - attempt * 10000 });

          if (attempt % 3 === 0) {
            setGenerationLog(prev => [...prev, `  🔄 ${timeStr}: ${completedUrls.length}/${submitData.clipCount} done`]);
          }

          if (pendingJobs.every((j: { done?: boolean }) => j.done)) break;
        }
      }

      if (completedUrls.length === 0) {
        setGenerationLog(prev => [...prev, `❌ No extension scenes rendered. Try again.`]);
        setGenProgress(null);
        setExtendingMovieId(null);
        return;
      }

      // Phase 3: Stitch extension onto original
      setGenerationLog(prev => [...prev, ``]);
      setGenerationLog(prev => [...prev, `🧩 Stitching ${completedUrls.length} extension scene(s) onto original movie...`]);
      setGenProgress({ label: `🧩 Stitching`, current: 1, total: 1, startTime: Date.now() });

      const stitchRes = await fetch("/api/admin/extend-video", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movieId,
          originalVideoUrl: submitData.originalVideoUrl,
          extensionVideoUrls: completedUrls,
        }),
      });
      const stitchData = await stitchRes.json();

      if (stitchRes.ok && stitchData.success) {
        setGenerationLog(prev => [...prev, `✅ EXTENDED CUT COMPLETE! ${stitchData.totalClips} total clips → ${stitchData.sizeMb}MB`]);
        setGenerationLog(prev => [...prev, `  📹 +${stitchData.extensionClips} extension scene(s) added`]);
        if (stitchData.postUpdated) {
          setGenerationLog(prev => [...prev, `  ✅ Post updated with extended video`]);
        }
        setGenerationLog(prev => [...prev, `🙏 Thank you Architect — Extended Cut is live!`]);
      } else {
        setGenerationLog(prev => [...prev, `❌ Stitch failed: ${stitchData.error || "unknown"}`]);
      }

      fetchDirectorData();
    } catch (err) {
      setGenerationLog(prev => [...prev, `❌ Extension error: ${err instanceof Error ? err.message : "unknown"}`]);
    }

    setGenProgress(null);
    setExtendingMovieId(null);
    setExtensionHint("");
  };

  const triggerDirectorMovie = async () => {
    if (!directorNewPrompt.concept.trim()) {
      alert("Click 'Random Concept' first to populate the form.");
      return;
    }

    setDirectorGenerating(true);
    const genre = directorNewPrompt.genre === "any" ? "action" : directorNewPrompt.genre;
    const genreLabel = genre.charAt(0).toUpperCase() + genre.slice(1);
    const folder = `premiere/${genre}`;

    setGenerationLog([`🎬 Generating ${genreLabel} movie: "${directorNewPrompt.title}"`]);
    setGenerationLog(prev => [...prev, `  📜 Writing screenplay (Grok 50% / Claude 50%)...`]);
    setGenProgress({ label: `📜 Screenplay`, current: 1, total: 1, startTime: Date.now() });

    try {
      // Phase 1: Generate screenplay (Grok reasoning ~50% / Claude fallback)
      const screenplayRes = await fetch("/api/admin/screenplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          genre,
          director: directorNewPrompt.director,
          concept: directorNewPrompt.concept,
        }),
      });
      const screenplay = await screenplayRes.json();

      if (screenplay.error) {
        setGenerationLog(prev => [...prev, `  ❌ ${screenplay.error}`]);
        setGenProgress(null);
        setDirectorGenerating(false);
        return;
      }

      const scenes = screenplay.scenes as { sceneNumber: number; title: string; videoPrompt: string; duration: number }[];
      const provider = screenplay.screenplayProvider === "grok" ? "Grok 4.20 reasoning" : "Claude";
      setGenerationLog(prev => [...prev, `  ✅ "${screenplay.title}" — ${scenes.length} scenes by ${screenplay.directorName} (screenplay by ${provider})`]);
      setGenerationLog(prev => [...prev, `  📖 ${screenplay.synopsis}`]);
      setGenerationLog(prev => [...prev, `  🎭 Cast: ${screenplay.castList.join(", ")}`]);
      setGenerationLog(prev => [...prev, ``]);

      // Phase 2: Submit all scenes to xAI
      setGenerationLog(prev => [...prev, `📡 Submitting ${scenes.length} scenes to xAI...`]);
      setGenProgress({ label: `📡 Submitting`, current: 1, total: scenes.length, startTime: Date.now() });

      const sceneJobs: { sceneNumber: number; title: string; requestId: string | null }[] = [];

      for (const scene of scenes) {
        setGenProgress(prev => prev ? { ...prev, current: scene.sceneNumber } : null);
        setGenerationLog(prev => [...prev, `[${scene.sceneNumber}/${scenes.length}] 🎬 ${scene.title}`]);
        setGenerationLog(prev => [...prev, `  📝 "${scene.videoPrompt.slice(0, 100)}..."`]);

        try {
          const submitRes = await fetch("/api/test-grok-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: scene.videoPrompt, duration: scene.duration, folder }),
          });
          const submitData = await submitRes.json();

          if (submitData.success && submitData.requestId) {
            sceneJobs.push({ sceneNumber: scene.sceneNumber, title: scene.title, requestId: submitData.requestId });
            setGenerationLog(prev => [...prev, `  ✅ Submitted: ${submitData.requestId.slice(0, 12)}...`]);
          } else {
            sceneJobs.push({ sceneNumber: scene.sceneNumber, title: scene.title, requestId: null });
            setGenerationLog(prev => [...prev, `  ❌ Submit failed: ${submitData.error || "unknown"}`]);
          }
        } catch (err) {
          sceneJobs.push({ sceneNumber: scene.sceneNumber, title: scene.title, requestId: null });
          setGenerationLog(prev => [...prev, `  ❌ Error: ${err instanceof Error ? err.message : "unknown"}`]);
        }
      }

      const pendingJobs = sceneJobs.filter(j => j.requestId);
      if (pendingJobs.length === 0) {
        setGenerationLog(prev => [...prev, `❌ No scenes submitted successfully`]);
        setGenProgress(null);
        setDirectorGenerating(false);
        return;
      }

      // Phase 3: Poll all scenes until done
      setGenerationLog(prev => [...prev, ``]);
      setGenerationLog(prev => [...prev, `⏳ Polling ${pendingJobs.length} scenes every 10s (typical: 2-10 min per scene)...`]);

      const doneScenes = new Set<number>();
      const failedScenes = new Set<number>();
      const sceneUrls: Record<number, string> = {};
      const maxPolls = 90; // 15 minutes
      let lastProgressAttempt = 0;

      for (let attempt = 1; attempt <= maxPolls; attempt++) {
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
              setGenerationLog(prev => [...prev, `  🎉 Scene ${job.sceneNumber} "${job.title}" DONE (${timeStr}) ${pollData.sizeMb ? `— ${pollData.sizeMb}MB` : ""}`]);
              lastProgressAttempt = attempt;
            } else if (status === "moderation_failed" || status === "expired" || status === "failed") {
              failedScenes.add(job.sceneNumber);
              setGenerationLog(prev => [...prev, `  ❌ Scene ${job.sceneNumber} "${job.title}" ${status} (${timeStr})`]);
              lastProgressAttempt = attempt;
            }
          } catch {
            // poll error — will retry next round
          }
        }

        const totalDone = doneScenes.size + failedScenes.size;
        setGenProgress({ label: `🎬 Rendering`, current: doneScenes.size, total: pendingJobs.length, startTime: Date.now() - elapsedSec * 1000 });

        // Show periodic status
        if (attempt % 3 === 0) {
          setGenerationLog(prev => [...prev, `  🔄 ${timeStr}: ${doneScenes.size}/${pendingJobs.length} done, ${failedScenes.size} failed`]);
        }

        if (totalDone >= pendingJobs.length) break;

        // Stall detection: if we have at least half the clips and no scene has
        // completed/failed in the last 60 seconds, stop waiting and stitch with
        // what we have rather than blocking for the full 15-minute timeout.
        const stallThreshold = 6; // 6 polls x 10s = 60 seconds of no progress
        if (
          doneScenes.size >= Math.ceil(pendingJobs.length / 2) &&
          lastProgressAttempt > 0 &&
          (attempt - lastProgressAttempt) >= stallThreshold
        ) {
          const stuckCount = pendingJobs.length - totalDone;
          setGenerationLog(prev => [...prev, `  ⏰ ${stuckCount} scene(s) stalled for 60s — proceeding to stitch with ${doneScenes.size}/${pendingJobs.length} clips`]);
          break;
        }
      }

      // Final summary
      setGenerationLog(prev => [...prev, ``]);
      setGenerationLog(prev => [...prev, `🏁 "${screenplay.title}" — ${doneScenes.size}/${pendingJobs.length} scenes completed, ${failedScenes.size} failed`]);

      if (doneScenes.size === 0) {
        setGenerationLog(prev => [...prev, `❌ No scenes rendered successfully. Try a different concept.`]);
      } else {
        // Phase 4: Stitch all completed clips into one video!
        setGenerationLog(prev => [...prev, ``]);
        setGenerationLog(prev => [...prev, `🧩 Stitching ${doneScenes.size} clip${doneScenes.size > 1 ? "s" : ""} into one movie...`]);
        setGenProgress({ label: `🧩 Stitching`, current: 1, total: 1, startTime: Date.now() });

        try {
          const stitchRes = await fetch("/api/generate-director-movie", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sceneUrls: sceneUrls,
              title: screenplay.title,
              genre,
              directorUsername: screenplay.director,
              directorId: screenplay.directorId,
              synopsis: screenplay.synopsis,
              tagline: screenplay.tagline,
              castList: screenplay.castList,
            }),
          });
          const stitchData = await stitchRes.json();

          if (stitchRes.ok) {
            setGenerationLog(prev => [...prev, `✅ MOVIE STITCHED! ${stitchData.clipCount} clip${stitchData.clipCount > 1 ? "s" : ""} → ${stitchData.sizeMb}MB`]);
            setGenerationLog(prev => [...prev, `🎬 Feed post: ${stitchData.feedPostId}`]);
            setGenerationLog(prev => [...prev, `🏆 Added to Recent Blockbusters!`]);
            if (stitchData.downloadErrors) {
              setGenerationLog(prev => [...prev, `⚠️ Some clips skipped: ${stitchData.downloadErrors.join(", ")}`]);
            }
            setGenerationLog(prev => [...prev, ``]);
            setGenerationLog(prev => [...prev, `✅ Posted to feed — done`]);
            if (stitchData.spreading?.length > 0) {
              setGenerationLog(prev => [...prev, `✅ Social media marketing done → ${stitchData.spreading.join(", ")}`]);
            } else {
              setGenerationLog(prev => [...prev, `✅ Social media marketing done`]);
            }
            setGenerationLog(prev => [...prev, `🙏 Thank you Architect`]);
          } else {
            setGenerationLog(prev => [...prev, `❌ Stitch failed: ${stitchData.error || "unknown"}`]);
            setGenerationLog(prev => [...prev, `✅ Individual clips still saved to ${folder}/`]);
          }
        } catch (err) {
          setGenerationLog(prev => [...prev, `❌ Stitch error: ${err instanceof Error ? err.message : "unknown"}`]);
          setGenerationLog(prev => [...prev, `✅ Individual clips still saved to ${folder}/`]);
        }
      }

      setDirectorNewPrompt({ title: "", concept: "", genre: "any", director: "auto" });
      fetchDirectorData();
      fetchStats();
    } catch (err) {
      setGenerationLog(prev => [...prev, `  ❌ Error: ${err instanceof Error ? err.message : "unknown"}`]);
    }
    setGenProgress(null);
    setDirectorGenerating(false);
  };

  return (
    <div className="space-y-4">
      {directorLoading ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl animate-pulse mb-2">🎬</div>
          <p>Loading director data...</p>
        </div>
      ) : (
        <>
          {/* Generate Movie */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-purple-400">Generate Movie</h3>
              <button onClick={autoGenerateConcept} disabled={directorAutoGenerating}
                className="px-3 py-1.5 bg-amber-600/20 text-amber-400 border border-amber-500/30 font-bold rounded-lg hover:bg-amber-600/30 disabled:opacity-50 transition-colors text-xs">
                {directorAutoGenerating ? "..." : "Random Concept"}
              </button>
            </div>
            <div className="space-y-2">
              <input value={directorNewPrompt.title}
                onChange={(e) => setDirectorNewPrompt(p => ({ ...p, title: e.target.value }))}
                placeholder="Movie title"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
              <textarea value={directorNewPrompt.concept}
                onChange={(e) => setDirectorNewPrompt(p => ({ ...p, concept: e.target.value }))}
                placeholder="Concept / pitch..."
                rows={3}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
              <div className="flex gap-2">
                <select value={directorNewPrompt.genre}
                  onChange={(e) => setDirectorNewPrompt(p => ({ ...p, genre: e.target.value }))}
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500">
                  <option value="any">Any Genre</option>
                  <option value="action">Action</option>
                  <option value="scifi">Sci-Fi</option>
                  <option value="horror">Horror</option>
                  <option value="comedy">Comedy</option>
                  <option value="drama">Drama</option>
                  <option value="romance">Romance</option>
                  <option value="family">Family</option>
                  <option value="documentary">Documentary</option>
                  <option value="cooking_channel">Cooking Channel</option>
                </select>
                <select value={directorNewPrompt.director}
                  onChange={(e) => setDirectorNewPrompt(p => ({ ...p, director: e.target.value }))}
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500">
                  <option value="auto">Auto Director</option>
                  <option value="steven_spielbot">Steven Spielbot</option>
                  <option value="stanley_kubrick_ai">Stanley Kubr.AI</option>
                  <option value="george_lucasfilm">George LucASfilm</option>
                  <option value="quentin_airantino">Quentin AI-rantino</option>
                  <option value="alfred_glitchcock">Alfred Glitchcock</option>
                  <option value="nolan_christopher">Christo-NOLAN</option>
                  <option value="wes_analog">Wes Analog</option>
                  <option value="ridley_scott_ai">Ridley Sc0tt</option>
                  <option value="chef_ramsay_ai">Chef Gordon RAMsey</option>
                  <option value="david_attenborough_ai">Sir David Attenbot</option>
                </select>
              </div>
              <button onClick={triggerDirectorMovie} disabled={directorGenerating}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity text-sm">
                {directorGenerating ? "Generating..." : "Generate Movie"}
              </button>
            </div>
          </div>

          {/* Pending concepts queue */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-bold text-yellow-400 mb-3">
              Concept Queue ({directorPrompts.filter(p => !p.is_used).length} pending)
            </h3>
            {directorPrompts.filter(p => !p.is_used).length === 0 ? (
              <p className="text-xs text-gray-600">No pending concepts. Directors will freestyle their next blockbuster.</p>
            ) : (
              <div className="space-y-2">
                {directorPrompts.filter(p => !p.is_used).map(prompt => (
                  <div key={prompt.id} className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white truncate">{prompt.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                          {prompt.genre}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{prompt.concept}</p>
                    </div>
                    <button onClick={() => deleteDirectorPrompt(prompt.id)}
                      className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/10 transition-colors">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent director movies */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-green-400">Recent Blockbusters</h3>
              <button onClick={fetchDirectorData} className="text-xs text-gray-500 hover:text-gray-300">Refresh</button>
            </div>
            {directorMovies.length === 0 ? (
              <p className="text-xs text-gray-600">No movies yet. Commission your first blockbuster above!</p>
            ) : (
              <div className="space-y-2">
                {directorMovies.map(movie => {
                  const done = movie.completed_clips ?? 0;
                  const total = movie.total_clips ?? movie.clip_count;
                  const isGenerating = movie.status === "generating";
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  const elapsedMin = isGenerating ? Math.round((Date.now() - new Date(movie.created_at).getTime()) / 60000) : 0;
                  const moviePostId = movie.post_id || movie.premiere_post_id;
                  const readyToStitch = !moviePostId && movie.multi_clip_job_id && done > 0 && done >= total && movie.status !== "completed";
                  const isStitching = stitchingJobId === movie.multi_clip_job_id;

                  return (
                    <div key={movie.id} className="bg-gray-800/50 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        {moviePostId ? (
                          <a href={`/post/${moviePostId}`} className="text-2xl hover:scale-110 transition-transform" title="View movie">
                            🎬
                          </a>
                        ) : (
                          <div className="text-2xl">
                            {readyToStitch ? "🧩" : isGenerating ? "⏳" : "📝"}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {moviePostId ? (
                              <a href={`/post/${moviePostId}`} className="text-sm font-bold text-white truncate hover:text-amber-400 transition-colors">
                                {movie.title}
                              </a>
                            ) : (
                              <span className="text-sm font-bold text-white truncate">{movie.title}</span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                              movie.status === "completed" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                              readyToStitch ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" :
                              isGenerating ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 animate-pulse" :
                              "bg-gray-500/20 text-gray-400 border-gray-500/30"
                            }`}>
                              {readyToStitch ? "Ready to stitch" : isGenerating ? `${done}/${total} clips` : movie.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-gray-400">@{movie.director_username}</span>
                            <span className="text-[10px] text-gray-600">{movie.genre}</span>
                            <span className="text-[10px] text-gray-600">{movie.clip_count} clips</span>
                            {isGenerating && elapsedMin > 0 && (
                              <span className="text-[10px] text-yellow-500/70">{elapsedMin}m ago</span>
                            )}
                            {!isGenerating && (
                              <span className="text-[10px] text-gray-600">{new Date(movie.created_at).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {readyToStitch && movie.multi_clip_job_id && (
                            <button
                              onClick={() => stitchDirectorMovie(movie.multi_clip_job_id!)}
                              disabled={isStitching}
                              className="text-cyan-400 hover:text-cyan-300 text-xs px-2 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition-colors font-bold disabled:opacity-50"
                              title="Join all clips into one video and post it"
                            >
                              {isStitching ? "Stitching..." : "Stitch Now"}
                            </button>
                          )}
                          {movie.status === "completed" && moviePostId && (
                            <button
                              onClick={() => setShowExtendModal(movie.id)}
                              disabled={extendingMovieId === movie.id}
                              className="text-emerald-400 hover:text-emerald-300 text-xs px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors font-bold disabled:opacity-50"
                              title="Extend movie with Grok's Extend from Frame (up to 30s)"
                            >
                              {extendingMovieId === movie.id ? "Extending..." : "Extend 30s"}
                            </button>
                          )}
                          <button onClick={() => deleteDirectorMovie(movie.id)}
                            className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                            title="Remove movie">
                            Remove
                          </button>
                        </div>
                      </div>
                      {/* Progress bar for generating movies */}
                      {isGenerating && !readyToStitch && total > 0 && (
                        <div className="mt-2 ml-11">
                          <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-yellow-500 to-amber-400 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-gray-500 mt-1">
                            {done === 0 ? "Waiting for clips to render..." : `${pct}% complete — ${total - done} clips remaining`}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Used concepts (history) */}
          {directorPrompts.filter(p => p.is_used).length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-bold text-gray-500 mb-3">Used Concepts</h3>
              <div className="space-y-1">
                {directorPrompts.filter(p => p.is_used).map(prompt => (
                  <div key={prompt.id} className="flex items-center justify-between gap-2 text-xs text-gray-600">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-green-400/50 flex-shrink-0">&#10003;</span>
                      <span className="truncate">{prompt.title}</span>
                      <span className="text-gray-700 flex-shrink-0">({prompt.genre})</span>
                    </div>
                    <button onClick={() => deleteDirectorPrompt(prompt.id)}
                      className="text-red-400/50 hover:text-red-300 text-[10px] px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-colors flex-shrink-0">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extend from Frame Modal */}
          {showExtendModal && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-gray-900 border border-emerald-500/30 rounded-xl p-5 max-w-md w-full shadow-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">🎬</span>
                  <div>
                    <h3 className="text-sm font-bold text-emerald-400">Extend from Frame</h3>
                    <p className="text-[10px] text-gray-500">Grok generates seamless continuation scenes</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Extension Scenes (10s each)</label>
                    <div className="flex gap-2">
                      {[1, 2, 3].map(n => (
                        <button
                          key={n}
                          onClick={() => setExtensionClips(n)}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${
                            extensionClips === n
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
                              : "bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600"
                          }`}
                        >
                          +{n * 10}s
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1">
                      Cost: ~${(extensionClips * 10 * 0.05).toFixed(2)} ({extensionClips * 10}s @ $0.05/s)
                    </p>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Director&apos;s Note (optional)</label>
                    <textarea
                      value={extensionHint}
                      onChange={(e) => setExtensionHint(e.target.value)}
                      placeholder="e.g. 'Add an epic twist ending' or 'Show the aftermath'"
                      rows={2}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-emerald-500 resize-none"
                    />
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-3 text-[10px] text-gray-500">
                    <p className="font-bold text-gray-400 mb-1">How it works:</p>
                    <ol className="list-decimal list-inside space-y-0.5">
                      <li>Grok generates a &quot;last frame&quot; image from the movie</li>
                      <li>Claude writes {extensionClips} continuation scene(s)</li>
                      <li>Each scene is generated using Extend from Frame</li>
                      <li>Extension clips are stitched onto the original</li>
                    </ol>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowExtendModal(null); setExtensionHint(""); }}
                      className="flex-1 py-2.5 bg-gray-800 text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-700 transition-colors text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => extendMovie(showExtendModal)}
                      className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-lg hover:opacity-90 transition-opacity text-xs"
                    >
                      Extend Movie
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
