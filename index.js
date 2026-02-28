import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// temp in-memory booking store
const bookings = {};

/* ===============================
   WEBHOOK VERIFY
================================ */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/* ===============================
   RECEIVE MESSAGES
================================ */
app.post("/webhook", async (req, res) => {
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];

  if (!message) return res.sendStatus(200);

  const from = message.from;
  const text = message.text?.body?.toLowerCase() || "";

  console.log("User said:", text);

  // ===== MENU =====
  if (text === "hi" || text === "menu") {
    await sendMessage(from,
`👋 Welcome to *Kaam Se Thai*  

Reply with a number 👇

1️⃣ Services & Pricing  
2️⃣ Book a Service  
3️⃣ Talk to Support`);
  }

  // ===== PRICING =====
  else if (text === "1") {
    await sendMessage(from,
`💰 *Our Services & Pricing*

🔧 AC Installation — Rs. 2,500  
❄ AC General Service — Rs. 2,000  
🔌 Electrical Work — Rs. 1,500  
🚰 Plumbing — Rs. 1,200  

Reply *2* to book a service 📅`);
  }

  // ===== BOOKING START =====
  else if (text === "2") {
    bookings[from] = { step: "name" };
    await sendMessage(from, "✍️ Please send your *name*");
  }

  else if (bookings[from]?.step === "name") {
    bookings[from].name = text;
    bookings[from].step = "service";
    await sendMessage(from,
`Select service 👇
AC
Electrical
Plumbing`);
  }

  else if (bookings[from]?.step === "service") {
    bookings[from].service = text;
    bookings[from].step = "date";
    await sendMessage(from, "📅 Please send preferred *date* (e.g. 5 March)");
  }

  else if (bookings[from]?.step === "date") {
    bookings[from].date = text;

    const { name, service } = bookings[from];

    await sendMessage(from,
`✅ *Booking Confirmed*

👤 Name: ${name}  
🛠 Service: ${service}  
📅 Date: ${text}

Our team will contact you shortly 💚`);

    delete bookings[from];
  }

  // ===== SUPPORT =====
  else if (text === "3") {
    await sendMessage(from,
`📞 Support Team  
WhatsApp: 0326-1761768  
Email: support@kaamsethai.pk`);
  }

  else {
    await sendMessage(from, "❓ Please type *menu* to continue");
  }

  res.sendStatus(200);
});

/* ===============================
   SEND MESSAGE FUNCTION
================================ */
async function sendMessage(to, body) {
  await fetch(
    `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
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

  console.log("Auto reply sent");
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));