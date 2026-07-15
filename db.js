// ================= FLOWREACH MYSQL DATABASE ENGINE & AUTO-MIGRATIONS =================

const mysql = require('mysql2/promise');
require('dotenv').config();

let dbConfig = null;
if (process.env.DATABASE_URL) {
    try {
        const url = require('url');
        const parsed = new url.URL(process.env.DATABASE_URL);
        dbConfig = {
            host: parsed.hostname,
            port: parsed.port ? parseInt(parsed.port) : 3306,
            user: parsed.username,
            password: decodeURIComponent(parsed.password),
            database: parsed.pathname ? parsed.pathname.replace('/', '') : 'test',
            ssl: { rejectUnauthorized: true } // Force SSL for TiDB
        };
    } catch(e) {
        dbConfig = process.env.DATABASE_URL;
    }
} else {
    dbConfig = {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_DATABASE || 'flowreach',
        ssl: { rejectUnauthorized: true }
    };
}

let pool = null;
global.useMemoryDb = false;

// Simulated Memory Database Arrays (MySQL-aligned values)
global.memoryDb = {
    users: [
        { id: 1, name: "TEST USER", email: "user@flowreach.com", phone: "+919988776655", password: "password", company: "FlowReach Enterprise Partner", role: "user", wallet_balance: 500.00 },
        { id: 2, name: "System Admin", email: "admin@flowreach.com", phone: "", password: "Admin@1234", company: "FlowReach HQ", role: "admin", wallet_balance: 0.00 }
    ],
    businesses: [],
    contacts: [
        { id: 1, name: "Raj Patel", phone: "+919876543210", var1: "FLOWREACH50", var2: "July 20", tag: "Customer" },
        { id: 2, name: "Amit Shah", phone: "+919123456789", var1: "SAVE10", var2: "July 25", tag: "Lead" },
        { id: 3, name: "Neha Sharma", phone: "+919000180002", var1: "GOLDVIP", var2: "Aug 01", tag: "VIP" }
    ],
    templates: [
        { id: 1, name: "hello_world", category: "UTILITY", language: "en_US", header_type: "TEXT", header_text: "Hello World", header_image_url: "", body: "Welcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test with us.", footer: "WhatsApp Business Platform sample message", buttons: "[]", status: "APPROVED" },
        { id: 2, name: "jaspers_market_order_confirmation_v1", category: "UTILITY", language: "en_US", header_type: "TEXT", header_text: "Order confirmed", header_image_url: "", body: "Hi {{1}},\n\nThank you for your purchase! Your order number is {{2}}.\n\nWe will start getting your farm fresh groceries ready to ship.\n\nEstimated delivery: {{3}}.\n\nWe will let you know when your order ships.", footer: "developers.facebook.com", buttons: JSON.stringify([{ type: 'URL', text: 'Visit order details', value: 'https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/utility-templates' }]), status: "APPROVED" },
        { id: 3, name: "jaspers_market_plain_text_v1", category: "MARKETING", language: "en_US", header_type: "NONE", header_text: "", header_image_url: "", body: "Welcome to Jaspers Market, your local grocery store providing farm-fresh produce and high-quality goods!", footer: "", buttons: "[]", status: "APPROVED" }
    ],
    campaigns: [],
    chat_messages: [],
    wallet_recharges: [],
    api_configs: []
};

// Auto-increment IDs counter for Memory DB
let idCounters = { users: 3, businesses: 1, contacts: 4, templates: 2, campaigns: 1, chat_messages: 1, wallet_recharges: 1, api_configs: 1 };

async function connectDatabase() {
    try {
        // Try direct connection to the database first (for hosted databases like InfinityFree)
        try {
            pool = mysql.createPool(dbConfig);
            const [rows] = await pool.query('SELECT 1');
            console.log(`\n🐬  [DATABASE SUCCESS] Connected to MySQL successfully!`);
            await runAutoMigrations();
            return;
        } catch (poolErr) {
            // Fallback: try creating the database (local XAMPP setup)
            // Skip this if we are connecting to a remote TiDB/AWS host to avoid root privileges errors
            if (dbConfig.host && dbConfig.host !== 'localhost' && dbConfig.host !== '127.0.0.1') {
                console.error("Remote DB connection error details:", poolErr.message);
                throw poolErr;
            }
            const tempConn = await mysql.createConnection({
                host: dbConfig.host,
                port: dbConfig.port,
                user: dbConfig.user,
                password: dbConfig.password
            });
            await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
            await tempConn.end();
            
            pool = mysql.createPool(dbConfig);
            await pool.query('SELECT 1');
            console.log(`\n🐬  [DATABASE SUCCESS] Connected to MySQL on ${dbConfig.host}:${dbConfig.port}`);
            await runAutoMigrations();
        }
    } catch (err) {
        console.warn("\n⚠️  [DATABASE WARNING] MySQL database connection failed! Check your credentials in server/.env.");
        console.warn("👉  Falling back to in-memory simulated database state for testing. Server remains fully operational.\n");
        global.useMemoryDb = true;
    }
}

// Auto-migrations runner (MySQL Dialect syntax)
async function runAutoMigrations() {
    try {
        // Attempt to create and use our own database to avoid permissions errors on default databases
        try {
            await pool.query('CREATE DATABASE IF NOT EXISTS flowreach');
            await pool.query('USE flowreach');
            console.log("🐬  [DATABASE] Switched to 'flowreach' database context.");
        } catch (dbErr) {
            console.log("⚠️  Could not create 'flowreach' database, continuing with default:", dbErr.message);
        }

        // 1. Create businesses table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS businesses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                whatsapp_phone_number_id VARCHAR(100),
                whatsapp_business_account_id VARCHAR(100),
                meta_access_token TEXT,
                connected_phone VARCHAR(50),
                plan VARCHAR(50) DEFAULT 'Professional',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Create contacts table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contacts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                business_id INT,
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                var1 VARCHAR(255),
                var2 VARCHAR(255),
                tag VARCHAR(50) DEFAULT 'Customer',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. Create templates table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS templates (
                id INT AUTO_INCREMENT PRIMARY KEY,
                business_id INT,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(50) DEFAULT 'MARKETING',
                language VARCHAR(10) DEFAULT 'en',
                header_type VARCHAR(20) DEFAULT 'NONE',
                header_text VARCHAR(255),
                header_image_url VARCHAR(512),
                body TEXT NOT NULL,
                footer TEXT,
                buttons JSON,
                status VARCHAR(50) DEFAULT 'PENDING',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 4. Create campaigns table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS campaigns (
                id INT AUTO_INCREMENT PRIMARY KEY,
                business_id INT,
                name VARCHAR(255) NOT NULL,
                template_name VARCHAR(255) NOT NULL,
                audience_tag VARCHAR(50) NOT NULL,
                scheduled_time VARCHAR(100) DEFAULT 'Send Now',
                sent INT DEFAULT 0,
                delivered INT DEFAULT 0,
                \`read\` INT DEFAULT 0,
                failed INT DEFAULT 0,
                status VARCHAR(50) DEFAULT 'Draft',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        try {
            await pool.query("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS user_id INT");
        } catch (err) {
            try {
                await pool.query("ALTER TABLE campaigns ADD COLUMN user_id INT");
            } catch (err2) {}
        }

        // 5. Create chat_messages table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                business_id INT,
                contact_phone VARCHAR(50) NOT NULL,
                sender VARCHAR(10) NOT NULL,
                text TEXT NOT NULL,
                time_str VARCHAR(20) NOT NULL,
                unread BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 6. Create users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                phone VARCHAR(50),
                password VARCHAR(255) NOT NULL,
                company VARCHAR(255),
                role VARCHAR(50) DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        try {
            await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user'");
        } catch (err) {
            try {
                await pool.query("ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user'");
            } catch (err2) {}
        }

        try {
            await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance DECIMAL(10, 2) DEFAULT 0.00");
        } catch (err) {
            try {
                await pool.query("ALTER TABLE users ADD COLUMN wallet_balance DECIMAL(10, 2) DEFAULT 0.00");
            } catch (err2) {}
        }

        // 7. Create wallet_recharges table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS wallet_recharges (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                payment_method VARCHAR(50) NOT NULL,
                status VARCHAR(20) DEFAULT 'Success',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 8. Create api_configs table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS api_configs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                api_name VARCHAR(255) NOT NULL,
                phone_number_id VARCHAR(100) NOT NULL,
                business_account_id VARCHAR(100),
                access_token TEXT NOT NULL,
                connected_phone VARCHAR(50) NOT NULL,
                description TEXT,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("🛠️  [DATABASE MIGRATIONS] Check finished. Tables verified successfully.\n");
        
        // Seed default templates if empty
        const [rows] = await pool.query("SELECT COUNT(*) as count FROM templates");
        if (parseInt(rows[0].count) === 0) {
            await pool.query(`
                INSERT INTO templates (name, category, language, header_type, header_text, body, footer, status)
                VALUES ('hello_world', 'UTILITY', 'en_US', 'TEXT', 'Hello World', 'Welcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test with us.', 'WhatsApp Business Platform sample message', 'APPROVED')
            `);
            await pool.query(`
                INSERT INTO templates (name, category, language, header_type, header_text, body, footer, status)
                VALUES ('jaspers_market_plain_text_v1', 'MARKETING', 'en_US', 'NONE', '', 'Welcome to Jaspers Market, your local grocery store providing farm-fresh produce and high-quality goods!', '', 'APPROVED')
            `);
            console.log("🌱  [DATABASE SEED] Default message templates populated.");
        }

        // Seed default user id: 1 if empty
        const [uCheck] = await pool.query("SELECT COUNT(*) as count FROM users WHERE id = 1");
        if (parseInt(uCheck[0].count) === 0) {
            await pool.query(`
                INSERT INTO users (id, name, email, phone, password, company, role, wallet_balance)
                VALUES (1, 'TEST USER', 'user@flowreach.com', '+919988776655', 'password', 'FlowReach Enterprise Partner', 'user', 500.00)
            `);
            console.log("🌱  [DATABASE SEED] Default test user ID 1 populated.");
        }

        // Seed Master Admin Account if empty
        const [adminCheck] = await pool.query("SELECT COUNT(*) as count FROM users WHERE email = 'admin@flowreach.com'");
        if (parseInt(adminCheck[0].count) === 0) {
            await pool.query(`
                INSERT INTO users (name, email, phone, password, company, role, wallet_balance)
                VALUES ('System Admin', 'admin@flowreach.com', '', 'Admin@1234', 'FlowReach HQ', 'admin', 0.00)
            `);
            console.log("🌱  [DATABASE SEED] Master Admin account (admin@flowreach.com) populated.");
        }

    } catch (e) {
        console.error("❌  [DATABASE MIGRATION ERROR] Auto schema setup failed:", e);
    }
}

// Unified Query Handler Interface (Encapsulates MySQL vs Memory DB, outputs PostgreSQL format rows: [...])
async function query(text, params = []) {
    if (!global.useMemoryDb) {
        const [rows] = await pool.query(text, params);
        // Normalize MySQL rows output array to match standard row structures
        return { rows: Array.isArray(rows) ? rows : (rows.affectedRows !== undefined ? [rows] : []) };
    }
    
    // Simulate MySQL query results on memory arrays using ? prepared markers
    const sql = text.trim().replace(/\s+/g, ' ');
    const sqlLower = sql.toLowerCase();
    
    let rows = [];
    
    // SELECT queries
    if (sqlLower.startsWith('select')) {
        if (sqlLower.includes('sum(amount)')) {
            const sumVal = global.memoryDb.wallet_recharges.reduce((s, r) => s + parseFloat(r.amount), 0.0);
            rows = [{ count: sumVal, sum: sumVal, total_recharges: sumVal }];
        }
        else if (sqlLower.includes('count(*) as count')) {
            let countVal = 0;
            if (sqlLower.includes('from users')) countVal = global.memoryDb.users.length;
            else if (sqlLower.includes('from campaigns')) countVal = global.memoryDb.campaigns.length;
            else if (sqlLower.includes('from templates')) countVal = global.memoryDb.templates.length;
            else if (sqlLower.includes('from businesses')) {
                countVal = global.memoryDb.businesses.filter(b => b.connected_phone).length;
            }
            rows = [{ count: countVal }];
        }
        else if (sqlLower.includes('from contacts')) {
            rows = [...global.memoryDb.contacts];
            if (sqlLower.includes('tag = ?') && params.length > 0) {
                const tagFilter = params[0];
                if (tagFilter && tagFilter !== 'all') {
                    rows = rows.filter(c => c.tag === tagFilter);
                }
            }
            if (sqlLower.includes('id = ?') && params.length > 0) {
                const searchId = parseInt(params[0]);
                rows = rows.filter(c => c.id === searchId);
            }
        } 
        else if (sqlLower.includes('from templates')) {
            rows = [...global.memoryDb.templates];
            if (sqlLower.includes("status = 'pending'")) {
                rows = rows.filter(t => t.status === 'PENDING');
            }
            if (sqlLower.includes('name = ?') && params.length > 0) {
                const tName = params[0];
                rows = rows.filter(t => t.name === tName);
            }
            if (sqlLower.includes('id = ?') && params.length > 0) {
                const tId = parseInt(params[0]);
                rows = rows.filter(t => t.id === tId);
            }
        } 
        else if (sqlLower.includes('from wallet_recharges')) {
            rows = [...global.memoryDb.wallet_recharges];
            if (sqlLower.includes('user_id = ?') && params.length > 0) {
                const uId = parseInt(params[0]);
                rows = rows.filter(r => r.user_id === uId);
            }
        } 
        else if (sqlLower.includes('from campaigns')) {
            rows = [...global.memoryDb.campaigns];
            if (sqlLower.includes('id = ?') && params.length > 0) {
                const cId = parseInt(params[0]);
                rows = rows.filter(c => c.id === cId);
            }
        } 
        else if (sqlLower.includes('from chat_messages')) {
            rows = [...global.memoryDb.chat_messages];
            if (sqlLower.includes('contact_phone = ?') && params.length > 0) {
                const phone = params[0];
                rows = rows.filter(m => m.contact_phone === phone);
            }
            if (sqlLower.includes('id = ?') && params.length > 0) {
                const mId = parseInt(params[0]);
                rows = rows.filter(m => m.id === mId);
            }
        }
        else if (sqlLower.includes('from businesses')) {
            rows = [...global.memoryDb.businesses];
        }
        else if (sqlLower.includes('from api_configs')) {
            rows = [...global.memoryDb.api_configs];
            if (sqlLower.includes('is_active = 1')) {
                rows = rows.filter(c => c.is_active === 1);
            }
            if (sqlLower.includes('id = ?') && params.length > 0) {
                const cfgId = parseInt(params[0]);
                rows = rows.filter(c => c.id === cfgId);
            }
        }
        else if (sqlLower.includes('from users')) {
            rows = [...global.memoryDb.users];
            if (sqlLower.includes('email = ? and password = ?') && params.length >= 2) {
                const uEmail = params[0];
                const uPass = params[1];
                rows = rows.filter(u => u.email === uEmail && u.password === uPass);
            } else if (sqlLower.includes('email = ?') && params.length > 0) {
                const uEmail = params[0];
                rows = rows.filter(u => u.email === uEmail);
            } else if (sqlLower.includes('id = ?') && params.length > 0) {
                const uId = parseInt(params[0]);
                rows = rows.filter(u => u.id === uId);
            }
        }
    } 
    // INSERT queries
    else if (sqlLower.startsWith('insert into')) {
        if (sqlLower.includes('into contacts')) {
            const id = idCounters.contacts++;
            const name = params[0] || '';
            const phone = params[1] || '';
            const var1 = params[2] || '';
            const var2 = params[3] || '';
            const tag = params[4] || 'Customer';
            
            const newRow = { id, name, phone, var1, var2, tag };
            global.memoryDb.contacts.push(newRow);
            rows = [{ insertId: id, ...newRow }]; // Emulate insertId returning property
        } 
        else if (sqlLower.includes('into templates')) {
            const id = idCounters.templates++;
            const name = params[0] || '';
            const category = params[1] || 'MARKETING';
            const language = params[2] || 'en';
            const header_type = params[3] || 'NONE';
            const header_text = params[4] || '';
            const header_image_url = params[5] || '';
            const body = params[6] || '';
            const footer = params[7] || '';
            const buttons = params[8] || '[]';
            const status = 'PENDING';
            
            const newRow = { id, name, category, language, header_type, header_text, header_image_url, body, footer, buttons, status };
            global.memoryDb.templates.push(newRow);
            rows = [{ insertId: id, ...newRow }];
        }
        else if (sqlLower.includes('into campaigns')) {
            const id = idCounters.campaigns++;
            const name = params[0] || '';
            const template_name = params[1] || '';
            const audience_tag = params[2] || '';
            const scheduled_time = params[3] || 'Send Now';
            const sentCount = parseInt(params[4] || '0');
            const status = params[5] || 'Draft';
            const user_id = parseInt(params[6] || '0');
            
            const newRow = { 
                id, 
                name, 
                template_name, 
                audience_tag, 
                scheduled_time, 
                status, 
                sent: sentCount, 
                delivered: 0, 
                read: 0, 
                failed: 0, 
                user_id,
                created_at: new Date().toISOString()
            };
            global.memoryDb.campaigns.push(newRow);
            rows = [{ insertId: id, ...newRow }];
        }
        else if (sqlLower.includes('into chat_messages')) {
            const id = idCounters.chat_messages++;
            const contact_phone = params[0] || '';
            const sender = params[1] || '';
            const textVal = params[2] || '';
            const time_str = params[3] || '';
            const unread = params[4] !== undefined ? params[4] : true;
            
            const newRow = { id, contact_phone, sender, text: textVal, time_str, unread };
            global.memoryDb.chat_messages.push(newRow);
            rows = [{ insertId: id, ...newRow }];
        }
        else if (sqlLower.includes('into businesses')) {
            const id = idCounters.businesses++;
            const name = params[0] || '';
            const whatsapp_phone_number_id = params[1] || '';
            const whatsapp_business_account_id = params[2] || '';
            const meta_access_token = params[3] || '';
            const connected_phone = params[4] || '';
            
            const newRow = { id, name, whatsapp_phone_number_id, whatsapp_business_account_id, meta_access_token, connected_phone };
            global.memoryDb.businesses.push(newRow);
            rows = [{ insertId: id, ...newRow }];
        }
        else if (sqlLower.includes('into users')) {
            const id = idCounters.users++;
            const name = params[0] || '';
            const email = params[1] || '';
            const phone = params[2] || '';
            const password = params[3] || '';
            const company = params[4] || '';
            const role = params[5] || 'user';
            
            const newRow = { id, name, email, phone, password, company, role, wallet_balance: 0.00 };
            global.memoryDb.users.push(newRow);
            rows = [{ insertId: id, ...newRow }];
        }
        else if (sqlLower.includes('into wallet_recharges')) {
            const id = idCounters.wallet_recharges++;
            const user_id = parseInt(params[0] || '0');
            const amount = parseFloat(params[1] || '0.00');
            const payment_method = params[2] || 'Card';
            const status = 'Success';
            
            const newRow = { id, user_id, amount, payment_method, status, created_at: new Date().toISOString() };
            global.memoryDb.wallet_recharges.push(newRow);
            rows = [{ insertId: id, ...newRow }];
        }
        else if (sqlLower.includes('into api_configs')) {
            const id = idCounters.api_configs++;
            const api_name             = params[0] || '';
            const phone_number_id      = params[1] || '';
            const business_account_id  = params[2] || '';
            const access_token         = params[3] || '';
            const connected_phone      = params[4] || '';
            const description          = params[5] || '';
            const is_active = 1;
            const newRow = { id, api_name, phone_number_id, business_account_id, access_token, connected_phone, description, is_active, created_at: new Date().toISOString() };
            global.memoryDb.api_configs.push(newRow);
            rows = [{ insertId: id, ...newRow }];
        }
    }
    // DELETE queries
    else if (sqlLower.startsWith('delete from')) {
        if (sqlLower.includes('from contacts')) {
            global.memoryDb.contacts = [];
        }
        else if (sqlLower.includes('from chat_messages')) {
            global.memoryDb.chat_messages = [];
        }
        else if (sqlLower.includes('from businesses')) {
            if (sqlLower.includes('whatsapp_phone_number_id = ?') && params.length > 0) {
                const phoneId = params[0];
                global.memoryDb.businesses = global.memoryDb.businesses.filter(b => b.whatsapp_phone_number_id !== phoneId);
            } else {
                global.memoryDb.businesses = [];
            }
        }
        else if (sqlLower.includes('from users')) {
            if (sqlLower.includes('id = ?') && params.length > 0) {
                const uId = parseInt(params[0]);
                global.memoryDb.users = global.memoryDb.users.filter(u => u.id !== uId);
            } else {
                global.memoryDb.users = [];
            }
        }
        else if (sqlLower.includes('from api_configs')) {
            if (sqlLower.includes('id = ?') && params.length > 0) {
                const cfgId = parseInt(params[0]);
                global.memoryDb.api_configs = global.memoryDb.api_configs.filter(c => c.id !== cfgId);
            } else {
                global.memoryDb.api_configs = [];
            }
        }
        rows = [{ affectedRows: 1 }];
    }
    // UPDATE queries
    else if (sqlLower.startsWith('update')) {
        if (sqlLower.includes('chat_messages')) {
            global.memoryDb.chat_messages.forEach(m => {
                if (m.contact_phone === params[0]) {
                    m.unread = false;
                }
            });
        }
        else if (sqlLower.includes('campaigns')) {
            const sent = params[0];
            const del = params[1];
            const rd = params[2];
            const fail = params[3];
            const cId = params[4];
            const cIdx = global.memoryDb.campaigns.findIndex(c => c.id === cId);
            if (cIdx !== -1) {
                global.memoryDb.campaigns[cIdx].sent = sent;
                global.memoryDb.campaigns[cIdx].delivered = del;
                global.memoryDb.campaigns[cIdx].read = rd;
                global.memoryDb.campaigns[cIdx].failed = fail;
                global.memoryDb.campaigns[cIdx].status = 'Completed';
            }
        }
        else if (sqlLower.includes('templates')) {
            if (sqlLower.includes('set status = ?') && params.length >= 2) {
                const newStatus = params[0];
                const tId = parseInt(params[1]);
                const tIdx = global.memoryDb.templates.findIndex(t => t.id === tId);
                if (tIdx !== -1) {
                    global.memoryDb.templates[tIdx].status = newStatus;
                }
            } else if (sqlLower.includes("status = 'approved'")) {
                global.memoryDb.templates.forEach(t => t.status = 'APPROVED');
            } else {
                const nameIdx = params.length - 1;
                const tName = params[nameIdx];
                const tIdx = global.memoryDb.templates.findIndex(t => t.name === tName);
                if (tIdx !== -1) {
                    global.memoryDb.templates[tIdx].status = 'PENDING';
                }
            }
        }
        else if (sqlLower.includes('users')) {
            if (sqlLower.includes('wallet_balance = wallet_balance +') && params.length >= 2) {
                const addVal = parseFloat(params[0]);
                const uId = parseInt(params[1]);
                const uIdx = global.memoryDb.users.findIndex(u => u.id === uId);
                if (uIdx !== -1) {
                    const currentBal = parseFloat(global.memoryDb.users[uIdx].wallet_balance || '0.00');
                    global.memoryDb.users[uIdx].wallet_balance = currentBal + addVal;
                }
            } else if (sqlLower.includes('wallet_balance = wallet_balance -') && params.length >= 2) {
                const subVal = parseFloat(params[0]);
                const uId = parseInt(params[1]);
                const uIdx = global.memoryDb.users.findIndex(u => u.id === uId);
                if (uIdx !== -1) {
                    const currentBal = parseFloat(global.memoryDb.users[uIdx].wallet_balance || '0.00');
                    global.memoryDb.users[uIdx].wallet_balance = Math.max(0.00, currentBal - subVal);
                }
            } else if (sqlLower.includes('wallet_balance = ?') && params.length >= 2) {
                const newVal = parseFloat(params[0]);
                const uId = parseInt(params[1]);
                const uIdx = global.memoryDb.users.findIndex(u => u.id === uId);
                if (uIdx !== -1) {
                    global.memoryDb.users[uIdx].wallet_balance = newVal;
                }
            }
        }
        rows = [{ affectedRows: 1 }];
    }

    return Promise.resolve({ rows });
}

// Bootstrap connection pool
connectDatabase();

module.exports = {
    query
};
