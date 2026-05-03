import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import cookieSession from 'cookie-session';
import fs from 'fs';

dotenv.config();

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('WARNING: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set. Google Calendar integration will not work.');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = getFirestore(firebaseConfig.firestoreDatabaseId);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'default-secret'],
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  secure: true,
  sameSite: 'none',
}));

const getOAuth2Client = () => new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/auth/google/callback`
);

// API Routes
app.get('/api/auth/google/url', (req, res) => {
  const { uid } = req.query;
  if (!uid) return res.status(400).json({ error: 'UID is required' });

  const scopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events'
  ];

  const client = getOAuth2Client();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: uid as string,
    prompt: 'consent select_account'
  });

  res.json({ url });
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state: uid } = req.query;

  if (!code || !uid) {
    return res.status(400).send('Missing code or state');
  }

  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code as string);
    
    // Pass tokens back to the client via postMessage
    // The client will handle storing them in Firestore to bypass server-side permission issues
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'OAUTH_AUTH_SUCCESS', 
                tokens: ${JSON.stringify(tokens)},
                uid: "${uid}"
              }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    res.status(500).send('Authentication failed');
  }
});

app.post('/api/calendar/events', async (req, res) => {
  const { uid, tokens: clientTokens } = req.body;
  if (!uid) return res.status(400).json({ error: 'UID is required' });
  if (!clientTokens) return res.status(400).json({ error: 'Tokens are required' });

  try {
    const client = getOAuth2Client();
    client.setCredentials(clientTokens);

    // Add a listener to capture refreshed tokens
    let refreshedTokens: any = null;
    client.on('tokens', (newTokens) => {
      refreshedTokens = newTokens;
    });

    const calendar = google.calendar({ version: 'v3', auth: client });
    
    // Fetch events for the next 7 days
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: nextWeek.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    res.json({ 
      events: response.data.items || [],
      refreshedTokens // Return new tokens if they were refreshed
    });
  } catch (error: any) {
    console.error('Error in /api/calendar/events:', error);
    const message = error.response?.data?.error?.message || error.message || 'Failed to fetch calendar events';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/auth/google/disconnect', async (req, res) => {
  const { uid } = req.query;
  if (!uid) return res.status(400).json({ error: 'UID is required' });

  try {
    await db.collection('google_tokens').doc(uid as string).delete();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting google tokens:', error);
    res.status(500).json({ error: 'Failed to disconnect Google Calendar' });
  }
});

// Vite middleware for development
if (process.env.NODE_ENV !== 'production') {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
