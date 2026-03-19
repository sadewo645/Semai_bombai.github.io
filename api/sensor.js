// Vercel Serverless Function (Node.js)
// Proxy aman untuk mengambil data Apps Script secara server-to-server.

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwAdKpcEGI1rCO-nb4vIHtHI2qFl0mqXA6iUOdICmXH-RSjrR-_y3s4kfA8YCmLq1VH/exec?action=data';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method tidak diizinkan. Gunakan GET.',
    });
  }

  const scriptUrl = process.env.GOOGLE_SCRIPT_URL || DEFAULT_SCRIPT_URL;
  if (!scriptUrl) {
    return res.status(500).json({
      success: false,
      message: 'Konfigurasi GOOGLE_SCRIPT_URL belum di-set di environment Vercel.',
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const upstream = await fetch(scriptUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent': 'semai-bombai-dashboard/1.0',
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    const rawText = await upstream.text();
    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(mapUpstreamStatus(upstream.status)).json({
        success: false,
        message: explainUpstreamStatus(upstream.status),
        status: upstream.status,
      });
    }

    const parsed = parseAppsScriptPayload(rawText);
    if (!Array.isArray(parsed)) {
      return res.status(502).json({
        success: false,
        message: 'Response Apps Script bukan JSON array yang valid.',
      });
    }

    return res.status(200).json({
      success: true,
      data: parsed,
      count: parsed.length,
      source: 'google-apps-script',
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    clearTimeout(timeout);

    if (error.name === 'AbortError') {
      return res.status(504).json({
        success: false,
        message: 'Timeout saat menghubungi Apps Script. Coba lagi beberapa saat.',
      });
    }

    return res.status(502).json({
      success: false,
      message: 'Gagal mengambil data sensor dari Apps Script.',
      details: error.message,
    });
  }
};

function parseAppsScriptPayload(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;

  // 1) JSON valid langsung
  const direct = safeJsonParse(text);
  const normalizedDirect = normalizePayload(direct);
  if (normalizedDirect) return normalizedDirect;

  // 2) Fallback: cari blok array pertama, untuk response ber-wrapper
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    const arraySlice = text.slice(arrStart, arrEnd + 1);
    const arrayParsed = safeJsonParse(arraySlice);
    const normalizedArray = normalizePayload(arrayParsed);
    if (normalizedArray) return normalizedArray;
  }

  // 3) Fallback: cari blok object pertama
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    const objectSlice = text.slice(objStart, objEnd + 1);
    const objectParsed = safeJsonParse(objectSlice);
    const normalizedObject = normalizePayload(objectParsed);
    if (normalizedObject) return normalizedObject;
  }

  return null;
}

function normalizePayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;

  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.values)) return payload.values;
  if (Array.isArray(payload.rows)) return payload.rows;

  return null;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapUpstreamStatus(status) {
  if (status === 403) return 502;
  if (status === 404) return 502;
  return 502;
}

function explainUpstreamStatus(status) {
  if (status === 403) {
    return 'Apps Script menolak akses (403). Pastikan deployment publik: Execute as Me, Who has access Anyone.';
  }
  if (status === 404) {
    return 'URL Apps Script tidak ditemukan (404). Periksa GOOGLE_SCRIPT_URL atau deployment ID.';
  }
  if (status >= 500) {
    return 'Server Apps Script sedang bermasalah (5xx). Coba lagi beberapa saat.';
  }
  return `Apps Script mengembalikan status ${status}.`;
}
