// Netlify sync function (10s timeout) — uploads a PDF to a Pipedrive Deal.
// Kept separate from the main Express-wrapped /api handler so it can receive
// a large base64 payload without going through the express body parser stack.

function getPipedriveDomain(): string {
  const d = process.env.PIPEDRIVE_DOMAIN || "";
  return d.startsWith("http") ? d : `https://${d}`;
}

export const handler = async (event: any) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body || "{}");
    const { leadId, fileName, fileData } = body;

    if (!leadId || !fileData) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: "Missing leadId or fileData" }) };
    }
    if (!process.env.PIPEDRIVE_API_TOKEN || !process.env.PIPEDRIVE_DOMAIN) {
      return { statusCode: 500, body: JSON.stringify({ success: false, error: "Pipedrive config missing" }) };
    }

    const domain = getPipedriveDomain();
    const b64 = fileData.split(",")[1] || fileData;
    const mime = fileData.split(";")[0]?.split(":")[1] || "application/pdf";
    const ext = mime === "application/pdf" ? "pdf" : "png";

    const fd = new FormData();
    fd.append(
      "file",
      new Blob([Buffer.from(b64, "base64")], { type: mime }),
      `${fileName}.${ext}`
    );
    fd.append("deal_id", leadId);

    const res = await fetch(`${domain}/api/v1/files`, {
      method: "POST",
      headers: { "x-api-token": process.env.PIPEDRIVE_API_TOKEN },
      body: fd,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Pipedrive file upload failed: ${res.status} ${errText}`);
      return { statusCode: 500, body: JSON.stringify({ success: false, error: errText }) };
    }

    console.log(`PDF uploaded to Pipedrive lead ${leadId}: ${fileName}.${ext}`);
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err: any) {
    console.error("upload-pdf-background error:", err?.message || err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err?.message || "Unknown error" }) };
  }
};
