import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import archiver from "archiver";
import { Resend } from "resend";
import dotenv from "dotenv";
import { initializeApp as initializeAdminApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

dotenv.config();

// ─── Startup Validation ───────────────────────────────────────────────────────
const REQUIRED_ENV_VARS = [
  "RESEND_API_KEY",
  "ADMIN_EMAIL",
  "RESEND_FROM_EMAIL",
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
];
const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.warn(`⚠️ Missing required env vars, some features will be disabled: ${missing.join(", ")}`);
}

// ─── Firebase Admin ───────────────────────────────────────────────────────────
let adminDb: any = null;
if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
  const adminApp = initializeAdminApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    }),
  });
  adminDb = getFirestore(adminApp);
}

// ─── Constants ────────────────────────────────────────────────────────────────
let __filename: string;
let __dirname: string;
try {
  __filename = fileURLToPath(import.meta.url);
  __dirname  = path.dirname(__filename);
} catch {
  __filename = process.cwd();
  __dirname  = process.cwd();
}
const resend      = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "test@example.com";
const FROM_EMAIL  = process.env.RESEND_FROM_EMAIL || "test@example.com";
const PORT        = parseInt(process.env.PORT || "3000", 10);

// ─── Pipedrive Helpers ────────────────────────────────────────────────────────
function getPipedriveDomain(): string {
  const d = process.env.PIPEDRIVE_DOMAIN || "";
  return d.startsWith("http") ? d : `https://${d}`;
}
function pipedriveHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-token": process.env.PIPEDRIVE_API_TOKEN!,
  };
}
function hasPipedriveConfig(): boolean {
  return !!(process.env.PIPEDRIVE_API_TOKEN && process.env.PIPEDRIVE_DOMAIN);
}

// ─── Twilio SMS Helper ──────────────────────────────────────────────────────
function hasTwilioConfig(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
}

/** Normalize NA phone numbers to E.164 (+1XXXXXXXXXX).
 *  Accepts '(555) 123-4567', '555-123-4567', '15551234567', '+15551234567', etc.
 *  Returns null for anything that can't be turned into a valid 11-digit NA number. */
function normalizePhoneNA(raw: string): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15 && String(raw).startsWith("+")) return `+${digits}`;
  return null;
}

/** Send a plain SMS via Twilio REST API. Fire-and-forget friendly.
 *  Returns { ok, sid, error } — never throws. */
async function sendSms(toRaw: string, body: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
  if (!hasTwilioConfig()) {
    return { ok: false, error: "Twilio not configured" };
  }
  const to = normalizePhoneNA(toRaw);
  if (!to) {
    return { ok: false, error: `Invalid phone number: ${toRaw}` };
  }
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const from = process.env.TWILIO_FROM_NUMBER!;
    const creds = Buffer.from(`${sid}:${token}`).toString("base64");
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const form = new URLSearchParams({ To: to, From: from, Body: body });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Twilio SMS failed:", data);
      return { ok: false, error: data.message || "SMS send failed" };
    }
    return { ok: true, sid: data.sid };
  } catch (e: any) {
    console.error("Twilio SMS exception:", e);
    return { ok: false, error: e?.message || "Unknown SMS error" };
  }
}

// ─── Pipeline / Stage Setup Cache ────────────────────────────────────────────
// Submissions are created as Deals in a pipeline. We use two stages:
//   "Incoming Lead"     — fresh, non-duplicate submissions
//   "Duplicate — Review" — flagged duplicates needing manual review
// Stages are auto-discovered or created on first use.
let pipedriveSetupCache: {
  pipelineId: number;
  incomingStageId: number;
  duplicateStageId: number;
} | null = null;

const INCOMING_STAGE_NAME = "Incoming Lead";
const DUPLICATE_STAGE_NAME = "Duplicate — Review";

// Normalize stage names for fuzzy matching — lowercase, strip punctuation,
// collapse whitespace, and treat em-dash/hyphen identically.
function normalizeStageName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[—–\-]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function ensurePipedriveSetup(): Promise<typeof pipedriveSetupCache> {
  if (pipedriveSetupCache) return pipedriveSetupCache;
  if (!hasPipedriveConfig()) return null;

  const domain = getPipedriveDomain();

  // 1. Pick the pipeline — env override or first one we find
  let pipelineId: number | null = null;
  if (process.env.PIPEDRIVE_PIPELINE_ID) {
    pipelineId = parseInt(process.env.PIPEDRIVE_PIPELINE_ID, 10);
  } else {
    const pRes = await fetch(`${domain}/api/v1/pipelines`, { headers: pipedriveHeaders() });
    if (!pRes.ok) {
      console.error("Pipedrive pipelines fetch failed:", pRes.status);
      return null;
    }
    const pData = await pRes.json();
    pipelineId = pData.data?.[0]?.id ?? null;
  }
  if (!pipelineId) {
    console.error("No Pipedrive pipeline available");
    return null;
  }

  // 2. Fetch existing stages for this pipeline
  const sRes = await fetch(`${domain}/api/v1/stages?pipeline_id=${pipelineId}`, { headers: pipedriveHeaders() });
  if (!sRes.ok) {
    console.error("Pipedrive stages fetch failed:", sRes.status);
    return null;
  }
  const sData = await sRes.json();
  const stages: any[] = sData.data || [];

  const findOrCreate = async (name: string, orderHint: number): Promise<number | null> => {
    const target = normalizeStageName(name);
    const existing = stages.find((s: any) => normalizeStageName(s.name) === target);
    if (existing) {
      console.log(`Pipedrive stage matched: "${existing.name}" → ${existing.id}`);
      return existing.id;
    }
    const createRes = await fetch(`${domain}/api/v1/stages`, {
      method: "POST",
      headers: pipedriveHeaders(),
      body: JSON.stringify({ name, pipeline_id: pipelineId, order_nr: orderHint }),
    });
    if (!createRes.ok) {
      console.error(`Failed to create stage "${name}":`, await createRes.text());
      return null;
    }
    const created = (await createRes.json()).data;
    return created?.id ?? null;
  };

  const incomingStageId = await findOrCreate(INCOMING_STAGE_NAME, 0);
  const duplicateStageId = await findOrCreate(DUPLICATE_STAGE_NAME, 1);

  if (!incomingStageId || !duplicateStageId) return null;

  pipedriveSetupCache = { pipelineId, incomingStageId, duplicateStageId };
  console.log(`Pipedrive setup: pipeline=${pipelineId}, incoming=${incomingStageId}, duplicate=${duplicateStageId}`);
  return pipedriveSetupCache;
}

// ─── App Factory ──────────────────────────────────────────────────────────────
export async function createExpressApp() {
  const app = express();

  // ── CORS ────────────────────────────────────────────────────────────────────
  app.use((req: Request, res: Response, next: NextFunction) => {
    const allowed = (process.env.ALLOWED_ORIGINS || "")
      .split(",").map(o => o.trim()).filter(Boolean);
    const origin = req.headers.origin;
    if (!origin || allowed.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin || "*");
    }
    res.setHeader("Access-Control-Allow-Methods",
      "GET, POST, OPTIONS, PUT, PATCH, DELETE");
    res.setHeader("Access-Control-Allow-Headers",
      "X-Requested-With, Content-Type, x-export-token");
    res.setHeader("Content-Security-Policy",
      "frame-ancestors 'self' https://*.wix.com https://*.wixsite.com");
    next();
  });
  app.options("*", (_req: Request, res: Response) => res.sendStatus(204));

  // Capture the raw JSON body on req.rawBody — required for Svix/Resend
  // webhook signature verification which HMACs the exact byte string.
  app.use(express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf.toString("utf8");
    },
  }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  if (!process.env.NETLIFY) {
    app.use(express.static(path.join(__dirname, "public")));
  }

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", mode: process.env.NODE_ENV || "development" });
  });

  // ── Create Job ──────────────────────────────────────────────────────────────
  app.post("/api/create-job", async (req: Request, res: Response) => {
    try {
      const {
        submissionId, city, customerName, customerEmail,
        customerPhone, configuration, status, contractorId, isDuplicate,
      } = req.body;

      if (!submissionId || !city || !configuration) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields: submissionId, city, configuration",
        });
      }
      if (!Array.isArray(configuration.accessories)) {
        configuration.accessories = [];
      }
      const validStatuses = [
        "open", "in-progress", "completed", "contractor_quote",
      ];
      const jobStatus = validStatuses.includes(status) ? status : "open";

      const jobRef = await adminDb.collection("jobs").add({
        submissionId,
        city,
        customerName:  customerName  || "",
        customerEmail: customerEmail || "",
        customerPhone: customerPhone || "",
        configuration,
        status:       jobStatus,
        contractorId: contractorId || null,
        isDuplicate:  isDuplicate  || false,
        createdAt:    FieldValue.serverTimestamp(),
      });
      return res.json({ success: true, jobId: jobRef.id });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("create-job error:", msg);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  });

  // ── Export ──────────────────────────────────────────────────────────────────
  app.get("/api/export", (req: Request, res: Response) => {
    if (req.headers["x-export-token"] !== process.env.EXPORT_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.attachment("eclipse-pergola-app.zip");
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      console.error("Archive error:", err);
      res.status(500).end();
    });
    archive.pipe(res);
    archive.glob("**/*", {
      cwd: process.cwd(),
      ignore: ["node_modules/**", "dist/**", ".git/**", ".env"],
    });
    archive.finalize();
  });

  // ── Update Lead ─────────────────────────────────────────────────────────────
  app.post("/api/update-lead", async (req: Request, res: Response) => {
    try {
      const { leadId, configuration, isDuplicate } = req.body;
      if (!leadId || !configuration) {
        return res.status(400).json({
          success: false, error: "Missing leadId or configuration",
        });
      }
      if (!Array.isArray(configuration.accessories)) {
        configuration.accessories = [];
      }
      if (!hasPipedriveConfig()) return res.json({ success: true });

      const domain = getPipedriveDomain();
      const price = typeof configuration.totalPrice === "string"
        ? parseFloat(configuration.totalPrice.replace(/[^0-9.-]+/g, ""))
        : parseFloat(configuration.totalPrice);

      // Update Deal price (leadId variable now holds a Deal ID).
      // Pipedrive v1 Deals API uses PUT (not PATCH). We still attempt the
      // config note even if the price update fails.
      const updateRes = await fetch(`${domain}/api/v1/deals/${leadId}`, {
        method: "PUT",
        headers: pipedriveHeaders(),
        body: JSON.stringify({
          value: isNaN(price) ? 0 : price,
          currency: "CAD",
        }),
      });
      if (!updateRes.ok) {
        const errText = await updateRes.text();
        console.error(`Pipedrive update-deal ${updateRes.status}:`, errText);
      }

      const warn = isDuplicate
        ? "⚠️ WARNING: Duplicate submission.\n\n" : "";
      const noteRes = await fetch(`${domain}/api/v1/notes`, {
        method: "POST",
        headers: pipedriveHeaders(),
        body: JSON.stringify({
          content: `${warn}Configuration: ${configuration.width}'x`
            + `${configuration.depth}'x${configuration.height}'\n`
            + `Accessories: ${configuration.accessories.join(", ")}`,
          deal_id: leadId,
        }),
      });
      if (!noteRes.ok) {
        const errText = await noteRes.text();
        console.error(`Pipedrive note (config) ${noteRes.status}:`, errText);
      }
      return res.json({ success: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("update-lead error:", msg);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  });

  // ── Create Lead ─────────────────────────────────────────────────────────────
  app.post("/api/create-lead", async (req: Request, res: Response) => {
    try {
      const { name, email, phone, address, city } = req.body;
      if (!name || !email) {
        return res.status(400).json({
          success: false, error: "Missing name or email",
        });
      }
      if (!hasPipedriveConfig()) {
        return res.json({ success: true, leadId: null, isDuplicate: false });
      }

      const domain = getPipedriveDomain();

      // ── Duplicate detection: search by email, phone, and name ─────────────
      const searchPerson = async (term: string, field: 'email' | 'phone' | 'name') => {
        try {
          const exact = field !== 'name'; // email/phone: exact match; name: fuzzy
          const res = await fetch(
            `${domain}/api/v1/persons/search?term=${encodeURIComponent(term)}&fields=${field}&exact_match=${exact}`,
            { headers: pipedriveHeaders() }
          );
          if (!res.ok) return null;
          const data = await res.json();
          const items = data.data?.items || [];
          return items.length > 0 ? items[0].item : null;
        } catch {
          return null;
        }
      };

      const [emailMatch, phoneMatch, nameMatch] = await Promise.all([
        email ? searchPerson(email, 'email') : Promise.resolve(null),
        phone ? searchPerson(phone, 'phone') : Promise.resolve(null),
        name  ? searchPerson(name,  'name')  : Promise.resolve(null),
      ]);

      // Collect which fields matched and which Pipedrive person IDs are involved
      const matchedFields: string[] = [];
      const matchedPersons = new Map<number, { id: number; name?: string; fields: string[] }>();
      const record = (item: any, field: string) => {
        if (!item) return;
        matchedFields.push(field);
        const existing = matchedPersons.get(item.id) || { id: item.id, name: item.name, fields: [] };
        existing.fields.push(field);
        matchedPersons.set(item.id, existing);
      };
      record(emailMatch, 'email');
      record(phoneMatch, 'phone');
      record(nameMatch,  'name');

      const isDuplicate = matchedFields.length > 0;

      // Prefer email match > phone match > name match for linking the lead
      let personId: number | null = emailMatch?.id ?? phoneMatch?.id ?? nameMatch?.id ?? null;

      if (!personId) {
        const pRes = await fetch(`${domain}/api/v1/persons`, {
          method: "POST",
          headers: pipedriveHeaders(),
          body: JSON.stringify({
            name,
            email: [{ value: email, primary: true }],
            phone: [{ value: phone, primary: true }],
          }),
        });
        if (!pRes.ok) {
          console.error("Pipedrive person error:",
            JSON.stringify(await pRes.json()));
          return res.status(500).json({
            success: false, error: "Failed to create Pipedrive person",
          });
        }
        personId = (await pRes.json()).data.id;
      }

      // Ensure pipeline + stages exist, then create a DEAL in the correct stage
      const setup = await ensurePipedriveSetup();
      if (!setup) {
        return res.status(500).json({
          success: false, error: "Failed to configure Pipedrive pipeline",
        });
      }
      const targetStageId = isDuplicate ? setup.duplicateStageId : setup.incomingStageId;

      const dealRes = await fetch(`${domain}/api/v1/deals`, {
        method: "POST",
        headers: pipedriveHeaders(),
        body: JSON.stringify({
          title: `${isDuplicate ? "[DUPLICATE] " : ""}Pergola Quote: ${name}`,
          person_id: personId,
          pipeline_id: setup.pipelineId,
          stage_id: targetStageId,
        }),
      });
      if (!dealRes.ok) {
        console.error("Pipedrive deal error:",
          JSON.stringify(await dealRes.json()));
        return res.status(500).json({
          success: false, error: "Failed to create Pipedrive deal",
        });
      }
      const leadId = (await dealRes.json()).data.id;

      // Build a detailed duplicate warning describing exactly what matched
      let warn = "";
      if (isDuplicate) {
        const fieldsList = Array.from(new Set(matchedFields)).join(", ");
        const personLines = Array.from(matchedPersons.values()).map(p =>
          `  • Person #${p.id}${p.name ? ` (${p.name})` : ''} — matched on: ${p.fields.join(', ')}`
        ).join("\n");
        const multiPerson = matchedPersons.size > 1
          ? `\n⚠️ Matches multiple existing people in CRM — please review manually.\n`
          : "";
        warn = `⚠️ WARNING: Duplicate submission.\n`
             + `Matched fields: ${fieldsList}\n${multiPerson}`
             + `Existing match(es):\n${personLines}\n\n`;
      }

      await fetch(`${domain}/api/v1/notes`, {
        method: "POST",
        headers: pipedriveHeaders(),
        body: JSON.stringify({
          content: `${warn}Customer: ${name}\nPhone: ${phone}\n`
            + `Address: ${address}, ${city}`,
          deal_id: leadId,
        }),
      });
      // Capture the submitter's IP so the admin dashboard can geolocate
      // leads on the map, and return it so the client can save to Firestore.
      const submitterIp = (req.headers["x-forwarded-for"] as string || "").split(",")[0].trim()
        || (req.headers["x-nf-client-connection-ip"] as string || "")
        || req.ip
        || "unknown";

      return res.json({ success: true, leadId, isDuplicate, matchedFields: Array.from(new Set(matchedFields)), submitterIp });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("create-lead error:", msg);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  });

  // ── Update Pipedrive Lead with Images ───────────────────────────────────────
  app.post("/api/update-pipedrive-lead", async (req: Request, res: Response) => {
    try {
      const { leadId, images, summary, price, isDuplicate } = req.body;
      if (!leadId) {
        return res.status(400).json({ success: false, error: "Missing leadId" });
      }
      if (!hasPipedriveConfig()) {
        return res.status(500).json({
          success: false, error: "Pipedrive config missing",
        });
      }
      const domain = getPipedriveDomain();
      if (Array.isArray(images)) {
        for (const image of images) {
          if (!image?.data || typeof image.data !== "string") continue;
          const b64  = image.data.split(",")[1];
          const mime = image.data.split(";")[0].split(":")[1] || "image/png";
          const ext  = mime === "application/pdf" ? "pdf" : "png";
          if (!b64) continue;
          const fd   = new FormData();
          fd.append(
            "file",
            new Blob([Buffer.from(b64, "base64")], { type: mime }),
            `${image.name}.${ext}`
          );
          fd.append("deal_id", leadId);
          const fileRes = await fetch(`${domain}/api/v1/files`, {
            method: "POST",
            headers: { "x-api-token": process.env.PIPEDRIVE_API_TOKEN! },
            body: fd,
          });
          if (!fileRes.ok) {
            console.error("Pipedrive file upload failed:",
              fileRes.status, await fileRes.text());
          }
        }
      }
      if (summary) {
        const warn = isDuplicate
          ? "⚠️ WARNING: Duplicate submission.\n\n" : "";
        await fetch(`${domain}/api/v1/notes`, {
          method: "POST",
          headers: pipedriveHeaders(),
          body: JSON.stringify({
            content: `${warn}Full Summary:\n${summary}\n\nTotal Price: ${price}`,
            deal_id: leadId,
          }),
        });
      }
      return res.json({ success: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("update-pipedrive-lead error:", msg);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  });

  // ── Submit ──────────────────────────────────────────────────────────────────
  app.post("/api/submit", async (req: Request, res: Response) => {
    try {
      const {
        name, email, phone, address, city,
        configuration, pdfAttachment, previewImage, proposalUrl, isDuplicate,
        // Dealer attribution (optional, set when submission came from /dealer/:slug)
        dealerEmail, dealerName, dealerSlug, dealerPhone,
      } = req.body;

      if (!name || !email || !configuration) {
        return res.status(400).json({
          success: false, error: "Missing required fields",
        });
      }
      if (!Array.isArray(configuration.accessories)) {
        configuration.accessories = [];
      }

      // PandaDoc
      let pandadocResult: { id?: string } | null = null;
      if (process.env.PANDADOC_API_KEY && process.env.PANDADOC_TEMPLATE_ID) {
        try {
          const pdRes = await fetch(
            "https://api.pandadoc.com/public/v1/documents",
            {
              method: "POST",
              headers: {
                Authorization: `API-Key ${process.env.PANDADOC_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                name: `Proposal for ${name} - `
                  + `${configuration.width}'x${configuration.depth}' Pergola`,
                template_uuid: process.env.PANDADOC_TEMPLATE_ID,
                recipients: [{
                  email, role: "Client",
                  first_name: name.split(" ")[0] || "Customer",
                  last_name:  name.split(" ").slice(1).join(" ") || " ",
                }],
                tokens: [
                  { name: "Customer.Name",       value: name },
                  { name: "Customer.Email",      value: email },
                  { name: "Customer.Phone",      value: phone },
                  { name: "Customer.Address",    value: `${address}, ${city}` },
                  { name: "Pergola.Dimensions",
                    value: `${configuration.width}' x `
                      + `${configuration.depth}' x ${configuration.height}'` },
                  { name: "Pergola.FrameColor",  value: configuration.frameColor },
                  { name: "Pergola.LouverColor", value: configuration.louverColor },
                  { name: "Pergola.TotalPrice",  value: configuration.totalPrice },
                  { name: "Pergola.Accessories",
                    value: configuration.accessories.join(", ") },
                ],
                metadata: { source: "Pergola Configurator" },
                tags: ["configurator", "pergola"],
              }),
            }
          );
          if (pdRes.ok) pandadocResult = await pdRes.json();
          else console.error("PandaDoc error:",
            JSON.stringify(await pdRes.json()));
        } catch (e) { console.error("PandaDoc failed:", e); }
      }

      // PDF size check
      if (pdfAttachment) {
        const sizeInMB = Buffer.from(
          pdfAttachment.split(",")[1] || pdfAttachment, "base64"
        ).length / (1024 * 1024);
        if (sizeInMB > 10) {
          return res.status(400).json({
            success: false,
            error: `PDF too large (${sizeInMB.toFixed(2)}MB). Limit is 10MB.`,
            pandadocId: pandadocResult?.id,
          });
        }
      }

      // Email
      const customerEmail = email
        && email !== ADMIN_EMAIL
        && !email.includes("onboarding@resend.dev")
        ? email : null;

      const warnHtml = isDuplicate
        ? "<p style='color:red;font-weight:bold;'>⚠️ WARNING: Duplicate submission.</p>"
        : "";

      const previewImgHtml = previewImage
        ? `<div style="text-align:center;margin:24px 0;">
             <img src="cid:pergola-preview" alt="Your Pergola Design" style="max-width:100%;border-radius:8px;border:1px solid #e5e7eb;" />
           </div>`
        : "";

      const proposalLinkHtml = proposalUrl
        ? `<div style="text-align:center;margin:28px 0;">
             <a href="${proposalUrl}" style="display:inline-block;background:#C5A059;color:#000;font-weight:700;font-size:15px;text-decoration:none;padding:14px 40px;border-radius:8px;letter-spacing:.05em;">
               View Your Interactive Proposal →
             </a>
             <p style="color:#999;font-size:11px;margin:10px 0 0;">Opens a live view with your 3D design, pricing breakdown, and all available upgrades.</p>
           </div>`
        : "";

      // Extract submissionId from the proposalUrl so we can tag the email
      // for the Resend webhook to route events back to the right submission.
      const submissionId =
        typeof proposalUrl === "string"
          ? proposalUrl.match(/\/proposal\/([^/?#]+)/)?.[1]
          : undefined;
      const resendTags = submissionId
        ? [{ name: "submissionId", value: submissionId }]
        : undefined;

      const makePayload = (to: string | string[]) => ({
        from: FROM_EMAIL,
        to,
        ...(resendTags ? { tags: resendTags } : {}),
        subject: `${isDuplicate ? "[DUPLICATE] " : ""}New Pergola Quote: ${name}`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
            <h1 style="color:#1A1A1A;border-bottom:3px solid #C5A059;padding-bottom:12px;">New Pergola Quote</h1>
            ${warnHtml}
            ${previewImgHtml}
            ${proposalLinkHtml}
            <h2 style="color:#C5A059;font-size:16px;margin-top:28px;">Customer</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone}</p>
            <p><strong>Address:</strong> ${address}, ${city}</p>
            <h2 style="color:#C5A059;font-size:16px;margin-top:28px;">Configuration</h2>
            <ul>
              <li><strong>Dimensions:</strong> ${configuration.width}' x `
                + `${configuration.depth}' x ${configuration.height}'</li>
              <li><strong>Frame Color:</strong> ${configuration.frameColor}</li>
              <li><strong>Louver Color:</strong> ${configuration.louverColor}</li>
              <li><strong>Total Price:</strong> ${configuration.totalPrice}</li>
            </ul>
            <h3 style="color:#C5A059;font-size:14px;margin-top:20px;">Accessories</h3>
            <ul>
              ${configuration.accessories
                .map((a: string) => `<li>${a}</li>`).join("")}
            </ul>
            <p style="color:#666;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:12px;">
              Click the link above to view the full interactive proposal with all rendering views, specifications, and pricing.
            </p>
          </div>`,
        attachments: [
          ...(pdfAttachment ? [{
            filename: `Eclipse_Proposal_${name.replace(/\s+/g, "_")}.pdf`,
            content:  pdfAttachment.split(",")[1] || pdfAttachment,
          }] : []),
          ...(previewImage ? [{
            filename: "pergola-preview.png",
            content:  previewImage.split(",")[1] || previewImage,
            content_id: "pergola-preview",
          }] : []),
        ],
      });

      let adminEmailId: string | undefined;
      let adminError: string | null = null;
      try {
        const r = await resend.emails.send(makePayload(ADMIN_EMAIL));
        if (r.error) {
          adminError = r.error.message;
          console.error("Resend admin error:", r.error);
        } else {
          adminEmailId = r.data?.id;
        }
      } catch (e: unknown) {
        adminError = e instanceof Error ? e.message : "Unknown";
      }

      let customerEmailId: string | undefined;
      let customerError: string | null = null;
      if (customerEmail) {
        try {
          const r = await resend.emails.send(makePayload(customerEmail));
          if (r.error) customerError = r.error.message;
          else customerEmailId = r.data?.id;
        } catch (e: unknown) {
          customerError = e instanceof Error ? e.message : "Unknown";
        }
      }

      // ── SMS: text the proposal link to the customer (fire-and-forget) ──────
      // Sends only if Twilio is configured, a phone was provided, and we have
      // a proposal URL to link to.
      let customerSmsSid: string | undefined;
      let customerSmsError: string | null = null;
      let adminSmsSid: string | undefined;
      if (phone && proposalUrl && hasTwilioConfig()) {
        const customerBody =
          `Hi ${String(name || '').split(' ')[0] || 'there'}, thanks for designing your Eclipse Pergola! ` +
          `View your interactive proposal and accept it here: ${proposalUrl}\n\n` +
          `— Eclipse Pergola`;
        const r = await sendSms(phone, customerBody);
        if (r.ok) customerSmsSid = r.sid;
        else customerSmsError = r.error || "SMS failed";

        // Also text admin phone if configured (ADMIN_SMS_NUMBER env)
        if (process.env.ADMIN_SMS_NUMBER) {
          const adminBody =
            `📨 New ${isDuplicate ? '[DUPLICATE] ' : ''}Pergola Quote from ${name} ` +
            `(${configuration.width}'x${configuration.depth}'x${configuration.height}', ${configuration.totalPrice})` +
            (dealerName ? ` via ${dealerName}` : '') + `. ` +
            `Proposal: ${proposalUrl}`;
          const a = await sendSms(process.env.ADMIN_SMS_NUMBER, adminBody);
          if (a.ok) adminSmsSid = a.sid;
        }

        // Also text the dealer if this lead came through their co-branded link
        if (dealerPhone) {
          const dealerSmsBody =
            `📨 New lead via your Eclipse Pergola configurator: ${name} ` +
            `(${configuration.totalPrice}, ${configuration.width}x${configuration.depth}'). ` +
            `Customer: ${email}${phone ? ` / ${phone}` : ''}.`;
          await sendSms(dealerPhone, dealerSmsBody);
        }
      }

      // ── Dealer notification email — separate from admin email ────────────
      if (dealerEmail && resend) {
        (async () => {
          try {
            await resend.emails.send({
              from: FROM_EMAIL,
              to: dealerEmail,
              subject: `New lead from your Eclipse co-branded configurator — ${name}`,
              html: `
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1A1A1A;">
                  <h1 style="color:#1A1A1A;border-bottom:3px solid #C5A059;padding-bottom:12px;">New Customer Lead</h1>
                  <p>A customer just submitted a quote through your co-branded link${dealerName ? ` (${dealerName})` : ''}:</p>
                  <h2 style="color:#C5A059;font-size:16px;margin-top:24px;">Customer</h2>
                  <p><strong>Name:</strong> ${name}<br/>
                     <strong>Email:</strong> ${email}<br/>
                     ${phone ? `<strong>Phone:</strong> ${phone}<br/>` : ''}
                     ${address ? `<strong>Address:</strong> ${address}, ${city || ''}` : ''}
                  </p>
                  <h2 style="color:#C5A059;font-size:16px;margin-top:24px;">Project</h2>
                  <p><strong>Size:</strong> ${configuration.width}' × ${configuration.depth}' × ${configuration.height}'<br/>
                     <strong>Frame:</strong> ${configuration.frameColor}<br/>
                     <strong>Louvers:</strong> ${configuration.louverColor}<br/>
                     <strong>Customer Total:</strong> ${configuration.totalPrice}
                  </p>
                  <div style="margin:28px 0;text-align:center;">
                    <a href="${proposalUrl}" style="display:inline-block;background:#C5A059;color:#000;font-weight:700;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;">View Customer Proposal</a>
                  </div>
                  <p style="color:#666;font-size:12px;line-height:1.5;border-top:1px solid #eee;padding-top:12px;margin-top:24px;">
                    This lead has been auto-assigned to you in the Eclipse CRM. We'll be in touch shortly to coordinate next steps.
                  </p>
                </div>
              `,
            });
          } catch (e) {
            console.error('Dealer notification email failed:', e);
          }
        })();
      }

      return res.json({
        success: true,
        adminEmailId,
        adminError,
        customerEmailId,
        customerError,
        customerSmsSid,
        customerSmsError,
        adminSmsSid,
        pandadocId: pandadocResult?.id,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("submit error:", msg);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  });

  // ── Email Status ────────────────────────────────────────────────────────────
  app.get("/api/email-status/:id", async (req: Request, res: Response) => {
    try {
      const { data, error } = await resend.emails.get(req.params.id);
      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
      return res.json({ success: true, data });
    } catch (e: unknown) {
      return res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : "Unknown",
      });
    }
  });

  // ── Admin: send an email from the CRM ──────────────────────────────────────
  app.post("/api/admin/send-email", async (req: Request, res: Response) => {
    try {
      const { to, subject, body, submissionId } = req.body;
      if (!to || !subject || !body) {
        return res.status(400).json({ success: false, error: "Missing to/subject/body" });
      }
      if (!resend) {
        return res.status(500).json({ success: false, error: "Email service not configured" });
      }
      // Escape HTML, then auto-linkify http(s) URLs as real <a> tags so
      // Resend's click tracking (and our webhook) can see the clicks.
      // Plain text URLs get auto-linked by the email client, but those
      // clicks bypass Resend's tracking rewrite entirely.
      const escaped = String(body).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const linkified = escaped.replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" style="color:#C5A059;text-decoration:underline;">$1</a>'
      );
      const htmlBody = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1A1A1A;line-height:1.55;"><div style="white-space:pre-wrap;">${linkified}</div><hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/><p style="color:#999;font-size:11px;">This message was sent from Eclipse Pergola CRM.</p></div>`;
      const r = await resend.emails.send({
        from: FROM_EMAIL,
        to,
        subject,
        html: htmlBody,
        text: String(body),
        ...(submissionId
          ? { tags: [{ name: "submissionId", value: String(submissionId) }] }
          : {}),
      });
      if (r.error) {
        return res.status(500).json({ success: false, error: r.error.message });
      }
      return res.json({ success: true, emailId: r.data?.id, submissionId });
    } catch (e: any) {
      console.error("admin send-email error:", e);
      return res.status(500).json({ success: false, error: e?.message || "Internal error" });
    }
  });

  // ── Resend Webhook: email delivery/open/click tracking ─────────────────────
  // Configure at https://resend.com/webhooks with URL:
  //   https://<domain>/api/webhooks/resend
  // The signing secret (starts with whsec_) goes in RESEND_WEBHOOK_SECRET.
  // Events from Resend include `tags` we set at send time — we read the
  // submissionId tag to route events back to the correct submission's
  // activities timeline.
  app.post("/api/webhooks/resend", async (req: Request, res: Response) => {
    const log = (m: string) => console.log(`[resend-webhook] ${m}`);
    try {
      if (!process.env.RESEND_WEBHOOK_SECRET) {
        log("RESEND_WEBHOOK_SECRET missing — rejecting");
        return res.status(500).json({ error: "Webhook not configured" });
      }
      if (!adminDb) {
        log("Firebase Admin SDK unavailable — rejecting");
        return res.status(500).json({ error: "Database unavailable" });
      }

      // Svix signature verification — uses the RAW body string we captured
      // in the express.json verify callback above.
      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        log("no raw body on request");
        return res.status(400).json({ error: "Missing body" });
      }

      const { Webhook } = await import("svix");
      const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET);
      let event: any;
      try {
        event = wh.verify(rawBody, {
          "svix-id":        req.header("svix-id") || "",
          "svix-timestamp": req.header("svix-timestamp") || "",
          "svix-signature": req.header("svix-signature") || "",
        });
      } catch (err: any) {
        log(`signature verification failed: ${err?.message || err}`);
        return res.status(401).json({ error: "Invalid signature" });
      }

      const type: string = event?.type || "";
      const data = event?.data || {};
      const emailId: string | undefined = data.email_id || data.id;
      const tags = Array.isArray(data.tags) ? data.tags : [];
      const submissionIdTag = tags.find(
        (t: any) => t?.name === "submissionId"
      );
      const submissionId: string | undefined = submissionIdTag?.value;

      log(`type=${type} emailId=${emailId} submissionId=${submissionId || "(none)"}`);

      if (!submissionId) {
        // Email wasn't tagged (probably sent before tags were added, or a
        // transactional email we didn't tag). Acknowledge the webhook so
        // Resend stops retrying, but skip the activity write.
        return res.status(200).json({ received: true, skipped: "no submissionId tag" });
      }

      // Map Resend event type → our ActivityType + friendly message.
      const subject = data.subject || "(no subject)";
      const toField = Array.isArray(data.to) ? data.to.join(", ") : (data.to || "");
      let activityType: string | null = null;
      let message = "";
      switch (type) {
        case "email.delivered":
          activityType = "email_delivered";
          message = `Email delivered to ${toField}: "${subject}"`;
          break;
        case "email.opened":
          activityType = "email_opened";
          message = `Customer opened: "${subject}"`;
          break;
        case "email.clicked": {
          activityType = "email_clicked";
          const link = data.click?.link || data.link || "";
          message = link
            ? `Customer clicked link in "${subject}": ${link}`
            : `Customer clicked a link in: "${subject}"`;
          break;
        }
        case "email.bounced":
          activityType = "email_bounced";
          message = `Email bounced to ${toField}: "${subject}"`;
          break;
        case "email.complained":
          activityType = "email_complained";
          message = `Recipient marked as spam: "${subject}"`;
          break;
        default:
          // Ignore email.sent (we already log it ourselves) and any other
          // event types.
          return res.status(200).json({ received: true, ignored: type });
      }

      await adminDb
        .collection("submissions")
        .doc(submissionId)
        .collection("activities")
        .add({
          type: activityType,
          message,
          actor: "system",
          createdAt: FieldValue.serverTimestamp(),
          meta: {
            source: "resend",
            emailId,
            eventType: type,
            to: toField,
            subject,
            userAgent: data.click?.ipAddress ? data.click : undefined,
          },
        });

      return res.status(200).json({ received: true });
    } catch (e: any) {
      console.error("[resend-webhook] error:", e);
      return res.status(500).json({ error: e?.message || "Internal error" });
    }
  });

  // ── Admin: send an SMS from the CRM ────────────────────────────────────────
  app.post("/api/admin/send-sms", async (req: Request, res: Response) => {
    try {
      const { to, body, submissionId } = req.body;
      if (!to || !body) {
        return res.status(400).json({ success: false, error: "Missing to/body" });
      }
      const result = await sendSms(to, String(body));
      if (!result.ok) {
        return res.status(500).json({ success: false, error: result.error });
      }
      return res.json({ success: true, sid: result.sid, submissionId });
    } catch (e: any) {
      console.error("admin send-sms error:", e);
      return res.status(500).json({ success: false, error: e?.message || "Internal error" });
    }
  });

  // ── Accept Proposal (customer signature) ────────────────────────────────────
  // Called from the public /proposal/:id page when a customer signs.
  // Captures the client IP (server-side, trustworthy), triggers admin email +
  // Pipedrive note. Returns the captured IP to the client which writes the
  // full signature to Firestore itself (via client SDK, guarded by rules).
  // This avoids requiring the Firebase Admin SDK to be provisioned — useful
  // when GCP org policy blocks service-account key creation.
  app.post("/api/accept-proposal", async (req: Request, res: Response) => {
    try {
      const { submissionId, signedName, acceptedTerms } = req.body;
      if (!submissionId || !signedName || !acceptedTerms) {
        return res.status(400).json({ success: false, error: "Missing submissionId, signedName, or terms acceptance." });
      }

      // Capture server-side signer metadata
      const signerIp = (req.headers["x-forwarded-for"] as string || "").split(",")[0].trim()
        || (req.headers["x-nf-client-connection-ip"] as string || "")
        || req.ip
        || "unknown";
      const signerUserAgent = (req.headers["user-agent"] as string || "unknown").slice(0, 500);

      // Look up the submission for name/email/leadId if admin is available;
      // otherwise fall back to the values the client passed.
      let existing: any = {
        name: signedName,
        email: req.body.customerEmail || null,
        leadId: req.body.leadId || null,
      };
      if (adminDb) {
        try {
          const snap = await adminDb.collection("submissions").doc(submissionId).get();
          if (snap.exists) existing = { ...snap.data(), ...existing };
        } catch (e) {
          console.warn("Admin doc lookup skipped:", e);
        }
      }

      // Fire-and-forget: Pipedrive deal note
      const leadId = existing.leadId || req.body.leadId || null;
      if (leadId && hasPipedriveConfig()) {
        const domain = getPipedriveDomain();
        (async () => {
          try {
            await fetch(`${domain}/api/v1/notes`, {
              method: "POST",
              headers: pipedriveHeaders(),
              body: JSON.stringify({
                content: `✅ Proposal accepted by ${signedName}\nAccepted: ${new Date().toISOString()}\nIP: ${signerIp}`,
                deal_id: leadId,
              }),
            });
          } catch (e) { console.error("Pipedrive accept note error:", e); }
        })();
      }

      // Fire-and-forget: admin email alert
      if (resend) {
        (async () => {
          try {
            await resend.emails.send({
              from: FROM_EMAIL,
              to: ADMIN_EMAIL,
              subject: `✅ Proposal Accepted — ${existing.name || signedName}`,
              html: `
                <h2 style="color:#1A1A1A;">Proposal Accepted</h2>
                <p><strong>${signedName}</strong> has signed their Eclipse Pergola proposal.</p>
                <p><strong>Submission ID:</strong> ${submissionId}</p>
                <p><strong>Customer:</strong> ${existing.name || 'N/A'} (${existing.email || 'N/A'})</p>
                <p><strong>Accepted:</strong> ${new Date().toLocaleString()}</p>
                <p><strong>IP:</strong> ${signerIp}</p>
                <p><strong>Device:</strong> ${signerUserAgent.slice(0, 120)}</p>
                <p><a href="https://eclipsepergola.netlify.app/admin" style="display:inline-block;background:#C5A059;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Open in CRM</a></p>
              `,
            });
          } catch (e) { console.error("Accept email error:", e); }
        })();
      }

      // Return captured metadata so the client can include it in its
      // Firestore signature write.
      return res.json({
        success: true,
        signerIp,
        signerUserAgent,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("accept-proposal error:", msg);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  });

  // ── Generate / Update Dealer Profile (called when contractor is created) ────
  // Writes a public-readable dealerProfiles/{slug} doc with display info
  // for the /dealer/:slug landing page. Admin SDK bypasses Firestore rules.
  app.post("/api/admin/upsert-dealer-profile", async (req: Request, res: Response) => {
    try {
      const { slug, contractorId, contractorEmail, companyName, contactName, phone, logoUrl, adminSecret } = req.body;
      if (adminSecret !== process.env.EXPORT_SECRET) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      if (!slug || !companyName || !contractorEmail) {
        return res.status(400).json({ success: false, error: "Missing slug, companyName, or contractorEmail" });
      }
      if (!adminDb) {
        return res.status(500).json({ success: false, error: "Firebase Admin not initialized" });
      }

      const cleanSlug = String(slug).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
      if (!cleanSlug) return res.status(400).json({ success: false, error: "Invalid slug" });

      // Check uniqueness — fail if slug taken by a different contractor
      const existing = await adminDb.collection("dealerProfiles").doc(cleanSlug).get();
      if (existing.exists && existing.data()?.contractorId !== contractorId) {
        return res.status(409).json({ success: false, error: `Slug "${cleanSlug}" is already in use by another dealer.` });
      }

      await adminDb.collection("dealerProfiles").doc(cleanSlug).set({
        slug: cleanSlug,
        contractorId: contractorId || null,
        contractorEmail,
        companyName,
        contactName: contactName || "",
        phone: phone || "",
        logoUrl: logoUrl || "",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // Also store the slug + logoUrl back on the contractor doc for convenience
      if (contractorId) {
        await adminDb.collection("contractors").doc(contractorId).set({
          slug: cleanSlug,
          logoUrl: logoUrl || "",
        }, { merge: true });
      }

      return res.json({ success: true, slug: cleanSlug });
    } catch (err: any) {
      console.error("upsert-dealer-profile error:", err);
      return res.status(500).json({ success: false, error: err?.message || "Internal error" });
    }
  });

  // ── Invite Contractor ───────────────────────────────────────────────────────
  app.post("/api/pro/invite-contractor", async (req: Request, res: Response) => {
    try {
      const { companyName, contactName, email, phone, discountPercentage, slug, logoUrl, adminSecret } = req.body;

      if (adminSecret !== process.env.EXPORT_SECRET) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      if (!companyName || !contactName || !email) {
        return res.status(400).json({ success: false, error: "Missing required fields: companyName, contactName, email" });
      }
      if (!adminDb) {
        return res.status(500).json({ success: false, error: "Firebase Admin not initialized" });
      }

      // Generate / clean the slug
      const cleanSlug = slug
        ? String(slug).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
        : String(companyName).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

      // Verify slug is unique (if provided)
      if (cleanSlug) {
        const existingSlug = await adminDb.collection("dealerProfiles").doc(cleanSlug).get();
        if (existingSlug.exists) {
          return res.status(409).json({ success: false, error: `Dealer slug "${cleanSlug}" is already in use. Pick a different one.` });
        }
      }

      const inviteToken = crypto.randomUUID();
      const contractorRef = await adminDb.collection("contractors").add({
        companyName,
        contactName,
        email,
        phone: phone || "",
        discountPercentage: Number(discountPercentage) || 0,
        slug: cleanSlug,
        logoUrl: logoUrl || "",
        status: "invited",
        inviteToken,
        invitedAt: FieldValue.serverTimestamp(),
        activatedAt: null,
        lastLogin: null,
        createdBy: "admin",
      });

      // Create the public dealer profile that the /dealer/:slug page reads
      if (cleanSlug) {
        await adminDb.collection("dealerProfiles").doc(cleanSlug).set({
          slug: cleanSlug,
          contractorId: contractorRef.id,
          contractorEmail: email,
          companyName,
          contactName,
          phone: phone || "",
          logoUrl: logoUrl || "",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      const proUrl = process.env.PRO_URL || "https://pro.eclipsepergola.ca";
      const signupLink = `${proUrl}/signup?token=${inviteToken}`;

      if (resend) {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: "You're Invited to Eclipse Pro — Contractor Portal",
          html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#C5A059;font-size:28px;margin:0;">Eclipse Pro</h1>
      <p style="color:#888;font-size:14px;margin:8px 0 0;">Contractor Portal</p>
    </div>
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:32px;">
      <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Welcome, ${contactName}!</h2>
      <p style="color:#ccc;font-size:15px;line-height:1.6;margin:0 0 8px;">
        You've been invited to join <strong style="color:#C5A059;">Eclipse Pro</strong> as a contractor for <strong style="color:#fff;">${companyName}</strong>.
      </p>
      <p style="color:#ccc;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Click the button below to create your account and start receiving project opportunities.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${signupLink}" style="display:inline-block;background:#C5A059;color:#000;font-weight:700;font-size:16px;text-decoration:none;padding:14px 40px;border-radius:8px;">
          Create Your Account
        </a>
      </div>
      ${cleanSlug ? `
      <div style="margin-top:32px;padding:20px;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:8px;">
        <h3 style="color:#C5A059;font-size:14px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.1em;">Your Co-Branded Configurator</h3>
        <p style="color:#ccc;font-size:13px;margin:0 0 12px;line-height:1.5;">Share this link with your customers. They'll design their pergola on a page co-branded with your company logo, and the lead will be automatically routed to you:</p>
        <a href="https://eclipsepergola.netlify.app/dealer/${cleanSlug}" style="color:#C5A059;word-break:break-all;font-size:13px;font-family:monospace;">https://eclipsepergola.netlify.app/dealer/${cleanSlug}</a>
      </div>
      ` : ''}
      <p style="color:#666;font-size:12px;line-height:1.5;margin:24px 0 0;border-top:1px solid #333;padding-top:16px;">
        If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${signupLink}" style="color:#C5A059;word-break:break-all;">${signupLink}</a>
      </p>
    </div>
    <p style="color:#555;font-size:11px;text-align:center;margin-top:24px;">
      Eclipse Pergola &mdash; Contractor Portal
    </p>
  </div>
</body>
</html>`,
        });
      }

      return res.json({ success: true, contractorId: contractorRef.id, inviteToken, slug: cleanSlug });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("invite-contractor error:", msg);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  });

  // ── Activate Contractor ────────────────────────────────────────────────────
  app.post("/api/pro/activate-contractor", async (req: Request, res: Response) => {
    try {
      const { inviteToken, uid } = req.body;

      if (!inviteToken || !uid) {
        return res.status(400).json({ success: false, error: "Missing inviteToken or uid" });
      }
      if (!adminDb) {
        return res.status(500).json({ success: false, error: "Firebase Admin not initialized" });
      }

      // Find the contractor doc with matching invite token
      const snapshot = await adminDb
        .collection("contractors")
        .where("inviteToken", "==", inviteToken)
        .where("status", "==", "invited")
        .limit(1)
        .get();

      if (snapshot.empty) {
        return res.status(404).json({ success: false, error: "Invalid or expired invite token" });
      }

      const oldDoc = snapshot.docs[0];
      const oldData = oldDoc.data();

      // Create new doc keyed by Firebase Auth UID
      await adminDb.collection("contractors").doc(uid).set({
        companyName: oldData.companyName,
        contactName: oldData.contactName,
        email: oldData.email,
        phone: oldData.phone || "",
        discountPercentage: oldData.discountPercentage || 0,
        status: "active",
        inviteToken: null,
        invitedAt: oldData.invitedAt,
        activatedAt: FieldValue.serverTimestamp(),
        lastLogin: null,
        createdBy: oldData.createdBy || "admin",
      });

      // Delete old auto-ID doc if different from uid
      if (oldDoc.id !== uid) {
        await adminDb.collection("contractors").doc(oldDoc.id).delete();
      }

      return res.json({ success: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("activate-contractor error:", msg);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  });

  // ── Vite / SPA Fallback ─────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production" && !process.env.NETLIFY) {
    // Only import Vite in local development, never on Netlify
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Pro portal SPA fallback
    app.get("/pro.html", (_req: Request, res: Response) =>
      res.sendFile(path.join(distPath, "pro.html"))
    );
    app.get("/login", (_req: Request, res: Response) =>
      res.sendFile(path.join(distPath, "pro.html"))
    );
    app.get("/signup", (_req: Request, res: Response) =>
      res.sendFile(path.join(distPath, "pro.html"))
    );
    app.get("/dashboard", (_req: Request, res: Response) =>
      res.sendFile(path.join(distPath, "pro.html"))
    );
    app.get("/quotes*", (_req: Request, res: Response) =>
      res.sendFile(path.join(distPath, "pro.html"))
    );
    app.get("/account", (_req: Request, res: Response) =>
      res.sendFile(path.join(distPath, "pro.html"))
    );
    // Retail SPA fallback (catch-all)
    app.get("*", (_req: Request, res: Response) =>
      res.sendFile(path.join(distPath, "index.html"))
    );
  }

  return app;
}

async function startServer() {
  const app = await createExpressApp();
  app.listen(PORT, "0.0.0.0", () =>
    console.log(`✅ Server running on http://localhost:${PORT}`)
  );
}
startServer();
