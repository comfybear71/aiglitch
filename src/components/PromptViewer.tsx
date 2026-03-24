"use client";
import { useState, useCallback } from "react";

interface PromptViewerProps {
  /** Function that fetches the prompt preview from the API */
  fetchPrompt: () => Promise<string>;
  /** Called when the user edits the prompt — parent stores the override */
  onPromptChange?: (prompt: string | null) => void;
  /** Current custom prompt override (controlled) */
  customPrompt?: string | null;
  /** Label for the button */
  label?: string;
  /** Accent color class for borders/text */
  accent?: string;
  /** Whether generation is in progress (disables editing) */
  disabled?: boolean;
}

export default function PromptViewer({
  fetchPrompt,
  onPromptChange,
  customPrompt,
  label = "Prompt",
  accent = "orange",
  disabled = false,
}: PromptViewerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [originalPrompt, setOriginalPrompt] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accentBorder = `border-${accent}-500/30`;
  const accentText = `text-${accent}-400`;
  const accentBg = `bg-${accent}-500/10`;

  const handleToggle = useCallback(async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (originalPrompt) return; // already fetched
    setLoading(true);
    setError(null);
    try {
      const prompt = await fetchPrompt();
      setOriginalPrompt(prompt);
      setEditedPrompt(prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prompt");
    }
    setLoading(false);
  }, [open, originalPrompt, fetchPrompt]);

  const handleEdit = (value: string) => {
    setEditedPrompt(value);
    if (onPromptChange) {
      // If user changed from original, pass the override; if reset to original, pass null
      onPromptChange(value !== originalPrompt ? value : null);
    }
  };

  const handleReset = () => {
    if (originalPrompt) {
      setEditedPrompt(originalPrompt);
      if (onPromptChange) onPromptChange(null);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const prompt = await fetchPrompt();
      setOriginalPrompt(prompt);
      setEditedPrompt(prompt);
      if (onPromptChange) onPromptChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prompt");
    }
    setLoading(false);
  };

  const isEdited = editedPrompt !== null && editedPrompt !== originalPrompt;

  return (
    <div className="w-full">
      <button
        onClick={handleToggle}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
          open
            ? `${accentBg} ${accentText} ${accentBorder}`
            : `bg-gray-800/40 text-gray-500 border-gray-700/50 hover:border-gray-500/50 hover:text-gray-300`
        } disabled:opacity-40`}
      >
        <span>{open ? "▼" : "▶"}</span>
        <span>👁 {label}</span>
        {isEdited && <span className="text-yellow-400 ml-1">(edited)</span>}
        {customPrompt && !open && <span className="text-yellow-400 ml-1">(custom)</span>}
      </button>

      {open && (
        <div className={`mt-2 rounded-lg border ${accentBorder} bg-black/30 overflow-hidden`}>
          {loading && (
            <div className="p-3 text-center">
              <span className={`text-[10px] ${accentText} animate-pulse`}>Loading prompt...</span>
            </div>
          )}
          {error && (
            <div className="p-3">
              <p className="text-[10px] text-red-400">{error}</p>
              <button onClick={handleRefresh} className="text-[10px] text-gray-400 underline mt-1">
                Retry
              </button>
            </div>
          )}
          {editedPrompt !== null && !loading && (
            <>
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800/50">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                  {label}
                </span>
                <div className="flex items-center gap-2">
                  {isEdited && (
                    <button
                      onClick={handleReset}
                      className="text-[10px] text-gray-500 hover:text-white transition-colors"
                    >
                      ↩ Reset
                    </button>
                  )}
                  <button
                    onClick={handleRefresh}
                    disabled={loading}
                    className="text-[10px] text-gray-500 hover:text-white transition-colors"
                  >
                    🔄 Refresh
                  </button>
                </div>
              </div>
              <textarea
                value={editedPrompt}
                onChange={(e) => handleEdit(e.target.value)}
                disabled={disabled}
                rows={Math.min(20, Math.max(4, editedPrompt.split("\n").length + 1))}
                className={`w-full px-3 py-2 bg-transparent text-[11px] font-mono text-gray-300 placeholder-gray-600 focus:outline-none resize-y disabled:opacity-50 leading-relaxed ${
                  isEdited ? "text-yellow-200" : ""
                }`}
              />
              {isEdited && (
                <div className="px-3 py-1.5 border-t border-gray-800/50">
                  <p className="text-[10px] text-yellow-400/70">
                    ✏️ Prompt has been edited — your version will be used instead of the default
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
