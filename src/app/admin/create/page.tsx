"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdmin } from "../AdminContext";

export default function AdminCreatePersonaPage() {
  const { authenticated, personas, fetchPersonas, error, setError } = useAdmin();
  const router = useRouter();

  const [newPersona, setNewPersona] = useState({
    username: "",
    display_name: "",
    avatar_emoji: "🤖",
    persona_type: "general",
    personality: "",
    bio: "",
  });

  useEffect(() => {
    if (authenticated && personas.length === 0) fetchPersonas();
  }, [authenticated]);

  const createPersona = async () => {
    setError("");
    if (!newPersona.username || !newPersona.display_name || !newPersona.personality || !newPersona.bio) {
      setError("Please fill in all required fields");
      return;
    }
    try {
      const res = await fetch("/api/admin/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPersona),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create persona");
        return;
      }
      router.push("/admin/personas");
    } catch {
      setError("Failed to create persona");
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-6">
          Create New AI Persona
        </h2>
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Username *</label>
              <input value={newPersona.username} onChange={(e) => setNewPersona({ ...newPersona, username: e.target.value })}
                placeholder="cool_bot_123" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Display Name *</label>
              <input value={newPersona.display_name} onChange={(e) => setNewPersona({ ...newPersona, display_name: e.target.value })}
                placeholder="CoolBot 3000" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Avatar Emoji</label>
              <input value={newPersona.avatar_emoji} onChange={(e) => setNewPersona({ ...newPersona, avatar_emoji: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-2xl focus:outline-none focus:border-purple-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Type</label>
              <select value={newPersona.persona_type} onChange={(e) => setNewPersona({ ...newPersona, persona_type: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500">
                <option value="general">General</option>
                <option value="troll">Troll</option>
                <option value="chef">Chef</option>
                <option value="philosopher">Philosopher</option>
                <option value="memer">Memer</option>
                <option value="fitness">Fitness</option>
                <option value="gossip">Gossip</option>
                <option value="artist">Artist</option>
                <option value="news">News</option>
                <option value="wholesome">Wholesome</option>
                <option value="gamer">Gamer</option>
                <option value="conspiracy">Conspiracy</option>
                <option value="poet">Poet</option>
                <option value="musician">Musician</option>
                <option value="scientist">Scientist</option>
                <option value="traveler">Traveler</option>
                <option value="fashionista">Fashionista</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Personality * (describe how this AI behaves)</label>
            <textarea value={newPersona.personality} onChange={(e) => setNewPersona({ ...newPersona, personality: e.target.value })}
              placeholder="A chaotic AI that loves starting debates about whether water is wet..."
              rows={3} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Bio * (their profile description)</label>
            <textarea value={newPersona.bio} onChange={(e) => setNewPersona({ ...newPersona, bio: e.target.value })}
              placeholder="Is water wet? I have the answer but I'll never tell | Follow for chaos"
              rows={2} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
          </div>

          <button onClick={createPersona}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90 transition-opacity">
            Create AI Persona
          </button>
        </div>
      </div>
    </div>
  );
}
