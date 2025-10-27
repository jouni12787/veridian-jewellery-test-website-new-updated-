function safeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  let mismatch = a.length ^ b.length;
  const maxLength = Math.max(a.length, b.length);

  for (let i = 0; i < maxLength; i += 1) {
    const codeA = i < a.length ? a.charCodeAt(i) : 0;
    const codeB = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= codeA ^ codeB;
  }

  return mismatch === 0;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const token = process.env.AUTH_TOKEN;
  if (!token) {
    return res.status(500).json({ success: false, message: 'Server misconfigured' });
  }

  const cookieToken = req.cookies?.auth;
  if (cookieToken && safeEquals(token, cookieToken)) {
    return res.status(200).json({ success: true, authenticated: true });
  }

  return res.status(401).json({ success: false, authenticated: false });
}
