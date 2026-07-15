// ================= FLOWREACH TEMPLATES ROUTES (DESIGN, SYNC & AI GENERATION) =================

const express = require('express');
const router = express.Router();
const db = require('../db');
require('dotenv').config();

const META_API_VERSION = process.env.META_API_VERSION || 'v20.0';

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/templates  →  Return all saved templates
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM templates ORDER BY id DESC");
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load message templates." });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/templates  →  Create or update a template
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    const { name, category, language, headerType, headerText, headerImageUrl, body, footer, buttons } = req.body;

    if (!name || !body) {
        return res.status(400).json({ error: "Template name and body content are required." });
    }

    try {
        const cleanName = name.toLowerCase().replace(/[^a-z0-9_]/g, '');
        const duplicate = await db.query("SELECT * FROM templates WHERE name = ?", [cleanName]);
        const serializedButtons = typeof buttons === 'string' ? buttons : JSON.stringify(buttons || []);

        let resultRow;

        if (duplicate.rows.length > 0) {
            // UPDATE existing template
            const updateQ = `
                UPDATE templates 
                SET category = ?, language = ?, header_type = ?, header_text = ?, 
                    header_image_url = ?, body = ?, footer = ?, buttons = ?, status = 'PENDING'
                WHERE name = ?
            `;
            await db.query(updateQ, [
                category || 'MARKETING', language || 'en',
                headerType || 'NONE', headerText || '',
                headerImageUrl || '', body, footer || '',
                serializedButtons, cleanName
            ]);
            const selectRes = await db.query("SELECT * FROM templates WHERE name = ?", [cleanName]);
            resultRow = selectRes.rows[0];
        } else {
            // INSERT new template
            const insertQ = `
                INSERT INTO templates (name, category, language, header_type, header_text, header_image_url, body, footer, buttons, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
            `;
            const insertRes = await db.query(insertQ, [
                cleanName, category || 'MARKETING', language || 'en',
                headerType || 'NONE', headerText || '',
                headerImageUrl || '', body, footer || '', serializedButtons
            ]);
            const insertId = insertRes.rows[0].insertId;
            const selectRes = await db.query("SELECT * FROM templates WHERE id = ?", [insertId]);
            resultRow = selectRes.rows[0];
        }

        res.status(201).json(resultRow);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to save message template." });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/templates/sync  →  Fetch templates from Meta Cloud API
//   Pulls live approval statuses from Meta and upserts them into the local DB.
//   Falls back to local approval simulation if no Meta credentials are set.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/sync', async (req, res) => {
    try {
        // Use server-side credentials from environment variables (set in Render dashboard)
        const wabaId     = process.env.META_WABA_ID || process.env.META_BUSINESS_ACCOUNT_ID;
        const token      = process.env.META_ACCESS_TOKEN;
        const apiVersion = META_API_VERSION;

        let syncedFromMeta = false;
        let metaTemplates  = [];

        // ── Live Meta Cloud API sync ──
        if (wabaId && token) {
            try {
                const metaUrl = `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates?fields=name,status,category,language,components&limit=100`;
                const metaRes = await fetch(metaUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (metaRes.ok) {
                    const metaData = await metaRes.json();
                    metaTemplates = metaData.data || [];
                    syncedFromMeta = true;
                    console.log(`✅  [TEMPLATE SYNC] Fetched ${metaTemplates.length} templates from Meta Cloud API.`);

                    // Upsert each template status into local DB
                    for (const mt of metaTemplates) {
                        const localCheck = await db.query("SELECT id FROM templates WHERE name = ?", [mt.name]);

                        // Extract body text from components
                        const bodyComp = (mt.components || []).find(c => c.type === 'BODY');
                        const headerComp = (mt.components || []).find(c => c.type === 'HEADER');
                        const footerComp = (mt.components || []).find(c => c.type === 'FOOTER');
                        const btnComp    = (mt.components || []).find(c => c.type === 'BUTTONS');

                        const headerType = headerComp?.format || 'NONE';
                        const headerText = headerComp?.text || '';
                        const bodyText   = bodyComp?.text || '';
                        const footerText = footerComp?.text || '';
                        const buttons    = JSON.stringify(btnComp?.buttons || []);

                        if (localCheck.rows.length > 0) {
                            // Update status + body from Meta
                            await db.query(
                                `UPDATE templates SET status = ?, category = ?, language = ?,
                                 header_type = ?, header_text = ?, body = ?, footer = ?, buttons = ?
                                 WHERE name = ?`,
                                [
                                    mt.status,
                                    mt.category,
                                    mt.language,
                                    headerType,
                                    headerText,
                                    bodyText,
                                    footerText,
                                    buttons,
                                    mt.name
                                ]
                            );
                        } else {
                            // Insert new template discovered on Meta
                            await db.query(
                                `INSERT INTO templates (name, category, language, header_type, header_text, body, footer, buttons, status)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [mt.name, mt.category, mt.language, headerType, headerText, bodyText, footerText, buttons, mt.status]
                            );
                        }
                    }
                } else {
                    const errData = await metaRes.json();
                    console.warn(`⚠️  [TEMPLATE SYNC] Meta API returned ${metaRes.status}:`, errData);
                }
            } catch (metaErr) {
                console.warn("⚠️  [TEMPLATE SYNC] Meta API fetch failed:", metaErr.message);
            }
        }

        // ── Fallback: mark local PENDING templates as APPROVED ──
        if (!syncedFromMeta) {
            await db.query("UPDATE templates SET status = 'APPROVED' WHERE status = 'PENDING'");
            console.log("ℹ️  [TEMPLATE SYNC] No Meta credentials. Simulated approval of pending templates.");
        }

        const result = await db.query("SELECT * FROM templates ORDER BY id DESC");

        res.json({
            success: true,
            syncedFromMeta,
            metaTemplateCount: metaTemplates.length,
            message: syncedFromMeta
                ? `Successfully synced ${metaTemplates.length} templates from Meta Cloud API.`
                : "No Meta credentials configured. All pending templates approved locally.",
            templates: result.rows
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Template sync operation failed." });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/templates/ai-generate  →  AI Template Generator
//   Priority: 1. Google Gemini API  2. OpenAI GPT  3. Keyword-based fallback
// ─────────────────────────────────────────────────────────────────────────────
router.post('/ai-generate', async (req, res) => {
    const { prompt, category } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required for AI template generation." });
    }

    // ── 1. Try Google Gemini API ──────────────────────────────────────────────
    if (process.env.GEMINI_API_KEY) {
        try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;

            const systemInstruction = `You are a WhatsApp Business marketing copywriter. Generate a WhatsApp message template based on the user's prompt. 
Return ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "name": "snake_case_template_name",
  "category": "MARKETING or UTILITY or AUTHENTICATION",
  "language": "en",
  "headerType": "TEXT or IMAGE or NONE",
  "headerText": "Short header if TEXT, else empty string",
  "body": "Message body with {{1}} for name, {{2}} for promo code etc",
  "footer": "Short footer text",
  "buttons": [{"type": "URL", "text": "Button Label", "value": "https://example.com"}]
}`;

            const geminiRes = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `${systemInstruction}\n\nUser prompt: "${prompt}"\nCategory preference: ${category || 'MARKETING'}`
                        }]
                    }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 512 }
                })
            });

            if (geminiRes.ok) {
                const geminiData = await geminiRes.json();
                const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

                // Extract JSON from response (strip markdown code blocks if present)
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    console.log(`✅  [AI GENERATE] Gemini generated template: ${parsed.name}`);
                    return res.json(parsed);
                }
            }
        } catch (gemErr) {
            console.warn("⚠️  [AI GENERATE] Gemini failed:", gemErr.message);
        }
    }

    // ── 2. Try OpenAI GPT API ─────────────────────────────────────────────────
    if (process.env.OPENAI_API_KEY) {
        try {
            const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: `You are a WhatsApp Business marketing copywriter. When given a prompt, generate a message template in this exact JSON format ONLY (no extra text):
{"name":"snake_case_name","category":"MARKETING","language":"en","headerType":"NONE","headerText":"","body":"Hi {{1}}, message here with {{2}} for variable","footer":"Footer text","buttons":[]}`
                        },
                        {
                            role: 'user',
                            content: `Create a WhatsApp template for: ${prompt}`
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 400
                })
            });

            if (openAiRes.ok) {
                const openAiData = await openAiRes.json();
                const rawText = openAiData.choices?.[0]?.message?.content || '';
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    console.log(`✅  [AI GENERATE] OpenAI generated template: ${parsed.name}`);
                    return res.json(parsed);
                }
            }
        } catch (openAiErr) {
            console.warn("⚠️  [AI GENERATE] OpenAI failed:", openAiErr.message);
        }
    }

    // ── 3. Keyword-based smart fallback ──────────────────────────────────────
    console.log("ℹ️  [AI GENERATE] No AI API keys configured. Using keyword-based generation.");
    const text = prompt.toLowerCase();

    let result = {
        name: "ai_campaign_draft",
        category: category || "MARKETING",
        language: "en",
        headerType: "NONE",
        headerText: "",
        headerImageUrl: "",
        body: "",
        footer: "FlowReach | Powered by AI",
        buttons: []
    };

    // Keyword matchers
    if (text.includes("diwali") || text.includes("festival") || text.includes("eid") || text.includes("christmas")) {
        const fest = text.includes("diwali") ? "Diwali 🪔" : text.includes("eid") ? "Eid 🌙" : text.includes("christmas") ? "Christmas 🎄" : "Festival 🎉";
        result.name = "festival_promo_" + new Date().getFullYear();
        result.headerType = "IMAGE";
        result.body = `Dear {{1}},\n\nHappy ${fest}! Celebrate with us — get 25% off using code {{2}} at checkout.\n\nValid this weekend only. Don't miss out!`;
        result.footer = "Valid till midnight. T&C Apply.";
        result.buttons = [{ type: "URL", text: "Shop Now 🎁", value: "https://flowreach.com/festival" }];
    } else if (text.includes("cart") || text.includes("abandon")) {
        result.name = "abandoned_cart_recovery";
        result.headerType = "TEXT";
        result.headerText = "You left something behind! 🛒";
        result.body = `Hi {{1}},\n\nYou left items in your cart! Complete your purchase now and get free shipping with code {{2}}.\n\nYour cart is waiting!`;
        result.buttons = [{ type: "URL", text: "Complete Checkout", value: "https://flowreach.com/cart" }];
    } else if (text.includes("otp") || text.includes("verif") || text.includes("code")) {
        result.name = "secure_verification_otp";
        result.category = "AUTHENTICATION";
        result.headerType = "TEXT";
        result.headerText = "Your Verification Code";
        result.body = `Hello {{1}},\n\nYour one-time password is *{{2}}*. This code is valid for 10 minutes. Do NOT share it with anyone.`;
        result.footer = "If you didn't request this, please ignore.";
    } else if (text.includes("order") || text.includes("shipment") || text.includes("deliver")) {
        result.name = "order_shipped_notification";
        result.category = "UTILITY";
        result.headerType = "TEXT";
        result.headerText = "Your Order Is On The Way! 📦";
        result.body = `Hi {{1}},\n\nGreat news! Your order has been dispatched. Tracking ID: *{{2}}*.\n\nExpected delivery within 2–3 business days.`;
        result.buttons = [{ type: "URL", text: "Track Order", value: "https://flowreach.com/track" }];
    } else if (text.includes("survey") || text.includes("feedback") || text.includes("review") || text.includes("rating")) {
        result.name = "customer_feedback_request";
        result.category = "UTILITY";
        result.body = `Hi {{1}},\n\nThank you for choosing us! 🙏 We'd love to hear your feedback. It only takes 1 minute.\n\nPlease rate your experience using the link below:`;
        result.buttons = [{ type: "URL", text: "Rate Us ⭐", value: "https://flowreach.com/review" }];
    } else if (text.includes("appointment") || text.includes("booking") || text.includes("remind")) {
        result.name = "appointment_reminder";
        result.category = "UTILITY";
        result.headerType = "TEXT";
        result.headerText = "Upcoming Appointment Reminder 📅";
        result.body = `Hello {{1}},\n\nThis is a reminder for your appointment scheduled for *{{2}}*.\n\nPlease arrive 10 minutes early. Reply CANCEL to reschedule.`;
    } else if (text.includes("welcome") || text.includes("onboard") || text.includes("signup")) {
        result.name = "welcome_new_user";
        result.headerType = "TEXT";
        result.headerText = "Welcome to FlowReach! 🎉";
        result.body = `Hi {{1}},\n\nWelcome aboard! 🙌 We're excited to have you. Your account is active.\n\nUse code *{{2}}* to unlock your first month at 50% off.\n\nLet's get started!`;
        result.buttons = [{ type: "URL", text: "Get Started →", value: "https://flowreach.com/start" }];
    } else if (text.includes("sale") || text.includes("offer") || text.includes("discount") || text.includes("promo")) {
        result.name = "special_promo_offer";
        result.headerType = "IMAGE";
        result.body = `Hey {{1}}! 🎯\n\nExclusive offer just for you — {{2}} OFF on your next purchase!\n\nThis offer expires in 24 hours. Tap below to claim it now.`;
        result.buttons = [{ type: "URL", text: "Claim Offer", value: "https://flowreach.com/offer" }];
    } else {
        // Generic fallback
        result.name = "campaign_broadcast";
        result.body = `Hi {{1}},\n\nWe have an important update for you! Use code *{{2}}* to get your exclusive benefit.\n\nThank you for being a valued customer!`;
        result.buttons = [{ type: "URL", text: "Learn More", value: "https://flowreach.com" }];
    }

    // Context modifiers
    if (text.includes("urgent") || text.includes("hurry") || text.includes("expires")) {
        result.body = "⚡ *URGENT — Limited Time!*\n\n" + result.body;
    }
    if (text.includes("hindi") || text.includes("हिन्दी")) {
        result.language = "hi";
    }

    res.json(result);
});

module.exports = router;
