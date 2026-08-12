const db = require('./db');

async function run() {
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS campaign_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            campaign_id INT NOT NULL,
            phone VARCHAR(50) NOT NULL,
            status VARCHAR(20) DEFAULT 'Pending',
            message_id VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log('campaign_logs table created!');
        
        const desc = await db.query('DESCRIBE campaign_logs');
        console.log(JSON.stringify(desc.rows, null, 2));
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}

run();
