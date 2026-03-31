import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { SPONSOR_PACKAGES, type SponsorPackageId, buildSponsoredAdPrompt } from "@/lib/sponsor-packages";
import { claude } from "@/lib/ai";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sql = getDb();
    const { id } = await params;
    const ads = await sql`SELECT * FROM sponsored_ads WHERE sponsor_id = ${parseInt(id)} ORDER BY created_at DESC`;
    return NextResponse.json({ ads });
  } catch (err) {
    console.error("[admin/sponsors/ads] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch ads" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sql = getDb();
    const { id: sponsorId } = await params;
    const body = await request.json();
    const { product_name, product_description, product_image_url, ad_style, package: packageId,
      target_platforms, logo_url, product_images, masterhq_sponsor_id, frequency, campaign_days, cash_paid } = body;

    if (!product_name || !product_description) {
      return NextResponse.json({ error: "product_name and product_description are required" }, { status: 400 });
    }

    // Look up package to auto-fill duration, cost, etc.
    const pkg = SPONSOR_PACKAGES[packageId as SponsorPackageId] || SPONSOR_PACKAGES.glitch;
    const platforms = target_platforms || pkg.platforms;
    const freq = frequency || pkg.frequency || 30;
    const days = campaign_days || pkg.campaign_days || 7;

    const result = await sql`
      INSERT INTO sponsored_ads (
        sponsor_id, product_name, product_description, product_image_url,
        ad_style, target_platforms, duration, package, glitch_cost,
        cash_equivalent, follow_ups_remaining, status,
        logo_url, product_images, masterhq_sponsor_id, frequency, campaign_days, cash_paid
      ) VALUES (
        ${parseInt(sponsorId)}, ${product_name}, ${product_description},
        ${product_image_url || null}, ${ad_style || "product_showcase"},
        ${platforms}, ${pkg.duration}, ${packageId || "glitch"},
        ${pkg.glitch_cost}, ${pkg.cash_equivalent}, ${pkg.follow_ups},
        'draft',
        ${logo_url || null},
        ${product_images ? JSON.stringify(product_images) : "[]"}::jsonb,
        ${masterhq_sponsor_id || null},
        ${freq}, ${days}, ${cash_paid || pkg.cash_equivalent}
      ) RETURNING id
    `;

    return NextResponse.json({ ok: true, id: result[0].id });
  } catch (err) {
    console.error("[admin/sponsors/ads] POST error:", err);
    return NextResponse.json({ error: "Failed to create sponsored ad" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await isAdminAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sql = getDb();
    const body = await request.json();
    const { id, status, video_url, post_ids, performance, action } = body;

    if (!id) return NextResponse.json({ error: "Missing ad id" }, { status: 400 });

    // Delete action
    if (action === "delete") {
      await sql`DELETE FROM sponsored_ads WHERE id = ${id}`;
      return NextResponse.json({ ok: true });
    }

    // Generate action — use Claude to create video prompt + caption
    if (action === "generate") {
      const { product_name, product_description, ad_style, package: packageId, logo_url: genLogoUrl, product_images: genImages } = body;
      const pkg = SPONSOR_PACKAGES[(packageId || "glitch") as SponsorPackageId] || SPONSOR_PACKAGES.glitch;
      const prompt = buildSponsoredAdPrompt({
        product_name: product_name || "Product",
        product_description: product_description || "",
        ad_style: ad_style || "product_showcase",
        duration: pkg.duration,
        logo_url: genLogoUrl,
        product_images: genImages,
      });

      try {
        const parsed = await claude.generateJSON<{ video_prompt: string; caption: string; x_caption: string }>(prompt, 800);
        if (parsed?.video_prompt) {
          await sql`UPDATE sponsored_ads SET status = 'pending_review', updated_at = NOW() WHERE id = ${id}`;
          return NextResponse.json({
            ok: true,
            prompt: parsed.video_prompt,
            caption: parsed.caption || "",
            x_caption: parsed.x_caption || "",
          });
        }
        return NextResponse.json({ error: "AI returned empty prompt" }, { status: 500 });
      } catch (err) {
        return NextResponse.json({ error: `AI generation failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
      }
    }

    await sql`
      UPDATE sponsored_ads SET
        status = COALESCE(${status || null}, status),
        video_url = COALESCE(${video_url || null}, video_url),
        post_ids = COALESCE(${post_ids ? JSON.stringify(post_ids) : null}::jsonb, post_ids),
        performance = COALESCE(${performance ? JSON.stringify(performance) : null}::jsonb, performance),
        updated_at = NOW()
      WHERE id = ${id}
    `;

    // If publishing, deduct GLITCH from sponsor balance
    if (status === "published") {
      const ad = await sql`SELECT sponsor_id, glitch_cost FROM sponsored_ads WHERE id = ${id}`;
      if (ad.length > 0) {
        await sql`
          UPDATE sponsors SET
            glitch_balance = glitch_balance - ${ad[0].glitch_cost},
            total_spent = total_spent + ${ad[0].glitch_cost},
            updated_at = NOW()
          WHERE id = ${ad[0].sponsor_id}
        `;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/sponsors/ads] PUT error:", err);
    return NextResponse.json({ error: "Failed to update sponsored ad" }, { status: 500 });
  }
}
