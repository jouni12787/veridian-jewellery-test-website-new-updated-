export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = process.env.AUTH_TOKEN || '';
    const bearerOk = (req.headers.authorization || '') === `Bearer ${token}`;
    const cookieOk = req.cookies?.auth === token;

    if (!bearerOk && !cookieOk) {
      return res.status(401).json({ error: 'Invalid or missing token' });
    }

    const url = process.env.purchase_sheet;
    if (!url) {
      return res.status(500).json({ error: 'purchase_sheet is not set' });
    }

    const upstream = await fetch(url, { cache: 'no-store' });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Sheets fetch failed: ${upstream.status}` });
    }

    const text = await upstream.text();

    try {
      const data = text ? JSON.parse(text) : [];
      return res.status(200).json(data);
    } catch (parseError) {
      return res.status(200).json({ raw: text });
    }
  } catch (error) {
    console.error('Purchases error:', error);
    return res.status(500).json({ error: 'Failed to fetch purchase data' });
  }
}
