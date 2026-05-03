import { db, doc, getDoc, setDoc } from '../firebase.ts';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
}

export async function getGoogleAuthUrl(uid: string): Promise<string> {
  const response = await fetch(`/api/auth/google/url?uid=${uid}`);
  if (!response.ok) throw new Error('Failed to get auth URL');
  const { url } = await response.json();
  return url;
}

export async function getCalendarEvents(uid: string): Promise<CalendarEvent[]> {
  // Fetch tokens from Firestore on the client side to bypass server-side permission issues
  const tokenRef = doc(db, 'google_tokens', uid);
  const tokenSnap = await getDoc(tokenRef);
  
  if (!tokenSnap.exists()) {
    return [];
  }

  const { tokens } = tokenSnap.data();

  const response = await fetch('/api/calendar/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, tokens }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to fetch calendar events');
  }

  const { events, refreshedTokens } = await response.json();

  // If tokens were refreshed by the server, update them in Firestore
  if (refreshedTokens) {
    await setDoc(tokenRef, {
      tokens: { ...tokens, ...refreshedTokens },
      updatedAt: new Date()
    }, { merge: true });
  }

  return events;
}

export async function disconnectGoogleCalendar(uid: string): Promise<void> {
  const response = await fetch(`/api/auth/google/disconnect?uid=${uid}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to disconnect Google Calendar');
}
