export default async function handler(req, res) {
  const gasUrl = process.env.SWEET_MART_GAS_URL;
  const secret = process.env.SWEET_MART_API_SECRET;

  if (!gasUrl || !secret) {
    return res.status(500).json({
      success: false,
      error: "Sweet Mart API environment variables are not configured."
    });
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

      try {
        return res.status(response.status).json(JSON.parse(text));
      } catch {
        return res.status(response.status).send(text);
      }
    }

    if (req.method === "POST") {
      const target = new URL(gasUrl);
      target.searchParams.set("action", "order");
      target.searchParams.set("key", secret);

      const body =
        typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body || {});

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

      try {
        return res.status(response.status).json(JSON.parse(text));
      } catch {
        return res.status(response.status).send(text);
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
