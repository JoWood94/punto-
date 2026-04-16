// punto! — scheduled reminder delivery (val.town Cron trigger, every 1 min)
//
// Port del cron GitHub Actions (server/index.js) con granularità 1 min invece di 5.
//
// Deploy:
//   - Nuovo file nel Project "notifyCompletion" (o val separato)
//   - Trigger: Cron → "* * * * *" (ogni minuto)
//   - Env vars condivise col val HTTP: FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT
//
// Funzioni:
//   1. checkAndSendReminders() — query reminderStatus=pending, invia FCM,
//      gestisce ricorrenze e snooze, aggiorna reminderTime/reminderStatus e blocks[]
//   2. checkAndSendCompletions() — cleanup di flag completionNotifyPending residui
//      (rete di sicurezza: il val HTTP è il path primario, questo pulisce i lost event)

import { SignJWT } from "npm:jose@5";

const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID")!;
const SERVICE_ACCOUNT = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!);

let cachedGcpToken: { token: string; exp: number } | null = null;

const NOTIF_STRINGS: Record<string, {
  defaultTitle: string;
  bodyWithDate: (d: string) => string;
  bodyNoDate: string;
}> = {
  it: {
    defaultTitle: "punto! — Promemoria",
    bodyWithDate: (d) => `Hai un promemoria per il ${d}`,
    bodyNoDate: "Hai un promemoria in scadenza!",
  },
  en: {
    defaultTitle: "punto! — Reminder",
    bodyWithDate: (d) => `You have a reminder for ${d}`,
    bodyNoDate: "You have an upcoming reminder!",
  },
};

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

// ── GCP OAuth ───────────────────────────────────────────────────────────────

async function getGcpAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedGcpToken && cachedGcpToken.exp > now + 60) return cachedGcpToken.token;

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

// ── Firestore Value encoder/decoder ─────────────────────────────────────────

function fsFromJs(v: any): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsFromJs) } };
  if (typeof v === "object") {
    const fields: any = {};
    for (const [k, val] of Object.entries(v)) fields[k] = fsFromJs(val);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function fsToJs(v: any): any {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return new Date(v.timestampValue).getTime();
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fsToJs);
  if ("mapValue" in v) {
    const out: any = {};
    for (const [k, val] of Object.entries(v.mapValue.fields ?? {})) out[k] = fsToJs(val);
    return out;
  }
  return null;
}

function fsDocToObj(doc: any): any {
  const out: any = { _id: doc.name.split("/").pop(), _path: doc.name };
  for (const [k, v] of Object.entries(doc.fields ?? {})) out[k] = fsToJs(v);
  return out;
}

// ── Firestore REST ──────────────────────────────────────────────────────────

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

async function fsGet(token: string, path: string): Promise<any | null> {
  const resp = await fetch(`${FS_BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`fsGet ${path}: ${resp.status} ${await resp.text()}`);
  return fsDocToObj(await resp.json());
}

type Filter =
  | { fieldFilter: { field: { fieldPath: string }; op: string; value: any } }
  | { compositeFilter: { op: "AND"; filters: Filter[] } };

async function fsRunQuery(
  token: string,
  parent: string | null, // path della collection padre, o null per root
  collectionId: string,
  allDescendants: boolean,
  filter: Filter | null,
): Promise<any[]> {
  const url = parent
    ? `${FS_BASE}/${parent}:runQuery`
    : `${FS_BASE}:runQuery`;
  const query: any = {
    structuredQuery: {
      from: [{ collectionId, allDescendants }],
    },
  };
  if (filter) query.structuredQuery.where = filter;
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });
  if (!resp.ok) throw new Error(`fsRunQuery ${collectionId}: ${resp.status} ${await resp.text()}`);
  const results = await resp.json();
  const docs: any[] = [];
  for (const r of results) {
    if (r.document) docs.push(fsDocToObj(r.document));
  }
  return docs;
}

// PATCH con updateMask — aggiorna solo i field elencati, altri preservati
async function fsPatch(
  token: string,
  path: string,
  fields: Record<string, any>,
  deleteFields: string[] = [],
): Promise<void> {
  const maskFields = [...Object.keys(fields), ...deleteFields];
  const qs = maskFields.map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join("&");
  const body = { fields: {} as any };
  for (const [k, v] of Object.entries(fields)) body.fields[k] = fsFromJs(v);
  // deleteFields omessi dal body → cancellati dal doc per come funziona updateMask
  const resp = await fetch(`${FS_BASE}/${path}?${qs}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`fsPatch ${path}: ${resp.status} ${await resp.text()}`);
}

async function fsDelete(token: string, path: string): Promise<void> {
  const resp = await fetch(`${FS_BASE}/${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`fsDelete ${path}: ${resp.status} ${await resp.text()}`);
  }
}

// arrayRemove via commit API con transforms
async function fsArrayRemove(
  token: string,
  path: string,
  field: string,
  values: string[],
): Promise<void> {
  if (values.length === 0) return;
  const body = {
    writes: [
      {
        transform: {
          document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`,
          fieldTransforms: [
            {
              fieldPath: field,
              removeAllFromArray: { values: values.map((v) => ({ stringValue: v })) },
            },
          ],
        },
      },
    ],
  };
  const resp = await fetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) throw new Error(`fsArrayRemove ${path}.${field}: ${resp.status} ${await resp.text()}`);
}

// ── FCM ─────────────────────────────────────────────────────────────────────

interface FcmSendResult { ok: boolean; invalidToken: boolean; }

async function fcmSend(
  token: string,
  registrationToken: string,
  title: string,
  body: string,
  noteId: string,
  kind: "reminder" | "completion" = "reminder",
): Promise<FcmSendResult> {
  const url = `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`;
  const message = {
    message: {
      token: registrationToken,
      webpush: {
        notification: {
          title,
          body,
          icon: "/icons/icon-192x192.png",
          tag: kind === "completion" ? `completion-${noteId}` : noteId,
          data: { noteId, kind },
        },
        data: { title, body, noteId, kind },
      },
    },
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (resp.ok) return { ok: true, invalidToken: false };
  const errText = await resp.text();
  const invalid =
    resp.status === 404 || resp.status === 400 ||
    errText.includes("UNREGISTERED") || errText.includes("INVALID_ARGUMENT");
  return { ok: false, invalidToken: invalid };
}

// ── Business logic ──────────────────────────────────────────────────────────

function calculateNextReminder(currentTime: number, recurrence: string): number {
  const d = new Date(currentTime);
  switch (recurrence) {
    case "daily":   d.setDate(d.getDate() + 1); break;
    case "weekly":  d.setDate(d.getDate() + 7); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "yearly":  d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.getTime();
}

const PGP_MARKER = "-----BEGIN PGP MESSAGE-----";
const isEncrypted = (val: any) => typeof val === "string" && val.startsWith(PGP_MARKER);

async function loadUser(
  token: string,
  cache: Record<string, { tokens: string[]; notifTitleEnabled: boolean; language: string }>,
  uid: string,
): Promise<void> {
  if (cache[uid]) return;
  const userData = await fsGet(token, `users/${uid}`);
  cache[uid] = {
    tokens: userData?.fcmTokens ?? [],
    notifTitleEnabled: userData?.notifTitleEnabled === true,
    language: userData?.language ?? "it",
  };
}

async function checkAndSendReminders(gcpToken: string): Promise<{ sent: number; processed: number }> {
  const now = Date.now();

  // Query reminderStatus == 'pending'
  const pendingNotes = await fsRunQuery(gcpToken, null, "notes", false, {
    fieldFilter: {
      field: { fieldPath: "reminderStatus" },
      op: "EQUAL",
      value: { stringValue: "pending" },
    },
  });

  if (pendingNotes.length === 0) return { sent: 0, processed: 0 };

  // Snoozes attivi via collectionGroup
  const snoozeMap = new Map<string, Set<string>>();
  try {
    const snoozes = await fsRunQuery(gcpToken, null, "reminderSnoozes", true, {
      fieldFilter: {
        field: { fieldPath: "snoozedUntil" },
        op: "GREATER_THAN",
        value: { integerValue: String(now) },
      },
    });
    for (const s of snoozes) {
      // _path: projects/.../documents/notes/{noteId}/reminderSnoozes/{uid}
      const parts = s._path.split("/");
      const noteIdx = parts.indexOf("notes");
      const noteId = parts[noteIdx + 1];
      const uid = s._id;
      if (!snoozeMap.has(noteId)) snoozeMap.set(noteId, new Set());
      snoozeMap.get(noteId)!.add(uid);
    }
  } catch (e) {
    console.warn("[snooze] collectionGroup query failed, proceeding senza filter:", (e as Error).message);
  }

  const tokensCache: Record<string, { tokens: string[]; notifTitleEnabled: boolean; language: string }> = {};
  let sentCount = 0;
  let processed = 0;

  for (const note of pendingNotes) {
    const reminderMs = typeof note.reminderTime === "number" ? note.reminderTime : Number(note.reminderTime);
    if (!reminderMs || reminderMs > now) continue;
    processed++;

    const noteId = note._id;
    const ownerUid = note.uid;
    const snoozedUids = snoozeMap.get(noteId) ?? new Set<string>();

    await loadUser(gcpToken, tokensCache, ownerUid);

    // Collaborators con editReminders:true (filtro lato client, REST non gestisce facilmente nested map filter)
    const collabUidTokenPairs: { uid: string; token: string; language: string; notifTitleEnabled: boolean }[] = [];
    try {
      const collaborators = await fsRunQuery(gcpToken, `notes/${noteId}`, "collaborators", false, null);
      for (const collab of collaborators) {
        const perms = collab.permissions ?? {};
        if (perms.editReminders !== true) continue;
        const collabUid = collab._id;
        if (snoozedUids.has(collabUid)) continue;
        await loadUser(gcpToken, tokensCache, collabUid);
        for (const t of tokensCache[collabUid].tokens) {
          collabUidTokenPairs.push({
            uid: collabUid,
            token: t,
            language: tokensCache[collabUid].language,
            notifTitleEnabled: tokensCache[collabUid].notifTitleEnabled,
          });
        }
      }
    } catch (e) {
      console.error(`[note ${noteId}] collab fetch failed:`, (e as Error).message);
    }

    // Owner tokens se non snoozato
    const ownerPairs = snoozedUids.has(ownerUid)
      ? []
      : tokensCache[ownerUid].tokens.map((t) => ({
          uid: ownerUid,
          token: t,
          language: tokensCache[ownerUid].language,
          notifTitleEnabled: tokensCache[ownerUid].notifTitleEnabled,
        }));

    const allPairs = [...ownerPairs, ...collabUidTokenPairs];

    if (allPairs.length > 0) {
      const reminderDate = new Date(reminderMs).toLocaleString("it-IT", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
        timeZone: "Europe/Rome",
      });
      const rawTitle = note.title;

      // Invia un messaggio per destinatario (FCM v1 è 1:1, no multicast)
      const failedByUid: Record<string, string[]> = {};
      const sends = allPairs.map(async (p) => {
        const strings = NOTIF_STRINGS[p.language] ?? NOTIF_STRINGS["it"];
        const msgTitle = (p.notifTitleEnabled && rawTitle && !isEncrypted(rawTitle))
          ? rawTitle
          : strings.defaultTitle;
        const bodyText = strings.bodyWithDate(reminderDate);
        const result = await fcmSend(gcpToken, p.token, msgTitle, bodyText, noteId, "reminder");
        if (!result.ok && result.invalidToken) {
          if (!failedByUid[p.uid]) failedByUid[p.uid] = [];
          failedByUid[p.uid].push(p.token);
        }
        return result.ok;
      });
      const results = await Promise.all(sends);
      if (results.some(Boolean)) sentCount++;

      // Cleanup token invalidi
      for (const [failUid, failTokens] of Object.entries(failedByUid)) {
        try {
          await fsArrayRemove(gcpToken, `users/${failUid}`, "fcmTokens", failTokens);
        } catch (e) {
          console.error(`[cleanup] arrayRemove users/${failUid}:`, (e as Error).message);
        }
      }
    }

    // Recurrence / sent transition
    const recurrence = note.recurrence ?? "none";
    const endDate = typeof note.recurrenceEndDate === "number" ? note.recurrenceEndDate : null;

    let updatedBlocks = note.blocks;
    if (Array.isArray(note.blocks)) {
      // Aggiorna reminder block se presente
      const nextTime = (recurrence !== "none") ? calculateNextReminder(reminderMs, recurrence) : null;
      const expired = nextTime !== null && endDate !== null && nextTime > endDate;

      updatedBlocks = note.blocks.map((b: any) => {
        if (b.type !== "reminder") return b;
        if (recurrence === "none" || expired) return { ...b, status: "sent" };
        return { ...b, time: nextTime, status: "pending" };
      });
    }

    const patch: Record<string, any> = { blocks: updatedBlocks };
    if (recurrence !== "none") {
      const nextTime = calculateNextReminder(reminderMs, recurrence);
      const expired = endDate !== null && nextTime > endDate;
      if (expired) {
        patch.reminderStatus = "sent";
      } else {
        patch.reminderStatus = "pending";
        patch.reminderTime = nextTime;
      }
    } else {
      patch.reminderStatus = "sent";
    }

    try {
      await fsPatch(gcpToken, `notes/${noteId}`, patch);
    } catch (e) {
      console.error(`[note ${noteId}] patch failed:`, (e as Error).message);
    }

    // Cleanup snoozes per questa istanza di reminder
    for (const snoozedUid of snoozedUids) {
      try {
        await fsDelete(gcpToken, `notes/${noteId}/reminderSnoozes/${snoozedUid}`);
      } catch { /* best effort */ }
    }
  }

  return { sent: sentCount, processed };
}

async function checkAndSendCompletions(gcpToken: string): Promise<{ sent: number }> {
  const pending = await fsRunQuery(gcpToken, null, "notes", false, {
    fieldFilter: {
      field: { fieldPath: "completionNotifyPending" },
      op: "EQUAL",
      value: { booleanValue: true },
    },
  });

  if (pending.length === 0) return { sent: 0 };

  const userCache: Record<string, { tokens: string[]; language: string }> = {};
  let sent = 0;

  for (const note of pending) {
    const noteId = note._id;
    const byUid: string = note.completionNotifyBy;
    const byName: string = note.completionNotifyByName || "A collaborator";
    const ownerUid: string = note.uid;
    const recipients = new Set<string>([ownerUid, ...((note.collaboratorUids ?? []) as string[])]);
    recipients.delete(byUid);

    const sends: Promise<any>[] = [];
    for (const uid of recipients) {
      if (!userCache[uid]) {
        const u = await fsGet(gcpToken, `users/${uid}`);
        userCache[uid] = {
          tokens: u?.fcmTokens ?? [],
          language: u?.language ?? "it",
        };
      }
      const strings = COMPLETION_STRINGS[userCache[uid].language] ?? COMPLETION_STRINGS["it"];
      for (const t of userCache[uid].tokens) {
        sends.push(fcmSend(gcpToken, t, strings.title, strings.body(byName), noteId, "completion"));
      }
    }
    await Promise.all(sends);
    if (sends.length > 0) sent++;

    // Reset flag
    try {
      await fsPatch(gcpToken, `notes/${noteId}`,
        { completionNotifyPending: false },
        ["completionNotifyBy", "completionNotifyByName", "completionNotifyAt"],
      );
    } catch (e) {
      console.error(`[completion ${noteId}] reset failed:`, (e as Error).message);
    }
  }

  return { sent };
}

// ── Scheduled entry point ──────────────────────────────────────────────────

export default async function () {
  const t0 = Date.now();
  console.log(`[${new Date().toISOString()}] scheduledReminders run`);
  try {
    const gcpToken = await getGcpAccessToken();
    const [rem, comp] = await Promise.all([
      checkAndSendReminders(gcpToken).catch((e) => {
        console.error("checkAndSendReminders error:", e);
        return { sent: 0, processed: 0 };
      }),
      checkAndSendCompletions(gcpToken).catch((e) => {
        console.error("checkAndSendCompletions error:", e);
        return { sent: 0 };
      }),
    ]);
    console.log(
      `done in ${Date.now() - t0}ms — reminders sent=${rem.sent} processed=${rem.processed}, ` +
      `completions sent=${comp.sent}`,
    );
  } catch (e) {
    console.error("scheduledReminders fatal:", e);
    throw e;
  }
}
