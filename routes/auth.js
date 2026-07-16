// ================= FLOWREACH AUTH ROUTES (CREDENTIALS LINKING - MYSQL) =================

const express = require('express');
const router = express.Router();
const db = require('../db');

// GET Connection Status
router.get('/status', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'] || req.query.userId || 1;
        
        // 1. Check if user has custom credentials in DB
        const result = await db.query("SELECT * FROM businesses WHERE user_id = ? ORDER BY id ASC", [userId]);
        if (result.rows.length > 0) {
            const devices = result.rows.map(biz => ({
                id: biz.id,
                name: biz.name || "Private WhatsApp Cloud API",
                phone: biz.connected_phone,
                whatsapp_phone_number_id: biz.whatsapp_phone_number_id,
                whatsapp_business_account_id: biz.whatsapp_business_account_id,
                meta_access_token: biz.meta_access_token,
                plan: biz.plan || 'Professional',
                is_private: true
            }));
            
            return res.json({
                connected: true,
                phone: devices[0].phone,
                whatsapp_phone_number_id: devices[0].whatsapp_phone_number_id,
                whatsapp_business_account_id: devices[0].whatsapp_business_account_id,
                meta_access_token: devices[0].meta_access_token,
                plan: devices[0].plan,
                is_private: true,
                devices: devices
            });
        }

        // 2. Fallback to server-side system-wide environment credentials
        const phoneId = process.env.META_PHONE_NUMBER_ID;
        const token = process.env.META_ACCESS_TOKEN;
        const wabaId = process.env.META_BUSINESS_ACCOUNT_ID || process.env.META_WABA_ID || '';
        
        const connected = !!(phoneId && token && token !== 'your_system_user_token_here');
        
        if (connected) {
            const devices = [{
                id: 1,
                name: "Company WhatsApp Business",
                phone: process.env.CONNECTED_PHONE || "Meta Verified API",
                whatsapp_phone_number_id: phoneId,
                whatsapp_business_account_id: wabaId,
                meta_access_token: token,
                plan: 'Enterprise',
                is_private: false
            }];
            
            return res.json({
                connected: true,
                phone: devices[0].phone,
                whatsapp_phone_number_id: devices[0].whatsapp_phone_number_id,
                whatsapp_business_account_id: devices[0].whatsapp_business_account_id,
                meta_access_token: devices[0].meta_access_token,
                plan: devices[0].plan,
                is_private: false,
                devices: devices
            });
        }
        
        return res.json({ connected: false, devices: [] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to read device pairing status." });
    }
});

// POST Link Credentials
router.post('/connect', async (req, res) => {
    const { name, whatsapp_phone_number_id, whatsapp_business_account_id, meta_access_token, connected_phone } = req.body;
    const userId = req.headers['x-user-id'] || 1;
    
    if (!whatsapp_phone_number_id || !meta_access_token || !connected_phone) {
        return res.status(400).json({ error: "Missing required fields (Phone ID, Token, Phone)." });
    }
    
    try {
        // Clear any duplicate credentials for the same user ID to update it
        await db.query("DELETE FROM businesses WHERE user_id = ?", [userId]);
        
        const q = `
            INSERT INTO businesses (name, whatsapp_phone_number_id, whatsapp_business_account_id, meta_access_token, connected_phone, user_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await db.query(q, [
            name || "Private WhatsApp Cloud API",
            whatsapp_phone_number_id,
            whatsapp_business_account_id || "",
            meta_access_token,
            connected_phone,
            userId
        ]);
        
        // Fetch devices list for verification
        const selectResult = await db.query("SELECT * FROM businesses WHERE user_id = ?", [userId]);
        const biz = selectResult.rows[0];
        
        res.status(201).json({
            success: true,
            message: "WhatsApp Business credentials linked successfully.",
            device: {
                connected: true,
                phone: biz.connected_phone,
                whatsapp_phone_number_id: biz.whatsapp_phone_number_id
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to connect WhatsApp account." });
    }
});

// POST Disconnect Phone
router.post('/disconnect', async (req, res) => {
    const userId = req.headers['x-user-id'] || 1;
    try {
        await db.query("DELETE FROM businesses WHERE user_id = ?", [userId]);
        res.json({ success: true, message: "WhatsApp device disconnected." });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to disconnect device." });
    }
});

// POST Register User
router.post('/register', async (req, res) => {
    const { name, email, phone, password, company } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email and password are required for registration." });
    }
    
    try {
        // Check if email already exists
        const checkQ = "SELECT * FROM users WHERE email = ?";
        const checkRes = await db.query(checkQ, [email]);
        if (checkRes.rows.length > 0) {
            return res.status(400).json({ error: "Email is already registered. Please log in instead." });
        }
        
        // Determine user role dynamically based on email
        const role = (email.toLowerCase() === 'admin@flowreach.com' || email.toLowerCase().includes('admin')) ? 'admin' : 'user';
        
        // Save user to DB (plain text password for simple setup/testing as this is a local showcase demo; in production you would hash)
        const insertQ = `
            INSERT INTO users (name, email, phone, password, company, role)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const result = await db.query(insertQ, [
            name,
            email,
            phone || "",
            password,
            company || "",
            role
        ]);
        
        const insertId = result.rows[0].insertId;
        const selectResult = await db.query("SELECT id, name, email, company, role FROM users WHERE id = ?", [insertId]);
        const newUser = selectResult.rows[0];
        
        res.status(201).json({
            success: true,
            message: "User registered successfully.",
            user: newUser
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Registration failed. Database error." });
    }
});

// POST Login User
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required for login." });
    }
    
    try {
        const checkQ = "SELECT * FROM users WHERE email = ? AND password = ?";
        const checkRes = await db.query(checkQ, [email, password]);
        if (checkRes.rows.length === 0) {
            return res.status(401).json({ error: "Invalid email or password." });
        }
        
        const user = checkRes.rows[0];
        res.json({
            success: true,
            message: "Logged in successfully.",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                company: user.company,
                role: user.role || 'user'
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Login failed. Database error." });
    }
});

// GET /api/auth/wallet - Retrieve wallet balance and invoices/recharges
router.get('/wallet', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(400).json({ error: "User ID header is required." });
    
    try {
        const userRes = await db.query("SELECT id, name, email, company, wallet_balance FROM users WHERE id = ?", [userId]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: "User not found." });
        }
        const user = userRes.rows[0];
        
        const rechargesRes = await db.query("SELECT * FROM wallet_recharges WHERE user_id = ? ORDER BY id DESC", [userId]);
        const campaignsRes = await db.query("SELECT * FROM campaigns WHERE user_id = ? ORDER BY id DESC", [userId]);
        
        res.json({
            success: true,
            wallet_balance: parseFloat(user.wallet_balance || '0.00'),
            recharges: rechargesRes.rows,
            campaigns: campaignsRes.rows
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to fetch wallet info." });
    }
});

// POST /api/auth/recharge - Process wallet recharge
router.post('/recharge', async (req, res) => {
    const { amount, paymentMethod } = req.body;
    const userId = req.headers['x-user-id'];
    
    if (!userId || !amount) {
        return res.status(400).json({ error: "User ID and recharge amount are required." });
    }
    
    try {
        // 1. Add amount to users wallet
        const amtVal = parseFloat(amount);
        await db.query("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?", [amtVal, userId]);
        
        // 2. Create recharge transaction entry
        const method = paymentMethod || 'Visa Card ending *4829';
        const rechargeQ = `
            INSERT INTO wallet_recharges (user_id, amount, payment_method)
            VALUES (?, ?, ?)
        `;
        const result = await db.query(rechargeQ, [userId, amtVal, method]);
        const insertId = result.rows[0].insertId;
        
        // 3. Fetch latest user wallet details
        const userRes = await db.query("SELECT id, name, email, company, wallet_balance FROM users WHERE id = ?", [userId]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: "User profile not found for recharge association." });
        }
        const user = userRes.rows[0];
        
        res.json({
            success: true,
            message: `Successfully recharged wallet with Rs. ${amtVal}.`,
            wallet_balance: parseFloat(user.wallet_balance || '0.00'),
            invoice: {
                id: insertId,
                amount: amtVal,
                payment_method: method,
                company: user.company || 'Personal Account',
                user_name: user.name,
                user_email: user.email,
                date: new Date().toLocaleDateString()
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Recharge failed. Database error." });
    }
});

// GET /api/auth/api-configs - list active API configs for user selection (public)
router.get('/api-configs', async (req, res) => {
    try {
        const result = await db.query("SELECT id, api_name, phone_number_id, business_account_id, connected_phone, description FROM api_configs WHERE is_active = 1 ORDER BY id DESC");
        res.json({ success: true, configs: result.rows });
    } catch (e) {
        console.error("User api-configs fetch error:", e);
        res.status(500).json({ error: "Failed to fetch available API configs." });
    }
});

// GET /api/auth/meta-status → Check if server-side Meta credentials are configured
router.get('/meta-status', (req, res) => {
    const phoneId = process.env.META_PHONE_NUMBER_ID;
    const token = process.env.META_ACCESS_TOKEN;
    const connected = !!(phoneId && token && token !== 'your_system_user_token_here');
    res.json({
        connected,
        phone_number_id: connected ? phoneId.substring(0, 4) + '****' : null,
        platform: 'WhatsApp Business Cloud API',
        message: connected ? 'Server-side Meta credentials are active.' : 'No Meta credentials configured on server.'
    });
});

module.exports = router;
