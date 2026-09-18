// Scheduled function — runs daily. Instagram long-lived tokens last ~60 days;
// this refreshes each connected account's token well before it can expire, so
// the site never goes stale or needs anyone to log back in.
import { getStore } from "@netlify/blobs";

const ACCOUNTS = ["music", "writing"];

export default async () => {
  const store = getStore("instagram-tokens");
  const results = {};

  for (const account of ACCOUNTS) {
    const data = await store.get(account, { type: "json" });
    if (!data || !data.access_token) {
      results[account] = "not_connected";
      continue;
    }
    try {
      const res = await fetch(
        `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(data.access_token)}`
      );
      const json = await res.json();
      if (json.access_token) {
        await store.setJSON(account, {
          access_token: json.access_token,
          obtained_at: Date.now(),
          expires_in: json.expires_in || 5184000
        });
        results[account] = "refreshed";
      } else {
        results[account] = "refresh_failed: " + JSON.stringify(json);
      }
    } catch (err) {
      results[account] = "error: " + String(err);
    }
  }

  console.log("instagram-refresh-token run:", JSON.stringify(results));
  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
};

export const config = { schedule: "@daily" };
