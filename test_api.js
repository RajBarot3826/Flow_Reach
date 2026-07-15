// ================= FLOWREACH API VERIFICATION SUITE =================

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}/api`;

async function runDiagnostics() {
    console.log("⚡  Starting FlowReach Backend API Diagnostics Verification...\n");
    let passed = 0;
    let failed = 0;
    
    const assert = (condition, successMsg, failMsg) => {
        if (condition) {
            passed++;
            console.log(`✅  [PASS] ${successMsg}`);
        } else {
            failed++;
            console.error(`❌  [FAIL] ${failMsg}`);
        }
    };
    
    try {
        // 1. Test Server Root
        const rootRes = await fetch(`http://localhost:${PORT}/`);
        const rootData = await rootRes.json();
        assert(rootRes.ok && rootData.status === "Active", "Server active handshake check passed.", "Server root check failed.");
        
        // 2. Test Device Link (Auth Connect)
        const connectRes = await fetch(`${BASE_URL}/auth/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: "Alpha Corporation",
                whatsapp_phone_number_id: "1029384756",
                whatsapp_business_account_id: "987654321",
                meta_access_token: "EAAG_TEST_TOKEN_12345",
                connected_phone: "+91 9988776655"
            })
        });
        const connectData = await connectRes.json();
        assert(connectRes.ok && connectData.success === true, "Auth connection payload save passed.", "Auth connect failed.");
        
        // 3. Test Device Pairing Status
        const statusRes = await fetch(`${BASE_URL}/auth/status`);
        const statusData = await statusRes.json();
        assert(statusRes.ok && statusData.connected === true && statusData.phone === "+91 9988776655", "Auth status state verification passed.", "Auth status verify failed.");
        
        // 4. Test Single Contact Insertion
        const contactRes = await fetch(`${BASE_URL}/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: "Vijay Sethupathi",
                phone: "+91 94444 88888",
                var1: "COUPON30",
                var2: "July 24",
                tag: "VIP"
            })
        });
        const contactData = await contactRes.json();
        assert(contactRes.ok && contactData.name === "Vijay Sethupathi", "Contact creation endpoint passed.", "Contact post failed.");
        
        // 5. Test Bulk Importer
        const importRes = await fetch(`${BASE_URL}/contacts/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contacts: [
                    { name: "John Wick", phone: "+1 555 999 1111", var1: "PENCIL", var2: "Aug 10", tag: "Customer" },
                    { name: "Sherlock Holmes", phone: "+44 20 7224 3688", var1: "ELEMENTARY", var2: "Tomorrow", tag: "Lead" }
                ]
            })
        });
        const importData = await importRes.json();
        assert(importRes.ok && importData.count === 2, "Bulk contacts import sheet parser endpoint passed.", "Bulk import failed.");
        
        // 6. Test Fetch Contacts List
        const fetchContactsRes = await fetch(`${BASE_URL}/contacts?tag=VIP`);
        const fetchContactsData = await fetchContactsRes.json();
        assert(fetchContactsRes.ok && Array.isArray(fetchContactsData), "Contacts lists filtering & query search parameters passed.", "Contacts fetch failed.");
        
        // 7. Test Save Templates Design
        const templateRes = await fetch(`${BASE_URL}/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: "autumn_sale_coupon",
                category: "MARKETING",
                language: "en",
                headerType: "TEXT",
                headerText: "Autumn Markdown!",
                body: "Hi {{1}},\n\nUse code {{2}} to claim 30% off.",
                footer: "Marketing Desk",
                buttons: [{ type: "URL", text: "Shop Now", value: "https://shop.com" }]
            })
        });
        const templateData = await templateRes.json();
        assert(templateRes.ok && templateData.name === "autumn_sale_coupon", "Templates layout validations and save passed.", "Template post failed.");
        
        // 8. Test Campaign Wizard Launch
        const launchRes = await fetch(`${BASE_URL}/campaigns/launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: "Diagnostics_Test_Campaign",
                templateName: "festival_promo_2026",
                audienceTag: "VIP"
            })
        });
        const launchData = await launchRes.json();
        assert(launchRes.ok && launchData.success === true, "Campaign wizard launch & simulation dispatcher trigger passed.", "Campaign launch failed.");
        
        // 9. Test Live Inbox Chats Transcript
        const chatsRes = await fetch(`${BASE_URL}/chats`);
        const chatsData = await chatsRes.json();
        assert(chatsRes.ok && Array.isArray(chatsData), "Live chat conversations mapping lists passed.", "Chats history fetch failed.");
        
        // Final Summary
        console.log(`\n======================================================`);
        console.log(`🏁  DIAGNOSTICS SUMMARY: Passed ${passed}/${passed + failed} assertions.`);
        console.log(`======================================================\n`);
        
        if (failed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
        
    } catch (e) {
        console.error("❌  [FATAL SERVICE ERROR] Diagnostics aborted due to server connection failures:", e.message);
        console.error("💡  Make sure to run 'npm install' and 'npm start' before starting verification checks.");
        process.exit(1);
    }
}

runDiagnostics();
