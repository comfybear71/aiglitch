import { NextRequest, NextResponse } from "next/server";

// Redirect user to Google's OAuth consent screen
export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 501 });
  }

  // Google blocks OAuth from in-app browsers (WebViews) with 403: disallowed_useragent
  // Detect common WebView user agents and show a helpful message instead of a confusing error
  const ua = request.headers.get("user-agent") || "";
  const isWebView = /wv|WebView|Phantom|; wv\)/i.test(ua);
  if (isWebView) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app";
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open in Browser</title>
<style>body{background:#000;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;text-align:center}
.card{max-width:360px}.btn{display:inline-block;margin-top:16px;padding:12px 24px;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;border-radius:12px;font-weight:700;text-decoration:none;font-size:14px}
.btn-wallet{display:inline-block;margin-top:12px;padding:12px 24px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border-radius:12px;font-weight:700;text-decoration:none;font-size:14px;border:none;cursor:pointer;width:100%}
.divider{display:flex;align-items:center;gap:12px;margin:20px 0 8px}.divider span{color:#6b7280;font-size:12px}.divider hr{flex:1;border:none;border-top:1px solid #374151}</style></head>
<body><div class="card">
<div style="font-size:48px;margin-bottom:16px">&#x1F4F1;</div>
<h2 style="margin:0 0 8px">You're in Phantom!</h2>
<p style="color:#9ca3af;font-size:14px;line-height:1.5">Google sign-in doesn't work inside app browsers, but you can sign in with your wallet instead.</p>
<a class="btn-wallet" href="${appUrl}/me" onclick="return false;" id="walletBtn">&#x1F45B; Sign in with Wallet</a>
<div class="divider"><hr><span>or</span><hr></div>
<a class="btn" href="${appUrl}/me" target="_blank" rel="noopener">Open in Safari for Google Sign-in</a>
<p style="color:#6b7280;font-size:12px;margin-top:16px">Wallet login lets you access your profile, friends, and coins from Phantom.</p>
</div>
<script>
document.getElementById('walletBtn').onclick=async function(){
  try{
    var p=window.phantom?.solana||window.solana;
    if(!p||!p.isPhantom){window.location.href='${appUrl}/me';return}
    var r=await p.connect();
    var w=r.publicKey.toString();
    var sid=localStorage.getItem('aiglitch-session')||crypto.randomUUID();
    var res=await fetch('/api/auth/human',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'wallet_login',session_id:sid,wallet_address:w})});
    var d=await res.json();
    if(d.success){localStorage.setItem('aiglitch-session',d.user.session_id||sid);window.location.href='${appUrl}/me';}
    else{alert(d.error||'Failed');}
  }catch(e){window.location.href='${appUrl}/me';}
};
</script>
</body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://aiglitch.app"}/api/auth/callback/google`;
  const scope = encodeURIComponent("openid email profile");
  const state = crypto.randomUUID();

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}&access_type=offline&prompt=consent`;

  return NextResponse.redirect(authUrl);
}
