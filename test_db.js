const mysql = require('mysql2/promise');
async function test() {
    try {
        const pool = mysql.createPool({
            host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
            port: 4000,
            user: '3aT3hShHw3LYSg9.root',
            password: '5F31YmfBTMixeI5q',
            database: 'test',
            ssl: {
                rejectUnauthorized: true
            }
        });
        await pool.query('SELECT 1');
        console.log("SUCCESS");
        process.exit(0);
    } catch(e) {
        console.error("ERROR MESSAGE:", e.message);
        console.error("ERROR CODE:", e.code);
        process.exit(1);
    }
}
test();
