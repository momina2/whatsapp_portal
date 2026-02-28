import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ENV VARIABLES
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ✅ Webhook verification (Meta ke liye)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ✅ Receive message + auto reply
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (message && message.text) {
      const from = message.from;
      const userText = message.text.body;

      console.log("User said:", userText);

      // 👉 AUTO REPLY TEXT
      let replyText = "Hello 👋\nThanks for messaging us!\nHow can I help you today? 😊";

      if (userText.toLowerCase() === "hi") {
        replyText = "Hi 👋\nWelcome to KaamSetHai 💼\nPlease tell us what service you need.";
      }

      // 🔥 Send reply to WhatsApp
      await fetch(
        `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: from,
            text: { body: replyText },
          }),
        }
      );

      console.log("Auto reply sent");
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    res.sendStatus(500);
  }
});

// ✅ Server start
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});