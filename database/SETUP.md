# Menyiapkan penyimpanan undangan VEXEL

Fitur tautan unik menggunakan Cloudflare Pages Functions + D1. File fungsi sudah ada di `functions/[[path]].js`, tetapi perlu satu kali konfigurasi database di dashboard Cloudflare.

## 1. Buat database D1
1. Buka Cloudflare Dashboard → **Storage & databases** → **D1 SQL Database**.
2. Pilih **Create database**, beri nama `vexel-invitations`.
3. Buka database → **Console**.
4. Salin dan jalankan seluruh isi file `database/schema.sql`.

## 2. Hubungkan ke Pages
1. Buka **Workers & Pages** → proyek Pages `vexelinvitation`.
2. Masuk **Settings** → **Functions** → **D1 database bindings**.
3. Tambahkan binding dengan variable name persis `VEXEL_DB`.
4. Pilih database `vexel-invitations`, lalu simpan.
5. Jalankan deployment baru (atau redeploy deployment terakhir).

## 3. Cara menerbitkan
1. Buka `/editor/` dan selesaikan desain undangan.
2. Klik **Terbitkan**.
3. Ketik slug yang diinginkan, misalnya `aditianindia`.
4. Tautan publik menjadi `https://vexelinvitation.pages.dev/aditianindia`.

Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung; panjang 3–48 karakter. Setiap slug hanya bisa dipakai satu kali. Jika sudah digunakan, editor akan meminta nama lain.

## Catatan
- Database menyimpan salinan HTML undangan dan data komponennya. Mengubah draft di browser tidak otomatis mengubah undangan yang sudah terbit.
- Foto yang diunggah editor saat ini masih berupa data lokal/base64 di dalam halaman terbit. Untuk katalog foto besar dan skala produksi, tahap berikutnya sebaiknya memindahkan aset ke Cloudflare R2.
- Belum ada login/otorisasi editor pada API publik ini. Jangan gunakan untuk data pribadi sensitif sebelum autentikasi admin ditambahkan.


## 4. Siapkan penyimpanan foto permanen (R2)
1. Cloudflare Dashboard → **R2 Object Storage** → buat bucket, misalnya \`vexel-invitation-assets\`.
2. Pada bucket, buka **Settings** → aktifkan akses publik melalui domain R2 yang sesuai (disarankan custom domain, misalnya \`media.domain-anda.com\`).
3. Pages project → **Settings** → **Functions** → **R2 bucket bindings**.
4. Tambahkan binding variable name persis \`VEXEL_ASSETS\`, pilih bucket tersebut.
5. Tambahkan variable \`R2_PUBLIC_URL\` berisi URL publik bucket, tanpa garis miring di akhir, misalnya \`https://media.domain-anda.com\`.

## 5. Lindungi akses editor
1. Pages project → **Settings** → **Variables and Secrets**.
2. Tambahkan secret bernama persis \`VEXEL_ADMIN_TOKEN\`.
3. Isi dengan kata sandi acak yang panjang dan unik. Jangan masukkan token ini ke GitHub atau kirimkan ke orang lain.
4. Simpan, lalu lakukan deployment ulang.
5. Di editor, klik **Kunci Admin** dan masukkan token tersebut. Token hanya disimpan di memori tab selama sesi aktif.

API upload foto dan penerbitan undangan sekarang mensyaratkan token admin. Foto JPG, PNG, WEBP, dan GIF maksimal 8 MB per file akan diunggah ke R2. Undangan publik mengambil foto dari URL R2, bukan menyimpan foto base64 di database.

## 6. Catatan keamanan dan operasional
- Jangan menonaktifkan autentikasi atau membagikan \`VEXEL_ADMIN_TOKEN\`.
- Bucket R2 hanya perlu akses baca publik untuk URL aset; operasi upload tetap melalui Pages Function yang memeriksa token admin.
- Jika token berubah, masukkan token baru melalui tombol **Kunci Admin** setelah membuka ulang editor.
- Fitur ini memerlukan D1, R2, binding, secret, dan deployment terbaru. Tanpa konfigurasi tersebut, upload dan publikasi akan menampilkan pesan konfigurasi yang belum tersedia.
