// punto! — real-time completion notification proxy
// Deploy as HTTP val on val.town. Requires env vars:
//   - FIREBASE_PROJECT_ID        es. "punto-staging" o "punto-84646"
//   - FIREBASE_SERVICE_ACCOUNT   JSON completo della service account (stesso usato dal cron)
//
// Endpoint: POST /
// Auth:     Authorization: Bearer <Firebase ID token>
// Body:     { noteId: string }
//
// Contract con client:
//   1. Client scrive sul doc nota: completionNotifyPending=true + By/ByName/At
//   2. Client chiama questo val (fire-and-forget)
//   3. Val legge la nota, valida che l'utente autenticato == completionNotifyBy,
//      invia FCM ai destinatari, resetta i flag
//   4. Fallback: se il val fallisce, il cron GHA (ogni 5min) pulisce l'arretrato

import { SignJWT, jwtVerify, createRemoteJWKSet } from "npm:jose@5";

const COMPLETION_STRINGS: Record<string, { title: string; body: (name: string) => string }> = {
  it: {
    title: "punto! — Promemoria evaso",
    body: (name) => `${name} ha evaso un promemoria condiviso`,
  },
  en: {
    title: "punto! — Reminder completed",
    body: (name) => `${name} completed a shared reminder`,
  },
};

let cachedGcpToken: { token: string; exp: number } | null = null;
const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID")!;
const SERVICE_ACCOUNT = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!);

const firebaseJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"),
  { cacheMaxAge: 60 * 60 * 1000 },
);

async function verifyFirebaseIdToken(idToken: string): Promise<string> {
  // Firebase usa cert pubblici in formato X509 sull'endpoint sopra. jose JWKS parser
  // non gestisce X509 direttamente → usiamo l'endpoint JWKS-compatibile alternativo:
  const jwksUrl = new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  );
  const jwks = createRemoteJWKSet(jwksUrl, { cacheMaxAge: 60 * 60 * 1000 });
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  });
  if (!payload.sub) throw new Error("ID token without sub");
  return payload.sub as string;
}

async function getGcpAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedGcpToken && cachedGcpToken.exp > now + 60) return cachedGcpToken.token;

  // Import PEM private key → CryptoKey
  const pem = (SERVICE_ACCOUNT.private_key as string)
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(SERVICE_ACCOUNT.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!resp.ok) throw new Error(`GCP token exchange failed: ${await resp.text()}`);
  const { access_token, expires_in } = await resp.json();
  cachedGcpToken = { token: access_token, exp: now + expires_in };
  return access_token;
}

type FirestoreValue = any;

function firestoreToJs(v: FirestoreValue): any {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(firestoreToJs);
  if ("mapValue" in v) {
    const out: any = {};
    for (const [k, val] of Object.entries(v.mapValue.fields ?? {})) out[k] = firestoreToJs(val);
    return out;
  }
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return new Date(v.timestampValue).getTime();
  return null;
}

async function firestoreGet(token: string, path: string): Promise<any | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`firestoreGet ${path}: ${resp.status} ${await resp.text()}`);
  const doc = await resp.json();
  const out: any = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) out[k] = firestoreToJs(v);
  return out;
}

async function firestoreResetCompletion(token: string, noteId: string): Promise<void> {
  // PATCH con updateMask che include i 4 campi → quelli omessi dal body vengono cancellati.
  const mask = [
    "completionNotifyPending",
    "completionNotifyBy",
    "completionNotifyByName",
    "completionNotifyAt",
  ];
  const qs = mask.map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join("&");
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/notes/${noteId}?${qs}`;
  const body = {
    fields: {
      completionNotifyPending: { booleanValue: false },
    },
  };
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`firestoreResetCompletion: ${resp.status} ${await resp.text()}`);
}

async function fcmSend(
  token: string,
  registrationToken: string,
  title: string,
  body: string,
  noteId: string,
): Promise<boolean> {
  const url = `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`;
  const message = {
    message: {
      token: registrationToken,
      webpush: {
        notification: {
          title,
          body,
          icon: "/icons/icon-192x192.png",
          tag: `completion-${noteId}`,
        },
        data: { title, body, noteId, kind: "completion" },
      },
    },
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  return resp.ok;
}

export default async function (req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return new Response("missing token", { status: 401 });
  const idToken = auth.slice(7);

  let callerUid: string;
  try {
    callerUid = await verifyFirebaseIdToken(idToken);
  } catch (e) {
    return new Response(`invalid token: ${(e as Error).message}`, { status: 401 });
  }

  let noteId: string;
  try {
    const body = await req.json();
    noteId = body.noteId;
    if (!noteId || typeof noteId !== "string") throw new Error("noteId required");
  } catch {
    return new Response("invalid body", { status: 400 });
  }

  const gcpToken = await getGcpAccessToken();
  const note = await firestoreGet(gcpToken, `notes/${noteId}`);
  if (!note) return new Response("note not found", { status: 404 });

  if (!note.completionNotifyPending) {
    return Response.json({ ok: true, noop: true, reason: "no pending flag" });
  }
  if (note.completionNotifyBy !== callerUid) {
    return new Response("caller not the completer", { status: 403 });
  }

  const ownerUid: string = note.uid;
  const collabUids: string[] = note.collaboratorUids ?? [];
  const recipients = new Set<string>([ownerUid, ...collabUids]);
  recipients.delete(callerUid);

  const byName: string = note.completionNotifyByName || "A collaborator";

  if (recipients.size === 0) {
    await firestoreResetCompletion(gcpToken, noteId);
    return Response.json({ ok: true, sent: 0, reason: "no recipients" });
  }

  const userDocs = await Promise.all(
    [...recipients].map(async (uid) => ({ uid, data: await firestoreGet(gcpToken, `users/${uid}`) })),
  );

  const sends: Promise<boolean>[] = [];
  for (const { data } of userDocs) {
    if (!data) continue;
    const tokens: string[] = data.fcmTokens ?? [];
    const lang = (data.language && data.language in COMPLETION_STRINGS ? data.language : "it") as "it" | "en";
    const strings = COMPLETION_STRINGS[lang];
    for (const t of tokens) {
      sends.push(fcmSend(gcpToken, t, strings.title, strings.body(byName), noteId));
    }
  }

  const results = await Promise.all(sends);
  const sent = results.filter(Boolean).length;

  await firestoreResetCompletion(gcpToken, noteId);

  return Response.json({ ok: true, sent, total: sends.length });
}
