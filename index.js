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
      await sendMainMenu(from);
    }

    /* ===== PRICING MENU ===== */
    else if (buttonId === "PRICING") {
      await sendPricingMenu(from);
    }

    /* ===== SOLAR PRICING ===== */
    else if (buttonId === "SOLAR_PRICE") {
      bookings[from] = { selectedService: "Solar" };
      await sendServicePricing(
        from,
        "☀️ *Solar Services Pricing*\n\n• Solar Installation — Rs. 150,000\n• Solar Maintenance — Rs. 10,000"
      );
    }

    /* ===== AC PRICING ===== */
    else if (buttonId === "AC_PRICE") {
      bookings[from] = { selectedService: "AC" };
      await sendServicePricing(
        from,
        "❄️ *AC Services Pricing*\n\n• AC Installation — Rs. 2,500\n• AC General Service — Rs. 2,000"
      );
    }

    /* ===== START BOOKING FROM PRICING ===== */
    else if (buttonId === "BOOK_NOW") {
      bookings[from].step = "name";
      await sendMessage(from, "✍️ Please send your *name*");
    }

    /* ===== BOOKING FLOW (UNCHANGED) ===== */
    else if (bookings[from]?.step === "name") {
      bookings[from].name = text;
      bookings[from].step = "date";
      await sendMessage(from, "📅 Please send preferred *date* (e.g. 5 March)");
    }

    else if (bookings[from]?.step === "date") {
      bookings[from].date = text;

      const { name, selectedService, date } = bookings[from];

      await sendMessage(
        from,
        `✅ *Booking Confirmed*

👤 Name: ${name}  
🛠 Service: ${selectedService}  
📅 Date: ${date}

Our team will contact you shortly 💚`
      );

      delete bookings[from];
    }

    /* ===== CONTACT ===== */
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

/* ================= MAIN MENU ================= */
async function sendMainMenu(to) {
  await sendList(
    to,
    "👋 Welcome to *Kaam Se Thai*\nChoose an option 👇",
    [
      { id: "PRICING", title: "💰 Pricing" },
      { id: "BOOK_NOW", title: "📅 Book Service" },
      { id: "SUPPORT", title: "📞 Contact & Support" },
    ]
  );
}

/* ================= PRICING MENU ================= */
async function sendPricingMenu(to) {
  await sendList(
    to,
    "💰 Select a service category",
    [
      { id: "SOLAR_PRICE", title: "☀️ Solar Services" },
      { id: "AC_PRICE", title: "❄️ AC Services" },
      { id: "BACK_MAIN", title: "⬅ Back to Main Menu" },
    ]
  );
}

/* ================= SERVICE PRICING ================= */
async function sendServicePricing(to, text) {
  await sendList(
    to,
    text,
    [
      { id: "BOOK_NOW", title: "✅ Book this service" },
      { id: "BACK_MAIN", title: "⬅ Back to Main Menu" },
    ]
  );
}

/* ================= LIST MESSAGE ================= */
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

/* ================= TEXT MESSAGE ================= */
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
app.listen(PORT, () =>
  console.log(`🚀 WhatsApp bot running on port ${PORT}`)
);