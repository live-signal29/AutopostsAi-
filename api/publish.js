// api/publish.js
// AutoPost.ai - Multi-platform publish endpoint
//
// SECURITY: All secrets (AI key, platform tokens that belong to YOU as the
// app owner) must live in Vercel Environment Variables — never hardcoded here.
// Per-user platform tokens (things the end user pastes in the UI, like their
// own Page Access Token) are received in the request body — that's fine for a
// single-user personal tool, but never log them and never echo them back.

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { raw_text, platforms = [], action, user_keys = {}, image_url } = req.body;

    // Your own Agent Router key — set this in Vercel Project Settings > Environment Variables
    const AGENT_ROUTER_KEY = process.env.AGENT_ROUTER_KEY;

    if (!raw_text) {
        return res.status(400).json({ error: 'Text content is required' });
    }

    try {
        // ---------------------------------------------------------------
        // STEP 2: AI ADAPT
        // ---------------------------------------------------------------
        if (action === 'adapt') {
            if (!AGENT_ROUTER_KEY) {
                return res.status(500).json({
                    success: false,
                    error: 'AGENT_ROUTER_KEY is not configured on the server (set it in Vercel env vars).'
                });
            }

            let adaptedText = raw_text;
            const aiResponse = await fetch('https://agentrouter.org/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AGENT_ROUTER_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert social media content creator. Take the user message/content and reformat it for social media (Facebook, Instagram, LinkedIn, X, Telegram). Add engaging line breaks, emojis where appropriate, a clear Call To Action (CTA), and relevant trending hashtags. Do not add conversational fluff, only output the ready-to-post text.'
                        },
                        { role: 'user', content: raw_text }
                    ]
                })
            });

            const aiData = await aiResponse.json();

            if (aiData.choices && aiData.choices[0]?.message?.content) {
                adaptedText = aiData.choices[0].message.content;
            } else {
                console.error("Agent Router Error:", aiData.error || aiData);
                return res.status(502).json({ success: false, error: 'AI adaptation failed', details: aiData.error?.message || 'Unknown AI provider error' });
            }

            return res.status(200).json({ success: true, formatted_content: adaptedText });
        }

        // ---------------------------------------------------------------
        // STEP 4: REAL PUBLISH DISPATCH — runs each requested platform,
        // never throws away a partial failure: every platform gets its
        // own try/catch and reports success/error independently.
        // ---------------------------------------------------------------
        const jobs = [];

        if (platforms.includes('telegram')) {
            jobs.push(publishTelegram(raw_text, image_url));
        }
        if (platforms.includes('facebook')) {
            jobs.push(publishFacebook(raw_text, image_url, user_keys));
        }
        if (platforms.includes('instagram')) {
            jobs.push(publishInstagram(raw_text, image_url, user_keys));
        }
        if (platforms.includes('linkedin')) {
            jobs.push(publishLinkedIn(raw_text, image_url, user_keys));
        }
        if (platforms.includes('twitter')) {
            jobs.push(publishTwitter(raw_text, user_keys));
        }

        const results = await Promise.all(jobs);
        const anySuccess = results.some(r => r.success);
        const allSuccess = results.length > 0 && results.every(r => r.success);

        return res.status(200).json({
            success: anySuccess,
            all_success: allSuccess,
            message: allSuccess
                ? 'Post published on all selected platforms.'
                : anySuccess
                    ? 'Post published on some platforms — check results for errors.'
                    : 'Post failed on all selected platforms.',
            results
        });

    } catch (error) {
        return res.status(500).json({ error: 'Server processing failed', details: error.message });
    }
}

// =====================================================================
// PLATFORM HANDLERS
// Each returns: { platform, success, post_id?, error?, permalink? }
// =====================================================================

async function publishTelegram(text, imageUrl) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
        return { platform: 'telegram', success: false, error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set in server env vars.' };
    }
    try {
        const endpoint = imageUrl
            ? `https://api.telegram.org/bot${token}/sendPhoto`
            : `https://api.telegram.org/bot${token}/sendMessage`;
        const body = imageUrl
            ? { chat_id: chatId, photo: imageUrl, caption: text }
            : { chat_id: chatId, text };

        const tgRes = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const tgData = await tgRes.json();
        if (!tgData.ok) {
            return { platform: 'telegram', success: false, error: tgData.description || 'Telegram API rejected the request.' };
        }
        return { platform: 'telegram', success: true, post_id: String(tgData.result.message_id) };
    } catch (e) {
        return { platform: 'telegram', success: false, error: e.message };
    }
}

async function publishFacebook(text, imageUrl, keys) {
    // Requires: Page ID + Page Access Token (from a Meta Developer App with pages_manage_posts scope)
    const pageId = keys.fb_page_id;
    const accessToken = keys.fb_token;
    if (!pageId || !accessToken) {
        return { platform: 'facebook', success: false, error: 'Missing Facebook Page ID or Page Access Token.' };
    }
    try {
        const url = imageUrl
            ? `https://graph.facebook.com/v19.0/${pageId}/photos`
            : `https://graph.facebook.com/v19.0/${pageId}/feed`;
        const params = new URLSearchParams({ access_token: accessToken });
        if (imageUrl) { params.append('url', imageUrl); params.append('caption', text); }
        else { params.append('message', text); }

        const fbRes = await fetch(`${url}?${params.toString()}`, { method: 'POST' });
        const fbData = await fbRes.json();
        if (fbData.error) {
            return { platform: 'facebook', success: false, error: fbData.error.message };
        }
        return { platform: 'facebook', success: true, post_id: fbData.id || fbData.post_id };
    } catch (e) {
        return { platform: 'facebook', success: false, error: e.message };
    }
}

async function publishInstagram(text, imageUrl, keys) {
    // Instagram Graph API needs an IG Business Account ID + Access Token,
    // AND requires a real media URL — Instagram cannot publish text-only posts.
    const igUserId = keys.insta_user_id;
    const accessToken = keys.insta_token;
    if (!igUserId || !accessToken) {
        return { platform: 'instagram', success: false, error: 'Missing Instagram Business Account ID or Access Token.' };
    }
    if (!imageUrl) {
        return { platform: 'instagram', success: false, error: 'Instagram requires an image or video — text-only posts are not supported by the API.' };
    }
    try {
        // Step 1: create media container
        const createParams = new URLSearchParams({ image_url: imageUrl, caption: text, access_token: accessToken });
        const createRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media?${createParams.toString()}`, { method: 'POST' });
        const createData = await createRes.json();
        if (createData.error) {
            return { platform: 'instagram', success: false, error: createData.error.message };
        }

        // Step 2: publish the container
        const publishParams = new URLSearchParams({ creation_id: createData.id, access_token: accessToken });
        const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish?${publishParams.toString()}`, { method: 'POST' });
        const publishData = await publishRes.json();
        if (publishData.error) {
            return { platform: 'instagram', success: false, error: publishData.error.message };
        }
        return { platform: 'instagram', success: true, post_id: publishData.id };
    } catch (e) {
        return { platform: 'instagram', success: false, error: e.message };
    }
}

async function publishLinkedIn(text, imageUrl, keys) {
    // Requires: Person or Organization URN (e.g. "urn:li:person:xxxx") + OAuth2 access token with w_member_social scope
    const authorUrn = keys.lnk_author_urn;
    const accessToken = keys.lnk_token;
    if (!authorUrn || !accessToken) {
        return { platform: 'linkedin', success: false, error: 'Missing LinkedIn Author URN or Access Token.' };
    }
    try {
        const body = {
            author: authorUrn,
            lifecycleState: 'PUBLISHED',
            specificContent: {
                'com.linkedin.ugc.ShareContent': {
                    shareCommentary: { text },
                    shareMediaCategory: imageUrl ? 'IMAGE' : 'NONE',
                    ...(imageUrl ? { media: [{ status: 'READY', originalUrl: imageUrl }] } : {})
                }
            },
            visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
        };

        const lnkRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'X-Restli-Protocol-Version': '2.0.0'
            },
            body: JSON.stringify(body)
        });

        if (!lnkRes.ok) {
            const errData = await lnkRes.json().catch(() => ({}));
            return { platform: 'linkedin', success: false, error: errData.message || `LinkedIn API error (${lnkRes.status})` };
        }
        const postId = lnkRes.headers.get('x-restli-id');
        return { platform: 'linkedin', success: true, post_id: postId };
    } catch (e) {
        return { platform: 'linkedin', success: false, error: e.message };
    }
}

async function publishTwitter(text, keys) {
    // X API v2 requires an OAuth2 User Context access token with "tweet.write" scope
    // (a plain App Bearer Token is NOT enough to post on someone's behalf).
    const accessToken = keys.tw_token;
    if (!accessToken) {
        return { platform: 'twitter', success: false, error: 'Missing X (Twitter) OAuth2 user access token.' };
    }
    try {
        const twRes = await fetch('https://api.twitter.com/2/tweets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ text })
        });
        const twData = await twRes.json();
        if (twData.errors || !twRes.ok) {
            return { platform: 'twitter', success: false, error: twData.detail || twData.title || 'X API rejected the request.' };
        }
        return { platform: 'twitter', success: true, post_id: twData.data?.id };
    } catch (e) {
        return { platform: 'twitter', success: false, error: e.message };
    }
}
