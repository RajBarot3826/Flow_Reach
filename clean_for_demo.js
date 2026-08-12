const db = require('./db');

async function clean() {
    try {
        console.log('Cleaning database for fresh client demo...');
        
        // Delete test user (keep user ID 1 = Raj and admin)
        await db.query("DELETE FROM users WHERE email = 'testclient@demo.com'");
        console.log('✅ Removed test user');
        
        // Clear all contacts
        await db.query("DELETE FROM contacts");
        console.log('✅ Cleared contacts');
        
        // Clear all campaigns
        await db.query("DELETE FROM campaigns");
        console.log('✅ Cleared campaigns');
        
        // Clear campaign logs
        await db.query("DELETE FROM campaign_logs");
        console.log('✅ Cleared campaign logs');
        
        // Clear chat messages
        await db.query("DELETE FROM chat_messages");
        console.log('✅ Cleared chat messages');
        
        // Clear businesses (embedded signup records)
        await db.query("DELETE FROM businesses");
        console.log('✅ Cleared businesses');
        
        // Clear wallet recharges
        await db.query("DELETE FROM wallet_recharges");
        console.log('✅ Cleared wallet recharges');
        
        // Reset Raj's wallet to 9999999
        await db.query("UPDATE users SET wallet_balance = 9999999.00 WHERE id = 1");
        console.log('✅ Reset wallet balance');
        
        // Verify final state
        const users = await db.query("SELECT id, name, email, wallet_balance FROM users");
        console.log('\n--- Final Users ---');
        console.log(JSON.stringify(users.rows, null, 2));
        
        const templates = await db.query("SELECT id, name, status FROM templates");
        console.log('\n--- Templates ---');
        console.log(JSON.stringify(templates.rows, null, 2));
        
        console.log('\n✅ Database cleaned and ready for client demo!');
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}

clean();
