import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ============ ENV ============
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ============ STATE ============
const bookings = {};
const processedMessages = new Set(); // 🔒 deduplication

// ============ VERIFY ============
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ============ WEBHOOK ============
app.post("/webhook", async (req, res) => {
  const value = req.body.entry?.[0]?.changes?.[0]?.value;

  // ❌ Ignore delivery / read / status events
  if (!value?.messages) {
    return res.sendStatus(200);
  }

  const msg = value.messages[0];
  const from = msg.from;

  // ❌ Ignore duplicate message IDs
  const messageId = msg.id;
  if (processedMessages.has(messageId)) {
    return res.sendStatus(200);
  }
  processedMessages.add(messageId);
  setTimeout(() => processedMessages.delete(messageId), 5 * 60 * 1000);

  // ===== ACTION =====
  let action =
    msg.interactive?.list_reply?.id ||
    msg.interactive?.button_reply?.id ||
    msg.text?.body;

  if (action) {
    action = action.toString().trim().toUpperCase();
  }

  console.log("User action:", action);

  try {
    /* ===== MAIN MENU ===== */
    if (action === "HI" || action === "MENU") {
      await sendMainMenu(from);
      return res.sendStatus(200);
    }

    /* ===== PRICING ===== */
    if (action === "PRICING") {
      await sendPricingMenu(from);
      return res.sendStatus(200);
    }

    /* ===== AC MENU ===== */
    if (action === "AC_MENU") {
      await sendACServices(from);
      return res.sendStatus(200);
    }

    /* ===== SOLAR MENU ===== */
    if (action === "SOLAR_MENU") {
      await sendSolarServices(from);
      return res.sendStatus(200);
    }

    /* ===== SERVICE SELECT ===== */
    if (action?.startsWith("SERVICE_")) {
      bookings[from] = {
        service: action.replace("SERVICE_", "").replace(/_/g, " "),
        step: "date",
      };

      await sendMessage(
        from,
        "📅 Please type your *preferred date*\n(e.g. 5 March 2026)"
      );
      return res.sendStatus(200);
    }

    /* ===== DATE ===== */
    if (bookings[from]?.step === "date") {
      bookings[from].date = action;
      bookings[from].step = "location";

      await sendMessage(
        from,
        "📍 Please type your *complete address*\n(Area, City)"
      );
      return res.sendStatus(200);
    }

    /* ===== LOCATION ===== */
    if (bookings[from]?.step === "location") {
      const { service, date } = bookings[from];
      delete bookings[from];

      await sendMessage(
        from,
        `✅ *Booking Confirmed*

🛠 Service: ${service}
📅 Date: ${date}
📍 Location: ${action}

Our team will contact you shortly 💚
*Kaam Set Hai!*`
      );
      return res.sendStatus(200);
    }

    await sendMessage(from, "❓ Type *menu* to continue");
    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    return res.sendStatus(200);
  }
});

/* ============ MENUS ============ */

async function sendMainMenu(to) {
  return sendList(
    to,
    `👋 *Welcome to Kaam Set Hai*

Trusted *AC & Solar services* at your doorstep 🏠  
✔ Skilled technicians  
✔ Transparent pricing  
✔ Quick support  

Please choose an option 👇`,
    [{ id: "PRICING", title: "💰 View Pricing" }]
  );
}

async function sendPricingMenu(to) {
  return sendList(to, "💰 *Choose Category*", [
    { id: "AC_MENU", title: "❄️ AC Services" },
    { id: "SOLAR_MENU", title: "☀️ Solar Services" },
  ]);
}

async function sendACServices(to) {
  return sendList(to, "❄️ *AC Services*", [
    { id: "SERVICE_AC_INSTALL", title: "AC Installation" },
    { id: "SERVICE_AC_GENERAL", title: "General Service" },
    { id: "SERVICE_AC_NORMAL", title: "Normal Service" },
    { id: "SERVICE_AC_REPAIR", title: "Repair (Inspection)" },
    { id: "SERVICE_AC_GAS", title: "Gas Refilling" },
  ]);
}

async function sendSolarServices(to) {
  return sendList(to, "☀️ *Solar Services*", [
    { id: "SERVICE_SOLAR_20", title: "Minimum 20 Plates" },
    { id: "SERVICE_SOLAR_EXTRA", title: "Extra Plates" },
    { id: "SERVICE_SOLAR_INVERTER", title: "Inverter Repair" },
    { id: "SERVICE_SOLAR_INSTALL", title: "Solar Installation" },
  ]);
}

/* ============ HELPERS ============ */

async function sendList(to, text, rows) {
  const response = await fetch(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text },
          action: {
            button: "Select",
            sections: [{ title: "Options", rows }],
          },
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("❌ WhatsApp LIST error:", data);
  } else {
    console.log("✅ List sent");
  }

  return data;
}

async function sendMessage(to, body) {
  const response = await fetch(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("❌ WhatsApp TEXT error:", data);
  } else {
    console.log("✅ Text sent");
  }

  return data;
}

// ============ SERVER ============
app.listen(process.env.PORT || 8080, () => {
  console.log("🚀 Kaam Set Hai WhatsApp Bot running");
});