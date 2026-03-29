import express from "express";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config();

const app = express();
const PORT = 3000;
const TOKENS_PATH = path.join(process.cwd(), "tokens.json");

app.use(express.json());

// Google OAuth2 Configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/auth/callback`
);

// Load tokens from disk on startup
function loadTokens() {
  if (fs.existsSync(TOKENS_PATH)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf-8"));
      oauth2Client.setCredentials(tokens);
      console.log("✅ Tokens loaded from disk.");
    } catch (error) {
      console.error("❌ Error loading tokens:", error);
    }
  }
}

// Save tokens to disk whenever they change (e.g. refresh)
oauth2Client.on("tokens", (tokens) => {
  try {
    const currentTokens = fs.existsSync(TOKENS_PATH) 
      ? JSON.parse(fs.readFileSync(TOKENS_PATH, "utf-8")) 
      : {};
    const updatedTokens = { ...currentTokens, ...tokens };
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(updatedTokens, null, 2));
    console.log("💾 Tokens updated and saved to disk.");
  } catch (error) {
    console.error("❌ Error saving tokens:", error);
  }
});

loadTokens();

const calendar = google.calendar({ version: "v3", auth: oauth2Client });

// API Routes
app.get("/api/health", async (req, res) => {
  let isAuthenticated = false;
  let user = null;

  if (oauth2Client.credentials.access_token) {
    try {
      // Check if token is still valid or can be refreshed
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      user = userInfo.data;
      isAuthenticated = user.email === 'yanivmiz77@gmail.com';
    } catch (error) {
      console.error("Health check auth error:", error);
      isAuthenticated = false;
    }
  }

  res.json({ 
    status: "ok", 
    authenticated: isAuthenticated,
    user: user,
    config: {
      clientId: !!process.env.GOOGLE_CLIENT_ID,
      clientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      appUrl: !!process.env.APP_URL,
    },
    env: process.env.NODE_ENV
  });
});

app.post("/api/auth/logout", (req, res) => {
  oauth2Client.setCredentials({});
  if (fs.existsSync(TOKENS_PATH)) {
    fs.unlinkSync(TOKENS_PATH);
  }
  res.json({ success: true });
});

app.get("/api/auth/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
  });
  res.json({ url });
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  console.log("🚀 Auth Callback triggered with code:", code ? "YES" : "NO");
  
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);
    
    // Strict User Validation: Only Yaniv can enter
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const userEmail = userInfo.data.email;
    
    console.log("📧 Authenticated User:", userEmail);

    if (userEmail !== 'yanivmiz77@gmail.com') {
      console.error("🚫 Access Denied for:", userEmail);
      return res.status(403).send(`
        <div style="background: #0f172a; color: white; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center; direction: rtl;">
          <div>
            <h1 style="font-size: 3rem; color: #f43f5e;">גישה חסומה 🛑</h1>
            <p style="font-size: 1.5rem; opacity: 0.7;">המערכת מיועדת לשימוש בלעדי של יניב (${userEmail}).</p>
          </div>
        </div>
      `);
    }

    fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
    console.log("💾 Tokens saved successfully for Yaniv.");

    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; direction: rtl; color: white;">
          <div style="text-align: center; padding: 60px; background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); border-radius: 40px; border: 1px solid rgba(255,255,255,0.1); max-width: 450px; box-shadow: 0 40px 100px rgba(0,0,0,0.5);">
            <div style="font-size: 80px; margin-bottom: 30px; filter: drop-shadow(0 0 20px #2563eb);">⚡</div>
            <h1 style="color: #3b82f6; margin-bottom: 15px; font-size: 32px; font-weight: 900; letter-spacing: -1px;">TITAN AUTH SUCCESS</h1>
            <p style="color: #94a3b8; font-size: 18px; line-height: 1.5; font-weight: 600;">היומן של יניב מסונכרן כעת בביצועי מפלצת. החלון ייסגר אוטומטית.</p>
            <script>
              setTimeout(() => {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                  window.close();
                } else {
                  window.location.href = '/';
                }
              }, 1500);
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("❌ Authentication Error Details:", error.message || error);
    res.status(500).send(`
      <div style="background: #0f172a; color: white; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center; direction: rtl;">
        <div>
          <h1 style="font-size: 2rem; color: #f43f5e;">שגיאת התחברות ⚠️</h1>
          <p style="opacity: 0.7;">פרטי השגיאה: ${error.message || 'Unknown Error'}</p>
          <p style="margin-top: 20px;">וודא שהגדרת נכון את ה-Redirect URI בגוגל קונסול.</p>
          <button onclick="window.close()" style="background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 10px; cursor: pointer; font-weight: bold;">סגור ונסה שוב</button>
        </div>
      </div>
    `);
  }
});

app.get("/api/events", async (req, res) => {
  try {
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString(),
      maxResults: 500,
      singleEvents: true,
      orderBy: "startTime",
    });
    res.json(response.data.items);
  } catch (error: any) {
    if (error.code === 401) return res.status(401).json({ error: "Unauthorized" });
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/events", async (req, res) => {
  try {
    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: req.body,
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/events/:id", async (req, res) => {
  try {
    const response = await calendar.events.update({
      calendarId: "primary",
      eventId: req.params.id,
      requestBody: req.body,
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/events/:id", async (req, res) => {
  try {
    await calendar.events.delete({ calendarId: "primary", eventId: req.params.id });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  const distPath = path.join(process.cwd(), "dist");
  const isProd = process.env.NODE_ENV === "production" || fs.existsSync(distPath);

  if (!isProd) {
    console.log("🛠️ Starting in Development mode with Vite...");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    console.log("🚀 Starting in Production mode...");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      // Handle SPA fallback
      if (req.path.startsWith('/api/')) return res.status(404).json({ error: "Not Found" });
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  
  app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Titan Server running on port ${PORT} (Mode: ${isProd ? 'Production' : 'Development'})`));
}

startServer();
