// ================= FLOWREACH CONTACTS ROUTES (DATABASE MANAGER - MYSQL) =================

const express = require('express');
const router = express.Router();
const db = require('../db');

// GET Contacts List (Supports filters: tag, search)
router.get('/', async (req, res) => {
    const { tag, search } = req.query;
    const userId = req.headers['x-user-id'] || 1;
    
    try {
        let q = "SELECT * FROM contacts WHERE user_id = ?";
        let params = [userId];
        let conditions = [];
        
        if (tag && tag !== 'all') {
            conditions.push(`tag = ?`);
            params.push(tag);
        }
        
        if (search) {
            conditions.push(`(name LIKE ? OR phone LIKE ?)`);
            params.push(`%${search}%`);
            params.push(`%${search}%`);
        }
        
        if (conditions.length > 0) {
            q += " AND " + conditions.join(" AND ");
        }
        
        q += " ORDER BY id DESC";
        
        const result = await db.query(q, params);
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to fetch contact database." });
    }
});

// POST Add Single Contact
router.post('/', async (req, res) => {
    const { name, phone, var1, var2, tag } = req.body;
    const userId = req.headers['x-user-id'] || 1;
    
    if (!name || !phone) {
        return res.status(400).json({ error: "Name and Phone number are required." });
    }
    
    try {
        const q = `
            INSERT INTO contacts (user_id, name, phone, var1, var2, tag)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const result = await db.query(q, [userId, name, phone, var1 || '', var2 || '', tag || 'Customer']);
        
        const insertId = result.rows[0].insertId;
        const selectResult = await db.query("SELECT * FROM contacts WHERE id = ?", [insertId]);
        res.status(201).json(selectResult.rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to save contact." });
    }
});

// POST Bulk Import Contacts (Array upload from sheet)
router.post('/import', async (req, res) => {
    const { contacts } = req.body;
    const userId = req.headers['x-user-id'] || 1;
    
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: "Invalid contacts list payload." });
    }
    
    try {
        let count = 0;
        for (const c of contacts) {
            if (!c.phone) continue;
            
            const q = `
                INSERT INTO contacts (user_id, name, phone, var1, var2, tag)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            await db.query(q, [
                userId,
                c.name || 'Unknown',
                c.phone,
                c.var1 || '',
                c.var2 || '',
                c.tag || 'Customer'
            ]);
            count++;
        }
        
        res.status(201).json({
            success: true,
            count: count,
            message: `Successfully imported ${count} contacts.`
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Bulk contact import failed." });
    }
});

// DELETE Contact by ID
router.delete('/:id', async (req, res) => {
    const userId = req.headers['x-user-id'] || 1;
    const contactId = req.params.id;
    try {
        await db.query('DELETE FROM contacts WHERE id = ? AND user_id = ?', [contactId, userId]);
        res.json({ success: true, message: 'Contact deleted.' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to delete contact.' });
    }
});

// DELETE Clear Database
router.delete('/clear', async (req, res) => {
    try {
        await db.query("DELETE FROM contacts");
        res.json({ success: true, message: "Contacts database cleared successfully." });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to clear database." });
    }
});

module.exports = router;
