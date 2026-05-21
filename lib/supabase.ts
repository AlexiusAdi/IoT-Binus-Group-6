/**
 * lib/supabase.ts
 *
 * Modul helper untuk membuat Supabase client.
 *
 * Menggunakan pola factory function (bukan singleton) sehingga
 * setiap pemanggilan membuat instance baru. Ini penting untuk
 * Next.js App Router karena:
 * - Server Components dan API Routes berjalan di lingkungan berbeda
 * - Singleton bisa menyebabkan kebocoran state antar request di server
 *
 * Kredensial diambil dari environment variable:
 * - NEXT_PUBLIC_SUPABASE_URL      : URL project Supabase (aman di client)
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY : Anon key Supabase (aman di client,
 *                                   akses dibatasi oleh RLS policy)
 *
 * Catatan: Prefix NEXT_PUBLIC_ membuat variabel ini tersedia di
 * browser (client-side). Untuk operasi yang membutuhkan hak akses
 * lebih tinggi (bypass RLS), gunakan SUPABASE_SERVICE_ROLE_KEY
 * tanpa prefix NEXT_PUBLIC_ dan hanya panggil dari server.
 */

import { createClient } from "@supabase/supabase-js";

/**
 * getSupabaseClient()
 *
 * Membuat dan mengembalikan instance Supabase client baru.
 * Dipanggil di setiap API route dan komponen yang membutuhkan
 * akses ke database, bukan diinisialisasi sekali di module level.
 *
 * @returns SupabaseClient yang siap digunakan untuk query database
 */
export function getSupabaseClient() {
  return createClient(
    // createClient dipanggil di dalam fungsi, bukan di module scope,
    // untuk menghindari masalah inisialisasi saat build time di Vercel
    // ketika environment variable belum tentu tersedia.
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
