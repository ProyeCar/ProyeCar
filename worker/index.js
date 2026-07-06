export default {
  async fetch(request, env) {
    if (request.method !== 'PUT') {
      return new Response('Method not allowed', { status: 405 });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('Missing bearer token', { status: 401 });
    }
    const accessToken = authHeader.slice('Bearer '.length);

    const userRes = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: 'Bearer ' + accessToken,
      },
    });

    if (!userRes.ok) {
      return new Response('Invalid or expired session', { status: 401 });
    }
    const user = await userRes.json();

    const nombreArchivo = new URL(request.url).pathname.replace(/^\/+/, '');
    if (!nombreArchivo) {
      return new Response('Missing filename', { status: 400 });
    }

    const key = 'pdfs/' + user.id + '/' + nombreArchivo;

    await env.PDFS_BUCKET.put(key, request.body, {
      httpMetadata: { contentType: 'text/html;charset=utf-8' },
    });

    return Response.json({ key: key, url: new URL(request.url).origin + '/' + key });
  },
};
