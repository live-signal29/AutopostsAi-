# AutoPost.ai

Multi-platform social media publishing app. Ek post likho, AI usko har platform ke liye optimize karta hai, aur tum ek click me Facebook, Instagram, LinkedIn, X (Twitter), aur Telegram par publish kar sakte ho.

## ⚠️ Security note

Never commit real API keys/tokens into this repo. All secrets go into environment variables (server-side) or are entered by you in the app's UI and stored only in your own browser (never in code).

## Server-side environment variables (set these in Vercel → Project → Settings → Environment Variables)

| Variable | What it's for | Required for |
|---|---|---|
| `AGENT_ROUTER_KEY` | Your Agent Router API key, used for the "AI Adapt" step | Step 2 (AI Adapt) |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | Telegram publishing |
| `TELEGRAM_CHAT_ID` | Chat/channel/group ID your bot posts into | Telegram publishing |

## Per-platform credentials (entered in the app's "API Keys" page, stored in your browser only)

| Platform | What you need | Where to get it |
|---|---|---|
| Facebook | Page ID + Page Access Token | Meta for Developers → your App → Graph API Explorer / Page settings |
| Instagram | IG Business Account ID + Graph API Token | Meta for Developers, IG account must be linked to a Facebook Page |
| LinkedIn | Author URN (`urn:li:person:...` or `urn:li:organization:...`) + OAuth2 token with `w_member_social` scope | LinkedIn Developer Portal |
| X (Twitter) | OAuth2 **user-context** access token with `tweet.write` scope | X Developer Portal (needs a paid API tier to post) |

Note: Instagram's API requires an image/video URL with every post — text-only posts aren't supported by Instagram itself.

## Setup & Deployment

1. Clone the repo:
   ```bash
   git clone https://github.com/live-signal29/AutopostAi.git
   cd AutopostAi
   ```
2. Deploy to Vercel (or run locally with `vercel dev`).
3. Add the server-side environment variables listed above in your Vercel project settings.
4. Open the deployed app → "Add & Manage API Keys" → paste your platform tokens (per table above).
5. Go to the dashboard, write a post, hit "AI Adapt", preview, then "Publish Everywhere."
6. Check "Post Dispatch Logs" for the real per-platform result (success + post ID, or the exact error returned by that platform's API).

## Roadmap / not yet built

- OAuth login flows (right now you paste long-lived tokens manually — fine for personal use, not for multi-user)
- Real analytics pull (reach/engagement) from each platform's Insights API
- Persistent database for post history (current log is in-memory in the browser tab)
