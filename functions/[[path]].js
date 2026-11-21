const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const validSlug = (s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 48;
const authorized = (request, env) => {
  const expected = String(env.VEXEL_ADMIN_TOKEN || "").trim();
  const supplied = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return !!expected && !!supplied && supplied === expected;
};
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  let path;
  try { path = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, "")); }
  catch { return new Response("Alamat tidak valid.", { status: 400 }); }
  // Draft editor: proyek yang belum diterbitkan, tersimpan terpisah dari undangan publik.
  if (path === "api/drafts" && ["GET", "POST"].includes(request.method)) {
    if (!authorized(request, env)) return json({ error: "Akses admin tidak valid." }, 401);
    if (!env.VEXEL_DB) return json({ error: "Database belum terhubung." }, 503);
    await env.VEXEL_DB.prepare("CREATE TABLE IF NOT EXISTS editor_drafts (id TEXT PRIMARY KEY, title TEXT NOT NULL, payload TEXT NOT NULL, assets TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
    if (request.method === "GET") {
      const { results = [] } = await env.VEXEL_DB.prepare("SELECT id, title, created_at, updated_at FROM editor_drafts ORDER BY updated_at DESC").all();
      return json({ ok: true, drafts: results });
    }
    let body; try { body = await request.json(); } catch { return json({ error: "Data draft tidak valid." }, 400); }
    if (!Array.isArray(body.data) || !body.data.length) return json({ error: "Konten draft kosong atau tidak valid." }, 400);
    const payload = JSON.stringify(body.data), assets = JSON.stringify(Array.isArray(body.assets) ? body.assets : []);
    if (payload.length + assets.length > 8_000_000) return json({ error: "Ukuran draft terlalu besar. Kurangi ukuran atau jumlah aset." }, 413);
    const id = crypto.randomUUID(), now = new Date().toISOString(), title = String(body.title || "Draft Undangan").trim().slice(0, 120) || "Draft Undangan";
    await env.VEXEL_DB.prepare("INSERT INTO editor_drafts (id, title, payload, assets, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, title, payload, assets, now, now).run();
    return json({ ok: true, draft: { id, title, created_at: now, updated_at: now } });
  }
  const draftMatch = /^api\/drafts\/([a-f0-9-]{36})$/.exec(path);
  const draftDuplicateMatch = /^api\/drafts\/([a-f0-9-]{36})\/duplicate$/.exec(path);
  if ((draftMatch || draftDuplicateMatch) && ["GET", "PUT", "DELETE", "POST"].includes(request.method)) {
    if (!authorized(request, env)) return json({ error: "Akses admin tidak valid." }, 401);
    if (!env.VEXEL_DB) return json({ error: "Database belum terhubung." }, 503);
    await env.VEXEL_DB.prepare("CREATE TABLE IF NOT EXISTS editor_drafts (id TEXT PRIMARY KEY, title TEXT NOT NULL, payload TEXT NOT NULL, assets TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
    const id = (draftMatch || draftDuplicateMatch)[1];
    const row = await env.VEXEL_DB.prepare("SELECT id, title, payload, assets, created_at, updated_at FROM editor_drafts WHERE id = ?").bind(id).first();
    if (!row) return json({ error: "Draft tidak ditemukan." }, 404);
    if (draftDuplicateMatch && request.method === "POST") {
      const newId = crypto.randomUUID(), now = new Date().toISOString();
      await env.VEXEL_DB.prepare("INSERT INTO editor_drafts (id, title, payload, assets, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(newId, "Salinan - " + row.title, row.payload, row.assets || "[]", now, now).run();
      return json({ ok: true, draft: { id: newId, title: "Salinan - " + row.title, created_at: now, updated_at: now } });
    }
    if (request.method === "GET") {
      let data, assets; try { data = JSON.parse(row.payload); assets = JSON.parse(row.assets || "[]"); } catch { return json({ error: "Isi draft rusak." }, 500); }
      return json({ ok: true, draft: { id: row.id, title: row.title, data, assets, created_at: row.created_at, updated_at: row.updated_at } });
    }
    if (request.method === "DELETE") {
      await env.VEXEL_DB.prepare("DELETE FROM editor_drafts WHERE id = ?").bind(id).run();
      return json({ ok: true, id });
    }
    let body; try { body = await request.json(); } catch { return json({ error: "Data draft tidak valid." }, 400); }
    if (!Array.isArray(body.data) || !body.data.length) return json({ error: "Konten draft kosong atau tidak valid." }, 400);
    const payload = JSON.stringify(body.data), assets = JSON.stringify(Array.isArray(body.assets) ? body.assets : []);
    if (payload.length + assets.length > 8_000_000) return json({ error: "Ukuran draft terlalu besar. Kurangi ukuran atau jumlah aset." }, 413);
    const title = String(body.title || row.title).trim().slice(0, 120) || row.title, now = new Date().toISOString();
    await env.VEXEL_DB.prepare("UPDATE editor_drafts SET title = ?, payload = ?, assets = ?, updated_at = ? WHERE id = ?").bind(title, payload, assets, now, id).run();
    return json({ ok: true, draft: { id, title, updated_at: now } });
  }
  if (path === "api/invitations" && request.method === "GET") {
    if (!authorized(request, env)) return json({ error: "Akses admin tidak valid." }, 401);
    if (!env.VEXEL_DB) return json({ error: "Database belum terhubung." }, 503);
    const { results = [] } = await env.VEXEL_DB.prepare("SELECT slug, title, created_at, updated_at FROM invitations ORDER BY created_at DESC").all();
    return json({ ok: true, invitations: results.map(r => ({ ...r, url: url.origin + "/" + r.slug })) });
  }
  const defaultCatalog = [
    { id: "blush-garden", title: "Blush Garden", category: "Romantic Floral", description: "Nuansa blush pink dan floral lembut untuk suasana romantis.", preview: "/blush-garden.html", visible: true, order: 1 },
    { id: "sage-serenity", title: "Sage Serenity", category: "Minimalist", description: "Desain minimalis dengan warna sage yang tenang dan natural.", preview: "/sage-serenity.html", visible: true, order: 2 },
    { id: "royal-midnight", title: "Royal Midnight", category: "Classic Luxury", description: "Tampilan klasik biru navy dan emas untuk kesan mewah.", preview: "/royal-midnight.html", visible: true, order: 3 }
  ];
  if (path === "api/catalog" && request.method === "GET") {
    if (!env.VEXEL_DB) return json({ ok: true, templates: defaultCatalog, configured: false });
    const row = await env.VEXEL_DB.prepare("SELECT payload FROM catalog_config WHERE id = 1").first().catch(() => null);
    if (!row) return json({ ok: true, templates: defaultCatalog, configured: false });
    try {
      const templates = JSON.parse(row.payload);
      if (!Array.isArray(templates)) throw new Error("invalid");
      return json({ ok: true, templates, configured: true });
    } catch { return json({ ok: true, templates: defaultCatalog, configured: false }); }
  }
  if (path === "api/catalog" && request.method === "PUT") {
    if (!authorized(request, env)) return json({ error: "Akses admin tidak valid." }, 401);
    if (!env.VEXEL_DB) return json({ error: "Database belum terhubung." }, 503);
    let body; try { body = await request.json(); } catch { return json({ error: "Data katalog tidak valid." }, 400); }
    if (!Array.isArray(body.templates) || body.templates.length > 30) return json({ error: "Daftar template tidak valid (maksimal 30)." }, 400);
    const allowed = new Set(defaultCatalog.map(x => x.id));
    const templates = [];
    for (let i = 0; i < body.templates.length; i++) {
      const x = body.templates[i];
      if (!x || !allowed.has(String(x.id))) return json({ error: "Template tidak dikenal." }, 400);
      const category = String(x.category || "").trim().slice(0, 40);
      const title = String(x.title || "").trim().slice(0, 60);
      const description = String(x.description || "").trim().slice(0, 180);
      if (!category || !title) return json({ error: "Nama template dan kategori wajib diisi." }, 400);
      templates.push({ id: x.id, title, category, description, preview: defaultCatalog.find(d => d.id === x.id).preview, visible: x.visible !== false, order: i + 1 });
    }
    const now = new Date().toISOString();
    await env.VEXEL_DB.prepare("INSERT INTO catalog_config (id, payload, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at")
      .bind(JSON.stringify(templates), now).run();
    return json({ ok: true, templates, updated_at: now });
  }
  const assetCollectionMatch = /^api\/invitations\/([a-z0-9-]+)\/assets$/.exec(path);
  if (assetCollectionMatch && ["GET", "PUT"].includes(request.method)) {
    if (!authorized(request, env)) return json({ error: "Akses admin tidak valid." }, 401);
    if (!env.VEXEL_DB) return json({ error: "Database belum terhubung." }, 503);
    await env.VEXEL_DB.prepare("CREATE TABLE IF NOT EXISTS invitation_asset_collections (slug TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
    const slug = assetCollectionMatch[1];
    if (request.method === "GET") {
      const row = await env.VEXEL_DB.prepare("SELECT payload, updated_at FROM invitation_asset_collections WHERE slug = ?").bind(slug).first();
      if (!row) return json({ ok: true, assets: [], updated_at: null });
      try { const assets = JSON.parse(row.payload); return json({ ok: true, assets: Array.isArray(assets) ? assets : [], updated_at: row.updated_at }); }
      catch { return json({ error: "Data koleksi aset rusak." }, 500); }
    }
    let body; try { body = await request.json(); } catch { return json({ error: "Data koleksi aset tidak valid." }, 400); }
    if (!Array.isArray(body.assets) || body.assets.length > 150) return json({ error: "Koleksi maksimal 150 aset." }, 400);
    const assets = [];
    for (const item of body.assets) {
      const name = String(item?.name || "").trim().slice(0, 180);
      const assetUrl = String(item?.url || "").trim();
      const type = String(item?.type || "");
      if (!name || !/^https:\/\//i.test(assetUrl) || !["image", "audio"].includes(type)) return json({ error: "Ada data aset yang tidak valid." }, 400);
      assets.push({ name, url: assetUrl, type, size: Math.max(0, Number(item.size) || 0) });
    }
    const now = new Date().toISOString();
    await env.VEXEL_DB.prepare("INSERT INTO invitation_asset_collections (slug, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(slug) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at")
      .bind(slug, JSON.stringify(assets), now).run();
    return json({ ok: true, assets, updated_at: now });
  }
  const duplicateMatch = /^api\/invitations\/([a-z0-9-]+)\/duplicate$/.exec(path);
  if (duplicateMatch && request.method === "POST") {
    if (!authorized(request, env)) return json({ error: "Akses admin tidak valid." }, 401);
    if (!env.VEXEL_DB) return json({ error: "Database belum terhubung." }, 503);
    const sourceSlug = duplicateMatch[1];
    let body; try { body = await request.json(); } catch { return json({ error: "Data tidak valid." }, 400); }
    const newSlug = String(body.slug || "").toLowerCase().trim();
    if (!validSlug(newSlug)) return json({ error: "Tautan baru harus 3–48 karakter, huruf kecil, angka, dan tanda hubung." }, 400);
    if (newSlug === sourceSlug) return json({ error: "Tautan salinan harus berbeda dari undangan asli." }, 400);
    const source = await env.VEXEL_DB.prepare("SELECT title, payload, html FROM invitations WHERE slug = ?").bind(sourceSlug).first();
    if (!source) return json({ error: "Undangan asli tidak ditemukan." }, 404);
    const now = new Date().toISOString();
    const title = String(body.title || ("Salinan - " + source.title)).slice(0, 120);
    try {
      await env.VEXEL_DB.prepare("INSERT INTO invitations (slug, title, payload, html, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(newSlug, title, source.payload, source.html, now, now).run();
      await env.VEXEL_DB.prepare("CREATE TABLE IF NOT EXISTS invitation_asset_collections (slug TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
      await env.VEXEL_DB.prepare("INSERT INTO invitation_asset_collections (slug, payload, updated_at) SELECT ?, payload, ? FROM invitation_asset_collections WHERE slug = ? ON CONFLICT(slug) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at")
        .bind(newSlug, now, sourceSlug).run();
      return json({ ok: true, slug: newSlug, url: url.origin + "/" + newSlug });
    } catch (e) {
      if (/UNIQUE|constraint/i.test(String(e && e.message || e))) return json({ error: "Tautan /" + newSlug + " sudah digunakan. Silakan pilih nama lain." }, 409);
      return json({ error: "Gagal menyalin undangan. Periksa konfigurasi database." }, 500);
    }
  }
  // Buku tamu digital: ucapan dan konfirmasi kehadiran dengan paginasi 5 item.
  const wishesMatch = /^api\/invitations\/([a-z0-9-]+)\/wishes$/.exec(path);
  if (wishesMatch && ["GET", "POST"].includes(request.method)) {
    if (!env.VEXEL_DB) return json({ error: "Database belum terhubung." }, 503);
    const slug = wishesMatch[1];
    const invitation = await env.VEXEL_DB.prepare("SELECT slug FROM invitations WHERE slug = ?").bind(slug).first();
    if (!invitation) return json({ error: "Undangan tidak ditemukan." }, 404);
    await env.VEXEL_DB.prepare("CREATE TABLE IF NOT EXISTS invitation_wishes (id TEXT PRIMARY KEY, invitation_slug TEXT NOT NULL, guest_name TEXT NOT NULL, attendance TEXT NOT NULL DEFAULT '', message TEXT NOT NULL, created_at TEXT NOT NULL)").run();
    await env.VEXEL_DB.prepare("ALTER TABLE invitation_wishes ADD COLUMN attendance TEXT NOT NULL DEFAULT ''").run().catch(() => {});
    if (request.method === "GET") {
      const pageSize = 5;
      const countRow = await env.VEXEL_DB.prepare("SELECT COUNT(*) AS total FROM invitation_wishes WHERE invitation_slug = ?").bind(slug).first();
      const total = Number(countRow?.total || 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(totalPages, Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1));
      const { results = [] } = await env.VEXEL_DB.prepare("SELECT guest_name, attendance, message, created_at FROM invitation_wishes WHERE invitation_slug = ? ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(slug, pageSize, (page - 1) * pageSize).all();
      return json({ ok: true, wishes: results, page, pageSize, total, totalPages });
    }
    let body; try { body = await request.json(); } catch { return json({ error: "Data ucapan tidak valid." }, 400); }
    const name = String(body.name || "").trim().slice(0, 80);
    const attendance = String(body.attendance || "").trim();
    const message = String(body.message || "").trim().slice(0, 500);
    if (!name || !attendance || !message) return json({ error: "Nama, kehadiran, dan ucapan wajib diisi." }, 400);
    if (name.length < 2 || message.length < 2) return json({ error: "Nama dan ucapan terlalu pendek." }, 400);
    if (!["Hadir", "Tidak Hadir"].includes(attendance)) return json({ error: "Pilihan kehadiran tidak valid." }, 400);
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await env.VEXEL_DB.prepare("INSERT INTO invitation_wishes (id, invitation_slug, guest_name, attendance, message, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, slug, name, attendance, message, createdAt).run();
    return json({ ok: true, wish: { guest_name: name, attendance, message, created_at: createdAt } });
  }
  // Manajemen tamu: token acak untuk tautan personal.
  const guestPublicMatch = /^api\/guest\/([a-f0-9-]{36})$/.exec(path);
  if (guestPublicMatch && request.method === "GET") {
    if (!env.VEXEL_DB) return json({ error: "Database belum terhubung." }, 503);
    await env.VEXEL_DB.prepare("CREATE TABLE IF NOT EXISTS invitation_guests (id TEXT PRIMARY KEY, invitation_slug TEXT NOT NULL, guest_name TEXT NOT NULL, phone TEXT, guest_group TEXT, created_at TEXT NOT NULL)").run();
    const guest = await env.VEXEL_DB.prepare("SELECT guest_name, invitation_slug FROM invitation_guests WHERE id = ?").bind(guestPublicMatch[1]).first();
    if (!guest) return json({ error: "Tautan tamu tidak ditemukan." }, 404);
    return json({ ok: true, name: guest.guest_name, slug: guest.invitation_slug });
  }
  const guestListMatch = /^api\/invitations\/([a-z0-9-]+)\/guests$/.exec(path);
  const guestDeleteMatch = /^api\/invitations\/([a-z0-9-]+)\/guests\/([a-f0-9-]{36})$/.exec(path);
  if ((guestListMatch || guestDeleteMatch) && ["GET", "POST", "DELETE"].includes(request.method)) {
    if (!authorized(request, env)) return json({ error: "Akses admin tidak valid." }, 401);
    if (!env.VEXEL_DB) return json({ error: "Database belum terhubung." }, 503);
    await env.VEXEL_DB.prepare("CREATE TABLE IF NOT EXISTS invitation_guests (id TEXT PRIMARY KEY, invitation_slug TEXT NOT NULL, guest_name TEXT NOT NULL, phone TEXT, guest_group TEXT, created_at TEXT NOT NULL)").run();
    const slug = (guestListMatch || guestDeleteMatch)[1];
    const exists = await env.VEXEL_DB.prepare("SELECT slug FROM invitations WHERE slug = ?").bind(slug).first();
    if (!exists) return json({ error: "Undangan tidak ditemukan." }, 404);
    if (request.method === "GET") {
      const { results = [] } = await env.VEXEL_DB.prepare("SELECT id, guest_name, phone, guest_group, created_at FROM invitation_guests WHERE invitation_slug = ? ORDER BY created_at DESC").bind(slug).all();
      return json({ ok: true, guests: results.map(g => ({ ...g, url: url.origin + "/" + slug + "?to=" + g.id })) });
    }
    if (request.method === "DELETE") {
      const result = await env.VEXEL_DB.prepare("DELETE FROM invitation_guests WHERE invitation_slug = ? AND id = ?").bind(slug, guestDeleteMatch[2]).run();
      if (!result.meta?.changes) return json({ error: "Data tamu tidak ditemukan." }, 404);
      return json({ ok: true });
    }
    let body; try { body = await request.json(); } catch { return json({ error: "Data tamu tidak valid." }, 400); }
    const guestName = String(body.name || "").trim().slice(0, 100);
    if (!guestName) return json({ error: "Nama tamu wajib diisi." }, 400);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.VEXEL_DB.prepare("INSERT INTO invitation_guests (id, invitation_slug, guest_name, phone, guest_group, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, slug, guestName, String(body.phone || "").trim().slice(0, 30), String(body.group || "").trim().slice(0, 50), now).run();
    return json({ ok: true, guest: { id, name: guestName, url: url.origin + "/" + slug + "?to=" + id } });
  }
  const invitationMatch = /^api\/invitations\/([a-z0-9-]+)$/.exec(path);
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
    const driveUrl = String(env.GOOGLE_DRIVE_WEB_APP_URL || "").trim();
    const uploadSecret = String(env.GOOGLE_DRIVE_UPLOAD_SECRET || "").trim();
    if (!driveUrl || !uploadSecret) {
      return json({ error: "Penyimpanan Google Drive belum dikonfigurasi. Periksa Variables and Secrets." }, 503);
    }
    let body;
    try { body = await request.json(); } catch { return json({ error: "Data upload tidak valid." }, 400); }
    const raw = String(body.data || "");
    const imageMatch = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(raw);
    const audioMatch = /^data:(audio\/mpeg);base64,([A-Za-z0-9+/=]+)$/.exec(raw);
    if (!imageMatch && !audioMatch) return json({ error: "Gunakan foto JPG/PNG/WEBP/GIF atau musik MP3." }, 400);
    const match = audioMatch || imageMatch;
    const isAudio = !!audioMatch;
    const estimatedBytes = Math.floor(match[2].length * 3 / 4);
    if (estimatedBytes > (isAudio ? 15 : 8) * 1024 * 1024) {
      return json({ error: isAudio ? "Ukuran MP3 maksimal 15 MB." : "Ukuran foto maksimal 8 MB." }, 413);
    }
    try {
      const upstream = await fetch(driveUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: uploadSecret, data: raw })
      });
      const responseText = await upstream.text();
      let result;
      try { result = JSON.parse(responseText); }
      catch {
        console.error("Google Drive connector returned non-JSON response", upstream.status, responseText.slice(0, 500));
        return json({ error: "Google Apps Script memberi respons yang tidak dikenali (HTTP " + upstream.status + "). Periksa deployment Web App." }, 502);
      }
      if (!result || !result.ok || !result.url) {
        console.error("Google Drive connector rejected upload", upstream.status, result?.error || "unknown error");
        return json({ error: result?.error || "Upload ke Google Drive gagal (HTTP " + upstream.status + ")." }, 502);
      }
      const urlText = String(result.url || "");
      const idFromUrl = urlText.includes("id=") ? urlText.split("id=").pop().split("&")[0] : (urlText.includes("/d/") ? urlText.split("/d/").pop().split("/")[0] : "");
      const fileId = String(result.fileId || idFromUrl).trim();
      // Use Drive thumbnail endpoint for browser-friendly image previews.
      // Keep the original Drive URL for audio files.
      const displayUrl = fileId && !isAudio
        ? "https://drive.google.com/thumbnail?id=" + encodeURIComponent(fileId) + "&sz=w2000"
        : result.url;
      return json({ ok: true, url: displayUrl, fileId: fileId || null });
    } catch (error) {
      console.error("Google Drive upload request failed", String(error));
      return json({ error: "Tidak dapat menghubungi Google Drive. Periksa URL Web App dan deployment Apps Script." }, 502);
    }
  }
  if (path && !path.includes("/") && !["editor", "admin", "katalog", "assets", "api", "favicon.ico", "robots.txt", "sitemap.xml"].includes(path) && request.method === "GET") {
    if (!env.VEXEL_DB) return new Response("Database undangan belum dikonfigurasi.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    const row = await env.VEXEL_DB.prepare("SELECT title, html FROM invitations WHERE slug = ?").bind(path.toLowerCase()).first();
    if (!row) return new Response("Undangan tidak ditemukan.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    const page = String(row.html).replace(/<title>[^<]*<\/title>/i, "<title>" + String(row.title).replace(/[&<>]/g, "") + "</title>");
    return new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" } });
  }
  return next();
}
