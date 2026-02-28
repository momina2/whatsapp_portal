import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ================= ENV =================
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ================= TEMP STORE =================
const sessions = {};

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

// ================= RECEIVE =================
app.post("/webhook", async (req, res) => {
  try {
    const message =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body?.trim();
    const buttonId = message.interactive?.list_reply?.id;
    const location = message.location;

    console.log("User said:", text || buttonId || "location");

    // ================= INIT =================
    if (!sessions[from]) sessions[from] = {};

    // ================= MENU =================
    if (text?.toLowerCase() === "hi" || text?.toLowerCase() === "menu") {
      sessions[from] = {};
      await sendMainMenu(from);
    }

    // ================= PRICING =================
    else if (buttonId === "PRICING") {
      await sendPricingMenu(from);
    }

    // ================= AC / SOLAR =================
    else if (buttonId === "AC_MENU") {
      sessions[from].category = "AC";
      await sendACServices(from);
    }

    else if (buttonId === "SOLAR_MENU") {
      sessions[from].category = "SOLAR";
      await sendSolarServices(from);
    }

    // ================= SERVICE SELECTION =================
    else if (sessions[from].category && /^[1-9]$/.test(text)) {
      const services =
        sessions[from].category === "AC" ? acServices : solarServices;

      const service = services[text];
      if (!service) {
        await sendMessage(from, "❌ Invalid option, please select again");
        return res.sendStatus(200);
      }

      sessions[from].service = service;
      sessions[from].step = "date";

      await sendMessage(from, "📅 Please send preferred *date* (e.g. 5 March)");
    }

    // ================= DATE =================
    else if (sessions[from].step === "date") {
      sessions[from].date = text;
      sessions[from].step = "location";

      await sendMessage(from, "📍 Please share your *live location*");
    }

    // ================= LOCATION =================
    else if (sessions[from].step === "location" && location) {
      sessions[from].location = location;

      const s = sessions[from];

      await sendMessage(
        from,
        `✅ *Booking Confirmed*

🛠 Service: ${s.service}
📅 Date: ${s.date}
📍 Location received

Our team will contact you shortly 💚`
      );

      delete sessions[from];
    }

    else {
      await sendMessage(from, "❓ Type *menu* to continue");
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(200);
  }
});

// ================= DATA =================
const acServices = {
  1: "AC Installation - Rs. 2,500",
  2: "General Service - Rs. 2,500",
  3: "Normal Service - Rs. 1,500",
  4: "Repair (After Inspection)",
  5: "PCB Card (Kit) - Rs. 8,000",
  6: "Leakage Repair - Rs. 6,000",
  7: "Gas Refilling - Rs. 8,000",
  8: "Visit Charges - Rs. 1,000",
};

const solarServices = {
  1: "Minimum 20 Plates - Rs. 3,000",
  2: "Additional Plates - Rs. 100 / plate",
  3: "Inverter Repair (Inspection)",
  4: "Solar Installation (Inspection)",
  5: "Visit Charges - Rs. 1,000",
};

// ================= MENUS =================
async function sendMainMenu(to) {
  return sendList(to, "👋 Welcome to *Kaam Se Thai*", [
    { id: "PRICING", title: "💰 Pricing" },
    { id: "SUPPORT", title: "📞 Contact Support" },
  ]);
}

async function sendPricingMenu(to) {
  return sendList(to, "Choose category 👇", [
    { id: "AC_MENU", title: "❄️ AC Services" },
    { id: "SOLAR_MENU", title: "☀️ Solar Services" },
  ]);
}

async function sendACServices(to) {
  let msg = "❄️ *AC Services*\n\n";
  Object.entries(acServices).forEach(([k, v]) => {
    msg += `${k}️⃣ ${v}\n`;
  });
  msg += "\nReply with *number* to book";
  return sendMessage(to, msg);
}

async function sendSolarServices(to) {
  let msg = "☀️ *Solar Services*\n\n";
  Object.entries(solarServices).forEach(([k, v]) => {
    msg += `${k}️⃣ ${v}\n`;
  });
  msg += "\nReply with *number* to book";
  return sendMessage(to, msg);
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
          button: "Select",
          sections: [{ title: "Menu", rows }],
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

// ================= SERVER =================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`🚀 WhatsApp bot running on port ${PORT}`)
);