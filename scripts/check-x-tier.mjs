import crypto from "crypto";

function percentEncode(str) {
  return encodeURIComponent(str).replace(/!/g,'%21').replace(/\*/g,'%2A').replace(/'/g,'%27').replace(/\(/g,'%28').replace(/\)/g,'%29');
}

function buildOAuth1Header(method, url, creds, extraParams = {}) {
  const oauthParams = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
  };
  if (creds.accessToken) oauthParams.oauth_token = creds.accessToken;
  const allParams = { ...oauthParams, ...extraParams };
  const paramString = Object.keys(allParams).sort().map(k => percentEncode(k) + '=' + percentEncode(allParams[k])).join('&');
  const signatureBase = method.toUpperCase() + '&' + percentEncode(url) + '&' + percentEncode(paramString);
  const signingKey = percentEncode(creds.consumerSecret) + '&' + percentEncode(creds.accessTokenSecret || '');
  const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');
  oauthParams.oauth_signature = signature;
  const headerString = Object.keys(oauthParams).sort().map(k => percentEncode(k) + '="' + percentEncode(oauthParams[k]) + '"').join(', ');
  return 'OAuth ' + headerString;
}

const creds = {
  consumerKey: process.env.X_CONSUMER_KEY,
  consumerSecret: process.env.X_CONSUMER_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
};

if (!creds.consumerKey) {
  console.log("ERROR: X_CONSUMER_KEY is not set in environment");
  process.exit(1);
}

console.log("Credentials found. Testing API access...\n");

// Test 1: GET /users/me (free tier)
const meUrl = "https://api.twitter.com/2/users/me";
const meParams = { "user.fields": "id,name,username,created_at" };
const meFullUrl = meUrl + "?" + new URLSearchParams(meParams).toString();
const meAuth = buildOAuth1Header("GET", meUrl, creds, meParams);
const meRes = await fetch(meFullUrl, { headers: { Authorization: meAuth } });
console.log("=== Test 1: Account Info (GET /2/users/me) ===");
console.log("Status:", meRes.status);
const meBody = await meRes.json();
console.log("Body:", JSON.stringify(meBody, null, 2));

// Check rate limit headers
const rateHeaders = {};
for (const [k, v] of meRes.headers.entries()) {
  if (k.startsWith("x-rate") || k.startsWith("x-app")) rateHeaders[k] = v;
}
if (Object.keys(rateHeaders).length > 0) console.log("Rate headers:", JSON.stringify(rateHeaders));

// Test 2: GET /users/:id/tweets (requires Basic tier)
console.log("\n=== Test 2: Read Elon's Tweets (GET /2/users/44196397/tweets) ===");
const elonUrl = "https://api.twitter.com/2/users/44196397/tweets";
const elonParams = { max_results: "5", "tweet.fields": "created_at" };
const elonFullUrl = elonUrl + "?" + new URLSearchParams(elonParams).toString();
const elonAuth = buildOAuth1Header("GET", elonUrl, creds, elonParams);
const elonRes = await fetch(elonFullUrl, { headers: { Authorization: elonAuth } });
console.log("Status:", elonRes.status);
const elonBody = await elonRes.text();
console.log("Body:", elonBody.slice(0, 600));

// Test 3: Check tweet write capability (dry — just check POST endpoint without sending)
console.log("\n=== Summary ===");
if (meRes.status === 200) {
  console.log("Auth: VALID");
  console.log("Account:", meBody.data?.username || "unknown");
} else {
  console.log("Auth: FAILED");
}
if (elonRes.status === 200) {
  console.log("Read tweets: YES (Basic tier or higher)");
} else if (elonRes.status === 403) {
  console.log("Read tweets: NO (Free tier — 403 Forbidden)");
} else {
  console.log("Read tweets: UNKNOWN (status " + elonRes.status + ")");
}
