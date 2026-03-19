// Contoh Next.js App Router route handler.
// Untuk project Next.js, salin file ini ke: app/api/sensor/route.js

export const dynamic = 'force-dynamic';

export async function GET() {
  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;

  if (!scriptUrl) {
    return Response.json(
      {
        success: false,
        message: 'Konfigurasi GOOGLE_SCRIPT_URL belum di-set.',
      },
      { status: 500 }
    );
  }

  try {
    const upstream = await fetch(scriptUrl, {
      method: 'GET',
      headers: { Accept: 'application/json,text/plain,*/*' },
      cache: 'no-store',
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      return Response.json(
        {
          success: false,
          message: `Apps Script error (${upstream.status}).`,
          status: upstream.status,
        },
        { status: 502 }
      );
    }

    const payload = safeJsonParse(text);
    const data = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.values)
      ? payload.values
      : null;

    if (!Array.isArray(data)) {
      return Response.json(
        {
          success: false,
          message: 'Response Apps Script bukan array JSON valid.',
        },
        { status: 502 }
      );
    }

    return Response.json(
      {
        success: true,
        data,
        count: data.length,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: 'Gagal mengambil data sensor.',
        details: error.message,
      },
      { status: 502 }
    );
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
