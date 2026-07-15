// ================= FLOWREACH BACKGROUND CAMPAIGN WORKER =================
// This worker pulls jobs from Redis and executes them safely, handling Meta API rate limits.

const { Worker, Queue } = require('bullmq');
const Redis = require('ioredis');
const axios = require('axios');
const db = require('../db');
require('dotenv').config();

// Connect to Cloud Redis (Upstash) or local Redis
const redisConnection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
});

// Create the Queue reference so we can export it
const campaignQueue = new Queue('campaign-dispatch', { connection: redisConnection });

// BullMQ Worker to process messages
const worker = new Worker('campaign-dispatch', async job => {
    const { campaignId, contact, template, user_id } = job.data;
    
    console.log(`[Worker] Processing message for ${contact.phone} (Campaign ${campaignId})`);

    // 1. Use server-side Meta credentials from environment variables
    const phoneId = process.env.META_PHONE_NUMBER_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;
    if (!phoneId || !accessToken) {
        throw new Error("META_PHONE_NUMBER_ID and META_ACCESS_TOKEN must be set in environment variables.");
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
            `https://graph.facebook.com/v19.0/${phoneId}/messages`,
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
        await db.query(`
            INSERT INTO logs (campaign_id, phone, status, message_id)
            VALUES (?, ?, ?, ?)
        `, [campaignId, contact.phone, 'Sent', msgId]);

        // 5. Deduct wallet balance (Rs. 0.30 per message)
        if (user_id && !global.useMemoryDb) {
            await db.query("UPDATE users SET wallet_balance = wallet_balance - 0.30 WHERE id = ?", [user_id]);
        }

        return { success: true, messageId: msgId };
        
    } catch (error) {
        console.error(`[Worker] Failed to send to ${contact.phone}:`, error.response?.data || error.message);
        
        // Log the failure
        await db.query(`
            INSERT INTO logs (campaign_id, phone, status, message_id)
            VALUES (?, ?, ?, ?)
        `, [campaignId, contact.phone, 'Failed', null]);
        
        // Throwing error allows BullMQ to retry if configured
        throw new Error(error.response?.data?.error?.message || error.message);
    }
}, {
    connection: redisConnection,
    limiter: {
        max: 50, // Meta's limit: Max 50 messages per second per phone number
        duration: 1000
    }
});

worker.on('completed', (job) => {
    // console.log(`Job ${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
    console.error(`Job ${job.id} has failed with ${err.message}`);
});

module.exports = { campaignQueue, worker };
