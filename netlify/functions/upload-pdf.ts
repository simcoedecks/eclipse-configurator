// Netlify sync function — uploads a PDF to a Pipedrive Deal.
// Uses the `form-data` npm package for reliable multipart uploads
// (Node's native FormData is not well supported by fetch for multipart
// POSTs to external APIs).

import FormData from "form-data";

function getPipedriveDomain(): string {
  const d = process.env.PIPEDRIVE_DOMAIN || "";
  return d.startsWith("http") ? d : `https://${d}`;
}

export const handler = async (event: any) => {
  const log = (msg: string) => console.log(`[upload-pdf] ${msg}`);

  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body || "{}");
    const { leadId, fileName, fileData } = body;

    log(`invoked: leadId=${leadId}, fileName=${fileName}, dataLen=${fileData?.length || 0}`);

    if (!leadId || !fileData) {
      log("missing leadId or fileData");
      return { statusCode: 400, body: JSON.stringify({ success: false, error: "Missing leadId or fileData" }) };
    }
    if (!process.env.PIPEDRIVE_API_TOKEN || !process.env.PIPEDRIVE_DOMAIN) {
      log("pipedrive env vars missing");
      return { statusCode: 500, body: JSON.stringify({ success: false, error: "Pipedrive config missing" }) };
    }

    const domain = getPipedriveDomain();
    const b64 = (fileData.split(",")[1] || fileData).trim();
    const mime = fileData.split(";")[0]?.split(":")[1] || "application/pdf";
    const ext = mime === "application/pdf" ? "pdf" : "png";

    const buffer = Buffer.from(b64, "base64");
    log(`decoded buffer: ${buffer.length} bytes, mime=${mime}`);

    const fd = new FormData();
    fd.append("file", buffer, {
      filename: `${fileName}.${ext}`,
      contentType: mime,
    });
    fd.append("deal_id", String(leadId));

    const url = `${domain}/api/v1/files?api_token=${process.env.PIPEDRIVE_API_TOKEN}`;
    log(`uploading to Pipedrive: ${domain}/api/v1/files (deal_id=${leadId})`);

    // Use node's native https by calling fetch via node-fetch style with form-data.
    // form-data exposes getBuffer()/getHeaders() which we pass to fetch directly.
    const formHeaders = fd.getHeaders();
    const formBuffer = fd.getBuffer();

    const res = await fetch(url, {
      method: "POST",
      headers: formHeaders,
      body: formBuffer,
    });

    const resText = await res.text();
    if (!res.ok) {
      log(`Pipedrive upload FAILED ${res.status}: ${resText.slice(0, 500)}`);
      return { statusCode: 500, body: JSON.stringify({ success: false, status: res.status, error: resText }) };
    }

    log(`Pipedrive upload OK: ${resText.slice(0, 200)}`);
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err: any) {
    log(`exception: ${err?.message || err}`);
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err?.message || "Unknown error" }) };
  }
};
