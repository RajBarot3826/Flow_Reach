// ================= FLOWREACH META CLOUD WEBHOOK HANDLER =================
// Handles:
//   GET  /api/webhook  → Meta webhook verification handshake
//   POST /api/webhook  → Inbound events: status updates + incoming messages

const express = require('express');
const router = express.Router();
const db = require('../db');
require('dotenv').config();

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'flowreach_verify_secret';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/webhook  →  Meta Webhook Verification Handshake
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        const expectedToken = VERIFY_TOKEN.trim();
        const fallbackToken = 'flowreach_verify_secret';

        if (mode === 'subscribe' && (token === expectedToken || token === fallbackToken)) {
            console.log("🌐  [WEBHOOK] Meta verification handshake accepted.");
            return res.status(200).send(challenge);
        }
        console.warn(`⚠️   [WEBHOOK] Verification failed. Expected: '${expectedToken}', Got: '${token}'`);
        console.warn("⚠️   [WEBHOOK] Verification failed — token mismatch.");
        return res.status(403).json({ error: 'Forbidden: verify token mismatch.' });
    }
    return res.status(400).json({ error: 'Bad request: missing hub parameters.' });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhook  →  Meta Inbound Events
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    // Always ACK immediately — Meta requires 200 within 20 seconds
    res.status(200).send('EVENT_RECEIVED');

    const body = req.body;
    if (!body?.object || !body?.entry?.[0]?.changes?.[0]?.value) return;

    const changeValue = body.entry[0].changes[0].value;

    // ── 1. Handle message STATUS updates (delivered, read, failed) ────────────
    if (changeValue.statuses && changeValue.statuses.length > 0) {
        for (const statusUpdate of changeValue.statuses) {
            await handleStatusUpdate(statusUpdate);
        }
    }

    // ── 2. Handle INBOUND messages from customers ─────────────────────────────
    if (changeValue.messages && changeValue.messages.length > 0) {
        for (const msg of changeValue.messages) {
            await handleInboundMessage(msg);
        }
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// STATUS UPDATE HANDLER
// Updates campaign delivered/read/failed counters + pushes WS progress event
// ─────────────────────────────────────────────────────────────────────────────
async function handleStatusUpdate(statusUpdate) {
    const messageId     = statusUpdate.id;
    const status        = statusUpdate.status; // 'sent', 'delivered', 'read', 'failed'
    const recipientPhone = statusUpdate.recipient_id;
    const timestamp     = statusUpdate.timestamp;
    const errorData     = statusUpdate.errors?.[0] || null;

    console.log(`📊  [WEBHOOK STATUS] ${recipientPhone} → ${status.toUpperCase()}${errorData ? ` (Error: ${errorData.message})` : ''}`);

    // Push real-time status update to all connected WebSocket clients
    sendWsUpdate({
        type: 'webhook_status_update',
        phone: recipientPhone,
        messageId,
        status,
        timestamp,
        error: errorData ? { code: errorData.code, message: errorData.message } : null
    });

    // Update campaign statistics based on status
    try {
        if (status === 'delivered') {
            // Increment delivered counter for the most recent In-Progress campaign
            await db.query(`
                UPDATE campaigns 
                SET delivered = delivered + 1
                WHERE status = 'In-Progress'
                ORDER BY id DESC LIMIT 1
            `);
        } else if (status === 'read') {
            // Increment read counter
            await db.query(`
                UPDATE campaigns 
                SET \`read\` = \`read\` + 1
                WHERE status IN ('In-Progress', 'Completed')
                ORDER BY id DESC LIMIT 1
            `);
        } else if (status === 'failed') {
            // Increment failed counter
            await db.query(`
                UPDATE campaigns 
                SET failed = failed + 1
                WHERE status = 'In-Progress'
                ORDER BY id DESC LIMIT 1
            `);
            if (errorData) {
                console.error(`❌  [WEBHOOK] Message failed for ${recipientPhone}: ${errorData.message} (code: ${errorData.code})`);
            }
        }

        // Fetch and broadcast updated campaign progress
        const campRes = await db.query("SELECT * FROM campaigns ORDER BY id DESC LIMIT 1");
        if (campRes.rows.length > 0) {
            const camp = campRes.rows[0];
            sendWsUpdate({
                type: 'progress',
                campaignId: camp.id,
                total: camp.sent || 0,
                sent: camp.sent || 0,
                delivered: camp.delivered || 0,
                read: camp.read || 0,
                failed: camp.failed || 0
            });
        }
    } catch (dbErr) {
        console.error("⚠️   [WEBHOOK] Failed to update campaign stats:", dbErr.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// INBOUND MESSAGE HANDLER
// Saves incoming customer message to DB + pushes chat_event to WebSocket
// ─────────────────────────────────────────────────────────────────────────────
async function handleInboundMessage(msg) {
    const senderPhone = msg.from;
    const messageId   = msg.id;
    const msgType     = msg.type;
    const timestamp   = msg.timestamp;

    // Extract message content based on type
    let textBody = "";
    let mediaType = null;
    let mediaUrl  = null;

    switch (msgType) {
        case 'text':
            textBody = msg.text?.body || "";
            break;
        case 'button':
            textBody = `[Button Reply] ${msg.button?.text || ""}`;
            break;
        case 'interactive':
            textBody = msg.interactive?.button_reply?.title
                    || msg.interactive?.list_reply?.title
                    || "[Interactive Response]";
            break;
        case 'image':
            textBody = "[Image received]";
            mediaType = 'image';
            break;
        case 'video':
            textBody = "[Video received]";
            mediaType = 'video';
            break;
        case 'audio':
            textBody = "[Voice message received]";
            mediaType = 'audio';
            break;
        case 'document':
            textBody = `[Document: ${msg.document?.filename || 'file'}]`;
            mediaType = 'document';
            break;
        case 'location':
            textBody = `[Location: lat=${msg.location?.latitude}, lng=${msg.location?.longitude}]`;
            break;
        default:
            textBody = `[${msgType} message received]`;
    }

    console.log(`📥  [WEBHOOK INBOUND] From ${senderPhone}: "${textBody}"`);

    // Convert Unix timestamp → time string
    const now = timestamp ? new Date(parseInt(timestamp) * 1000) : new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    try {
        // Try to find contact in our DB
        const contactsResult = await db.query("SELECT * FROM contacts WHERE phone = ?", [senderPhone]);
        const contactName = contactsResult.rows.length > 0
            ? contactsResult.rows[0].name
            : `Guest (${senderPhone})`;

        // Save inbound message to chat_messages table
        const insertRes = await db.query(`
            INSERT INTO chat_messages (contact_phone, sender, text, time_str, unread)
            VALUES (?, 'them', ?, ?, TRUE)
        `, [senderPhone, textBody, timeStr]);

        const insertId = insertRes.rows[0].insertId;
        const savedMsg = (await db.query("SELECT * FROM chat_messages WHERE id = ?", [insertId])).rows[0];

        // Broadcast chat_event to all connected WebSocket clients
        sendWsUpdate({
            type: 'chat_event',
            phone: senderPhone,
            contactName,
            inbound: true,
            messageId,
            message: savedMsg
        });

        // Mark unread badge
        sendWsUpdate({
            type: 'inbox_badge',
            phone: senderPhone,
            unread: true
        });

    } catch (e) {
        console.error("❌  [WEBHOOK] Failed to save inbound message:", e.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — Broadcast to all connected WebSocket clients
// ─────────────────────────────────────────────────────────────────────────────
function sendWsUpdate(payload) {
    if (global.wsClients && Array.isArray(global.wsClients)) {
        const dataStr = JSON.stringify(payload);
        global.wsClients.forEach(client => {
            try {
                if (client.readyState === 1) client.send(dataStr);
            } catch (e) {
                // Skip closed/errored sockets silently
            }
        });
    }
}

module.exports = router;
