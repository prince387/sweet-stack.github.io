export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  const gasUrl = process.env.SWEET_MART_GAS_URL;
  const secret = process.env.SWEET_MART_API_SECRET;

  if (!gasUrl || !secret) {
    return res.status(500).json({
      success: false,
      error: "Sweet Mart API environment variables are not configured."
    });
  }

  try {
    const target = new URL(gasUrl);
    target.searchParams.set("bot", "customer");
    target.searchParams.set("key", secret);

    const update =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});

    const response = await fetch(target.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(update),
      redirect: "follow"
    });

    const text = await response.text();

    if (!text.trim()) {
      return res.status(502).json({
        success: false,
        error: "Google Apps Script returned an empty response.",
        upstreamStatus: response.status
      });
    }

    try {
      const parsed = JSON.parse(text);
      return res.status(200).json(parsed);
    } catch {
      return res.status(502).json({
        success: false,
        error: "Google Apps Script returned a non-JSON response.",
        upstreamStatus: response.status,
        bodyPreview: text.slice(0, 500)
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Customer webhook relay failed."
    });
  }
}
