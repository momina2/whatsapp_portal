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
  const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return res.sendStatus(200);

  const from = msg.from;

  // ===== FIXED ACTION HANDLING =====
  let action =
    msg.interactive?.list_reply?.id ||
    msg.interactive?.button_reply?.id ||
    msg.text?.body;

  if (action) {
    action = action.toString().trim().toUpperCase();
  }

  console.log("User action:", action);

  /* ===== MAIN MENU ===== */
  if (action === "HI" || action === "MENU") {
    return sendMainMenu(from);
  }

  /* ===== PRICING ===== */
  if (action === "PRICING") {
    return sendPricingMenu(from);
  }

  /* ===== AC MENU ===== */
  if (action === "AC_MENU") {
    return sendACServices(from);
  }

  /* ===== SOLAR MENU ===== */
  if (action === "SOLAR_MENU") {
    return sendSolarServices(from);
  }

  /* ===== SERVICE SELECT ===== */
  if (action?.startsWith("SERVICE_")) {
    bookings[from] = {
      service: action.replace("SERVICE_", "").replace(/_/g, " "),
      step: "date",
    };
    return sendMessage(
      from,
      "📅 Please type your *preferred date*\n(e.g. 5 March 2026)"
    );
  }

  /* ===== DATE ===== */
  if (bookings[from]?.step === "date") {
    bookings[from].date = action;
    bookings[from].step = "location";
    return sendMessage(
      from,
      "📍 Please type your *complete address*\n(Area, City)"
    );
  }

  /* ===== LOCATION ===== */
  if (bookings[from]?.step === "location") {
    const { service, date } = bookings[from];
    delete bookings[from];

    return sendMessage(
      from,
      `✅ *Booking Confirmed*

🛠 Service: ${service}
📅 Date: ${date}
📍 Location: ${action}

Our team will contact you shortly 💚
*Kaam Set Hai!*`
    );
  }

  return sendMessage(from, "❓ Type *menu* to continue");
});

/* ============ MENUS ============ */

async function sendMainMenu(to) {
  return sendList(
    to,
    `👋 *Welcome to Kaam Set Hai*

We provide *trusted AC & Solar services* at your doorstep 🏠  
✔ Skilled technicians  
✔ Transparent pricing  
✔ Quick support  

Please choose an option below 👇`,
    [
      { id: "PRICING", title: "💰 View Pricing" },
      { id: "SUPPORT", title: "📞 Contact Support" },
    ]
  );
}

async function sendPricingMenu(to) {
  return sendList(to, "💰 *Choose a Service Category*", [
    { id: "AC_MENU", title: "❄️ AC Services" },
    { id: "SOLAR_MENU", title: "☀️ Solar Services" },
  ]);
}

async function sendACServices(to) {
  return sendList(to, "❄️ *AC Services & Pricing*", [
    { id: "SERVICE_AC_INSTALLATION", title: "AC Installation — Rs. 2,500" },
    { id: "SERVICE_AC_GENERAL_SERVICE", title: "General Service — Rs. 2,500" },
    { id: "SERVICE_AC_NORMAL_SERVICE", title: "Normal Service — Rs. 1,500" },
    { id: "SERVICE_AC_REPAIR", title: "Repair (After Inspection)" },
    { id: "SERVICE_AC_PCB", title: "PCB Card (Kit) — Rs. 8,000" },
    { id: "SERVICE_AC_LEAKAGE", title: "Leakage Repair — Rs. 6,000" },
    { id: "SERVICE_AC_GAS", title: "Gas Refilling — Rs. 8,000" },
    { id: "SERVICE_AC_VISIT", title: "Visit Charges — Rs. 1,000" },
  ]);
}

async function sendSolarServices(to) {
  return sendList(to, "☀️ *Solar Services & Pricing*", [
    { id: "SERVICE_SOLAR_20_PLATES", title: "Minimum 20 Plates — Rs. 3,000" },
    { id: "SERVICE_SOLAR_EXTRA_PLATES", title: "Extra Plates — Rs. 100 / plate" },
    { id: "SERVICE_SOLAR_INVERTER", title: "Inverter Repair (Inspection)" },
    { id: "SERVICE_SOLAR_INSTALLATION", title: "Solar Installation (Inspection)" },
    { id: "SERVICE_SOLAR_VISIT", title: "Visit Charges — Rs. 1,000" },
  ]);
}

/* ============ HELPERS ============ */

async function sendList(to, text, rows) {
  return fetch(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, {
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
  });
}

async function sendMessage(to, body) {
  return fetch(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, {
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
  });
}

// ============ SERVER ============
app.listen(process.env.PORT || 8080, () =>
  console.log("🚀 Kaam Set Hai Bot running")
);