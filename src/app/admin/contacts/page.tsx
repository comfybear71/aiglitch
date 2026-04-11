"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import type { Persona } from "../admin-types";

interface Contact {
  id: string;
  name: string | null;
  email: string;
  company: string | null;
  tags: string[];
  assigned_persona_id: string | null;
  notes: string | null;
  last_emailed_at: string | null;
  email_count: number;
  created_at: string;
  updated_at: string;
  persona_username?: string | null;
  persona_display_name?: string | null;
  persona_avatar?: string | null;
}

export default function ContactsAdminPage() {
  const { personas, fetchPersonas, authenticated } = useAdmin();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tagFilter, setTagFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Single add form
  const [showSingleForm, setShowSingleForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newAssignedPersona, setNewAssignedPersona] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [savingSingle, setSavingSingle] = useState(false);

  // Bulk import state
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkDefaultTags, setBulkDefaultTags] = useState("");
  const [bulkDefaultPersona, setBulkDefaultPersona] = useState("");
  const [savingBulk, setSavingBulk] = useState(false);

  // Edit mode
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string; email: string; company: string; tags: string;
    assigned_persona_id: string; notes: string;
  }>({ name: "", email: "", company: "", tags: "", assigned_persona_id: "", notes: "" });

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tagFilter) params.set("tag", tagFilter);
      if (searchQuery) params.set("search", searchQuery);
      const res = await fetch(`/api/admin/contacts${params.toString() ? `?${params.toString()}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
        setAllTags(data.all_tags || []);
      }
    } catch (err) {
      console.error("Failed to fetch contacts:", err);
    }
    setLoading(false);
  }, [tagFilter, searchQuery]);

  useEffect(() => { if (authenticated) fetchContacts(); }, [authenticated, fetchContacts]);
  useEffect(() => { if (authenticated && personas.length === 0) fetchPersonas(); }, [authenticated, personas.length, fetchPersonas]);

  const resetSingleForm = () => {
    setNewEmail("");
    setNewName("");
    setNewCompany("");
    setNewTags("");
    setNewAssignedPersona("");
    setNewNotes("");
  };

  const addSingleContact = async () => {
    if (savingSingle) return;
    if (!newEmail.trim()) {
      alert("\u274C Email required");
      return;
    }
    setSavingSingle(true);
    try {
      const tagsArray = newTags.split(",").map((t: string) => t.trim()).filter(Boolean);
      const res = await fetch("/api/admin/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          name: newName.trim() || null,
          company: newCompany.trim() || null,
          tags: tagsArray,
          assigned_persona_id: newAssignedPersona || null,
          notes: newNotes.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`\u2705 Contact added: ${data.email}`);
        resetSingleForm();
        setShowSingleForm(false);
        fetchContacts();
      } else {
        alert(`\u274C ${data.error || "Failed"}`);
      }
    } catch (err) {
      alert(`\u274C Network error: ${err instanceof Error ? err.message : "unknown"}`);
    }
    setSavingSingle(false);
  };

  const bulkImport = async () => {
    if (savingBulk) return;
    if (!bulkText.trim()) {
      alert("\u274C Paste at least one line");
      return;
    }
    setSavingBulk(true);
    try {
      const defaultTags = bulkDefaultTags.split(",").map((t: string) => t.trim()).filter(Boolean);
      const res = await fetch("/api/admin/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bulk: bulkText,
          default_tags: defaultTags,
          default_assigned_persona_id: bulkDefaultPersona || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        let msg = `\u2705 Bulk import done\n\nCreated: ${data.created}\nSkipped (duplicates): ${data.skipped}`;
        if (data.errors_count > 0) {
          msg += `\nErrors: ${data.errors_count}\n\nFirst few errors:\n${(data.errors || []).slice(0, 5).map((e: { line: string; reason: string }) => `  \u2022 ${e.line.slice(0, 40)} \u2192 ${e.reason}`).join("\n")}`;
        }
        alert(msg);
        setBulkText("");
        setBulkDefaultTags("");
        setBulkDefaultPersona("");
        setShowBulkForm(false);
        fetchContacts();
      } else {
        alert(`\u274C ${data.error || "Failed"}`);
      }
    } catch (err) {
      alert(`\u274C Network error: ${err instanceof Error ? err.message : "unknown"}`);
    }
    setSavingBulk(false);
  };

  const startEdit = (c: Contact) => {
    setEditingContactId(c.id);
    setEditForm({
      name: c.name || "",
      email: c.email,
      company: c.company || "",
      tags: (c.tags || []).join(", "),
      assigned_persona_id: c.assigned_persona_id || "",
      notes: c.notes || "",
    });
  };

  const saveEdit = async () => {
    if (!editingContactId) return;
    try {
      const tagsArray = editForm.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
      const res = await fetch("/api/admin/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingContactId,
          name: editForm.name.trim() || null,
          email: editForm.email.trim(),
          company: editForm.company.trim() || null,
          tags: tagsArray,
          assigned_persona_id: editForm.assigned_persona_id || null,
          notes: editForm.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingContactId(null);
        fetchContacts();
      } else {
        alert(`\u274C ${data.error || "Failed"}`);
      }
    } catch (err) {
      alert(`\u274C Network error: ${err instanceof Error ? err.message : "unknown"}`);
    }
  };

  const deleteContact = async (c: Contact) => {
    if (!confirm(`Delete contact ${c.name || c.email}?`)) return;
    try {
      const res = await fetch(`/api/admin/contacts?id=${encodeURIComponent(c.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setContacts(prev => prev.filter((x: Contact) => x.id !== c.id));
      } else {
        alert(`\u274C ${data.error || "Failed"}`);
      }
    } catch (err) {
      alert(`\u274C Network error: ${err instanceof Error ? err.message : "unknown"}`);
    }
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return "never";
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 border border-pink-500/30 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-3xl">{"\uD83D\uDCC7"}</span>
          <div>
            <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-cyan-400">
              Contacts
            </h2>
            <p className="text-gray-400 text-xs">
              Outreach list for persona email campaigns. Tag contacts by category (grants / sponsors / media) and
              assign them to specific personas. Phase 5.2b will let Telegram personas draft emails to these contacts.
            </p>
          </div>
        </div>
      </div>

      {/* Stats + actions bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-4 flex-wrap">
        <div className="flex gap-4 text-xs">
          <div><span className="text-gray-500">Total:</span> <span className="text-white font-bold">{contacts.length}</span></div>
          <div><span className="text-gray-500">Tags:</span> <span className="text-cyan-400 font-bold">{allTags.length}</span></div>
        </div>
        <div className="ml-auto flex gap-2 flex-wrap">
          <button
            onClick={() => { setShowSingleForm(!showSingleForm); setShowBulkForm(false); }}
            className="px-3 py-1 bg-pink-500/30 hover:bg-pink-500/50 text-pink-200 rounded text-xs font-bold"
          >
            {showSingleForm ? "\u2715 Close" : `\u2795 Add Contact`}
          </button>
          <button
            onClick={() => { setShowBulkForm(!showBulkForm); setShowSingleForm(false); }}
            className="px-3 py-1 bg-cyan-500/30 hover:bg-cyan-500/50 text-cyan-200 rounded text-xs font-bold"
          >
            {showBulkForm ? "\u2715 Close" : `\uD83D\uDCCB Bulk Import`}
          </button>
          <button
            onClick={fetchContacts}
            disabled={loading}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs disabled:opacity-50"
          >
            {loading ? "..." : `\u21BB Refresh`}
          </button>
        </div>
      </div>

      {/* Single contact form */}
      {showSingleForm && (
        <div className="bg-gray-900 border border-pink-500/30 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-pink-400">Add New Contact</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Email *</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEmail(e.target.value)}
                placeholder="dante@darwininnovationhub.com.au"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Name</label>
              <input
                value={newName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
                placeholder="Dante St James"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Company</label>
              <input
                value={newCompany}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCompany(e.target.value)}
                placeholder="Darwin Innovation Hub"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Tags (comma-separated)</label>
              <input
                value={newTags}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTags(e.target.value)}
                placeholder="grants, darwin, startnt"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Assigned Persona</label>
              <select
                value={newAssignedPersona}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewAssignedPersona(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs"
              >
                <option value="">— Any persona —</option>
                {personas.map((p: Persona) => (
                  <option key={p.id} value={p.id}>{p.avatar_emoji} {p.display_name} (@{p.username})</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] text-gray-400 block mb-1">Notes</label>
              <textarea
                value={newNotes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewNotes(e.target.value)}
                rows={2}
                placeholder="Met at Start NT meetup. Interested in AI commercialisation."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={addSingleContact}
              disabled={savingSingle || !newEmail.trim()}
              className="flex-1 px-4 py-2 bg-pink-500/30 hover:bg-pink-500/50 text-pink-200 rounded text-xs font-bold disabled:opacity-40"
            >
              {savingSingle ? "Saving..." : "\u2705 Save Contact"}
            </button>
            <button onClick={() => { resetSingleForm(); setShowSingleForm(false); }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bulk import form */}
      {showBulkForm && (
        <div className="bg-gray-900 border border-cyan-500/30 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-cyan-400">Bulk Import Contacts</h3>
          <p className="text-[10px] text-gray-500">
            Paste one contact per line. Format: <code className="text-cyan-300">email</code> OR <code className="text-cyan-300">email, name</code> OR <code className="text-cyan-300">email, name, company</code>.
            Duplicates (by email) will be skipped automatically.
          </p>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Contacts (one per line)</label>
            <textarea
              value={bulkText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBulkText(e.target.value)}
              rows={8}
              placeholder="dante@darwininnovationhub.com.au, Dante St James, Darwin Innovation Hub&#10;brooke@darwininnovationhub.com.au, Brooke Young&#10;journalist@example.com&#10;sponsor@mtv.com"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs font-mono"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Default Tags (applied to all)</label>
              <input
                value={bulkDefaultTags}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBulkDefaultTags(e.target.value)}
                placeholder="grants, darwin"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Default Assigned Persona</label>
              <select
                value={bulkDefaultPersona}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBulkDefaultPersona(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs"
              >
                <option value="">— Any persona —</option>
                {personas.map((p: Persona) => (
                  <option key={p.id} value={p.id}>{p.avatar_emoji} {p.display_name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={bulkImport}
              disabled={savingBulk || !bulkText.trim()}
              className="flex-1 px-4 py-2 bg-cyan-500/30 hover:bg-cyan-500/50 text-cyan-200 rounded text-xs font-bold disabled:opacity-40"
            >
              {savingBulk ? "Importing..." : "\uD83D\uDCCB Import All"}
            </button>
            <button onClick={() => { setBulkText(""); setShowBulkForm(false); }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={searchQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
          placeholder={`\uD83D\uDD0D Search by email / name / company...`}
          className="flex-1 min-w-[200px] px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-xs"
        />
        <select
          value={tagFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTagFilter(e.target.value)}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-xs"
        >
          <option value="">All tags</option>
          {allTags.map((t: string) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Contacts list */}
      {loading ? (
        <div className="text-center py-8 text-gray-500 text-sm">Loading contacts...</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-5xl mb-3">{"\uD83D\uDCC7"}</p>
          <p className="text-sm">No contacts yet.</p>
          <p className="text-xs text-gray-600 mt-2">
            Click {"\u2795"} Add Contact or {"\uD83D\uDCCB"} Bulk Import to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((c: Contact) => (
            <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              {editingContactId === c.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input value={editForm.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, email: e.target.value })} placeholder="email" className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs" />
                    <input value={editForm.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, name: e.target.value })} placeholder="name" className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs" />
                    <input value={editForm.company} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, company: e.target.value })} placeholder="company" className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs" />
                    <input value={editForm.tags} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, tags: e.target.value })} placeholder="tags (comma)" className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs" />
                    <select value={editForm.assigned_persona_id} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm({ ...editForm, assigned_persona_id: e.target.value })} className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs">
                      <option value="">— Any persona —</option>
                      {personas.map((p: Persona) => <option key={p.id} value={p.id}>{p.avatar_emoji} {p.display_name}</option>)}
                    </select>
                  </div>
                  <textarea value={editForm.notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="notes" rows={2} className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs" />
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="flex-1 py-1 bg-green-500/20 text-green-300 rounded text-xs font-bold">Save</button>
                    <button onClick={() => setEditingContactId(null)} className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-xs">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{c.name || "(no name)"}</span>
                      <a href={`mailto:${c.email}`} className="text-xs font-mono text-pink-400 hover:text-pink-300">{c.email}</a>
                      {c.company && <span className="text-[10px] text-gray-500">&middot; {c.company}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {(c.tags || []).map((t: string) => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 rounded-full">{t}</span>
                      ))}
                      {c.persona_username && (
                        <span className="text-[10px] text-gray-500">
                          {"\u2192"} {c.persona_avatar} @{c.persona_username}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-600">
                        Last emailed: {formatDate(c.last_emailed_at)} {c.email_count > 0 && `(${c.email_count} total)`}
                      </span>
                    </div>
                    {c.notes && <p className="text-[10px] text-gray-500 mt-1 italic">{c.notes}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEdit(c)} className="px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded text-[10px]">Edit</button>
                    <button onClick={() => deleteContact(c)} className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-[10px]">Del</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
