import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ================= ENV =================
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ================= SESSION STORE =================
const sessions = {};

// ================= HELPERS =================
function isBookingInProgress(user) {
  return sessions[user]?.step;
}

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
    const buttonId =
      message.interactive?.list_reply?.id ||
      message.interactive?.button_reply?.id;

    console.log("User said:", text || buttonId);

    // ================= MAIN MENU =================
    if ((text === "hi" || text === "menu") && !isBookingInProgress(from)) {
      sessions[from] = {};
      await sendMainMenu(from);
    }

    // ================= PRICING MENU =================
    else if (buttonId === "PRICING" && !isBookingInProgress(from)) {
      await sendPricingMenu(from);
    }

    // ================= CATEGORY =================
    else if (buttonId === "AC_MENU" && !isBookingInProgress(from)) {
      sessions[from] = { category: "AC" };
      await sendACServices(from);
    }

    else if (buttonId === "SOLAR_MENU" && !isBookingInProgress(from)) {
      sessions[from] = { category: "SOLAR" };
      await sendSolarServices(from);
    }

    // ================= SERVICE SELECTION =================
    else if (
      sessions[from]?.category &&
      !sessions[from]?.step &&
      /^service_/i.test(buttonId)
    ) {
      sessions[from].service = buttonId.replace("SERVICE_", "");
      sessions[from].step = "date";

      await sendMessage(
        from,
        `📅 *${sessions[from].service}*\n\nPlease send preferred *date* (e.g. 2 March)`
      );
    }

    // ================= DATE =================
    else if (sessions[from]?.step === "date" && text) {
      sessions[from].date = text;
      sessions[from].step = "location";

      await sendMessage(
        from,
        "📍 Please share your *current location*"
      );
    }

    // ================= LOCATION =================
    else if (sessions[from]?.step === "location" && message.location) {
      const { latitude, longitude } = message.location;
      sessions[from].location = `${latitude}, ${longitude}`;

      const { category, service, date } = sessions[from];

      await sendMessage(
        from,
        `✅ *Booking Confirmed*

🛠 Category: ${category}  
🔧 Service: ${service}  
📅 Date: ${date}  
📍 Location received

Our team will contact you shortly 💚`
      );

      delete sessions[from];
    }

    // ================= SUPPORT =================
    else if (buttonId === "SUPPORT" && !isBookingInProgress(from)) {
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

// ================= MENUS =================
async function sendMainMenu(to) {
  return sendList(to, "👋 *Welcome to Kaam Se Thai*", [
    { id: "PRICING", title: "💰 Pricing" },
    { id: "SUPPORT", title: "📞 Contact & Support" },
  ]);
}

async function sendPricingMenu(to) {
  return sendList(to, "💰 *Choose Category*", [
    { id: "AC_MENU", title: "❄️ AC Services" },
    { id: "SOLAR_MENU", title: "☀️ Solar Services" },
  ]);
}

async function sendACServices(to) {
  return sendList(to, "❄️ *AC Services*", [
    { id: "SERVICE_AC Installation", title: "AC Installation - Rs. 2,500" },
    { id: "SERVICE_General Service", title: "General Service - Rs. 2,500" },
    { id: "SERVICE_Normal Service", title: "Normal Service - Rs. 1,500" },
    { id: "SERVICE_Repair", title: "Repair (After Inspection)" },
    { id: "SERVICE_PCB Card", title: "PCB Card (Kit) - Rs. 8,000" },
    { id: "SERVICE_Leakage Repair", title: "Leakage Repair - Rs. 6,000" },
    { id: "SERVICE_Gas Refilling", title: "Gas Refilling - Rs. 8,000" },
    { id: "SERVICE_Visit Charges", title: "Visit Charges - Rs. 1,000" },
  ]);
}

async function sendSolarServices(to) {
  return sendList(to, "☀️ *Solar Services*", [
    { id: "SERVICE_Minimum 20 Plates", title: "Minimum 20 Plates - Rs. 3,000" },
    { id: "SERVICE_Additional Plates", title: "Additional Plates (Above 30)" },
    { id: "SERVICE_Inverter Repair", title: "Inverter Repair (Inspection)" },
    { id: "SERVICE_Solar Installation", title: "Solar Installation (Inspection)" },
    { id: "SERVICE_Visit Charges", title: "Visit Charges - Rs. 1,000" },
  ]);
}

// ================= SEND LIST =================
async function sendList(to, text, rows) {
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
        body: { text },
        action: {
          button: "Select",
          sections: [{ title: "Options", rows }],
        },
      },
    }),
  });
}

// ================= SEND TEXT =================
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