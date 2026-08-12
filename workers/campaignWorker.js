// ================= FLOWREACH BACKGROUND CAMPAIGN WORKER =================
// This worker pulls jobs from an in-memory queue and executes them safely, handling Meta API rate limits.
// We use async.queue to handle 5000+ messages securely without requiring external Redis installation on Windows.

const async = require('async');
const axios = require('axios');
const db = require('../db');
require('dotenv').config();

// Create an async queue with a concurrency limit (e.g., 50 messages per second per Meta's limit)
const campaignQueue = async.queue(async (task, callback) => {
    const { campaignId, contact, template, user_id } = task;
    
    console.log(`[Worker] Processing message for ${contact.phone} (Campaign ${campaignId})`);

    // 1. Fetch user-specific credentials if they exist in the DB, otherwise fall back to environment variables
    let phoneId = null;
    let accessToken = null;
    
    if (user_id && !global.useMemoryDb) {
        const bizRes = await db.query("SELECT * FROM businesses WHERE user_id = ?", [user_id]);
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
        console.error("[Worker Error] Meta API credentials are not configured.");
        throw new Error("Meta API credentials (Access Token or Phone ID) are not configured for this user or server.");
    }

    // 2. Prepare the payload exactly as the Meta API expects it
    let payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: contact.phone.replace('+', ''), // Meta requires no '+'
        type: "template",
        template: {
            name: template.name,
            language: { code: template.language || "en_US" },
            components: []
        }
    };

    // If template has header text variables (e.g., {{1}})
    if (template.header_type === 'TEXT' && template.header_text && template.header_text.includes('{{1}}')) {
        payload.template.components.push({
            type: "header",
            parameters: [ { type: "text", text: contact.name || "Customer" } ] // Variable 1 usually mapped to Name
        });
    }

    // If template has body variables
    if (template.body && template.body.includes('{{1}}')) {
        // Just a basic map. A real SaaS allows users to select which CSV column maps to which variable
        let params = [];
        if (template.body.includes('{{1}}')) params.push({ type: "text", text: contact.name || "Customer" });
        if (template.body.includes('{{2}}')) params.push({ type: "text", text: contact.var1 || "Offer" });
        if (template.body.includes('{{3}}')) params.push({ type: "text", text: contact.var2 || "" });
        
        payload.template.components.push({
            type: "body",
            parameters: params
        });
    }

    try {
        // 3. Fire the request to Meta
        const response = await axios.post(
            `https://graph.facebook.com/${process.env.META_API_VERSION || 'v20.0'}/${phoneId}/messages`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // 4. Log the success in the database
        const msgId = response.data.messages[0].id;
        if (!global.useMemoryDb) {
            await db.query(`
                INSERT INTO campaign_logs (campaign_id, phone, status, message_id)
                VALUES (?, ?, ?, ?)
            `, [campaignId, contact.phone, 'Sent', msgId]);
            
            // Update campaigns table stats
            await db.query("UPDATE campaigns SET sent = sent + 1 WHERE id = ?", [campaignId]);

            // 5. Deduct wallet balance (base rate + 30% markup per message)
            if (user_id) {
                const baseRate = parseFloat(process.env.BILLING_RATE_PER_MSG || '1.00');
                const ratePerMsg = baseRate * 1.30;
                await db.query("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?", [ratePerMsg, user_id]);
            }
        }

        // Send WebSocket update so the dispatch console shows it instantly
        if (global.wsClients && global.wsClients.length > 0) {
             const wsPayload = JSON.stringify({
                 type: 'log',
                 message: `[SENDING] Dispatched template to ${contact.name} (${contact.phone})... SUCCESS (ID: ${msgId})`
             });
             global.wsClients.forEach(client => {
                 if (client.readyState === 1) client.send(wsPayload); // 1 = OPEN
             });
        }
        
    } catch (error) {
        console.error(`[Worker] Failed to send to ${contact.phone}:`, error.response?.data || error.message);
        
        // Log the failure
        if (!global.useMemoryDb) {
            await db.query(`
                INSERT INTO campaign_logs (campaign_id, phone, status, message_id)
                VALUES (?, ?, ?, ?)
            `, [campaignId, contact.phone, 'Failed', null]);
            
            await db.query("UPDATE campaigns SET failed = failed + 1 WHERE id = ?", [campaignId]);
        }

        // Send WebSocket error log
        if (global.wsClients && global.wsClients.length > 0) {
             const wsPayload = JSON.stringify({
                 type: 'log',
                 message: `[ERROR] Failed dispatch to ${contact.name}: ${error.response?.data?.error?.message || error.message}`
             });
             global.wsClients.forEach(client => {
                 if (client.readyState === 1) client.send(wsPayload); // 1 = OPEN
             });
        }
    }
    
    // Add artificial delay to respect Meta API limits safely
    await new Promise(resolve => setTimeout(resolve, parseInt(process.env.SEND_DELAY_MS || '1200')));
    
    // Call callback to signal job is done
    if (callback) callback();

}, 50); // Concurrency limit

campaignQueue.error((err, task) => {
    console.error(`[Worker Queue Error] Failed to process task for ${task.contact.phone}`, err);
});

campaignQueue.drain(() => {
    console.log('[Worker] All items in the campaign queue have been processed.');
    if (global.wsClients && global.wsClients.length > 0) {
        const wsPayload = JSON.stringify({ type: 'log', message: `[SYSTEM] Broadcast queue processing completed.` });
        global.wsClients.forEach(client => {
            if (client.readyState === 1) client.send(wsPayload);
        });
    }
});

// Wrapper to match BullMQ 'add' API signature roughly for drop-in replacement
const queueWrapper = {
    add: async (jobName, data) => {
        campaignQueue.push(data);
    }
};

module.exports = { campaignQueue: queueWrapper };
