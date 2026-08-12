const mysql = require('mysql2/promise');
require('dotenv').config();

async function clean() {
    console.log("Connecting to Database...");
    const pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: true }
    });

    const tables = ['users', 'businesses', 'contacts', 'campaigns', 'templates', 'wallet_recharges'];
    
    for (const t of tables) {
        try {
            await pool.query('TRUNCATE TABLE ' + t);
            console.log('✅ Cleaned ' + t);
        } catch (e) {
            console.log('⚠️  Skip ' + t + ' - ' + e.message);
        }
    }
    
    console.log("Database perfectly cleaned!");
    process.exit(0);
}
clean();
