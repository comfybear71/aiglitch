/**
 * OAuth 1.0a Signing for X/Twitter API
 * =====================================
 * Generates HMAC-SHA1 signed Authorization headers for the Twitter API.
 * Used for both tweet posting (app-level keys) and user authentication (3-legged flow).
 */

import crypto from "crypto";

interface OAuth1Credentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken?: string;
  accessTokenSecret?: string;
}

interface OAuth1Params {
  [key: string]: string;
}

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

function generateTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

/**
 * Build the OAuth 1.0a Authorization header for an HTTP request.
 */
export function buildOAuth1Header(
  method: string,
  url: string,
  credentials: OAuth1Credentials,
  extraParams?: OAuth1Params,
): string {
  const oauthParams: OAuth1Params = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: generateTimestamp(),
    oauth_version: "1.0",
  };

  if (credentials.accessToken) {
    oauthParams.oauth_token = credentials.accessToken;
  }

  // Combine oauth params + any extra query/body params for signature base
  const allParams: OAuth1Params = { ...oauthParams, ...extraParams };

  // Sort parameters alphabetically and build the parameter string
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  // Build the signature base string
  const signatureBase = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;

  // Build the signing key
  const signingKey = `${percentEncode(credentials.consumerSecret)}&${percentEncode(credentials.accessTokenSecret || "")}`;

  // Generate HMAC-SHA1 signature
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(signatureBase)
    .digest("base64");

  oauthParams.oauth_signature = signature;

  // Build the Authorization header
  const headerString = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${headerString}`;
}

/**
 * Get app-level OAuth 1.0a credentials from environment variables.
 */
export function getAppCredentials(): OAuth1Credentials | null {
  const consumerKey = process.env.X_CONSUMER_KEY;
  const consumerSecret = process.env.X_CONSUMER_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    return null;
  }

  return { consumerKey, consumerSecret, accessToken, accessTokenSecret };
}
