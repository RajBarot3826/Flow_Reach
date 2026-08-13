// ================= FLOWREACH INBOX & LIVE CHATS MANAGER - MYSQL =================

const express = require('express');
const router = express.Router();
const db = require('../db');
const axios = require('axios');


// GET Chat Threads List (Groups messages by contact phone)
router.get('/', async (req, res) => {
    try {
        // Fetch all contacts to cross-reference details
        const contactsResult = await db.query("SELECT * FROM contacts");
        const contacts = contactsResult.rows;
        
        // Fetch message logs
        const msgsResult = await db.query("SELECT * FROM chat_messages ORDER BY id ASC");
        const messages = msgsResult.rows;
        
        // Map messages into grouped conversations
        const conversationsMap = {};
        
        messages.forEach(m => {
            if (!conversationsMap[m.contact_phone]) {
                const contact = contacts.find(c => c.phone === m.contact_phone) || {
                    name: `Guest ${m.contact_phone}`,
                    phone: m.contact_phone,
                    tag: 'Customer'
                };
                
                conversationsMap[m.contact_phone] = {
                    contact,
                    messages: [],
                    unread: false
                };
            }
            
            conversationsMap[m.contact_phone].messages.push(m);
            if (m.unread && m.sender === 'them') {
                conversationsMap[m.contact_phone].unread = true;
            }
        });
        
        const conversations = Object.values(conversationsMap);
        res.json(conversations);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load chat conversations list." });
    }
});

// GET Message history for a specific phone number
router.get('/:phone', async (req, res) => {
    const { phone } = req.params;
    
    try {
        // Clear unread flag for these messages
        const updateQ = "UPDATE chat_messages SET unread = FALSE WHERE contact_phone = ?";
        await db.query(updateQ, [phone]);
        
        // Get sorted thread messages
        const getQ = "SELECT * FROM chat_messages WHERE contact_phone = ? ORDER BY id ASC";
        const result = await db.query(getQ, [phone]);
        
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load message thread." });
    }
});

// POST Send manual message from dashboard console
router.post('/send', async (req, res) => {
    const { phone, text, whatsapp_phone_number_id } = req.body;
    const userId = req.headers['x-user-id'] || 1;
    
    if (!phone || !text) {
        return res.status(400).json({ error: "Destination phone number and text body are required." });
    }
    
    try {
        // 1. Fetch user credentials
        let phoneId = whatsapp_phone_number_id || null;
        let accessToken = null;
        
        if (phoneId) {
            const bizRes = await db.query("SELECT * FROM businesses WHERE user_id = ? AND whatsapp_phone_number_id = ?", [userId, phoneId]);
            if (bizRes.rows.length > 0) {
                accessToken = bizRes.rows[0].meta_access_token;
            } else {
                const bizRes2 = await db.query("SELECT * FROM businesses WHERE whatsapp_phone_number_id = ?", [phoneId]);
                if (bizRes2.rows.length > 0) {
                    accessToken = bizRes2.rows[0].meta_access_token;
                }
            }
        }
        
        if (!accessToken) {
            const bizRes = await db.query("SELECT * FROM businesses WHERE user_id = ?", [userId]);
            if (bizRes.rows.length > 0) {
                phoneId = bizRes.rows[0].whatsapp_phone_number_id;
                accessToken = bizRes.rows[0].meta_access_token;
            }
        }
        
        if (!phoneId || !accessToken) {
            phoneId = process.env.META_PHONE_NUMBER_ID;
            accessToken = process.env.META_ACCESS_TOKEN;
        }

        if (!phoneId || !accessToken) {
            return res.status(500).json({ error: "Meta API credentials are not configured for this account." });
        }

        // 2. Send via Meta API
        const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phone.replace('+', ''),
            type: "text",
            text: { body: text }
        };

        await axios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        // 3. Save to DB
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const insertQ = `
            INSERT INTO chat_messages (contact_phone, sender, text, time_str, unread)
            VALUES (?, ?, ?, ?, FALSE)
        `;
        const result = await db.query(insertQ, [phone, 'me', text, timeStr]);
        
        const insertId = result.rows[0].insertId;
        const selectRes = await db.query("SELECT * FROM chat_messages WHERE id = ?", [insertId]);
        const savedMsg = selectRes.rows[0];
        
        // Broadcast manual outgoing message to other clients
        sendWsUpdate({
            type: 'chat_event',
            phone,
            message: savedMsg
        });
        
        res.status(201).json(savedMsg);
    } catch (e) {
        console.error("Meta API Chat Send Error:", e.response ? e.response.data : e.message);
        res.status(500).json({ error: "Failed to send chat message." });
    }
});

function triggerBotAutoReply(phone) {
    const botReplies = [
        "Thanks for the quick response! That makes perfect sense.",
        "Understood. Let me check the documentation and try that.",
        "Excellent support. Thank you for resolving my billing issue.",
        "Appreciate the update. I will keep you posted.",
        "Could you send over the updated coupon values if they become active?"
    ];
    
    setTimeout(async () => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const replyText = botReplies[Math.floor(Math.random() * botReplies.length)];
        
        try {
            const insertQ = `
                INSERT INTO chat_messages (contact_phone, sender, text, time_str, unread)
                VALUES (?, ?, ?, ?, TRUE)
            `;
            const result = await db.query(insertQ, [phone, 'them', replyText, timeStr]);
            
            const insertId = result.rows[0].insertId;
            const selectRes = await db.query("SELECT * FROM chat_messages WHERE id = ?", [insertId]);
            const savedMsg = selectRes.rows[0];
            
            // Push message update to connected WebSockets
            sendWsUpdate({
                type: 'chat_event',
                phone,
                inbound: true,
                message: savedMsg
            });
            
        } catch (e) {
            console.error("Bot auto reply failed:", e);
        }
    }, 2000);
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

module.exports = router;
