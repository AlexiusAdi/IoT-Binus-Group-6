/**
 * app/api/vision/route.ts
 *
 * API endpoint untuk menerima gambar JPEG dari ESP32-S3 dan
 * meneruskannya ke Roboflow Inference API untuk deteksi manusia.
 *
 * Alur kerja:
 * 1. ESP32 mengirim raw JPEG via HTTP POST (Content-Type: image/jpeg)
 * 2. Server memvalidasi JPEG (header magic bytes 0xFF 0xD8)
 * 3. Gambar dikonversi ke base64 dan dikirim ke Roboflow COCO model
 * 4. Roboflow mengembalikan daftar prediksi objek yang terdeteksi
 * 5. Server memeriksa apakah ada prediksi dengan class "person"
 *    dan confidence > 0.2 (20%)
 * 6. Hasil dikembalikan ke ESP32 dalam format JSON
 */

import { NextRequest } from "next/server";

/**
 * POST /api/vision
 *
 * Menerima raw JPEG dari ESP32, memvalidasi, lalu mengirim ke Roboflow
 * untuk deteksi kehadiran manusia menggunakan model COCO (80 kelas objek).
 *
 * Request:
 *   Content-Type: image/jpeg
 *   Body: raw JPEG bytes
 *
 * Response (sukses):
 *   {
 *     success: true,
 *     human: boolean,           // true jika manusia terdeteksi
 *     human_detected: boolean,  // alias human, untuk kompatibilitas ESP32
 *     predictions: array        // seluruh hasil deteksi dari Roboflow
 *   }
 *
 * Response (gagal):
 *   { error: string, detail?: string }
 */
export async function POST(req: NextRequest) {
  // Ambil API key dari environment variable (disimpan di Vercel dashboard)
  const apiKey = process.env.ROBOFLOW_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "Missing ROBOFLOW_API_KEY" },
      { status: 500 },
    );
  }

  try {
    // Baca raw bytes dari body request yang dikirim ESP32
    const imageBytes = await req.arrayBuffer();
    const buffer = Buffer.from(imageBytes);

    console.log("Image size:", buffer.length);

    // Validasi JPEG menggunakan magic bytes:
    // Setiap file JPEG selalu diawali dengan 0xFF 0xD8 (SOI marker).
    // Ukuran minimum 100 bytes untuk memastikan bukan file kosong/corrupt.
    if (buffer.length < 100 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      throw new Error("Invalid JPEG image");
    }

    // Konversi buffer JPEG ke string base64.
    // Roboflow API menerima gambar dalam format base64 via form-urlencoded.
    const base64 = buffer.toString("base64");

    console.log("Base64 length:", base64.length);

    // Kirim ke Roboflow menggunakan model COCO versi 7.
    // Parameter:
    // - confidence=20 : threshold minimum confidence 20% untuk dihitung sebagai deteksi
    // - overlap=30    : toleransi overlap antar bounding box (NMS threshold)
    // Model COCO dapat mendeteksi 80 kelas objek, termasuk "person".
    const response = await fetch(
      `https://detect.roboflow.com/coco/7?api_key=${apiKey}&confidence=20&overlap=30`,
      {
        method: "POST",
        headers: {
          // Roboflow menerima base64 sebagai form-urlencoded body
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: base64,
      },
    );

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Roboflow error ${response.status}: ${text}`);
    }

    const data = JSON.parse(text);

    // Cek apakah ada prediksi dengan class "person" dan confidence > 20%.
    // Threshold 20% dipilih untuk meningkatkan sensitivitas deteksi
    // dalam kondisi pencahayaan ruangan yang bervariasi.
    const human =
      data.predictions?.some(
        (p: { class: string; confidence: number }) =>
          p.class === "person" && p.confidence > 0.2,
      ) ?? false;

    console.log("Human detected:", human);

    // Kembalikan dua field boolean untuk kompatibilitas:
    // - "human"          : dibaca langsung oleh ESP32 firmware
    // - "human_detected" : digunakan oleh dashboard dan sensor API
    return Response.json({
      success: true,
      human,
      human_detected: human,
      predictions: data.predictions ?? [],
    });
  } catch (err: any) {
    console.error("Vision error:", err?.message ?? err);

    return Response.json(
      {
        error: "Vision check failed",
        detail: err?.message ?? String(err),
      },
      { status: 500 },
    );
  }
}
