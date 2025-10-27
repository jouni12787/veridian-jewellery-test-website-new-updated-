export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  res.setHeader(
    'Set-Cookie',
    ['auth=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Secure', 'Max-Age=0'].join('; ')
  );
  return res.status(200).json({ success: true });
}
