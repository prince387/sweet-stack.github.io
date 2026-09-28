export default async function handler(req, res) {
  const gasUrl = process.env.SWEET_MART_GAS_URL;
  const secret = process.env.SWEET_MART_API_SECRET;

  if (!gasUrl || !secret) {
    return res.status(500).json({
      success: false,
      error: "Sweet Mart API environment variables are not configured."
    });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    if (req.method === "GET") {
      const params = new URLSearchParams(req.query || {});
      const action = params.get("action") || "";
      const target = new URL(gasUrl);
      target.searchParams.set("action", action);
      target.searchParams.set("key", secret);

      const response = await fetch(target.toString(), { redirect: "follow" });
      const text = await response.text();

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-store");

      const trimmed = text.trim();

      if (!trimmed) {
        return res.status(502).json({
          success: false,
          error: "Google Apps Script returned an empty response.",
          upstreamStatus: response.status,
          upstreamContentType: response.headers.get("content-type") || ""
        });
      }

      try {
        return res.status(response.status).json(JSON.parse(trimmed));
      } catch {
        return res.status(502).json({
          success: false,
          error: "Google Apps Script returned a non-JSON response.",
          upstreamStatus: response.status,
          upstreamContentType: response.headers.get("content-type") || "",
          bodyPreview: trimmed.slice(0, 500)
        });
      }
    }

    if (req.method === "POST") {
      const requestAction =
        String((req.query && req.query.action) || "order").trim();

      const target = new URL(gasUrl);
      target.searchParams.set("action", requestAction);
      target.searchParams.set("key", secret);

      let requestData;

      if (typeof req.body === "string") {
        requestData = JSON.parse(req.body || "{}");
      } else {
        requestData = req.body || {};
      }

      const body =
        requestAction === "order"
          ? JSON.stringify({
              action: "order",
              orderData: requestData
            })
          : requestAction === "ask_product"
            ? JSON.stringify({
                action: "ask_product",
                questionData: requestData
              })
            : JSON.stringify({
                action: requestAction,
                data: requestData
              });

      const response = await fetch(target.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body,
        redirect: "follow"
      });

      const text = await response.text();

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-store");

      const trimmed = text.trim();

      if (!trimmed) {
        return res.status(502).json({
          success: false,
          error: "Google Apps Script returned an empty response.",
          upstreamStatus: response.status,
          upstreamContentType: response.headers.get("content-type") || ""
        });
      }

      try {
        return res.status(response.status).json(JSON.parse(trimmed));
      } catch {
        return res.status(502).json({
          success: false,
          error: "Google Apps Script returned a non-JSON response.",
          upstreamStatus: response.status,
          upstreamContentType: response.headers.get("content-type") || "",
          bodyPreview: trimmed.slice(0, 500)
        });
      }
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Proxy request failed."
    });
  }
}
