import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ================= ENV =================
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ================= TEMP BOOKING STORE =================
const bookings = {};

// ================= WEBHOOK VERIFY =================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ================= RECEIVE MESSAGES =================
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body?.toLowerCase() || "";
    const buttonId = message.interactive?.list_reply?.id;

    console.log("User said:", text || buttonId);

    /* ===== MAIN MENU ===== */
    if (text === "hi" || text === "menu" || buttonId === "BACK_MAIN") {
      return sendMainMenu(from);
    }

    /* ===== PRICING MENU ===== */
    if (buttonId === "PRICING") {
      return sendPricingMenu(from);
    }

    /* ===== AC SERVICES LIST ===== */
    if (buttonId === "AC_MENU") {
      return sendACServices(from);
    }

    /* ===== SOLAR SERVICES LIST ===== */
    if (buttonId === "SOLAR_MENU") {
      return sendSolarServices(from);
    }

    /* ===== SERVICE SELECTED ===== */
    if (buttonId?.startsWith("SERVICE_")) {
      const serviceName = buttonId.replace("SERVICE_", "");
      bookings[from] = { service: serviceName };
      return sendServiceConfirm(from, serviceName);
    }

    /* ===== START BOOKING ===== */
    if (buttonId === "BOOK_SERVICE") {
      bookings[from].step = "name";
      return sendMessage(from, "✍️ Please send your *name*");
    }

    /* ===== BOOKING FLOW ===== */
    if (bookings[from]?.step === "name") {
      bookings[from].name = text;
      bookings[from].step = "date";
      return sendMessage(from, "📅 Please send preferred *date* (e.g. 5 March)");
    }

    if (bookings[from]?.step === "date") {
      bookings[from].date = text;
      const { name, service, date } = bookings[from];

      await sendMessage(
        from,
        `✅ *Booking Confirmed*

👤 Name: ${name}
🛠 Service: ${service}
📅 Date: ${date}

Our team will contact you shortly 💚`
      );

      delete bookings[from];
      return;
    }

    /* ===== SUPPORT ===== */
    if (buttonId === "SUPPORT") {
      return sendMessage(
        from,
        `📞 *Contact & Support*
WhatsApp: 0326-1761768
Email: support@kaamsethai.pk`
      );
    }

    await sendMessage(from, "❓ Type *menu* to continue");
  } catch (err) {
    console.error(err);
  }

  res.sendStatus(200);
});

/* ================= MENUS ================= */

async function sendMainMenu(to) {
  return sendList(to, "👋 Welcome to *Kaam Se Thai*\nChoose an option 👇", [
    { id: "PRICING", title: "💰 Pricing" },
    { id: "SUPPORT", title: "📞 Contact & Support" },
  ]);
}

async function sendPricingMenu(to) {
  return sendList(to, "💰 Select a category", [
    { id: "AC_MENU", title: "❄️ AC Services" },
    { id: "SOLAR_MENU", title: "☀️ Solar Services" },
    { id: "BACK_MAIN", title: "⬅ Back to Main Menu" },
  ]);
}

/* ================= AC SERVICES ================= */

async function sendACServices(to) {
  return sendList(to, "❄️ *AC Services*", [
    { id: "SERVICE_AC Installation - Rs. 2,500", title: "AC Installation - Rs. 2,500" },
    { id: "SERVICE_General Service - Rs. 2,500", title: "General Service - Rs. 2,500" },
    { id: "SERVICE_Normal Service - Rs. 1,500", title: "Normal Service - Rs. 1,500" },
    { id: "SERVICE_Repair (After Inspection)", title: "Repair (Indoor / Outdoor)" },
    { id: "SERVICE_PCB Card (Kit) - Rs. 8,000", title: "PCB Card (Kit) - Rs. 8,000" },
    { id: "SERVICE_Leakage Repair - Rs. 6,000", title: "Leakage Repair - Rs. 6,000" },
    { id: "SERVICE_Gas Refilling - Rs. 8,000", title: "Gas Refilling - Rs. 8,000" },
    { id: "SERVICE_Visit Charges - Rs. 1,000", title: "Visit Charges - Rs. 1,000" },
  ]);
}

/* ================= SOLAR SERVICES ================= */

async function sendSolarServices(to) {
  return sendList(to, "☀️ *Solar Services*", [
    { id: "SERVICE_Minimum 20 Plates - Rs. 3,000", title: "Minimum 20 Plates - Rs. 3,000" },
    { id: "SERVICE_Additional Plates - Rs. 100/plate", title: "Additional Plates (Above 30)" },
    { id: "SERVICE_Inverter Repair (Inspection)", title: "Inverter Repair" },
    { id: "SERVICE_Solar Installation (Inspection)", title: "Solar Installation" },
    { id: "SERVICE_Visit Charges - Rs. 1,000", title: "Visit Charges - Rs. 1,000" },
  ]);
}

/* ================= CONFIRM SERVICE ================= */

async function sendServiceConfirm(to, service) {
  return sendList(
    to,
    `🛠 *${service}*\n\nAap ye service book karna chahte hain?`,
    [
      { id: "BOOK_SERVICE", title: "✅ Book this service" },
      { id: "BACK_MAIN", title: "⬅ Back to Main Menu" },
    ]
  );
}

/* ================= HELPERS ================= */

async function sendList(to, bodyText, rows) {
  await fetch(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, {
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
        body: { text: bodyText },
        action: {
          button: "Select",
          sections: [{ title: "Options", rows }],
        },
      },
    }),
  });
}

async function sendMessage(to, body) {
  await fetch(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, {
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

/* ================= SERVER ================= */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Bot running on ${PORT}`));