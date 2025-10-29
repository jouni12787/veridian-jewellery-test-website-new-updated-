// /api/sales.js
async function parseJSONBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch { return {}; }
    }
    if (
      Buffer.isBuffer(req.body) ||
      req.body instanceof Uint8Array ||
      req.body instanceof ArrayBuffer
    ) {
      try {
        const rawBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
        return JSON.parse(rawBuffer.toString('utf8'));
      } catch {
        return {};
      }
    }
    if (typeof req.body === 'object') {
      return req.body;
    }
    return req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

const SALES_FEED_URL =
  process.env.SALES_FEED_URL ||
  process.env.SALES_SHEET_URL ||
  process.env.sales_sheet ||
  process.env.GOOGLE_SHEET_URL ||
  '';

const SALES_SUBMIT_URL =
  process.env.SALES_SUBMIT_URL ||
  process.env.SELL_API_URL ||
  '';

const SALES_SUBMIT_TOKEN =
  process.env.SALES_SUBMIT_TOKEN ||
  process.env.SELL_API_TOKEN ||
  '';

async function handleGet(req, res) {
  try {
    const token = process.env.AUTH_TOKEN || '';
    const bearerOk = (req.headers.authorization || '') === `Bearer ${token}`;
    const cookieOk = req.cookies?.auth === token;

    if (!bearerOk && !cookieOk) {
      return res.status(401).json({ error: 'Invalid or missing token' });
    }

    if (!SALES_FEED_URL) {
      return res.status(500).json({ error: 'SALES_FEED_URL is not set' });
    }

    const upstream = await fetch(SALES_FEED_URL, { cache: 'no-store' });
    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .json({ error: `Sales feed failed: ${upstream.status}` });
    }

    const text = await upstream.text();
    if (!text) {
      return res.status(200).json([]);
    }

    try {
      return res.status(200).json(JSON.parse(text));
    } catch (parseError) {
      console.warn('Failed to parse sales feed JSON:', parseError);
      return res.status(200).json({ raw: text });
    }
  } catch (error) {
    console.error('Sales feed error:', error);
    return res.status(500).json({ error: 'Failed to fetch sales feed' });
  }
}

async function handlePost(req, res) {
  // Auth via cookie set at login
  if (req.cookies?.auth !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: missing or bad auth cookie' });
  }

  try {
    const { sku, employee, price, notes, availability, timestamp } = await parseJSONBody(req);

    if (!sku || !employee || price === undefined || price === null) {
      return res.status(400).json({ error: 'Missing required fields: sku, employee, price' });
    }

    const numPrice = Number(price);
    if (Number.isNaN(numPrice)) {
      return res.status(400).json({ error: 'Price must be a number' });
    }

    if (!SALES_SUBMIT_URL) {
      return res.status(500).json({ error: 'Sales submission endpoint not configured' });
    }

    const trimmedSku = String(sku).trim();
    const trimmedEmployee = String(employee).trim();
    const safeNotes = typeof notes === 'string' ? notes : '';
    const saleTimestamp = timestamp
      ? String(timestamp).trim()
      : new Date().toISOString();
    const availabilityValue = availability
      ? String(availability).trim()
      : 'No';

    const salePayload = {
      token: SALES_SUBMIT_TOKEN,
      sku: trimmedSku,
      employee: trimmedEmployee,
      soldBy: trimmedEmployee,
      price: numPrice,
      soldPrice: numPrice,
      notes: safeNotes,
      availability: availabilityValue,
      status: availabilityValue,
      timestamp: saleTimestamp,
      soldDate: saleTimestamp
    };

    const headers = { 'Content-Type': 'application/json' };
    if (SALES_SUBMIT_TOKEN) {
      headers['X-Token'] = SALES_SUBMIT_TOKEN;
    }

    const upstream = await fetch(SALES_SUBMIT_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(salePayload)
    });

    const text = await upstream.text();
    let parsedBody = null;
    if (text) {
      try {
        parsedBody = JSON.parse(text);
      } catch (err) {
        parsedBody = null;
      }
    }

    if (!upstream.ok) {
      const details = parsedBody?.error ?? parsedBody ?? text.slice(0, 500);
      const payload = { error: `Upstream failed ${upstream.status}`, details };

      if (upstream.status === 401) {
        payload.hint = 'Sales endpoint responded with 401 (unauthorized). Check that SALES_SUBMIT_TOKEN matches the upstream expectation.';
      }

      console.error('Sales submit error:', upstream.status, details);
      return res.status(502).json(payload);
    }

    if (parsedBody && typeof parsedBody === 'object') {
      const successField = parsedBody.success;
      const okField = parsedBody.ok;
      const statusField = typeof parsedBody.status === 'string'
        ? parsedBody.status.trim().toLowerCase()
        : '';
      const errorField = parsedBody.error;

      const hasExplicitFailure =
        (typeof successField === 'boolean' && successField === false) ||
        (typeof successField === 'string' && successField.trim().toLowerCase() === 'false') ||
        (typeof okField === 'boolean' && okField === false) ||
        (statusField && ['error', 'failed', 'fail', 'unauthorized', 'forbidden'].includes(statusField)) ||
        (typeof errorField === 'string' && errorField.trim().length > 0) ||
        (errorField && typeof errorField === 'object');

      if (hasExplicitFailure) {
        const message =
          (typeof errorField === 'string' && errorField.trim().length > 0)
            ? errorField.trim()
            : (typeof parsedBody.message === 'string' && parsedBody.message.trim().length > 0)
              ? parsedBody.message.trim()
              : 'Sales endpoint indicated a failure.';

        console.error('Sales submit reported failure despite 2xx response:', parsedBody);
        return res.status(502).json({ error: message, details: parsedBody });
      }

      return res.status(200).json({ success: true, data: parsedBody });
    }

    return res.status(200).json({ success: true, message: text });
  } catch (e) {
    console.error('Sale handler error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
