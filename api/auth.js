// /api/auth.js
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_ATTEMPTS = 5;
const MAX_BODY_BYTES = 1024;

const rateLimitState = new Map();

function getClientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(key, now) {
  const entry = rateLimitState.get(key);
  if (!entry || entry.reset <= now) {
    rateLimitState.set(key, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_ATTEMPTS) {
    return true;
  }
  return false;
}

function clearRateLimitOnSuccess(key) {
  rateLimitState.delete(key);
}

function timingSafeMatch(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string') {
    return false;
  }

  let mismatch = expected.length ^ provided.length;
  const maxLength = Math.max(expected.length, provided.length);

  for (let i = 0; i < maxLength; i += 1) {
    const expectedCode = i < expected.length ? expected.charCodeAt(i) : 0;
    const providedCode = i < provided.length ? provided.charCodeAt(i) : 0;
    mismatch |= expectedCode ^ providedCode;
  }

  return mismatch === 0;
}

async function readLimitedBody(req) {
  const chunks = [];
  let bytes = 0;

  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    bytes += buf.length;
    if (bytes > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Payload too large'), { statusCode: 413 });
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw || '{}';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const clientKey = getClientKey(req);
  const now = Date.now();
  if (isRateLimited(clientKey, now)) {
    return res
      .status(429)
      .json({ success: false, message: 'Too many attempts. Please try again later.' });
  }

  try {
    const raw = await readLimitedBody(req);
    let password = '';

    try {
      const parsed = JSON.parse(raw);
      password = typeof parsed?.password === 'string' ? parsed.password : '';
    } catch (parseErr) {
      console.warn('Invalid JSON received on /api/auth');
    }

    const expectedPassword = process.env.ADMIN_PASSWORD;
    if (!expectedPassword) {
      return res.status(500).json({ success: false, message: 'Server misconfigured' });
    }

    if (password && timingSafeMatch(expectedPassword, password)) {
      clearRateLimitOnSuccess(clientKey);
      const token = process.env.AUTH_TOKEN || '';
      const cookie = [
        `auth=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Secure',
        'Max-Age=86400'
      ].join('; ');
      res.setHeader('Set-Cookie', cookie);
      return res.status(200).json({ success: true, message: 'Authentication successful' });
    }

    return res
      .status(401)
      .json({ success: false, message: 'Invalid credentials' });
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    if (statusCode === 413) {
      return res.status(413).json({ success: false, message: 'Payload too large' });
    }

    console.error('Auth API error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
