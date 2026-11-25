# Panduan Menghubungkan Google Sign-In (OAuth 2.0) pada CBT Kebahasaan

Sistem autentikasi staf (**Dosen Penguji** & **Administrator**) pada aplikasi **CBT Kebahasaan** mendukung keamanan berlapis (*Hybrid Security*):
1. **Login Email Terdaftar + PIN 6 Digit** — langsung aktif sejak awal tanpa konfigurasi tambahan.
2. **Login dengan Akun Google (OAuth 2.0)** — terintegrasi penuh dengan tombol Google resmi dan dapat dikombinasikan dengan verifikasi PIN 6 digit (*2-Factor Authentication*).

> **Catatan Penting Akun Awal:** Untuk akun Admin/Dosen yang dibuat sebelum pembaruan ini (belum memiliki PIN), sistem secara otomatis menetapkan PIN awal **`123456`** dan akan menampilkan pengingat untuk segera menggantinya melalui tombol ikon kunci (**Ubah PIN Saya**) di pojok kiri bawah sidebar.

---

## Langkah-langkah Membuat & Menghubungkan `Google Client ID`

Anda tidak perlu mengubah kode apa pun untuk mengaktifkan tombol Google Sign-In. Cukup ikuti 5 langkah berikut saat Anda siap menghubungkannya:

### 1. Buka Google Cloud Console
1. Masuk ke [Google Cloud Console — Credentials](https://console.cloud.google.com/apis/credentials) menggunakan akun Google institusi atau pengelola sistem.
2. Klik dropdown project di bagian atas, lalu klik **New Project** (beri nama misalnya `CBT Kebahasaan Institusi`) dan klik **Create**.

### 2. Konfigurasi Layar Persetujuan (*OAuth Consent Screen*)
1. Pada menu kiri, pilih **OAuth consent screen** (atau **Google Auth Platform > Branding** pada tampilan konsol terbaru).
2. Pilih tipe **External** (agar bisa digunakan oleh email `@gmail.com` maupun email kampus `@kampus.ac.id`), lalu klik **Create**.
3. Isi kolom wajib saja:
   - **App name:** `CBT Bahasa — Sistem Ujian Kebahasaan`
   - **User support email:** alamat email Anda
   - **Developer contact information:** alamat email Anda
4. Klik **Save and Continue** hingga selesai, lalu pada halaman ringkasan klik **Publish App** (agar status menjadi *In Production* dan semua email dosen yang terdaftar di whitelist CBT dapat login tanpa batas *Test Users*).

### 3. Buat *OAuth 2.0 Client ID*
1. Buka menu **Credentials** di panel kiri.
2. Klik **+ Create Credentials** di bagian atas, lalu pilih **OAuth client ID**.
3. Pada **Application type**, pilih **Web application**.
4. Beri nama misalnya `Portal Web CBT Kebahasaan`.
5. Pada bagian **Authorized JavaScript origins**, klik **+ Add URI** lalu masukkan alamat URL aplikasi Anda:
   - Domain Vercel produksi Anda, contoh: `https://ujian-cbt-anda.vercel.app` *(tanpa garis miring `/` di akhir)*
   - Jika memakai domain kustom institusi, tambahkan juga: `https://cbt.kampus.ac.id`
   - *(Opsional untuk pengujian lokal)*: `http://localhost:3000`
6. Bagian *Authorized redirect URIs* boleh dikosongkan karena Google Identity Services menggunakan mode popup JavaScript aman.
7. Klik **Create**.

### 4. Salin Nilai *Client ID*
Setelah jendela konfirmasi muncul, salin kode pada kolom **Client ID** yang berbentuk seperti:
```text
123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com
```
*(Anda **tidak** memerlukan Client Secret).*

### 5. Tempelkan ke Aplikasi CBT Kebahasaan
Ada **dua cara** (pilih salah satu, cara pertama paling praktis):

- **Cara A — Langsung dari Dashboard Admin CBT (Tanpa Redeploy):**
  1. Login sebagai **Administrator** menggunakan Email + PIN 6 digit.
  2. Buka menu **Pengaturan Sistem** di sidebar kiri.
  3. Gulir ke kartu **Keamanan Login Staf (Google Sign-In OAuth & PIN)**.
  4. Tempelkan kode *Client ID* ke kolom **Google OAuth 2.0 Client ID**.
  5. Pilih kebijakan yang diinginkan:
     - **Gabungan 2 Lapis: Verifikasi Google OAuth + PIN 6 Digit** *(Direkomendasikan — memverifikasi kepemilikan akun Google sekaligus PIN staf)*, atau
     - **Single Sign-On: Masuk Langsung jika Email Google Terdaftar**.
  6. Klik **Simpan Seluruh Pengaturan Sistem**. Tombol Google Sign-In di halaman login akan langsung aktif otomatis!

- **Cara B — Melalui Environment Variable Vercel (Opsional):**
  1. Buka **Vercel Dashboard > Project Settings > Environment Variables**.
  2. Tambahkan key `GOOGLE_CLIENT_ID` berisi nilai *Client ID* Anda, lalu lakukan **Redeploy**.
