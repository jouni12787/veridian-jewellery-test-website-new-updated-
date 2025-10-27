// /api/auth.js
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_ATTEMPTS = 5;
const MAX_BODY_BYTES = 1024;

const rateLimitState = new Map();

function getClientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  let ip = 'unknown';
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    ip = forwarded.split(',')[0].trim();
  } else if (req.socket?.remoteAddress) {
    ip = req.socket.remoteAddress;
  }

  const userAgent = req.headers['user-agent'] || 'unknown-user-agent';
  const secChUa = req.headers['sec-ch-ua'] || 'unknown-ch-ua';

  return `${ip}|${userAgent}|${secChUa}`;
}

function consumeRateLimit(key, now) {
  const entry = rateLimitState.get(key);
  if (!entry || entry.reset <= now) {
    const reset = now + RATE_LIMIT_WINDOW_MS;
    rateLimitState.set(key, { count: 1, reset });
    return { limited: false, retryAfterMs: reset - now };
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_ATTEMPTS) {
    return { limited: true, retryAfterMs: Math.max(0, entry.reset - now) };
  }

  return { limited: false, retryAfterMs: Math.max(0, entry.reset - now) };
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
  const rateLimit = consumeRateLimit(clientKey, now);
  if (rateLimit.limited) {
    const retryAfterSeconds = Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000));
    const minutes = Math.floor(retryAfterSeconds / 60);
    const seconds = retryAfterSeconds % 60;
    const parts = [];
    if (minutes > 0) {
      parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
    }
    if (seconds > 0) {
      parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
    }
    const waitString = parts.join(' and ') || 'a moment';

    res.setHeader('Retry-After', String(retryAfterSeconds));

    return res.status(429).json({
      success: false,
      message: `Too many attempts. Please try again in ${waitString}.`,
      retryAfterSeconds
    });
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
