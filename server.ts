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

  app.use(express.json({ limit: "50mb" }));
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
      return res.json({ success: true, leadId, isDuplicate, matchedFields: Array.from(new Set(matchedFields)) });
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

      const makePayload = (to: string | string[]) => ({
        from: FROM_EMAIL,
        to,
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
              Full proposal with all rendering views, specifications, and pricing is attached as a PDF.
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

      return res.json({
        success: true,
        adminEmailId,
        adminError,
        customerEmailId,
        customerError,
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

  // ── Invite Contractor ───────────────────────────────────────────────────────
  app.post("/api/pro/invite-contractor", async (req: Request, res: Response) => {
    try {
      const { companyName, contactName, email, phone, discountPercentage, adminSecret } = req.body;

      if (adminSecret !== process.env.EXPORT_SECRET) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      if (!companyName || !contactName || !email) {
        return res.status(400).json({ success: false, error: "Missing required fields: companyName, contactName, email" });
      }
      if (!adminDb) {
        return res.status(500).json({ success: false, error: "Firebase Admin not initialized" });
      }

      const inviteToken = crypto.randomUUID();
      const contractorRef = await adminDb.collection("contractors").add({
        companyName,
        contactName,
        email,
        phone: phone || "",
        discountPercentage: Number(discountPercentage) || 0,
        status: "invited",
        inviteToken,
        invitedAt: FieldValue.serverTimestamp(),
        activatedAt: null,
        lastLogin: null,
        createdBy: "admin",
      });

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

      return res.json({ success: true, contractorId: contractorRef.id, inviteToken });
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
