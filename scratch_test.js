const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}/api`;

async function testAll() {
    try {
        // Helper to log responses
        const testRoute = async (name, url, method, body = null) => {
            console.log(`\n--- Test: ${name} ---`);
            const opt = {
                method,
                headers: { 'Content-Type': 'application/json' }
            };
            if (body) opt.body = JSON.stringify(body);
            
            const res = await fetch(url, opt);
            console.log("Status:", res.status);
            const text = await res.text();
            console.log("Response Body:", text.substring(0, 300));
            return res.ok;
        };

        await testRoute("1. Server Root", `http://localhost:${PORT}/`, "GET");
        await testRoute("2. Auth Connect", `${BASE_URL}/auth/connect`, "POST", {
            name: "Alpha Corp",
            whatsapp_phone_number_id: "12345",
            meta_access_token: "TEST_TOKEN",
            connected_phone: "+919988776655"
        });
        await testRoute("3. Auth Status", `${BASE_URL}/auth/status`, "GET");
        await testRoute("4. Contact Post", `${BASE_URL}/contacts`, "POST", {
            name: "Vijay Sethupathi",
            phone: "+919444488888"
        });
        await testRoute("5. Bulk Import", `${BASE_URL}/contacts/import`, "POST", {
            contacts: [
                { name: "John Wick", phone: "+15559991111" }
            ]
        });
        await testRoute("6. Contacts List", `${BASE_URL}/contacts?tag=VIP`, "GET");
        await testRoute("7. Save Template", `${BASE_URL}/templates`, "POST", {
            name: "autumn_sale_coupon",
            category: "MARKETING",
            language: "en",
            headerType: "TEXT",
            headerText: "Autumn Markdown!",
            body: "Hi {{1}}, Use code {{2}} to claim 30% off.",
            footer: "Marketing Desk",
            buttons: [{ type: "URL", text: "Shop Now", value: "https://shop.com" }]
        });
        await testRoute("8. Launch Campaign", `${BASE_URL}/campaigns/launch`, "POST", {
            name: "Diagnostics_Test_Campaign",
            templateName: "festival_promo_2026",
            audienceTag: "VIP"
        });
        await testRoute("9. Inbox Chats", `${BASE_URL}/chats`, "GET");

    } catch (e) {
        console.error("Test failed with error:", e);
    }
}

testAll();
