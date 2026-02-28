import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ===== ENV =====
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ===== BOOKING STATE =====
const bookings = {};

// ================= VERIFY =================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
  try {
    const msg =
      req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const text = msg.text?.body?.toLowerCase();
    const actionId =
      msg.interactive?.list_reply?.id ||
      msg.interactive?.button_reply?.id;

    console.log("User said:", text || actionId);

    /* ===== MAIN MENU ===== */
    if (text === "hi" || text === "menu") {
      await sendMainMenu(from);
    }

    /* ===== PRICING ===== */
    else if (actionId === "PRICING") {
      await sendPricingMenu(from);
    }

    /* ===== AC / SOLAR MENU ===== */
    else if (actionId === "AC_MENU") {
      await sendACServices(from);
    }

    else if (actionId === "SOLAR_MENU") {
      await sendSolarServices(from);
    }

    /* ===== BOOKING START ===== */
    else if (actionId?.startsWith("SERVICE_")) {
      bookings[from] = {
        step: "date",
        service: actionId.replace("SERVICE_", "")
      };

      await sendMessage(
        from,
        `📅 *${bookings[from].service}*\n\nPlease send preferred *date*`
      );
    }

    else if (bookings[from]?.step === "date") {
      bookings[from].date = text;
      bookings[from].step = "location";

      await sendMessage(from, "📍 Please share your *location*");
    }

    else if (bookings[from]?.step === "location") {
      const { service, date } = bookings[from];

      await sendMessage(
        from,
        `✅ *Booking Confirmed*\n\n🛠 ${service}\n📅 ${date}\n📍 ${text}\n\nOur team will contact you 💚`
      );

      delete bookings[from];
    }

    else {
      await sendMessage(from, "Type *menu* to continue");
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(200);
  }
});

// ================= MENUS =================

async function sendMainMenu(to) {
  return sendList(to, "👋 Welcome to *Kaam Se Thai*", [
    { id: "PRICING", title: "💰 Pricing" },
    { id: "SUPPORT", title: "📞 Contact Support" },
  ]);
}

async function sendPricingMenu(to) {
  return sendList(to, "Choose service category 👇", [
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
    { id: "SERVICE_Gas Refilling", title: "Gas Refilling - Rs. 8,000" },
  ]);
}

async function sendSolarServices(to) {
  return sendList(to, "☀️ *Solar Services*", [
    { id: "SERVICE_20 Plates Service", title: "20 Plates - Rs. 3,000" },
    { id: "SERVICE_Extra Plates", title: "Extra Plates - Rs.100/plate" },
    { id: "SERVICE_Inverter Repair", title: "Inverter Repair" },
    { id: "SERVICE_Solar Installation", title: "Solar Installation" },
  ]);
}

// ================= HELPERS =================

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
  console.log(`🚀 WhatsApp bot running on ${PORT}`)
);