import { NextRequest, NextResponse } from 'next/server';

// --- Configuration ---
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

// --- Types for TypeScript ---
interface WebhookChange {
    field: string;
    value: {
        from?: { id: string; username: string };
        item?: string;
        comment_id?: string;
        text?: string;
        post_id?: string;
    };
}

interface WebhookEntry {
    id: string;
    changes?: WebhookChange[]; // Optional because some events don't have changes
}

interface WebhookPayload {
    object: string;
    entry: WebhookEntry[];
}

// --- 1. GET Handler (Verification) ---
export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    // Verify the token matches your .env
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ WEBHOOK_VERIFIED');
        return new NextResponse(challenge, { status: 200 });
    }

    return new NextResponse('Forbidden', { status: 403 });
}

// --- 2. POST Handler (The Logic) ---
export async function POST(req: NextRequest) {
    try {
        // 1. Safety Check: Credentials
        if (!PAGE_ACCESS_TOKEN) {
            console.error('❌ ERROR: Missing META_PAGE_ACCESS_TOKEN in .env');
            return new NextResponse('Server Config Error', { status: 500 });
        }

        const body: WebhookPayload = await req.json();

        // 2. Log Incoming Payload (Helpful for debugging, disable in high traffic)
        // console.log("Incoming Webhook:", JSON.stringify(body, null, 2));

        // 3. Validate Event Type
        if (body.object === 'instagram') {

            // Handle empty entries safely
            const entries = body.entry || [];

            for (const entry of entries) {
                // --- PRODUCTION FIX: Handle undefined changes ---
                // Some events (like standby, read receipts) have no 'changes' array.
                // We defaults to [] to prevent "not iterable" crashes.
                const changes = entry.changes ?? [];

                for (const change of changes) {

                    // Filter: We only care about comments
                    if (change.field === 'comments') {

                        // --- PRODUCTION FIX: Handle Media/Deleted Comments ---
                        // If a user sends a GIF or deletes a comment, 'text' might be missing.
                        const rawText = change.value.text;
                        const commentId = change.value.comment_id;

                        if (!rawText || !commentId) {
                            console.log("⚠️ Skipping comment: No text or ID found (Media or Deleted).");
                            continue;
                        }

                        // --- CASE INSENSITIVITY LOGIC ---
                        // Convert to lowercase to match "Roadmap", "ROADMAP", "roadmap"
                        const normalizedText = rawText.toLowerCase();

                        if (normalizedText.includes('roadmap')) {
                            console.log(`🚀 Keyword found: "${rawText}". Sending DM to ID: ${commentId}`);

                            // We await here to ensure DM is sent before response returns
                            await sendPrivateReply(commentId);
                        }
                    }
                }
            }

            // --- CRITICAL FOR META ---
            // Always return 200 OK. If you return 500, Meta will retry repeatedly.
            return new NextResponse('EVENT_RECEIVED', { status: 200 });
        }

        // Return 404 for non-Instagram events
        return new NextResponse('Not Found', { status: 404 });

    } catch (error) {
        console.error('❌ CRASH ERROR processing webhook:', error);
        // Even on crash, return 200 to stop Meta from spamming retries
        return new NextResponse('Internal Server Error Handled', { status: 200 });
    }
}

// --- 3. Helper Function: Send the DM ---
async function sendPrivateReply(commentId: string) {
    const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;

    const payload = {
        recipient: {
            comment_id: commentId
        },
        message: {
            text: "Hey! 👋 Here is the link to the roadmap you asked for: https://ontheorbit.com/roadmap"
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (data.error) {
            console.error('❌ Meta API Error:', JSON.stringify(data.error, null, 2));
        } else {
            console.log('✅ DM Sent Successfully!');
        }
    } catch (error) {
        console.error('❌ Network Fetch Error:', error);
    }
}