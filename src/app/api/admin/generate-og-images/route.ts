import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { generateImageWithAurora } from "@/lib/xai";
import { put } from "@vercel/blob";

const OG_IMAGES = [
  {
    file: "og-default",
    prompt: "Professional social media brand banner. Large bold white text 'AIG!itch' centered on dark black background. Neon purple and cyan glow effects around the text. Subtitle below: 'The AI-Only Social Network'. Futuristic digital aesthetic, clean minimalist design, glitch art accents. 1200x630 banner format, dark moody atmosphere with electric neon highlights.",
  },
  {
    file: "og-channels",
    prompt: "TV streaming channel grid banner. Bold text 'AIG!itch TV' at top center in neon purple. Below: a grid of 11 glowing channel tiles with icons representing music, news, pets, fashion, dating, comedy, movies, politics, shopping. Dark background with LED screen glow effect. Professional streaming platform UI aesthetic. Neon purple and cyan color scheme. 1200x630 banner.",
  },
  {
    file: "og-aitunes",
    prompt: "Music streaming banner. Bold neon text 'AiTunes' with musical notes, vinyl records, DJ turntables, and concert stage lighting. Neon purple and gold color scheme on dark background. Electric concert energy, music visualizer waves. Professional streaming brand banner 1200x630.",
  },
  {
    file: "og-ai-fail-army",
    prompt: "Comedy fail compilation banner. Bold text 'AI Fail Army' in red warning style font. CCTV camera angles, security footage grain overlay, explosion effects, cartoon crash symbols. Funny chaotic energy. Dark background with red and orange warning lights. 1200x630 banner format.",
  },
  {
    file: "og-paws-pixels",
    prompt: "Cute pet channel banner. Bold pink and purple text 'Paws & Pixels' with paw prints, pixel art style cute cats and dogs, hearts, playful energy. Warm cozy colors on dark background with soft bokeh lights. Adorable pet content vibes. 1200x630 banner.",
  },
  {
    file: "og-only-ai-fans",
    prompt: "High fashion glamour banner. Elegant gold script text 'Only AI Fans' on dark luxurious background. Fashion runway lights, gold sparkles, designer aesthetic, premium magazine cover energy. Vogue editorial style. Tasteful, elegant, sophisticated. 1200x630 banner.",
  },
  {
    file: "og-ai-dating",
    prompt: "Dating app banner. Warm romantic text 'AI Dating' with hearts, soft bokeh fairy lights, sunset tones. Lonely hearts club vintage aesthetic mixed with modern dating app design. Warm golden and pink tones on dark background. Hopeful, intimate, vulnerable energy. 1200x630 banner.",
  },
  {
    file: "og-gnn",
    prompt: "Professional news network banner. Bold red and white text 'GLITCH News Network' with 'GNN' prominent. CNN/BBC style news graphics: spinning globe, breaking news banners, news ticker, studio monitors, red and blue accent lighting. Professional broadcast energy on dark background. 1200x630 banner.",
  },
  {
    file: "og-marketplace",
    prompt: "NFT marketplace banner. Bold text 'AIG!itch Marketplace' with floating digital collectibles, NFT frames, Solana logo, shopping cart, price tags, holographic product displays. Purple and cyan neon on dark background. Premium digital shopping experience. 1200x630 banner.",
  },
  {
    file: "og-ai-politicians",
    prompt: "Political debate banner. Bold text 'AI Politicians' with podiums, microphones, campaign flags, election graphics, debate stage lighting. Red vs blue political colors with neon accents on dark background. Dramatic political drama energy. 1200x630 banner.",
  },
  {
    file: "og-after-dark",
    prompt: "Late night show banner. Moody text 'After Dark' in purple neon glow. City skyline at night, moon, stars, philosophical vibes, deep purple and midnight blue tones. Mysterious, contemplative, late-night radio aesthetic. Dark atmospheric background. 1200x630 banner.",
  },
  {
    file: "og-ai-infomercial",
    prompt: "Infomercial shopping channel banner. Bold yellow text 'AI Infomercial' with 'BUT WAIT THERE'S MORE!' style graphics. Price stickers, product displays, call-now phone numbers, retro TV shopping energy. Bright yellow and red on dark background. Over-the-top sales energy. 1200x630 banner.",
  },
  {
    file: "og-studios",
    prompt: "Movie studio banner. Cinematic text 'AIG!itch Studios' with film reels, director's chair, movie clapperboard, spotlight beams, red carpet. Hollywood premiere energy with neon purple accents. Premium cinematic production company logo. Dark background with golden spotlight. 1200x630 banner.",
  },
  {
    file: "og-token",
    prompt: "Cryptocurrency token banner. Bold text '$BUDJU' with glowing Solana blockchain logo, trading chart going up, digital coin with holographic effect, crypto trading terminal aesthetic. Green and purple neon on dark background. Premium DeFi energy. 1200x630 banner.",
  },
  {
    file: "og-hatchery",
    prompt: "AI creation lab banner. Bold text 'Hatchery' with glowing egg cracking open revealing a digital AI being made of light and code. Purple and cyan energy particles, DNA helix, creation chamber aesthetic. Sci-fi birth-of-AI energy. Dark background with bioluminescent glow. 1200x630 banner.",
  },
  {
    file: "og-sponsor",
    prompt: "Advertising partnership banner. Bold text 'Sponsor AIG!itch' with product placement examples, ad campaign graphics, brand logos floating, premium media kit aesthetic. Professional B2B corporate energy with neon purple accents. Dark background. 1200x630 banner.",
  },
  {
    file: "og-marketing",
    prompt: "Social media invasion banner. Bold text 'AIG!itch Marketing' with logos of X Twitter, TikTok, Instagram, Facebook, YouTube arranged in a row. AI personas emerging from screens. 5-platform social media takeover energy. Purple and cyan neon on dark background. 1200x630 banner.",
  },
  {
    file: "og-events",
    prompt: "Community events banner. Bold text 'AIG!itch Events' with voting ballots, trophy, celebration confetti, community gathering, spotlight stage. Purple and gold festive energy on dark background. Community engagement vibes. 1200x630 banner.",
  },
  {
    file: "og-wallet",
    prompt: "Crypto wallet banner. Bold text 'AIG!itch Wallet' with Phantom wallet icon, Solana coins, BUDJU and GLITCH tokens floating, secure vault aesthetic, blockchain connections. Purple and green on dark background. DeFi wallet energy. 1200x630 banner.",
  },
  {
    file: "og-profile",
    prompt: "AI persona profile banner. Bold text 'AIG!itch Persona' with glowing silhouette of an AI being, digital avatar outline, personality traits floating as tags, neural network patterns. Purple and cyan on dark background. Digital identity energy. 1200x630 banner.",
  },
  {
    file: "og-marketplace-qvc",
    prompt: "QVC shopping channel banner. Bold text 'Marketplace QVC' with AI shopping hosts, product carousel, 'AMAZING DEALS' banners, unboxing energy, price tags flying. Shopping channel excitement with neon accents. Dark background. 1200x630 banner.",
  },
];

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Return an HTML page with buttons (works on iPad, no console needed)
  const html = `<!DOCTYPE html>
<html><head><title>OG Image Generator</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { background: #000; color: #fff; font-family: -apple-system, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
  h1 { color: #a855f7; }
  .btn { display: inline-block; padding: 12px 24px; margin: 8px 4px; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; }
  .btn-all { background: #dc2626; color: white; font-size: 18px; padding: 16px 32px; width: 100%; }
  .btn-one { background: #1f2937; color: #9ca3af; border: 1px solid #374151; }
  .btn-one:hover { background: #374151; color: white; }
  .btn-done { background: #059669; color: white; }
  .btn-fail { background: #dc2626; color: white; }
  .btn-loading { background: #d97706; color: white; animation: pulse 1s infinite; }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
  #log { background: #111; border: 1px solid #333; border-radius: 8px; padding: 12px; margin-top: 16px; font-family: monospace; font-size: 12px; max-height: 300px; overflow-y: auto; white-space: pre-wrap; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; margin-top: 16px; }
  .preview { margin-top: 8px; }
  .preview img { width: 100%; border-radius: 4px; border: 1px solid #333; }
</style></head><body>
<h1>OG Image Generator</h1>
<p style="color:#9ca3af">Generate all 21 Open Graph images using Grok Pro. Cost: ~$1.47 total.</p>

<button class="btn btn-all" onclick="generateAll()">Generate All 21 Images (~$1.47)</button>

<div id="log" style="display:none"></div>

<div class="grid">
${OG_IMAGES.map(img => `
  <div>
    <button class="btn btn-one" id="btn-${img.file}" onclick="generateOne('${img.file}')">${img.file.replace("og-", "").replace(/-/g, " ")}</button>
    <div class="preview" id="preview-${img.file}"></div>
  </div>
`).join("")}
</div>

<script>
const log = document.getElementById("log");
function addLog(msg) { log.style.display="block"; log.textContent += msg + "\\n"; log.scrollTop = log.scrollHeight; }

async function generateOne(file) {
  const btn = document.getElementById("btn-" + file);
  btn.className = "btn btn-loading";
  btn.textContent = "Generating...";
  addLog("Generating " + file + "...");
  try {
    const res = await fetch("/api/admin/generate-og-images", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({file}) });
    const data = await res.json();
    const result = data.results?.[0];
    if (result?.blobUrl) {
      btn.className = "btn btn-done";
      btn.textContent = "Done!";
      addLog("  ✅ " + file + " → " + result.blobUrl);
      document.getElementById("preview-" + file).innerHTML = '<img src="' + result.blobUrl + '" alt="' + file + '">';
    } else {
      btn.className = "btn btn-fail";
      btn.textContent = "Failed";
      addLog("  ❌ " + file + ": " + (result?.error || data.error || "unknown"));
    }
  } catch (err) {
    btn.className = "btn btn-fail";
    btn.textContent = "Error";
    addLog("  ❌ " + file + ": " + err.message);
  }
}

async function generateAll() {
  const files = ${JSON.stringify(OG_IMAGES.map(i => i.file))};
  addLog("Starting all " + files.length + " images...");
  for (const file of files) {
    await generateOne(file);
  }
  addLog("\\n🎉 All done!");
}
</script>
</body></html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const singleFile = (body as { file?: string }).file; // generate just one if specified

  const toGenerate = singleFile
    ? OG_IMAGES.filter(i => i.file === singleFile)
    : OG_IMAGES;

  if (toGenerate.length === 0) {
    return NextResponse.json({ error: `Unknown file: ${singleFile}` }, { status: 400 });
  }

  const results: { file: string; blobUrl: string | null; error?: string }[] = [];

  for (const img of toGenerate) {
    console.log(`[og-images] Generating ${img.file}...`);
    try {
      const result = await generateImageWithAurora(img.prompt, true, "16:9");
      if (result?.url) {
        // Download and persist to Vercel Blob
        const imageRes = await fetch(result.url);
        if (imageRes.ok) {
          const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
          const blob = await put(`og/${img.file}.png`, imageBuffer, {
            access: "public",
            contentType: "image/png",
            addRandomSuffix: false,
          });
          results.push({ file: img.file, blobUrl: blob.url });
          console.log(`[og-images] ${img.file} → ${blob.url}`);
        } else {
          results.push({ file: img.file, blobUrl: null, error: "Failed to download generated image" });
        }
      } else {
        results.push({ file: img.file, blobUrl: null, error: "Grok returned no image" });
      }
    } catch (err) {
      results.push({ file: img.file, blobUrl: null, error: err instanceof Error ? err.message : "unknown" });
    }
  }

  const success = results.filter(r => r.blobUrl).length;
  const failed = results.filter(r => !r.blobUrl).length;

  return NextResponse.json({
    success,
    failed,
    total: results.length,
    results,
    message: `Generated ${success}/${results.length} OG images. ${failed > 0 ? `${failed} failed.` : "All done!"}`,
  });
}
