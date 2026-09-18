// GET /api/instagram-media?account=music|writing
// Returns the latest 3 posts for whichever Instagram account has been connected
// via /api/instagram-oauth-callback. Reads the stored token from Netlify Blobs —
// never touches env vars at request time, so this stays fast and simple.
import { getStore } from "@netlify/blobs";

const ACCOUNTS = ["music", "writing"];

export default async (req) => {
  const url = new URL(req.url);
  const account = url.searchParams.get("account");

  if (!ACCOUNTS.includes(account)) {
    return json({ error: "invalid_account" }, 400);
  }

  const store = getStore("instagram-tokens");
  const tokenData = await store.get(account, { type: "json" });

  if (!tokenData || !tokenData.access_token) {
    // Not connected yet — the site's own fallback UI handles this gracefully.
    return json({ connected: false, items: [] }, 200);
  }

  try {
    const fields = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp";
    const igUrl = `https://graph.instagram.com/me/media?fields=${fields}&access_token=${encodeURIComponent(tokenData.access_token)}&limit=3`;
    const igRes = await fetch(igUrl);
    const igJson = await igRes.json();

    if (igJson.error) {
      return json({ connected: true, error: "ig_api_error", detail: igJson.error }, 200);
    }

    return json({ connected: true, items: igJson.data || [] }, 200, "public, max-age=600");
  } catch (err) {
    return json({ connected: true, error: "fetch_failed", detail: String(err) }, 200);
  }
};

function json(body, status, cacheControl) {
  const headers = { "Content-Type": "application/json" };
  if (cacheControl) headers["Cache-Control"] = cacheControl;
  return new Response(JSON.stringify(body), { status, headers });
}

export const config = { path: "/api/instagram-media" };
