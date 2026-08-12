const db = require('./db.js');

async function clearUsers() {
    try {
        await db.query("DELETE FROM users");
        await db.query("DELETE FROM businesses");
        await db.query("DELETE FROM contacts");
        await db.query("DELETE FROM campaigns");
        await db.query("DELETE FROM api_configs");
        await db.query("DELETE FROM pending_registrations");
        
        console.log("All users and their details have been removed.");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

clearUsers();
