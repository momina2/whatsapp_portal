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

    // ===== SHOW MENU =====
    if (text === "hi" || text === "menu") {
      await sendMenu(from);
    }

    // ===== MENU BUTTONS =====
    else if (buttonId === "PRICING") {
      await sendMessage(
        from,
        `💰 *Services & Pricing*

🔧 AC Installation — Rs. 2,500  
❄ AC General Service — Rs. 2,000  
🔌 Electrical — Rs. 1,500  
🚰 Plumbing — Rs. 1,200  

Type *menu* to go back`
      );
    }

    else if (buttonId === "BOOK") {
      bookings[from] = { step: "name" };
      await sendMessage(from, "✍️ Please send your *name*");
    }

    else if (buttonId === "SUPPORT") {
      await sendMessage(
        from,
        `📞 *Support Team*
WhatsApp: 0326-1761768  
Email: support@kaamsethai.pk`
      );
    }

    // ===== BOOKING FLOW =====
    else if (bookings[from]?.step === "name") {
      bookings[from].name = text;
      bookings[from].step = "service";
      await sendMessage(
        from,
        `🛠 Which service do you want?

AC  
Electrical  
Plumbing`
      );
    }

    else if (bookings[from]?.step === "service") {
      bookings[from].service = text;
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

    else {
      await sendMessage(from, "❓ Type *menu* to continue");
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(200);
  }
});

// ================= SEND MENU =================
async function sendMenu(to) {
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
        body: {
          text: "👋 Welcome to *Kaam Se Thai*\nChoose an option 👇",
        },
        action: {
          button: "Open Menu",
          sections: [
            {
              title: "Main Menu",
              rows: [
                { id: "PRICING", title: "💰 Services & Pricing" },
                { id: "BOOK", title: "📅 Book a Service" },
                { id: "SUPPORT", title: "📞 Contact Support" },
              ],
            },
          ],
        },
      },
    }),
  });
}

// ================= SEND TEXT MESSAGE =================
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

  console.log("Auto reply sent");
}

// ================= SERVER =================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`🚀 WhatsApp bot running on port ${PORT}`)
);