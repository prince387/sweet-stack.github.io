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
    const update =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});

    /*
     * Google Apps Script Content Service redirects responses
     * from the /exec URL to a one-time script.googleusercontent.com
     * URL. For customer Telegram callbacks we therefore relay
     * the Telegram update through Apps Script doGet instead of
     * POST, avoiding the POST-redirect problem.
     */
    const payload = Buffer
      .from(JSON.stringify(update), "utf8")
      .toString("base64url");

    const target = new URL(gasUrl);

    target.searchParams.set("bot", "customer");
    target.searchParams.set("key", secret);
    target.searchParams.set("payload64", payload);

    const response = await fetch(target.toString(), {
      method: "GET",
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
