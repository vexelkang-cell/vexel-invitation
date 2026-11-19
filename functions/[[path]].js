const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const validSlug = (s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 48;
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  let path;
  try { path = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, "")); }
  catch { return new Response("Alamat tidak valid.", { status: 400 }); }
  if (path === "api/invitations" && request.method === "POST") {
    if (!env.VEXEL_DB) return json({ error: "Database belum terhubung. Atur binding D1 dengan nama VEXEL_DB di Cloudflare Pages." }, 503);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Data tidak valid." }, 400); }
    const slug = String(body.slug || "").toLowerCase().trim();
    if (!validSlug(slug)) return json({ error: "Tautan harus 3–48 karakter, huruf kecil, angka, dan tanda hubung. Contoh: aditianindia." }, 400);
    if (!body.data || !Array.isArray(body.data) || !body.html) return json({ error: "Konten undangan belum lengkap." }, 400);
    const now = new Date().toISOString();
    try {
      await env.VEXEL_DB.prepare("INSERT INTO invitations (slug, title, payload, html, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(slug, String(body.title || "Undangan Pernikahan").slice(0, 120), JSON.stringify(body.data), String(body.html), now, now).run();
      return json({ ok: true, slug, url: url.origin + "/" + slug });
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/UNIQUE|constraint/i.test(msg)) return json({ error: "Tautan /" + slug + " sudah digunakan. Silakan pilih nama lain." }, 409);
      return json({ error: "Gagal menerbitkan undangan. Periksa konfigurasi database." }, 500);
    }
  }
  if (path && !path.includes("/") && !["editor", "katalog", "assets", "api", "favicon.ico", "robots.txt", "sitemap.xml"].includes(path) && request.method === "GET") {
    if (!env.VEXEL_DB) return new Response("Database undangan belum dikonfigurasi.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    const row = await env.VEXEL_DB.prepare("SELECT title, html FROM invitations WHERE slug = ?").bind(path.toLowerCase()).first();
    if (!row) return new Response("Undangan tidak ditemukan.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    const page = String(row.html).replace(/<title>[^<]*<\/title>/i, "<title>" + String(row.title).replace(/[&<>]/g, "") + "</title>");
    return new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" } });
  }
  return next();
}
