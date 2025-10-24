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

    const url = process.env.google_sheet_statement;
    if (!url) {
      return res.status(500).json({ error: 'google_sheet_statement is not set' });
    }

    const upstream = await fetch(url, { cache: 'no-store' });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Sheets fetch failed: ${upstream.status}` });
    }

    const data = await upstream.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Statement error:', error);
    return res.status(500).json({ error: 'Failed to fetch statement data' });
  }
}
