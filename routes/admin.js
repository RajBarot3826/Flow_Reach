// ================= FLOWREACH PLATFORM ADMINISTRATION SERVICE ROUTER =================

const express = require('express');
const router = express.Router();
const db = require('../db');

// Role-based Access Control (RBAC) middleware for Admin-only routes
function verifyAdminRole(req, res, next) {
    const role = req.headers['x-user-role'];
    if (role !== 'admin') {
        return res.status(403).json({ error: "Access Denied: Admin privileges required." });
    }
    next();
}

router.use(verifyAdminRole);

// GET /api/admin/stats - Retrieve system-wide statistics
router.get('/stats', async (req, res) => {
    try {
        const usersCountRes = await db.query("SELECT COUNT(*) as count FROM users");
        const campaignsCountRes = await db.query("SELECT COUNT(*) as count FROM campaigns");
        const templatesCountRes = await db.query("SELECT COUNT(*) as count FROM templates");
        const activeConnectionsRes = await db.query("SELECT COUNT(*) as count FROM businesses WHERE connected_phone IS NOT NULL");
        
        // Sum total campaigns sent messages
        const sentCountRes = await db.query("SELECT SUM(sent) as total_sent FROM campaigns");
        // Sum total platform recharges
        const rechargesSumRes = await db.query("SELECT SUM(amount) as total_recharges FROM wallet_recharges");
        
        const totalUsers = parseInt(usersCountRes.rows[0]?.count || '0');
        const totalCampaigns = parseInt(campaignsCountRes.rows[0]?.count || '0');
        const totalTemplates = parseInt(templatesCountRes.rows[0]?.count || '0');
        const activeConnCount = parseInt(activeConnectionsRes.rows[0]?.count || '0');
        
        const totalSent = parseInt(sentCountRes.rows[0]?.total_sent || '0');
        const totalRecharges = parseFloat(rechargesSumRes.rows[0]?.total_recharges || '0');
        
        const baseRate = parseFloat(process.env.BILLING_RATE_PER_MSG || '1.00');
        const userRate = baseRate * 1.30;
        const metaRate = baseRate;
        const platformRevenue = totalSent * userRate;
        const metaCostBill = totalSent * metaRate;
        const adminNetProfit = totalSent * (userRate - metaRate);
        
        res.json({
            success: true,
            stats: {
                users: totalUsers,
                campaigns: totalCampaigns,
                templates: totalTemplates,
                active_connections: activeConnCount,
                database_mode: global.useMemoryDb ? "Simulated (Memory DB)" : "Real MySQL Engine",
                total_sent: totalSent,
                total_recharges: totalRecharges,
                platform_revenue: platformRevenue,
                meta_cost_bill: metaCostBill,
                admin_net_profit: adminNetProfit
            }
        });
    } catch (e) {
        console.error("Admin stats fetch error:", e);
        res.status(500).json({ error: "Failed to load admin stats." });
    }
});

// GET /api/admin/users - Retrieve all registered users
router.get('/users', async (req, res) => {
    try {
        const queryStr = `
            SELECT u.id, u.name, u.email, u.phone, u.company, u.role, u.wallet_balance, u.created_at,
                   b.connected_phone, b.whatsapp_phone_number_id, b.whatsapp_business_account_id
            FROM users u
            LEFT JOIN businesses b ON u.id = b.user_id
            ORDER BY u.id DESC
        `;
        const result = await db.query(queryStr);
        res.json({ success: true, users: result.rows });
    } catch (e) {
        console.error("Admin users list fetch error:", e);
        res.status(500).json({ error: "Failed to retrieve user list." });
    }
});

// POST /api/admin/users/delete - Delete a user profile
router.post('/users/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "User ID is required." });
    
    try {
        await db.query("DELETE FROM users WHERE id = ?", [id]);
        res.json({ success: true, message: "User deleted successfully from platform." });
    } catch (e) {
        console.error("Admin user delete error:", e);
        res.status(500).json({ error: "Failed to delete user." });
    }
});

// POST /api/admin/users/adjust-balance - Adjust a user's wallet balance directly
router.post('/users/adjust-balance', async (req, res) => {
    const { id, amount } = req.body;
    if (!id || amount === undefined) {
        return res.status(400).json({ error: "User ID and amount are required." });
    }
    
    try {
        await db.query("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?", [parseFloat(amount), id]);
        
        // Fetch updated user to return latest values
        const userRes = await db.query("SELECT id, name, wallet_balance FROM users WHERE id = ?", [id]);
        res.json({
            success: true,
            message: `Adjusted user balance successfully.`,
            user: userRes.rows[0]
        });
    } catch (e) {
        console.error("Adjust wallet error:", e);
        res.status(500).json({ error: "Failed to adjust user wallet balance." });
    }
});

// POST /api/admin/verify-pin - Security Gate access verification
router.post('/verify-pin', async (req, res) => {
    const { pin } = req.body;
    // Default security pin is '8888'
    if (pin === '8888') {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: "Incorrect Security PIN. Access denied." });
    }
});

// GET /api/admin/templates/pending - Retrieve templates pending review/approval
router.get('/templates/pending', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM templates WHERE status = 'PENDING' ORDER BY id DESC");
        res.json({ success: true, templates: result.rows });
    } catch (e) {
        console.error("Admin pending templates fetch error:", e);
        res.status(500).json({ error: "Failed to fetch pending templates." });
    }
});

// POST /api/admin/templates/approve - Approve or Reject a custom template
router.post('/templates/approve', async (req, res) => {
    const { id, status } = req.body;
    if (!id || !status) return res.status(400).json({ error: "Template ID and Target Status are required." });
    
    try {
        await db.query("UPDATE templates SET status = ? WHERE id = ?", [status, id]);
        res.json({ success: true, message: `Template status updated to ${status}.` });
    } catch (e) {
        console.error("Admin template approval error:", e);
        res.status(500).json({ error: "Failed to update template status." });
    }
});

// GET /api/admin/api-configs - list all API configuration profiles
router.get('/api-configs', async (req, res) => {
    try {
        const result = await db.query("SELECT id, api_name, phone_number_id, business_account_id, connected_phone, description, is_active, created_at FROM api_configs ORDER BY id DESC");
        res.json({ success: true, configs: result.rows });
    } catch (e) {
        console.error("Admin api-configs fetch error:", e);
        res.status(500).json({ error: "Failed to fetch API configs." });
    }
});

// POST /api/admin/api-configs - create a new API configuration profile
router.post('/api-configs', async (req, res) => {
    const { api_name, phone_number_id, business_account_id, access_token, connected_phone, description } = req.body;
    if (!api_name || !phone_number_id || !access_token || !connected_phone) {
        return res.status(400).json({ error: "api_name, phone_number_id, access_token, connected_phone are required." });
    }
    try {
        await db.query(
            "INSERT INTO api_configs (api_name, phone_number_id, business_account_id, access_token, connected_phone, description) VALUES (?,?,?,?,?,?)",
            [api_name, phone_number_id, business_account_id || '', access_token, connected_phone, description || '']
        );
        res.status(201).json({ success: true, message: "API profile saved successfully." });
    } catch (e) {
        console.error("Admin api-config create error:", e);
        res.status(500).json({ error: "Failed to save API config." });
    }
});

// POST /api/admin/api-configs/delete - delete an API configuration profile
router.post('/api-configs/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "ID is required." });
    try {
        await db.query("DELETE FROM api_configs WHERE id = ?", [id]);
        res.json({ success: true, message: "API profile deleted." });
    } catch (e) {
        console.error("Admin api-config delete error:", e);
        res.status(500).json({ error: "Failed to delete API config." });
    }
});

module.exports = router;
