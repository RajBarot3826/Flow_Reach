const fs = require('fs');
let code = fs.readFileSync('db.js', 'utf8');

const replacement = let idCounters = { users: 1, businesses: 1, contacts: 1, pending_registrations: 1, templates: 4, campaigns: 1, chat_messages: 1, wallet_recharges: 1, api_configs: 1 };

const dbFile = './memory_db.json';
function loadMemoryDb() { 
    if(fs.existsSync(dbFile)){
        try { 
            const data = JSON.parse(fs.readFileSync(dbFile, 'utf8')); 
            global.memoryDb = data.memoryDb || global.memoryDb; 
            idCounters = data.idCounters || idCounters; 
            console.log('??  [DATABASE] Loaded persistent memory state from memory_db.json.');
        } catch(e) {}
    } 
}
function saveMemoryDb() { 
    fs.writeFileSync(dbFile, JSON.stringify({memoryDb: global.memoryDb, idCounters}, null, 2)); 
}
loadMemoryDb();;

code = code.replace('let idCounters = { users: 1, businesses: 1, contacts: 1, templates: 4, campaigns: 1, chat_messages: 1, wallet_recharges: 1, api_configs: 1 };', replacement);

const insertLogic = 
        else if (sqlLower.includes('into pending_registrations')) {
            const id = idCounters.pending_registrations++;
            const newRow = { id, user_id: params[0], phone_number_id: params[1], phone_number: params[2], cc: params[3] };
            global.memoryDb.pending_registrations = global.memoryDb.pending_registrations || [];
            global.memoryDb.pending_registrations.push(newRow);
            rows = [{ insertId: id, ...newRow }];
            saveMemoryDb();
        }
;

const selectLogic = 
        else if (sqlLower.includes('from pending_registrations')) {
            global.memoryDb.pending_registrations = global.memoryDb.pending_registrations || [];
            if (sqlLower.startsWith('delete')) {
                if (params.length > 0) {
                    const uId = parseInt(params[0]);
                    global.memoryDb.pending_registrations = global.memoryDb.pending_registrations.filter(r => r.user_id !== uId);
                    saveMemoryDb();
                }
            } else {
                rows = [...global.memoryDb.pending_registrations];
                if (params.length >= 2) {
                    const uId = parseInt(params[0]);
                    const phoneId = params[1];
                    rows = rows.filter(r => r.user_id === uId && r.phone_number_id === phoneId);
                }
            }
        }
;

code = code.replace(/rows = \[\{ affectedRows: 1 \}\];/g, 'rows = [{ affectedRows: 1 }]; saveMemoryDb();');
code = code.replace(/rows = \[\{ insertId: id, \.\.\.newRow \}\];/g, 'rows = [{ insertId: id, ...newRow }]; saveMemoryDb();');

code = code.replace("        else if (sqlLower.includes('into businesses')) {", insertLogic + "        else if (sqlLower.includes('into businesses')) {");
code = code.replace("        else if (sqlLower.includes('from businesses')) {", selectLogic + "        else if (sqlLower.includes('from businesses')) {");

fs.writeFileSync('db.js', code);
