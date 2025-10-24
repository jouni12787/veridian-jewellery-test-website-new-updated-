export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const bearerOk = (req.headers.authorization || '') === `Bearer ${process.env.AUTH_TOKEN}`;
    const cookieOk  = req.cookies?.auth === process.env.AUTH_TOKEN;

    if (!bearerOk && !cookieOk) return res.status(401).json({ error: 'Invalid or missing token' });

    const url = process.env.GOOGLE_SHEET_URL;
    if (!url) return res.status(500).json({ error: 'GOOGLE_SHEET_URL is not set' });

    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return res.status(r.status).json({ error: `Sheets fetch failed: ${r.status}` });

    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    console.error('Inventory error:', e);
    return res.status(500).json({ error: 'Failed to fetch inventory' });
  }
}
