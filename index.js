// ================= FLOWREACH BACKEND ENGINE (CORE SERVICE) =================

const express = require('express');
const http    = require('http');
const ws      = require('ws');
const cors    = require('cors');
require('dotenv').config();

// ── Route controllers ─────────────────────────────────────────────────────────
const authRouter      = require('./routes/auth');
const contactsRouter  = require('./routes/contacts');
const templatesRouter = require('./routes/templates');
const campaignsRouter = require('./routes/campaigns');
const chatsRouter     = require('./routes/chats');
const webhookRouter   = require('./routes/webhook');
const adminRouter     = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
// Raw body required BEFORE json() for webhook signature verification
app.use('/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
    // Convert raw buffer to parsed JSON for our handler
    if (Buffer.isBuffer(req.body)) {
        try { req.body = JSON.parse(req.body.toString()); } catch(e) { req.body = {}; }
    }
    next();
});
app.use(express.json());

// ── Health & info ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({
        service:       "FlowReach WhatsApp Broadcast Engine",
        status:        "Active",
        version:       "2.0.1-fallback-fixed",
        database_mode: global.useMemoryDb ? "Memory DB (local)" : "MySQL",
        endpoints: {
            auth:      "/api/auth",
            contacts:  "/api/contacts",
            templates: "/api/templates",
            campaigns: "/api/campaigns",
            chats:     "/api/chats",
            webhook:   "/webhook  (Meta registers here)",
            admin:     "/api/admin",
            privacy:   "/privacy"
        }
    });
});

// ── Meta App Review Privacy Policy Route ──────────────────────────────────────
app.get(['/privacy', '/privacy-policy'], (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Privacy Policy - FlowReach</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; padding: 40px; max-width: 800px; margin: 0 auto; color: #1e293b; background-color: #f8fafc; }
                h1 { color: #6366f1; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
                h2 { color: #334155; margin-top: 30px; }
                .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                footer { margin-top: 40px; font-size: 0.9em; color: #94a3b8; text-align: center; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Privacy Policy for FlowReach</h1>
                <p><strong>Effective Date:</strong> July 20, 2026</p>
                <p>FlowReach ("we", "our", or "us") respects your privacy and is committed to protecting the personal data of our users and their customers. This Privacy Policy explains how we collect, use, disclose, and safeguard information when you use our WhatsApp Business Broadcast and API Management platform.</p>

                <h2>1. Information We Collect</h2>
                <ul>
                    <li><strong>Account Information:</strong> Name, business email, phone number, company name, and encrypted authentication credentials.</li>
                    <li><strong>WhatsApp Integration Data:</strong> Phone number IDs, WhatsApp Business Account IDs (WABA), and Meta API access tokens required to send messages on your behalf.</li>
                    <li><strong>Message Data:</strong> Message templates, delivery status logs, and customer opt-in records.</li>
                </ul>

                <h2>2. How We Use Your Information</h2>
                <p>We use collected information solely to:</p>
                <ul>
                    <li>Provide, maintain, and optimize our WhatsApp broadcast services.</li>
                    <li>Deliver requested transactional and marketing message templates to target contacts.</li>
                    <li>Verify Meta App Webhooks and process message status updates (Sent, Delivered, Read).</li>
                    <li>Ensure platform compliance with Meta Business Policies.</li>
                </ul>

                <h2>3. Data Protection and Storage</h2>
                <p>All data transmitted between FlowReach, Meta API endpoints, and mobile devices is encrypted in transit using SSL/TLS encryption. We do not sell or rent your personal data to third parties.</p>

                <h2>4. Data Retention & User Control</h2>
                <p>Users can request data deletion or account removal at any time by contacting our support team. All associated Meta API tokens and message logs are purged upon account closure.</p>

                <h2>5. Contact Us</h2>
                <p>If you have any questions regarding this Privacy Policy, contact us at:</p>
                <p><strong>Email:</strong> support@flowreach.com</p>
                <footer>&copy; 2026 FlowReach Enterprise Platform. All rights reserved.</footer>
            </div>
        </body>
        </html>
    `);
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRouter);
app.use('/api/contacts',  contactsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/chats',     chatsRouter);
app.use('/api/admin',     adminRouter);

// ── Root-level /webhook  (Meta registers webhooks here, NOT under /api) ───────
// IMPORTANT: In your Meta App Dashboard → WhatsApp → Webhook, set:
//   Callback URL:  http://<your-server-ip>:3000/webhook
//   Verify token:  flowreach_verify_secret  (or whatever is in WEBHOOK_VERIFY_TOKEN)
app.use('/webhook', webhookRouter);

// Keep /api/webhook as alias for backward compatibility
app.use('/api/webhook', webhookRouter);

// ── HTTP + WebSocket Server ───────────────────────────────────────────────────
const server = http.createServer(app);

const wss = new ws.Server({ server });
global.wsClients = [];

wss.on('connection', (socket, req) => {
    const clientIp = req.socket.remoteAddress;
    global.wsClients.push(socket);
    console.log(`📡  [WS CONNECTED] ${clientIp} — Active clients: ${global.wsClients.length}`);

    // Send welcome message
    socket.send(JSON.stringify({
        type: 'system_welcome',
        message: "Connected to FlowReach real-time event server.",
        serverTime: new Date().toISOString()
    }));

    socket.on('close', (code, reason) => {
        global.wsClients = global.wsClients.filter(c => c !== socket);
        console.log(`📡  [WS CLOSED] ${clientIp} — Active clients: ${global.wsClients.length}`);
    });

    socket.on('error', (err) => {
        console.error(`⚠️   [WS ERROR] ${clientIp}:`, err.message);
        global.wsClients = global.wsClients.filter(c => c !== socket);
    });

    // Handle ping/pong for keepalive
    socket.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (msg.type === 'ping') {
                socket.send(JSON.stringify({ type: 'pong', time: Date.now() }));
            }
        } catch(e) { /* Ignore non-JSON messages */ }
    });
});

// Heartbeat to remove dead connections every 30 seconds
setInterval(() => {
    global.wsClients = global.wsClients.filter(client => {
        if (client.readyState !== ws.OPEN) {
            client.terminate();
            return false;
        }
        return true;
    });
}, 30000);

// ── Start server ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀  FlowReach Backend running on http://localhost:${PORT}`);
    console.log(`📡  WebSocket Server on      ws://localhost:${PORT}`);
    console.log(`🌐  Meta Webhook endpoint:   http://localhost:${PORT}/webhook`);
    console.log(`======================================================\n`);
});
