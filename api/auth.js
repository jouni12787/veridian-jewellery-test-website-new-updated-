// /api/auth.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Safely read JSON body without a helper
    const raw = await new Promise((resolve) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => resolve(data || '{}'));
    });
    const { password = '' } = JSON.parse(raw);

    const expectedPassword = process.env.ADMIN_PASSWORD;
    if (!expectedPassword) {
      return res.status(500).json({ success: false, message: 'ADMIN_PASSWORD missing' });
    }

    if (password === expectedPassword) {
      const token = process.env.AUTH_TOKEN || '';
      const cookie = [
        `auth=${encodeURIComponent(token)}`,
        'Path=/', 'HttpOnly', 'SameSite=Lax', 'Secure', 'Max-Age=86400'
      ].join('; ');
      res.setHeader('Set-Cookie', cookie);
      return res.status(200).json({ success: true, message: 'Authentication successful' });
    }

    return res.status(401).json({ success: false, message: 'Invalid password' });
  } catch (err) {
    console.error('Auth API error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
