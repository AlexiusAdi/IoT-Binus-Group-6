/**
 * app/api/sensor/route.ts
 *
 * API endpoint untuk menerima dan menyimpan data pembacaan sensor
 * dari ESP32-S3 ke database Supabase (PostgreSQL).
 *
 * Tabel target: sensor_readings
 * Kolom: temperature, humidity, lux, motion, device_id,
 *        human_detected, vision_checked, created_at (auto)
 */

import { getSupabaseClient } from "@/lib/supabase";

/**
 * POST /api/sensor
 *
 * Menerima payload JSON dari ESP32 dan menyimpannya ke tabel
 * sensor_readings di Supabase.
 *
 * Request body (JSON):
 *   {
 *     temperature:   number   (wajib) — suhu dalam °C dari DHT22
 *     humidity:      number   (wajib) — kelembaban relatif dalam %
 *     lux:           number   (opsional, default 0) — intensitas cahaya dari BH1750
 *     motion:        boolean  — true jika PIR mendeteksi gerak
 *     device_id:     string   (opsional, default "esp32") — identifikasi perangkat
 *     human_detected:boolean  — true jika Roboflow mengonfirmasi kehadiran manusia
 *     vision_checked:boolean  — true jika pembacaan ini didahului sesi kamera
 *   }
 *
 * Response (sukses):
 *   { ok: true, data: SensorReading }
 *
 * Response (gagal):
 *   { error: string }
 */
export async function POST(req: Request) {
  const supabase = getSupabaseClient();

  try {
    const body = await req.json();

    // Destructure semua field yang diharapkan dari payload ESP32
    const {
      temperature,
      humidity,
      lux,
      motion,
      device_id,
      human_detected,
      vision_checked,
    } = body;

    // Validasi field wajib: temperature dan humidity harus selalu ada
    if (temperature === undefined || humidity === undefined) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Insert ke Supabase dengan konversi tipe eksplisit.
    // Number() dan Boolean() digunakan untuk memastikan tipe data
    // konsisten meskipun ESP32 mengirim string atau nilai lain.
    const { data, error } = await supabase
      .from("sensor_readings")
      .insert({
        temperature: Number(temperature),
        humidity: Number(humidity),
        lux: lux !== undefined ? Number(lux) : 0, // default 0 jika tidak dikirim
        motion: Boolean(motion),
        device_id: device_id ?? "esp32", // fallback jika device_id tidak ada
        human_detected: Boolean(human_detected),
        vision_checked: Boolean(vision_checked),
        // created_at diisi otomatis oleh Supabase (DEFAULT NOW())
      })
      .select() // kembalikan row yang baru diinsert
      .single(); // ambil sebagai objek tunggal, bukan array

    if (error) throw error;

    return Response.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Failed to insert" }, { status: 500 });
  }
}

/**
 * GET /api/sensor
 *
 * Mengambil satu pembacaan sensor terbaru dari Supabase.
 * Digunakan oleh dashboard sebagai fallback jika realtime subscription
 * Supabase belum terhubung saat halaman pertama kali dimuat.
 *
 * Response:
 *   { data: SensorReading | null }
 */
export async function GET() {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("sensor_readings")
    .select("*")
    .order("created_at", { ascending: false }) // urutkan terbaru dulu
    .limit(1)
    .maybeSingle(); // kembalikan null jika tabel kosong (tidak throw error)

  // Jika terjadi error Supabase, kembalikan data: null
  // agar dashboard menampilkan state "waiting" bukan crash
  if (error) return Response.json({ data: null });

  return Response.json({ data });
}
