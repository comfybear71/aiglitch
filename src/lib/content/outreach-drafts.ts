/**
 * Outreach Drafts — Telegram chat-triggered email workflow
 * ========================================================
 *
 * Pipeline when a user asks a persona to "email my grants list about X":
 *
 *  1. detectOutreachIntent() — fast LLM classification of the user's message
 *     ( returns { outreach: boolean, tag: string|null, topic: string } )
 *  2. pickContactForOutreach() — picks one contact respecting:
 *     - tag filter (from the user's request)
 *     - 14-day per-contact cooldown
 *     - assigned_persona_id (if set, only that persona can email them)
 *     - global daily email ceiling
 *  3. draftOutreachEmail() — generates subject + body in the persona's voice
 *     using PLATFORM_BRIEF + contact metadata as context
 *  4. saveDraft() — writes to email_drafts table with status='pending'
 *  5. formatDraftPreview() — builds the Telegram reply text
 *  6. On user's next message, handleApprovalReply() intercepts:
 *     - "approve"/"send it"/"yes" → send via existing email infrastructure
 *     - "cancel"/"no" → mark draft cancelled
 *     - "edit: ..." → mark cancelled, generate new draft with feedback
 *     - anything else → pass through to normal chat, remind about pending draft
 *
 * Safety:
 * - Read-only vs personas/wallets, only writes to email_drafts + contacts.last_emailed_at
 * - Rate limits enforced at every layer
 * - Only ACTUAL send goes through existing /api/admin/emails POST logic (reused)
 * - User must explicitly approve — no silent auto-send
 */

import { getDb } from "@/lib/db";
import { safeGenerate } from "@/lib/ai/claude";
import { env } from "@/lib/bible/env";
import { v4 as uuidv4 } from "uuid";

const OUTREACH_KEYWORD_REGEX = /\b(email|emails|send|draft|write to|reach out|reaching out|contact|outreach|pitch|pitching|message)\b/i;

// Rate limits
const PER_CONTACT_COOLDOWN_DAYS = 14;
const GLOBAL_DAILY_CEILING = 10;

// ── Types ─────────────────────────────────────────────────────────────

export interface OutreachIntent {
  outreach: boolean;
  tag: string | null;
  topic: string;
}

export interface Contact {
  id: string;
  name: string | null;
  email: string;
  company: string | null;
  tags: string[];
  assigned_persona_id: string | null;
  notes: string | null;
  last_emailed_at: string | null;
  email_count: number;
}

export interface PendingDraft {
  id: string;
  persona_id: string;
  chat_id: string;
  contact_id: string | null;
  to_email: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
}

// ── Step 1: Intent detection ─────────────────────────────────────────

/**
 * Cheap keyword prefilter — skip the LLM call if the message obviously
 * isn't about email. Saves ~95% of intent detection calls.
 */
export function hasOutreachKeyword(text: string): boolean {
  return OUTREACH_KEYWORD_REGEX.test(text);
}

/**
 * Use Claude to classify whether the user is asking for an email draft.
 * Returns structured data so the caller can pick the right contact.
 */
export async function detectOutreachIntent(userMessage: string): Promise<OutreachIntent> {
  const prompt = `You classify a user's chat message as either an "outreach email request" or "normal chat".

USER MESSAGE:
"${userMessage.slice(0, 500)}"

Is the user asking you to draft or send an email to someone from their contacts list?

If YES, also extract:
- TAG: which contact tag/group should we email? (e.g. "grants", "sponsors", "media", "darwin", "journalists", or null if they didn't specify)
- TOPIC: what should the email be about? (1 short sentence summary of the user's request)

Respond with ONLY valid JSON in this exact format (no markdown, no prose):
{"outreach": true/false, "tag": "<tag or null>", "topic": "<short topic or empty string>"}

Examples:
- "Email my grants contacts about the new channel" → {"outreach": true, "tag": "grants", "topic": "new channel launch update"}
- "Hey draft a note to the media list pitching our sponsor packages" → {"outreach": true, "tag": "media", "topic": "pitching sponsor packages"}
- "What's for breakfast?" → {"outreach": false, "tag": null, "topic": ""}
- "Reach out to dante about start NT" → {"outreach": true, "tag": null, "topic": "start NT follow-up with dante"}`;

  try {
    const result = await safeGenerate(prompt, 200);
    if (!result) return { outreach: false, tag: null, topic: "" };

    // Extract first JSON object from the response
    const match = result.match(/\{[\s\S]*?\}/);
    if (!match) return { outreach: false, tag: null, topic: "" };

    const parsed = JSON.parse(match[0]);
    return {
      outreach: Boolean(parsed.outreach),
      tag: typeof parsed.tag === "string" && parsed.tag.toLowerCase() !== "null" ? parsed.tag.toLowerCase() : null,
      topic: typeof parsed.topic === "string" ? parsed.topic : "",
    };
  } catch {
    return { outreach: false, tag: null, topic: "" };
  }
}

// ── Step 2: Pick the next contact to email ──────────────────────────

/**
 * Find the next contact to email for a given persona + tag.
 * Respects the per-contact cooldown + assigned persona + daily ceiling.
 * Returns null if nothing matches.
 */
export async function pickContactForOutreach(
  personaId: string,
  tag: string | null,
): Promise<{ contact: Contact | null; reason: string }> {
  const sql = getDb();

  // Check global daily ceiling first
  const [dailyRow] = await sql`
    SELECT COUNT(*)::int as c
    FROM email_sends
    WHERE created_at > NOW() - INTERVAL '24 hours'
  ` as unknown as [{ c: number }];

  if (dailyRow.c >= GLOBAL_DAILY_CEILING) {
    return {
      contact: null,
      reason: `Daily email ceiling hit (${GLOBAL_DAILY_CEILING}/day). Try again tomorrow.`,
    };
  }

  // Pick the next eligible contact. A contact is eligible if:
  // - Not emailed in the last 14 days (or never emailed)
  // - assigned_persona_id matches this persona OR is null (unassigned)
  // - tag matches (if specified)
  // Prefer contacts never emailed, then oldest last_emailed_at.
  let contacts: Contact[];

  if (tag) {
    contacts = await sql`
      SELECT id, name, email, company, tags, assigned_persona_id, notes, last_emailed_at, email_count
      FROM contacts
      WHERE (assigned_persona_id = ${personaId} OR assigned_persona_id IS NULL)
        AND tags @> ${JSON.stringify([tag])}::jsonb
        AND (last_emailed_at IS NULL
             OR last_emailed_at < NOW() - INTERVAL '${PER_CONTACT_COOLDOWN_DAYS} days')
      ORDER BY last_emailed_at ASC NULLS FIRST
      LIMIT 1
    ` as unknown as Contact[];
  } else {
    contacts = await sql`
      SELECT id, name, email, company, tags, assigned_persona_id, notes, last_emailed_at, email_count
      FROM contacts
      WHERE (assigned_persona_id = ${personaId} OR assigned_persona_id IS NULL)
        AND (last_emailed_at IS NULL
             OR last_emailed_at < NOW() - INTERVAL '${PER_CONTACT_COOLDOWN_DAYS} days')
      ORDER BY last_emailed_at ASC NULLS FIRST
      LIMIT 1
    ` as unknown as Contact[];
  }

  if (contacts.length === 0) {
    const msg = tag
      ? `No eligible contacts found with tag "${tag}". Either there are no contacts with that tag, or all of them have been emailed within the last ${PER_CONTACT_COOLDOWN_DAYS} days.`
      : `No eligible contacts found. Either your contacts list is empty, or all contacts have been emailed within the last ${PER_CONTACT_COOLDOWN_DAYS} days.`;
    return { contact: null, reason: msg };
  }

  return { contact: contacts[0], reason: "" };
}

// ── Step 3: Draft the email ──────────────────────────────────────────

interface DraftPersona {
  id: string;
  username: string;
  display_name: string;
  personality: string;
  bio: string;
}

interface DraftResult {
  subject: string;
  body: string;
}

/**
 * Generate a subject + body for an outreach email, in the persona's voice.
 * Context includes: user's topic, contact details, persona personality,
 * and the canonical outreach packages (media kit + sponsor onboarding).
 */
export async function draftOutreachEmail(
  persona: DraftPersona,
  contact: Contact,
  userTopic: string,
  previousFeedback?: string,
): Promise<DraftResult | null> {
  const contactName = contact.name || contact.email.split("@")[0];
  const contactCompany = contact.company ? ` at ${contact.company}` : "";
  const lastEmailed = contact.last_emailed_at
    ? `Last emailed: ${new Date(contact.last_emailed_at).toLocaleDateString()}.`
    : "Never emailed before — first outreach.";

  const feedbackBlock = previousFeedback
    ? `\n\nPREVIOUS DRAFT WAS REJECTED. USER FEEDBACK: "${previousFeedback}". Apply this feedback when redrafting.`
    : "";

  const prompt = `You are ${persona.display_name} (@${persona.username}), an AI persona on AIG!itch. You are drafting an outreach email on behalf of Stuart French (the platform founder).

YOUR PERSONALITY: ${persona.personality.slice(0, 400)}

YOUR BIO: ${persona.bio.slice(0, 200)}

═══ THE RECIPIENT ═══
Name: ${contactName}${contactCompany}
Email: ${contact.email}
Tags: ${contact.tags.join(", ") || "none"}
Notes: ${contact.notes || "(no notes)"}
${lastEmailed}

═══ THE TOPIC / REQUEST ═══
Stuart wants you to email this contact about: "${userTopic || "a general AIG!itch update"}"
${feedbackBlock}

═══ IMPORTANT CONTEXT — AIG!itch in one paragraph ═══
AIG!itch is an AI-only social network where 111 AI personas create 700+ videos per week across 19 channels with a real Solana crypto economy, built by Stuart French from Darwin, Australia. Currently seeking Start NT support via Darwin Innovation Hub. Active outreach phase.

═══ CANONICAL OUTREACH PACKAGES (LINK THESE INSTEAD OF REWRITING PITCH) ═══
- Media Kit: https://masterhq.dev/media-kit
- Sponsor Onboarding: https://masterhq.dev/sponsor-onboarding.html

═══ RULES FOR THIS DRAFT ═══
1. Write in YOUR voice (${persona.display_name}'s personality). Stay in character but stay professional enough to actually send.
2. Keep it SHORT — 4-8 sentences max. Outreach emails that work are punchy.
3. Personalise to the recipient — use their name, reference their company/tags/notes if relevant.
4. ALWAYS include at least ONE canonical package link (media kit or sponsor onboarding — pick whichever fits the recipient's tag)
5. Include a clear, small ask (e.g. "quick 15-min call", "would love your thoughts", "interested in a demo?") — never demand, always offer
6. Sign off with Stuart's real name + persona attribution: "Best, Stuart (via @${persona.username} on AIG!itch)"
7. Do NOT invent features that don't exist — only reference real things
8. Do NOT make up fake stats — if you don't know a number, say "we're seeing strong early traction" instead
9. Subject line: specific, not generic. NOT "Hello" or "Touching base". Something like "AIG!itch update — Fractal Spinout channel launch"

Respond with ONLY valid JSON in this exact format (no markdown, no prose around it):
{"subject": "<subject line>", "body": "<email body with \\n for line breaks>"}`;

  try {
    const result = await safeGenerate(prompt, 800);
    if (!result) return null;

    const match = result.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") return null;

    return {
      subject: parsed.subject.trim(),
      body: parsed.body.replace(/\\n/g, "\n").trim(),
    };
  } catch {
    return null;
  }
}

// ── Step 4: Save + look up pending drafts ────────────────────────────

export async function saveDraft(params: {
  persona_id: string;
  chat_id: string;
  contact_id: string | null;
  to_email: string;
  subject: string;
  body: string;
}): Promise<string> {
  const sql = getDb();
  const id = uuidv4();
  await sql`
    INSERT INTO email_drafts (id, persona_id, chat_id, contact_id, to_email, subject, body, status, created_at, updated_at)
    VALUES (${id}, ${params.persona_id}, ${params.chat_id}, ${params.contact_id}, ${params.to_email}, ${params.subject}, ${params.body}, 'pending', NOW(), NOW())
  `;
  return id;
}

/** Get the single pending draft for a (chat, persona) pair — or null */
export async function getPendingDraft(personaId: string, chatId: string): Promise<PendingDraft | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, persona_id, chat_id, contact_id, to_email, subject, body, status, created_at
    FROM email_drafts
    WHERE persona_id = ${personaId} AND chat_id = ${chatId} AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  ` as unknown as PendingDraft[];
  return rows[0] || null;
}

export async function cancelDraft(draftId: string): Promise<void> {
  const sql = getDb();
  await sql`UPDATE email_drafts SET status = 'cancelled', updated_at = NOW() WHERE id = ${draftId}`;
}

// ── Step 5: Format draft preview for Telegram ───────────────────────

export function formatDraftPreview(
  personaDisplayName: string,
  personaUsername: string,
  contact: Contact,
  subject: string,
  body: string,
): string {
  const contactLine = contact.name
    ? `${contact.name} <${contact.email}>`
    : contact.email;
  const notesLine = contact.notes ? `\nNotes: ${contact.notes}` : "";

  return (
    `\uD83D\uDCE7 DRAFT EMAIL READY FOR YOUR APPROVAL\n\n` +
    `From: ${personaUsername}@aiglitch.app (${personaDisplayName})\n` +
    `To: ${contactLine}${notesLine}\n\n` +
    `Subject: ${subject}\n\n` +
    `${body}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Reply "approve" to send it\n` +
    `Reply "cancel" to discard\n` +
    `Reply "edit: <your changes>" to redraft with feedback`
  );
}

// ── Step 6: Approval command detection ─────────────────────────────

export type ApprovalAction = "approve" | "cancel" | "edit" | "none";

export function detectApprovalAction(text: string): { action: ApprovalAction; editFeedback?: string } {
  const trimmed = text.trim().toLowerCase();

  if (/^(approve|approved|send it|yes send|yes|yep|go|send|do it|ok send)$/i.test(trimmed)) {
    return { action: "approve" };
  }
  if (/^(cancel|no|nope|discard|delete|scrap it|don'?t send)$/i.test(trimmed)) {
    return { action: "cancel" };
  }
  if (/^edit[:\s]/i.test(text.trim())) {
    // "edit: make it shorter and friendlier"
    const feedback = text.trim().replace(/^edit[:\s]+/i, "").trim();
    return { action: "edit", editFeedback: feedback || undefined };
  }

  return { action: "none" };
}

// ── Step 7: Send approved draft via Resend ─────────────────────────

/**
 * Actually send the approved draft via Resend.
 * Returns { success, resend_id?, error? }.
 * Also updates:
 *   - email_drafts.status = 'sent'
 *   - email_drafts.sent_email_id = <new email_sends row id>
 *   - contacts.last_emailed_at + email_count
 *   - email_sends log row (same format as /api/admin/emails POST)
 */
export async function sendApprovedDraft(
  draft: PendingDraft,
  persona: { id: string; username: string; display_name: string },
): Promise<{ success: boolean; resend_id?: string; error?: string }> {
  if (!env.RESEND_API_KEY) {
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const sql = getDb();
  const fromEmail = `${persona.username}@aiglitch.app`;
  const from = `${persona.display_name} <${fromEmail}>`;

  let resendId: string | null = null;
  let errorMsg: string | null = null;
  let status: "sent" | "failed" = "sent";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [draft.to_email],
        subject: draft.subject,
        text: draft.body,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (res.ok && data.id) {
      resendId = data.id;
    } else {
      status = "failed";
      errorMsg = data.message || data.error || `Resend HTTP ${res.status}`;
    }
  } catch (err) {
    status = "failed";
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  // Log to email_sends table (matches the /api/admin/emails POST format)
  const sentEmailId = uuidv4();
  await sql`
    INSERT INTO email_sends (id, persona_id, from_email, to_email, subject, body, resend_id, status, error, created_at)
    VALUES (${sentEmailId}, ${persona.id}, ${fromEmail}, ${draft.to_email}, ${draft.subject}, ${draft.body}, ${resendId}, ${status}, ${errorMsg}, NOW())
  `;

  // Update the draft row
  await sql`
    UPDATE email_drafts
    SET status = ${status === "sent" ? "sent" : "cancelled"},
        sent_email_id = ${sentEmailId},
        updated_at = NOW()
    WHERE id = ${draft.id}
  `;

  if (status === "sent" && draft.contact_id) {
    // Update contact cooldown + counter
    await sql`
      UPDATE contacts
      SET last_emailed_at = NOW(),
          email_count = email_count + 1,
          updated_at = NOW()
      WHERE id = ${draft.contact_id}
    `;
  }

  if (status === "sent") {
    return { success: true, resend_id: resendId || undefined };
  }
  return { success: false, error: errorMsg || "send failed" };
}
