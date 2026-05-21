/**
 * app/page.tsx
 *
 * Halaman utama dashboard monitoring sensor IoT secara real-time.
 *
 * Fitur:
 * - Menampilkan pembacaan sensor terbaru (suhu, kelembaban, cahaya)
 * - Status deteksi gerak (PIR) dan kehadiran manusia (Roboflow)
 * - Gauge visual berbasis SVG dengan animasi transisi
 * - Comfort Index berdasarkan Heat Index formula
 * - Light Condition berdasarkan rentang nilai lux
 * - Raw payload JSON dari ESP32
 * - Realtime update via Supabase Realtime (WebSocket postgres_changes)
 * - Flash animation saat data baru masuk
 * - Responsive untuk mobile (2 kolom) dan desktop (3 kolom)
 */

"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

/**
 * Tipe data untuk satu baris dari tabel sensor_readings di Supabase.
 * Field opsional (?) mencerminkan bahwa data lama mungkin tidak memiliki
 * kolom yang ditambahkan belakangan (human_detected, vision_checked).
 */
interface SensorReading {
  id?: number;
  temperature: number;
  humidity: number;
  lux: number;
  motion: boolean;
  human_detected?: boolean;
  vision_checked?: boolean;
  created_at: string;
  device_id?: string;
}

// ──────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ──────────────────────────────────────────────────────────────

/**
 * Memformat string ISO timestamp menjadi waktu HH:MM:SS (24 jam).
 * @param iso  String ISO 8601 dari Supabase (contoh: "2025-01-15T10:30:45Z")
 * @returns    String waktu lokal, contoh: "10:30:45"
 */
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Memformat string ISO timestamp menjadi tanggal singkat.
 * @param iso  String ISO 8601 dari Supabase
 * @returns    String tanggal lokal, contoh: "Jan 15, 2025"
 */
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

/**
 * Menghitung Heat Index (indeks panas terasa) dari suhu dan kelembaban.
 * Menggunakan persamaan Rothfusz Regression yang digunakan oleh NOAA/NWS.
 * Akurat untuk suhu >= 27°C dan kelembaban >= 40%.
 *
 * @param t  Suhu dalam °C
 * @param h  Kelembaban relatif dalam %
 * @returns  Heat Index dalam °C
 */
function getHeatIndex(t: number, h: number) {
  return (
    -8.78469475556 +
    1.61139411 * t +
    2.33854883889 * h +
    -0.14611605 * t * h +
    -0.012308094 * t * t +
    -0.0164248277778 * h * h +
    0.002211732 * t * t * h +
    0.00072546 * t * h * h +
    -0.000003582 * t * t * h * h
  );
}

/**
 * Menentukan label dan warna Comfort Index berdasarkan Heat Index.
 * Rentang disesuaikan dengan kondisi iklim tropis Indonesia.
 *
 * @param t  Suhu dalam °C
 * @param h  Kelembaban relatif dalam %
 * @returns  Objek dengan label, warna teks, dan warna background
 */
function comfortLabel(
  t: number,
  h: number,
): { label: string; color: string; bg: string } {
  const hi = getHeatIndex(t, h);
  if (hi < 18) return { label: "COOL", color: "#3b82f6", bg: "#eff6ff" };
  if (hi < 26) return { label: "COMFORT", color: "#16a34a", bg: "#f0fdf4" };
  if (hi < 32) return { label: "WARM", color: "#d97706", bg: "#fffbeb" };
  if (hi < 41) return { label: "HOT", color: "#ea580c", bg: "#fff7ed" };
  return { label: "DANGER", color: "#dc2626", bg: "#fef2f2" };
}

/**
 * Menentukan label dan warna Light Condition berdasarkan nilai lux.
 * Rentang berdasarkan standar pencahayaan ruangan umum (lux):
 * < 10   : Gelap (malam hari tanpa lampu)
 * 10-50  : Redup (lorong, kamar tidur malam)
 * 50-200 : Indoor normal (ruang kerja, ruang tamu)
 * 200-1000: Terang (area kerja intensif, dekat jendela)
 * > 1000 : Cahaya matahari langsung
 *
 * @param lux  Intensitas cahaya dalam lux dari BH1750
 * @returns    Objek dengan label, warna teks, dan warna background
 */
function lightLabel(lux: number): { label: string; color: string; bg: string } {
  if (lux < 10) return { label: "DARK", color: "#6b7280", bg: "#f9fafb" };
  if (lux < 50) return { label: "DIM", color: "#92400e", bg: "#fffbeb" };
  if (lux < 200) return { label: "INDOOR", color: "#15803d", bg: "#f0fdf4" };
  if (lux < 1000) return { label: "BRIGHT", color: "#b45309", bg: "#fffbeb" };
  return { label: "SUNLIGHT", color: "#c2410c", bg: "#fff7ed" };
}

// ──────────────────────────────────────────────────────────────
// KOMPONEN: Gauge
// ──────────────────────────────────────────────────────────────

/**
 * Gauge
 * Komponen visualisasi nilai sensor berbentuk lingkaran busur SVG.
 * Arc menempati 72% lingkaran penuh (260 derajat) untuk estetika.
 * Animasi transisi CSS digunakan saat nilai berubah.
 *
 * @param value  Nilai saat ini
 * @param max    Nilai maksimum (menentukan pengisian busur)
 * @param color  Warna hex busur aktif
 * @param unit   Satuan yang ditampilkan di bawah nilai (°C, %, lx)
 * @param label  Label di atas gauge (TEMPERATURE, HUMIDITY, LIGHT)
 * @param sub    Teks kecil opsional di bawah gauge (misal: konversi °F)
 */
function Gauge({
  value,
  max,
  color,
  unit,
  label,
  sub,
}: {
  value: number;
  max: number;
  color: string;
  unit: string;
  label: string;
  sub?: string;
}) {
  // Hitung panjang busur berdasarkan persentase nilai terhadap max
  const pct = Math.min(Math.max(value / max, 0), 1); // clamp 0-1
  const r = 48; // radius lingkaran dalam SVG unit
  const circ = 2 * Math.PI * r; // keliling penuh
  const arc = circ * 0.72; // panjang busur aktif (72% lingkaran)
  const filled = arc * pct; // panjang busur yang terisi
  const offset = circ * 0.14; // offset rotasi agar busur mulai dari bawah-kiri

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #f0ede8",
        borderRadius: 20,
        padding: "28px 20px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
    >
      {/* Label gauge */}
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          color: "#b8a99a",
          fontFamily: "'DM Mono', 'Courier New', monospace",
          fontWeight: 500,
          marginBottom: 4,
        }}
      >
        {label}
      </div>

      <svg viewBox="0 0 110 110" width={130} height={130}>
        {/* Track: busur latar belakang (abu-abu) */}
        <circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke="#f5f0eb"
          strokeWidth="7"
          strokeDasharray={`${arc} ${circ - arc}`}
          strokeDashoffset={-offset}
          strokeLinecap="round"
        />
        {/* Fill: busur aktif dengan animasi dan glow effect */}
        <circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={-offset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1)",
            filter: `drop-shadow(0 0 6px ${color}40)`,
          }}
        />
        {/* Nilai numerik di tengah gauge */}
        <text
          x="55"
          y="50"
          textAnchor="middle"
          fill={color}
          fontSize="20"
          fontWeight="700"
          fontFamily="'Georgia', 'Times New Roman', serif"
        >
          {value.toFixed(1)}
        </text>
        {/* Satuan di bawah nilai */}
        <text
          x="55"
          y="66"
          textAnchor="middle"
          fill="#c4b5a5"
          fontSize="10"
          fontFamily="'DM Mono', 'Courier New', monospace"
        >
          {unit}
        </text>
      </svg>

      {/* Teks sub-informasi opsional, contoh: konversi suhu ke °F */}
      {sub && (
        <div
          style={{
            fontSize: 11,
            color: "#c4b5a5",
            fontFamily: "'DM Mono', monospace",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// KOMPONEN: StatusDot
// ──────────────────────────────────────────────────────────────

/**
 * StatusDot
 * Indikator status koneksi berbentuk lingkaran kecil di header.
 * - "ok"      : hijau, animasi bernapas (koneksi aktif)
 * - "error"   : merah, statis
 * - lainnya   : kuning (loading/waiting)
 *
 * @param status  String status koneksi
 */
function StatusDot({ status }: { status: string }) {
  const color =
    status === "ok" ? "#86efac" : status === "error" ? "#fca5a5" : "#fcd34d";
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 0 2px ${color}44, 0 0 10px ${color}66`,
        animation:
          status === "ok" ? "breathe 2.5s ease-in-out infinite" : "none",
        flexShrink: 0,
      }}
    />
  );
}

// ──────────────────────────────────────────────────────────────
// HALAMAN UTAMA
// ──────────────────────────────────────────────────────────────

export default function Home() {
  // State utama: data sensor terbaru dari Supabase
  const [data, setData] = useState<SensorReading | null>(null);

  // Status koneksi: "loading" | "ok" | "error" | "waiting"
  // - loading : sedang fetch pertama kali
  // - ok      : data berhasil diterima
  // - error   : koneksi gagal
  // - waiting : koneksi ok tapi tabel masih kosong
  const [status, setStatus] = useState<"loading" | "ok" | "error" | "waiting">(
    "loading",
  );

  // Waktu terakhir data berhasil diterima (untuk ditampilkan di header)
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  // Counter jumlah update realtime yang diterima sejak halaman dibuka
  const [tick, setTick] = useState(0);

  // Trigger animasi flash saat data baru masuk via realtime
  const [flash, setFlash] = useState(false);

  const supabase = getSupabaseClient();

  useEffect(() => {
    // ── FETCH AWAL ──────────────────────────────────────────
    // Ambil data terbaru saat halaman pertama dimuat,
    // sebelum realtime subscription aktif.
    supabase
      .from("sensor_readings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() // gunakan maybeSingle agar tidak error jika tabel kosong
      .then(({ data: row, error }) => {
        console.log("row:", row);
        console.log("error:", error);
        if (row && !error) {
          setData(row);
          setStatus("ok");
        } else {
          setStatus("waiting"); // tabel kosong, tunggu data dari ESP32
        }
        setLastFetch(new Date());
      });

    // ── REALTIME SUBSCRIPTION ───────────────────────────────
    // Subscribe ke perubahan INSERT pada tabel sensor_readings.
    // Setiap kali ESP32 mengirim data baru, Supabase akan mengirim
    // event via WebSocket dan komponen ini akan langsung terupdate
    // tanpa perlu polling manual.
    const channel = supabase
      .channel("sensor_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensor_readings" },
        (payload) => {
          setData(payload.new as SensorReading);
          setStatus("ok");
          setLastFetch(new Date());
          setTick((t) => t + 1); // increment counter update

          // Aktifkan flash animation selama 600ms
          setFlash(true);
          setTimeout(() => setFlash(false), 600);
        },
      )
      .subscribe();

    // Cleanup: unsubscribe saat komponen unmount untuk mencegah memory leak
    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // dependency array kosong = hanya dijalankan sekali saat mount

  // Hitung label comfort dan light dari data terbaru
  const comfort = data ? comfortLabel(data.temperature, data.humidity) : null;
  const light = data ? lightLabel(data.lux ?? 0) : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#faf9f7",
        color: "#2d2520",
        fontFamily: "'DM Mono', 'Courier New', monospace",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');

        /* Animasi StatusDot saat koneksi aktif */
        @keyframes breathe {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(0.85); }
        }

        /* Animasi kemunculan konten saat data pertama diterima */
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Animasi flash hijau saat data realtime baru masuk */
        @keyframes flashPulse {
          0%   { box-shadow: 0 0 0 0 rgba(134,239,172,0.5); }
          70%  { box-shadow: 0 0 0 10px rgba(134,239,172,0); }
          100% { box-shadow: 0 0 0 0 rgba(134,239,172,0); }
        }

        /* Efek hover pada kartu gauge */
        .card-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 2px 6px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.06) !important;
        }

        .data-appear { animation: fadeIn 0.4s ease forwards; }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        /* Responsive: 2 kolom untuk layar medium */
        @media (max-width: 680px) {
          .gauge-grid { grid-template-columns: 1fr 1fr !important; }
          .header-inner { flex-direction: column; gap: 10px; align-items: flex-start !important; }
        }

        /* Responsive: 1 kolom untuk layar kecil */
        @media (max-width: 420px) {
          .gauge-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────
          Sticky header dengan status koneksi, timestamp update terakhir,
          dan counter jumlah update realtime yang diterima.
      */}
      <header
        style={{
          borderBottom: "1px solid #ede9e4",
          padding: "18px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(255,255,255,0.8)",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          className="header-inner"
          style={{ display: "flex", alignItems: "center", gap: 12 }}
        >
          <StatusDot status={status} />
          <span
            style={{
              fontSize: 11,
              letterSpacing: "0.2em",
              color: "#b8a99a",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            ESP32 · DHT22 · PIR
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* Waktu update terakhir */}
          {lastFetch && (
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: 9,
                  color: "#c4b5a5",
                  letterSpacing: "0.15em",
                  marginBottom: 2,
                }}
              >
                LAST UPDATE
              </div>
              <div style={{ fontSize: 12, color: "#8a7a6e" }}>
                {lastFetch.toLocaleTimeString("en-US", { hour12: false })}
              </div>
            </div>
          )}
          {/* Counter realtime updates */}
          <div
            style={{
              fontSize: 9,
              color: "#d4c9bc",
              letterSpacing: "0.12em",
              background: "#f5f2ee",
              padding: "4px 10px",
              borderRadius: 20,
            }}
          >
            LIVE #{tick}
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ───────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          maxWidth: 860,
          width: "100%",
          margin: "0 auto",
          padding: "44px 24px 60px",
        }}
      >
        {/* State: sedang menghubungkan ke Supabase */}
        {status === "loading" && (
          <div
            style={{
              textAlign: "center",
              paddingTop: 100,
              color: "#c4b5a5",
              fontSize: 11,
              letterSpacing: "0.25em",
            }}
          >
            CONNECTING...
          </div>
        )}

        {/* State: terhubung tapi belum ada data dari ESP32 */}
        {status === "waiting" && (
          <div style={{ textAlign: "center", paddingTop: 100 }}>
            <div
              style={{
                fontSize: 11,
                color: "#b8a99a",
                letterSpacing: "0.2em",
                marginBottom: 10,
              }}
            >
              AWAITING SENSOR DATA
            </div>
            <div style={{ fontSize: 10, color: "#d4c9bc" }}>
              POST to{" "}
              <code
                style={{
                  color: "#c2410c",
                  background: "#fff7ed",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                /api/sensor
              </code>
            </div>
          </div>
        )}

        {/* State: koneksi Supabase gagal */}
        {status === "error" && (
          <div
            style={{
              textAlign: "center",
              paddingTop: 100,
              color: "#fca5a5",
              fontSize: 11,
              letterSpacing: "0.2em",
            }}
          >
            CONNECTION ERROR
          </div>
        )}

        {/* State: data tersedia — tampilkan seluruh dashboard */}
        {data && (
          <div
            className="data-appear"
            style={{ display: "flex", flexDirection: "column", gap: 20 }}
          >
            {/* ── BARIS INFO PERANGKAT ──────────────────────────
                Menampilkan: device ID, status gerak PIR,
                status deteksi manusia (jika vision_checked),
                dan timestamp pembacaan terakhir.
            */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
                background: "#ffffff",
                border: "1px solid #f0ede8",
                borderRadius: 16,
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                // Aktifkan flash animation saat data realtime baru masuk
                ...(flash ? { animation: "flashPulse 0.6s ease" } : {}),
              }}
            >
              {/* Device ID */}
              <div>
                <div
                  style={{
                    fontSize: 9,
                    color: "#c4b5a5",
                    letterSpacing: "0.2em",
                    marginBottom: 4,
                  }}
                >
                  DEVICE
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#c2410c",
                    letterSpacing: "0.08em",
                    fontWeight: 600,
                  }}
                >
                  {data.device_id?.toUpperCase() ?? "ESP32"}
                </div>
              </div>

              {/* Badge status gerak PIR */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: data.motion ? "#f0fdf4" : "#faf9f7",
                  border: `1px solid ${data.motion ? "#bbf7d0" : "#ede9e4"}`,
                  borderRadius: 24,
                  padding: "6px 14px",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: data.motion ? "#22c55e" : "#d4c9bc",
                    display: "inline-block",
                    boxShadow: data.motion ? "0 0 8px #22c55e88" : "none",
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    color: data.motion ? "#16a34a" : "#b8a99a",
                    letterSpacing: "0.15em",
                  }}
                >
                  {data.motion ? "MOTION" : "STILL"}
                </span>
              </div>

              {/* Badge status deteksi manusia Roboflow (hanya tampil jika vision_checked=true) */}
              {data.vision_checked && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: data.human_detected ? "#f0fdf4" : "#faf9f7",
                    border: `1px solid ${data.human_detected ? "#bbf7d0" : "#ede9e4"}`,
                    borderRadius: 24,
                    padding: "6px 14px",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: data.human_detected ? "#22c55e" : "#d4c9bc",
                      display: "inline-block",
                      boxShadow: data.human_detected
                        ? "0 0 8px #22c55e88"
                        : "none",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      color: data.human_detected ? "#16a34a" : "#b8a99a",
                      letterSpacing: "0.15em",
                    }}
                  >
                    {data.human_detected ? "HUMAN" : "NO HUMAN"}
                  </span>
                </div>
              )}

              {/* Tanggal dan waktu pembacaan sensor */}
              <div style={{ textAlign: "right" }}>
                <div
                  style={{ fontSize: 11, color: "#b8a99a", marginBottom: 2 }}
                >
                  {formatDate(data.created_at)}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    color: "#5a3e30",
                    fontFamily: "'Georgia', serif",
                    letterSpacing: "0.04em",
                  }}
                >
                  {formatTime(data.created_at)}
                </div>
              </div>
            </div>

            {/* ── GAUGE GRID ────────────────────────────────────
                Tiga gauge: Suhu, Kelembaban, Cahaya.
                Responsive: 3 kolom → 2 kolom → 1 kolom.
                Suhu juga menampilkan konversi ke °F sebagai sub-info.
            */}
            <div
              className="gauge-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 16,
              }}
            >
              <div
                className="card-hover"
                style={{ transition: "transform 0.2s, box-shadow 0.2s" }}
              >
                <Gauge
                  value={data.temperature}
                  max={50}
                  color="#f97316"
                  unit="°C"
                  label="TEMPERATURE"
                  sub={`${((data.temperature * 9) / 5 + 32).toFixed(1)}°F`}
                />
              </div>
              <div
                className="card-hover"
                style={{ transition: "transform 0.2s, box-shadow 0.2s" }}
              >
                <Gauge
                  value={data.humidity}
                  max={100}
                  color="#38bdf8"
                  unit="%"
                  label="HUMIDITY"
                  sub="REL. HUMIDITY"
                />
              </div>
              <div
                className="card-hover"
                style={{ transition: "transform 0.2s, box-shadow 0.2s" }}
              >
                {/* Lux dibatasi maksimum 1000 untuk skala gauge yang proporsional */}
                <Gauge
                  value={Math.min(data.lux ?? 0, 1000)}
                  max={1000}
                  color="#fbbf24"
                  unit="lx"
                  label="LIGHT"
                  sub="BH1750"
                />
              </div>
            </div>

            {/* ── COMFORT INDEX & LIGHT CONDITION ───────────────
                Dua kartu analisis kondisi ruangan:
                - Comfort Index: berdasarkan Heat Index formula NOAA
                - Light Condition: berdasarkan rentang nilai lux
            */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              {comfort && (
                <div
                  style={{
                    background: comfort.bg,
                    border: `1px solid ${comfort.color}22`,
                    borderRadius: 16,
                    padding: "20px 22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.2em",
                      color: "#b8a99a",
                    }}
                  >
                    COMFORT INDEX
                  </div>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 700,
                      color: comfort.color,
                      letterSpacing: "0.06em",
                    }}
                  >
                    {comfort.label}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-end",
                    }}
                  >
                    <div style={{ fontSize: 10, color: "#b8a99a" }}>
                      HEAT INDEX
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        color: comfort.color,
                        fontFamily: "'Georgia', serif",
                      }}
                    >
                      {getHeatIndex(data.temperature, data.humidity).toFixed(1)}
                      °C
                    </div>
                  </div>
                </div>
              )}

              {light && (
                <div
                  style={{
                    background: light.bg,
                    border: `1px solid ${light.color}22`,
                    borderRadius: 16,
                    padding: "20px 22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.2em",
                      color: "#b8a99a",
                    }}
                  >
                    LIGHT CONDITION
                  </div>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 700,
                      color: light.color,
                      letterSpacing: "0.06em",
                    }}
                  >
                    {light.label}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-end",
                    }}
                  >
                    <div style={{ fontSize: 10, color: "#b8a99a" }}>
                      ILLUMINANCE
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        color: light.color,
                        fontFamily: "'Georgia', serif",
                      }}
                    >
                      {(data.lux ?? 0).toFixed(0)} lx
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── RAW PAYLOAD ───────────────────────────────────
                Menampilkan data JSON mentah yang diterima dari ESP32,
                dengan syntax highlighting warna per field.
                Berguna untuk debugging dan verifikasi data.
            */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #f0ede8",
                borderRadius: 16,
                padding: "18px 22px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: "#c4b5a5",
                  letterSpacing: "0.2em",
                  marginBottom: 14,
                }}
              >
                RAW PAYLOAD
              </div>
              <pre
                style={{
                  margin: 0,
                  fontSize: 11,
                  lineHeight: 1.9,
                  color: "#8a7a6e",
                  fontFamily: "'DM Mono', 'Courier New', monospace",
                }}
              >
                {`{\n  "temperature": `}
                <span style={{ color: "#f97316" }}>
                  {data.temperature.toFixed(2)}
                </span>
                {`,\n  "humidity":    `}
                <span style={{ color: "#38bdf8" }}>
                  {data.humidity.toFixed(2)}
                </span>
                {`,\n  "lux":         `}
                <span style={{ color: "#fbbf24" }}>
                  {(data.lux ?? 0).toFixed(0)}
                </span>
                {`,\n  "motion":      `}
                <span style={{ color: data.motion ? "#22c55e" : "#b8a99a" }}>
                  {String(data.motion)}
                </span>
                {`,\n  "device_id":   `}
                <span style={{ color: "#c2410c" }}>
                  &quot;{data.device_id ?? "esp32"}&quot;
                </span>
                {`,\n  "created_at":  `}
                <span style={{ color: "#94a3b8" }}>
                  &quot;{data.created_at}&quot;
                </span>
                {`\n}`}
              </pre>
            </div>
          </div>
        )}
      </main>

      {/* ── FOOTER ─────────────────────────────────────────────
          Informasi singkat teknologi yang digunakan dan device ID aktif.
      */}
      <footer
        style={{
          borderTop: "1px solid #ede9e4",
          padding: "12px 32px",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 9,
          color: "#d4c9bc",
          letterSpacing: "0.15em",
          background: "rgba(255,255,255,0.6)",
        }}
      >
        <span>REALTIME · SUPABASE</span>
        <span>{data?.device_id?.toUpperCase() ?? "—"} · IoT DASHBOARD</span>
      </footer>
    </div>
  );
}
