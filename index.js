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
            admin:     "/api/admin"
        }
    });
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
