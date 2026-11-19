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
