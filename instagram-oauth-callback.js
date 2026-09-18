// GET /api/instagram-oauth-callback?code=...&state=music|writing
// Instagram redirects here once, right after Abhijeet approves the connection.
// This exchanges the code for a short-lived token, upgrades it to a 60-day
// long-lived token, and stores it in Netlify Blobs keyed by account ("music"
// or "writing" — passed through as the OAuth "state" parameter). After this
// runs once per account, nothing manual is needed again — instagram-refresh-token.js
// keeps the token alive on a schedule.
import { getStore } from "@netlify/blobs";

const ACCOUNTS = ["music", "writing"];

export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");

  if (oauthError) {
    return html(`<h1>Connection cancelled</h1><p>${escapeHtml(oauthError)}</p><p>Close this tab and try the connect link again.</p>`, 200);
  }
  if (!code || !ACCOUNTS.includes(state)) {
    return html(`<h1>Something's missing</h1><p>No authorization code, or an unexpected account (${escapeHtml(state || "none")}). Close this tab and try the connect link again.</p>`, 400);
  }

  const appId = Netlify.env.get("INSTAGRAM_APP_ID");
  const appSecret = Netlify.env.get("INSTAGRAM_APP_SECRET");
  const redirectUri = Netlify.env.get("INSTAGRAM_REDIRECT_URI");

  if (!appId || !appSecret || !redirectUri) {
    return html(`<h1>Not configured yet</h1><p>INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET / INSTAGRAM_REDIRECT_URI aren't set in this site's environment variables yet.</p>`, 500);
  }

  try {
    // Step 1: authorization code -> short-lived token
    const form = new URLSearchParams();
    form.set("client_id", appId);
    form.set("client_secret", appSecret);
    form.set("grant_type", "authorization_code");
    form.set("redirect_uri", redirectUri);
    form.set("code", code);

    const shortRes = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
    const shortJson = await shortRes.json();
    if (!shortJson.access_token) {
      return html(`<h1>Token exchange failed</h1><pre>${escapeHtml(JSON.stringify(shortJson, null, 2))}</pre>`, 500);
    }

    // Step 2: short-lived -> 60-day long-lived token
    const longUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(appSecret)}&access_token=${encodeURIComponent(shortJson.access_token)}`;
    const longRes = await fetch(longUrl);
    const longJson = await longRes.json();
    if (!longJson.access_token) {
      return html(`<h1>Long-lived token exchange failed</h1><pre>${escapeHtml(JSON.stringify(longJson, null, 2))}</pre>`, 500);
    }

    const store = getStore("instagram-tokens");
    await store.setJSON(state, {
      access_token: longJson.access_token,
      obtained_at: Date.now(),
      expires_in: longJson.expires_in || 5184000
    });

    return html(`<h1>Connected ✓</h1><p>The <strong>${escapeHtml(state)}</strong> Instagram account is linked. You can close this tab — the website will start showing its latest posts automatically.</p>`, 200);
  } catch (err) {
    return html(`<h1>Unexpected error</h1><pre>${escapeHtml(String(err))}</pre>`, 500);
  }
};

function html(body, status) {
  return new Response(
    `<!doctype html><html><body style="font-family:sans-serif; max-width:560px; margin:60px auto; padding:0 20px;">${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html" } }
  );
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const config = { path: "/api/instagram-oauth-callback" };
