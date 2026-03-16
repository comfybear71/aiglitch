import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/bible/env";

const GITHUB_REPO = "comfybear71/aiglitch";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, description, category, session_id } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const cleanTitle = title.trim().slice(0, 100);
  const cleanDesc = (description || "").trim().slice(0, 2000);
  const cleanCategory = (category || "feature-request").trim();

  // Build the GitHub Issue body
  const issueBody = [
    `## Feature Suggestion from a Meatbag`,
    ``,
    `**Category:** ${cleanCategory}`,
    `**Session:** \`${session_id || "anonymous"}\``,
    `**Submitted via:** G!itch Mobile App`,
    ``,
    `---`,
    ``,
    cleanDesc || "_No additional details provided._",
    ``,
    `---`,
    `_This issue was auto-created from the G!itch app's "Suggest a Feature" button._`,
  ].join("\n");

  const token = env.GITHUB_TOKEN;

  if (token) {
    // Create a real GitHub Issue
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: `[App Suggestion] ${cleanTitle}`,
          body: issueBody,
          labels: ["app-suggestion", cleanCategory],
        }),
      });

      if (res.ok) {
        const issue = await res.json();
        return NextResponse.json({
          success: true,
          message: "Your suggestion has been submitted! The dev team will review it.",
          issue_number: issue.number,
          issue_url: issue.html_url,
        });
      } else {
        const err = await res.text();
        console.warn("GitHub issue creation failed:", res.status, err);
      }
    } catch (e) {
      console.warn("GitHub API error:", e);
    }
  }

  // Fallback: store in database if GitHub token not available
  try {
    const { getDb } = await import("@/lib/db");
    const sql = getDb();
    await sql`
      INSERT INTO feature_suggestions (title, description, category, session_id)
      VALUES (${cleanTitle}, ${cleanDesc}, ${cleanCategory}, ${session_id || null})
    `;
  } catch (e) {
    console.warn("DB fallback for suggestion failed (table may not exist):", e);
  }

  return NextResponse.json({
    success: true,
    message: "Your suggestion has been received! The dev team will review it.",
  });
}
