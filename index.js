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
    const text = message.text?.body?.toLowerCase();
    const buttonId =
      message.interactive?.list_reply?.id ||
      message.interactive?.button_reply?.id;

    console.log("User said:", text || buttonId);

    // ================= MAIN MENU =================
    if (text === "hi" || text === "menu") {
      bookings[from] = {};
      await sendMainMenu(from);
    }

    // ================= PRICING MENU =================
    else if (buttonId === "PRICING") {
      await sendPricingMenu(from);
    }

    // ================= AC / SOLAR MENU =================
    else if (buttonId === "AC_MENU") {
      await sendACServices(from);
    } 
    else if (buttonId === "SOLAR_MENU") {
      await sendSolarServices(from);
    }

    // ================= SERVICE SELECTED =================
    else if (buttonId?.startsWith("SERVICE_")) {
      bookings[from] = {
        step: "confirm",
        service: SERVICE_MAP[buttonId],
      };

      await sendConfirmService(from, SERVICE_MAP[buttonId]);
    }

    // ================= CONFIRM BOOKING =================
    else if (buttonId === "CONFIRM_BOOKING") {
      bookings[from].step = "name";
      await sendMessage(from, "✍️ Please send your *name*");
    }

    else if (buttonId === "BACK_MENU") {
      bookings[from] = {};
      await sendMainMenu(from);
    }

    // ================= BOOKING FLOW =================
    else if (bookings[from]?.step === "name") {
      bookings[from].name = text;
      bookings[from].step = "date";
      await sendMessage(from, "📅 Please send preferred *date* (e.g. 5 March)");
    }

    else if (bookings[from]?.step === "date") {
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
    }

    // ================= SUPPORT =================
    else if (buttonId === "SUPPORT") {
      await sendMessage(
        from,
        `📞 *Contact & Support*
WhatsApp: 0326-1761768
Email: support@kaamsethai.pk`
      );
    }

    else {
      await sendMessage(from, "❓ Type *menu* to continue");
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(200);
  }
});

// ================= SERVICE MAP =================
const SERVICE_MAP = {
  SERVICE_AC_INSTALL: "AC Installation - Rs. 2,500",
  SERVICE_AC_GENERAL: "General Service - Rs. 2,500",
  SERVICE_AC_NORMAL: "Normal Service - Rs. 1,500",
  SERVICE_AC_REPAIR: "Repair (Indoor / Outdoor)",
  SERVICE_AC_PCB: "PCB Card (Kit) - Rs. 8,000",
  SERVICE_AC_LEAK: "Leakage Repair - Rs. 6,000",
  SERVICE_AC_GAS: "Gas Refilling - Rs. 8,000",
  SERVICE_AC_VISIT: "Visit Charges - Rs. 1,000",

  SERVICE_SOLAR_20: "Minimum 20 Plates - Rs. 3,000",
  SERVICE_SOLAR_EXTRA: "Additional Plates (Above 30)",
  SERVICE_SOLAR_INVERTER: "Inverter Repair (Inspection)",
  SERVICE_SOLAR_INSTALL: "Solar Installation (Inspection)",
  SERVICE_SOLAR_VISIT: "Visit Charges - Rs. 1,000",
};

// ================= MENUS =================
async function sendMainMenu(to) {
  return sendList(to, "👋 Welcome to Kaam Set Hai", [
    { id: "PRICING", title: "💰 Services & Pricing" },
    { id: "SUPPORT", title: "📞 Contact & Support" },
  ]);
}

async function sendPricingMenu(to) {
  return sendList(to, "Choose a category 👇", [
    { id: "AC_MENU", title: "❄️ AC Services" },
    { id: "SOLAR_MENU", title: "☀️ Solar Services" },
  ]);
}

async function sendACServices(to) {
  return sendList(to, "❄️ *AC Services*", [
    { id: "SERVICE_AC_INSTALL", title: "AC Installation - Rs. 2,500" },
    { id: "SERVICE_AC_GENERAL", title: "General Service - Rs. 2,500" },
    { id: "SERVICE_AC_NORMAL", title: "Normal Service - Rs. 1,500" },
    { id: "SERVICE_AC_REPAIR", title: "Repair (Indoor / Outdoor)" },
    { id: "SERVICE_AC_PCB", title: "PCB Card (Kit) - Rs. 8,000" },
    { id: "SERVICE_AC_LEAK", title: "Leakage Repair - Rs. 6,000" },
    { id: "SERVICE_AC_GAS", title: "Gas Refilling - Rs. 8,000" },
    { id: "SERVICE_AC_VISIT", title: "Visit Charges - Rs. 1,000" },
  ]);
}

async function sendSolarServices(to) {
  return sendList(to, "☀️ *Solar Services*", [
    { id: "SERVICE_SOLAR_20", title: "Minimum 20 Plates - Rs. 3,000" },
    { id: "SERVICE_SOLAR_EXTRA", title: "Additional Plates (Above 30)" },
    { id: "SERVICE_SOLAR_INVERTER", title: "Inverter Repair" },
    { id: "SERVICE_SOLAR_INSTALL", title: "Solar Installation" },
    { id: "SERVICE_SOLAR_VISIT", title: "Visit Charges - Rs. 1,000" },
  ]);
}

async function sendConfirmService(to, service) {
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
        type: "button",
        body: {
          text: `You selected:\n*${service}*\n\nDo you want to book this service?`,
        },
        action: {
          buttons: [
            { type: "reply", reply: { id: "CONFIRM_BOOKING", title: "✅ Book Now" } },
            { type: "reply", reply: { id: "BACK_MENU", title: "⬅️ Main Menu" } },
          ],
        },
      },
    }),
  });
}

// ================= HELPERS =================
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
          button: "Open Menu",
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

// ================= SERVER =================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`🚀 WhatsApp bot running on port ${PORT}`)
);