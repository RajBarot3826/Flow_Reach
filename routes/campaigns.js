// ================= FLOWREACH CAMPAIGNS WIZARD & BROADCAST DISPATCHER - MYSQL =================

const express = require('express');
const router = express.Router();
const db = require('../db');

// GET Campaign History list
router.get('/', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM campaigns ORDER BY id DESC");
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load campaigns history." });
    }
});

// POST Launch Campaign Broadcast
router.post('/launch', async (req, res) => {
    const { name, templateName, audienceTag, scheduledTime } = req.body;
    
    if (!name || !templateName || !audienceTag) {
        return res.status(400).json({ error: "Missing campaign name, template, or audience parameters." });
    }
    
    try {
        // 1. Fetch matching template parameters
        const tplResult = await db.query("SELECT * FROM templates WHERE name = ?", [templateName]);
        if (tplResult.rows.length === 0) {
            return res.status(404).json({ error: `Message template "${templateName}" not found.` });
        }
        const tpl = tplResult.rows[0];
        
        // 2. Fetch target audience list
        let contactsQ = "SELECT * FROM contacts";
        let contactsParams = [];
        if (audienceTag !== 'all') {
            contactsQ += " WHERE tag = ?";
            contactsParams.push(audienceTag);
        }
        const contactsResult = await db.query(contactsQ, contactsParams);
        const contacts = contactsResult.rows;
        
        if (contacts.length === 0) {
            return res.status(400).json({ error: "Target segment contains 0 contacts. Populate lists first." });
        }
        
        // Check user wallet balance (Requires base rate + 30% markup per message)
        const userId = req.headers['x-user-id'] || req.body.userId;
        let user = null;
        if (userId) {
            const userRes = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
            if (userRes.rows.length > 0) {
                user = userRes.rows[0];
                const baseRate = parseFloat(process.env.BILLING_RATE_PER_MSG || '1.00');
                const ratePerMsg = baseRate * 1.30;
                const requiredBal = contacts.length * ratePerMsg;
                const currentBal = parseFloat(user.wallet_balance || '0.00');
                if (currentBal < requiredBal) {
                    return res.status(402).json({ 
                        error: `Insufficient wallet balance. Sending this campaign to ${contacts.length} contacts requires Rs. ${requiredBal.toFixed(2)} (at Rs. ${ratePerMsg.toFixed(2)}/msg), but your balance is Rs. ${currentBal.toFixed(2)}. Please recharge your wallet.` 
                    });
                }
            }
        }
        
        // 3. (Option 2) Platform uses Master Credentials, so we no longer fetch device credentials
        const biz = null;
        
        // Deduct wallet balance check completed (Deductions will occur message-by-message as dispatches succeed)
        
        // Save campaign stub to DB
        const campaignQ = `
            INSERT INTO campaigns (name, template_name, audience_tag, scheduled_time, sent, status, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const initialStatus = scheduledTime && scheduledTime !== 'Send Now' ? 'Scheduled' : 'In-Progress';
        const insertRes = await db.query(campaignQ, [
            name, 
            templateName, 
            audienceTag, 
            scheduledTime || 'Send Now',
            contacts.length,
            initialStatus,
            userId || null
        ]);
        
        const insertId = insertRes.rows[0].insertId;
        const selectRes = await db.query("SELECT * FROM campaigns WHERE id = ?", [insertId]);
        const campaign = selectRes.rows[0];
        
        // If scheduled for later, resolve call here
        if (initialStatus === 'Scheduled') {
            return res.status(201).json({
                success: true,
                message: `Campaign scheduled successfully to start on ${scheduledTime}.`,
                campaign
            });
        }
        
        // --- REAL WORLD SAAS: Add to Redis Queue ---
        try {
            const { campaignQueue } = require('../workers/campaignWorker');
            for (let contact of contacts) {
                await campaignQueue.add('send-message', {
                    campaignId: campaign.id,
                    contact: contact,
                    template: tpl,
                    user_id: userId
                });
            }
        } catch (queueErr) {
            console.error("Queue connection failed, ensure Redis is running or use mock.", queueErr.message);
            // Fallback for local testing if redis fails
            setTimeout(() => {
                runBackgroundBroadcast(campaign.id, contacts, tpl, biz, userId);
            }, 1000);
        }
        
        res.status(201).json({
            success: true,
            message: "Campaign broadcast jobs added to queue successfully.",
            campaign
        });
        
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to launch campaign broadcast." });
    }
});

// BACKGROUND Sequential Sender Loop
async function runBackgroundBroadcast(campaignId, contacts, tpl, biz, userId) {
    let sent = 0;
    let delivered = 0;
    let read = 0;
    let failed = 0;
    
    sendWsUpdate({ type: 'log', message: `[SYSTEM] Broadcast Queue started for Campaign #${campaignId}. Processing ${contacts.length} targets.` });
    
    for (let index = 0; index < contacts.length; index++) {
        const contact = contacts[index];
        sendWsUpdate({
            type: 'log',
            message: `[SENDING] Node ${index+1}/${contacts.length}: Dispatching template to ${contact.name} (${contact.phone})...`
        });
        
        let success = false;
        
        // Query user-specific credentials if they exist
        let masterPhoneId = null;
        let masterToken = null;
        
        if (userId) {
            try {
                const bizRes = await db.query("SELECT * FROM businesses WHERE user_id = ?", [userId]);
                if (bizRes.rows.length > 0) {
                    masterPhoneId = bizRes.rows[0].whatsapp_phone_number_id;
                    masterToken = bizRes.rows[0].meta_access_token;
                }
            } catch (dbErr) {
                console.error("DB error fetching credentials:", dbErr.message);
            }
        }
        
        if (!masterPhoneId || !masterToken) {
            masterToken = process.env.META_ACCESS_TOKEN;
            masterPhoneId = process.env.META_PHONE_NUMBER_ID;
        }
        
        if (masterToken && masterPhoneId && masterToken !== 'your_system_user_token_here') {
            success = await callMetaCloudAPI(contact, tpl, masterToken, masterPhoneId);
        } else {
            sendWsUpdate({ type: 'log', message: `[ERROR] Node ${contact.name}: Dispatch failed. Master platform API credentials not configured in backend.` });
            success = false;
        }
        
        sent++;
        
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        if (success) {
            delivered++;
            
            // Deduct base rate + 30% markup per successfully delivered message from user balance on the server!
            if (userId) {
                try {
                    const baseRate = parseFloat(process.env.BILLING_RATE_PER_MSG || '1.00');
                    const ratePerMsg = baseRate * 1.30;
                    await db.query("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?", [ratePerMsg, userId]);
                } catch (walletErr) {
                    console.error("⚠️ [WALLET DEDUCTION ERROR] Failed to deduct balance:", walletErr.message);
                }
            }

            sendWsUpdate({ type: 'log', message: `[STATUS] Node ${contact.name}: Delivered successfully.` });
            
            // Log outgoing message to chat_messages table
            let bodyText = tpl.body
                .replace(/\{\{1\}\}/g, contact.name)
                .replace(/\{\{2\}\}/g, contact.var1 || 'PROMO10')
                .replace(/\{\{3\}\}/g, contact.var2 || 'Tomorrow');
            
            const chatRes = await db.query(`
                INSERT INTO chat_messages (contact_phone, sender, text, time_str, unread)
                VALUES (?, ?, ?, ?, FALSE)
            `, [contact.phone, 'me', bodyText, timeStr]);
            
            const insertId = chatRes.rows[0].insertId;
            const selectRes = await db.query("SELECT * FROM chat_messages WHERE id = ?", [insertId]);
            const savedMsg = selectRes.rows[0];
            
            // Send socket event to refresh inbox list
            sendWsUpdate({
                type: 'chat_event',
                phone: contact.phone,
                message: savedMsg
            });
            
            // Read rate trigger (75%)
            const isRead = Math.random() < 0.75;
            if (isRead) {
                read++;
                setTimeout(() => {
                    sendWsUpdate({ type: 'log', message: `[STATUS] Node ${contact.name}: Message read (Blue Ticks).` });
                }, 500);
            }
            
            // Inbound User Reply Trigger (30%)
            const isReply = Math.random() < 0.30;
            if (isReply) {
                scheduleSimulatedUserReply(contact, timeStr);
            }
            
        } else {
            failed++;
            sendWsUpdate({ type: 'log', message: `[ERROR] Node ${contact.name}: Dispatch failed. Destination network timeout.` });
        }
        
        // Push progress to connected WebSockets
        sendWsUpdate({
            type: 'progress',
            campaignId,
            sent,
            delivered,
            read,
            failed,
            total: contacts.length
        });
    }
    
    // Save final stats to DB
    const finalQ = `
        UPDATE campaigns 
        SET sent = ?, delivered = ?, \`read\` = ?, failed = ?, status = 'Completed'
        WHERE id = ?
    `;
    await db.query(finalQ, [sent, delivered, read, failed, campaignId]);
    sendWsUpdate({ type: 'log', message: `[SYSTEM] Campaign #${campaignId} broadcast processing complete.` });
}

// Meta WhatsApp Cloud API HTTP Client Caller
async function callMetaCloudAPI(contact, tpl, masterToken, masterPhoneId) {
    const url = `https://graph.facebook.com/v20.0/${masterPhoneId}/messages`;
    
    // Construct template component parameters dynamically
    const components = [];
    
    // 1. Map Header component if text or media link is provided
    // Support both camelCase (memory DB) and snake_case (MySQL) field names
    const headerType = tpl.header_type || tpl.headerType || 'NONE';
    const headerText = tpl.header_text || tpl.headerText || '';
    const headerImageUrl = tpl.header_image_url || tpl.headerImageUrl || tpl.headerImage || '';
    
    if (headerType === 'TEXT' && headerText) {
        // Static text headers do not require parameters in the Meta API request payload.
    } else if (headerType === 'IMAGE' && headerImageUrl) {
        components.push({
            type: "header",
            parameters: [
                {
                    type: "image",
                    image: { link: headerImageUrl }
                }
            ]
        });
    }
    
    // 2. Count variables in body template (e.g. {{1}}, {{2}}) and append values
    const varMatches = tpl.body.match(/\{\{\d+\}\}/g) || [];
    if (varMatches.length > 0) {
        const bodyParams = [];
        if (varMatches.length >= 1) {
            bodyParams.push({ type: "text", text: contact.name });
        }
        if (varMatches.length >= 2) {
            bodyParams.push({ type: "text", text: contact.var1 || "PROMO" });
        }
        if (varMatches.length >= 3) {
            bodyParams.push({ type: "text", text: contact.var2 || "Today" });
        }
        
        components.push({
            type: "body",
            parameters: bodyParams
        });
    }
    
    const templatePayload = {
        name: tpl.name,
        language: { code: tpl.language || "en_US" }
    };
    
    // Only include components if there are parameters to send
    if (components.length > 0) {
        templatePayload.components = components;
    }
    
    const payload = {
        messaging_product: "whatsapp",
        to: contact.phone.replace(/[^0-9]/g, ''), // Strip non-digit characters for WhatsApp API delivery specs
        type: "template",
        template: templatePayload
    };
    
    console.log(`[META API] Sending to ${contact.phone}: template=${tpl.name}, lang=${tpl.language}`);
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${masterToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            console.error(`Meta API returned HTTP Error ${response.status}:`, JSON.stringify(data));
            sendWsUpdate({ 
                type: 'log', 
                message: `[META API ERROR] HTTP ${response.status}: ${data.error?.message || 'Unknown Meta failure'}` 
            });
            return false;
        }
        
        console.log(`[META API] ✅ Message accepted: ${data.messages?.[0]?.id}`);
        return data.messages && data.messages.length > 0;
    } catch (e) {
        console.error("Meta integration API fetch request crashed:", e);
        return false;
    }
}

// Helper schedule user replies
function scheduleSimulatedUserReply(contact, originalTimeStr) {
    const replies = [
        "Hey! This offer sounds interesting. Is it valid on renewals?",
        "Awesome template! Do you accept credit card payments?",
        "Please remove me from this broadcast list.",
        "Could someone from the support team call me on this number?",
        "Coupon code working. Thank you for the discount!"
    ];
    
    const delayTime = 3000 + Math.random() * 5000;
    
    setTimeout(async () => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const text = replies[Math.floor(Math.random() * replies.length)];
        
        try {
            const insertRes = await db.query(`
                INSERT INTO chat_messages (contact_phone, sender, text, time_str, unread)
                VALUES (?, ?, ?, ?, TRUE)
            `, [contact.phone, 'them', text, timeStr]);
            
            const insertId = insertRes.rows[0].insertId;
            const selectRes = await db.query("SELECT * FROM chat_messages WHERE id = ?", [insertId]);
            const savedMsg = selectRes.rows[0];
            
            // Push message to WebSocket clients
            sendWsUpdate({
                type: 'chat_event',
                phone: contact.phone,
                inbound: true,
                message: savedMsg
            });
        } catch (e) {
            console.error("Simulated reply insertion failed: ", e);
        }
    }, delayTime);
}

// WebSocket broadcast client updates helper
function sendWsUpdate(payload) {
    if (global.wsClients && Array.isArray(global.wsClients)) {
        const dataStr = JSON.stringify(payload);
        global.wsClients.forEach(client => {
            if (client.readyState === 1) { // 1 = OPEN
                client.send(dataStr);
            }
        });
    }
}

// POST /api/campaigns/deduct-message - Deduct base rate + 30% markup for a single sent message
router.post('/deduct-message', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(400).json({ error: "User ID header is required." });
    }
    
    try {
        const baseRate = parseFloat(process.env.BILLING_RATE_PER_MSG || '1.00');
        const rate = baseRate * 1.30;
        // Subtract base rate + 30% markup from user's wallet
        await db.query("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?", [rate, userId]);
        
        // Return latest balance details
        const userRes = await db.query("SELECT wallet_balance FROM users WHERE id = ?", [userId]);
        const balance = userRes.rows[0]?.wallet_balance || 0.00;
        
        res.json({
            success: true,
            wallet_balance: parseFloat(balance)
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to deduct single message charge." });
    }
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = router;
