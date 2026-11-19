const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const validSlug = (s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 48;
const authorized = (request, env) => {
  const expected = env.VEXEL_ADMIN_TOKEN;
  return !!expected && request.headers.get("authorization") === "Bearer " + expected;
};
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  let path;
  try { path = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, "")); }
  catch { return new Response("Alamat tidak valid.", { status: 400 }); }
  if (path === "api/invitations" && request.method === "GET") {
    if (!authorized(request, env)) return json({ error: "Akses admin tidak valid." }, 401);
    if (!env.VEXEL_DB) return json({ error: "Database belum terhubung." }, 503);
    const { results = [] } = await env.VEXEL_DB.prepare("SELECT slug, title, created_at, updated_at FROM invitations ORDER BY created_at DESC").all();
    return json({ ok: true, invitations: results.map(r => ({ ...r, url: url.origin + "/" + r.slug })) });
  }
  const invitationMatch = /^api\\/invitations\\/([a-z0-9-]+)$/.exec(path);
  if (invitationMatch && ["GET", "PUT", "DELETE"].includes(request.method)) {
    if (!authorized(request, env)) return json({ error: "Akses admin tidak valid." }, 401);
    if (!env.VEXEL_DB) return json({ error: "Database belum terhubung." }, 503);
    const slug = invitationMatch[1];
    if (request.method === "GET") {
      const row = await env.VEXEL_DB.prepare("SELECT slug, title, payload, html, created_at, updated_at FROM invitations WHERE slug = ?").bind(slug).first();
      if (!row) return json({ error: "Undangan tidak ditemukan." }, 404);
      let data; try { data = JSON.parse(row.payload); } catch { return json({ error: "Data undangan rusak." }, 500); }
      return json({ ok: true, invitation: { ...row, payload: undefined, data, url: url.origin + "/" + slug } });
    }
    if (request.method === "DELETE") {
      const result = await env.VEXEL_DB.prepare("DELETE FROM invitations WHERE slug = ?").bind(slug).run();
      if (!result.meta?.changes) return json({ error: "Undangan tidak ditemukan." }, 404);
      return json({ ok: true, slug });
    }
    let body; try { body = await request.json(); } catch { return json({ error: "Data tidak valid." }, 400); }
    if (!Array.isArray(body.data) || !body.html) return json({ error: "Konten undangan belum lengkap." }, 400);
    if (String(body.html).length > 8_000_000) return json({ error: "Ukuran halaman terlalu besar." }, 413);
    const now = new Date().toISOString();
    const result = await env.VEXEL_DB.prepare("UPDATE invitations SET title = ?, payload = ?, html = ?, updated_at = ? WHERE slug = ?")
      .bind(String(body.title || "Undangan Pernikahan").slice(0, 120), JSON.stringify(body.data), String(body.html), now, slug).run();
    if (!result.meta?.changes) return json({ error: "Undangan tidak ditemukan." }, 404);
    return json({ ok: true, slug, url: url.origin + "/" + slug });
  }
  if (path === "api/invitations" && request.method === "POST") {
    if (!authorized(request, env)) return json({ error: "Akses admin tidak valid. Masukkan kunci admin." }, 401);
    if (!env.VEXEL_DB) return json({ error: "Database belum terhubung. Atur binding D1 dengan nama VEXEL_DB." }, 503);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Data tidak valid." }, 400); }
    const slug = String(body.slug || "").toLowerCase().trim();
    if (!validSlug(slug)) return json({ error: "Tautan harus 3–48 karakter, huruf kecil, angka, dan tanda hubung." }, 400);
    if (!body.data || !Array.isArray(body.data) || !body.html) return json({ error: "Konten undangan belum lengkap." }, 400);
    if (String(body.html).length > 8_000_000) return json({ error: "Ukuran halaman terlalu besar. Optimalkan foto terlebih dahulu." }, 413);
    const now = new Date().toISOString();
    try {
      await env.VEXEL_DB.prepare("INSERT INTO invitations (slug, title, payload, html, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(slug, String(body.title || "Undangan Pernikahan").slice(0, 120), JSON.stringify(body.data), String(body.html), now, now).run();
      return json({ ok: true, slug, url: url.origin + "/" + slug });
    } catch (e) {
      if (/UNIQUE|constraint/i.test(String(e && e.message || e))) return json({ error: "Tautan /" + slug + " sudah digunakan. Silakan pilih nama lain." }, 409);
      return json({ error: "Gagal menerbitkan undangan. Periksa konfigurasi database." }, 500);
    }
  }
  if (path === "api/upload" && request.method === "POST") {
    if (!authorized(request, env)) return json({ error: "Akses admin tidak valid. Masukkan kunci admin." }, 401);
    if (!env.VEXEL_ASSETS) return json({ error: "Penyimpanan R2 belum terhubung. Atur binding VEXEL_ASSETS." }, 503);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Data upload tidak valid." }, 400); }
    const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.data || ""));
    if (!match) return json({ error: "Format foto tidak didukung. Gunakan JPG, PNG, WEBP, atau GIF." }, 400);
    const binary = atob(match[2]);
    if (binary.length > 8 * 1024 * 1024) return json({ error: "Ukuran foto maksimal 8 MB." }, 413);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const ext = { "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif" }[match[1]];
    const key = "invitations/" + crypto.randomUUID() + "." + ext;
    await env.VEXEL_ASSETS.put(key, bytes, { httpMetadata: { contentType: match[1], cacheControl: "public, max-age=31536000, immutable" } });
    if (!env.R2_PUBLIC_URL) return json({ error: "Foto tersimpan, tetapi R2_PUBLIC_URL belum diatur. Atur domain publik bucket R2." }, 503);
    return json({ ok: true, url: env.R2_PUBLIC_URL.replace(/\/+$/, "") + "/" + key });
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
