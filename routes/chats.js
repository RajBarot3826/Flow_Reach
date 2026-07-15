// ================= FLOWREACH INBOX & LIVE CHATS MANAGER - MYSQL =================

const express = require('express');
const router = express.Router();
const db = require('../db');

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
    const { phone, text } = req.body;
    
    if (!phone || !text) {
        return res.status(400).json({ error: "Destination phone number and text body are required." });
    }
    
    try {
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
        
        // Trigger simulated bot auto-reply after 2 seconds
        triggerBotAutoReply(phone);
        
        res.status(201).json(savedMsg);
    } catch (e) {
        console.error(e);
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
