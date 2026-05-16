"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface SensorReading {
  id?: number;
  temperature: number;
  humidity: number;
  lux: number;
  motion: boolean;
  created_at: string;
  device_id?: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

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

function lightLabel(lux: number): { label: string; color: string; bg: string } {
  if (lux < 10) return { label: "DARK", color: "#6b7280", bg: "#f9fafb" };
  if (lux < 50) return { label: "DIM", color: "#92400e", bg: "#fffbeb" };
  if (lux < 200) return { label: "INDOOR", color: "#15803d", bg: "#f0fdf4" };
  if (lux < 1000) return { label: "BRIGHT", color: "#b45309", bg: "#fffbeb" };
  return { label: "SUNLIGHT", color: "#c2410c", bg: "#fff7ed" };
}

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
  const pct = Math.min(Math.max(value / max, 0), 1);
  const r = 48;
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.72;
  const filled = arc * pct;
  const offset = circ * 0.14;

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
        {/* Track */}
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
        {/* Fill */}
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
        {/* Value */}
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
        {/* Unit */}
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

function StatusDot({ status }: { status: string }) {
  const color =
    status === "ok" ? "#86efac" : status === "error" ? "#fca5a5" : "#fcd34d";
  const glow =
    status === "ok" ? "#86efac" : status === "error" ? "#fca5a5" : "#fcd34d";
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 0 2px ${glow}44, 0 0 10px ${glow}66`,
        animation:
          status === "ok" ? "breathe 2.5s ease-in-out infinite" : "none",
        flexShrink: 0,
      }}
    />
  );
}

export default function Home() {
  const [data, setData] = useState<SensorReading | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error" | "waiting">(
    "loading",
  );
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    // 1. Load latest on mount
    supabase
      .from("sensor_readings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() // ← was .single()
      .then(({ data: row, error }) => {
        if (row && !error) {
          setData(row);
          setStatus("ok");
        } else {
          setStatus("waiting");
        }
        setLastFetch(new Date());
      });

    // 2. Realtime subscription
    const channel = supabase
      .channel("sensor_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensor_readings" },
        (payload) => {
          setData(payload.new as SensorReading);
          setStatus("ok");
          setLastFetch(new Date());
          setTick((t) => t + 1);
          setFlash(true);
          setTimeout(() => setFlash(false), 600);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

        @keyframes breathe {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.85); }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes flashPulse {
          0%   { box-shadow: 0 0 0 0 rgba(134,239,172,0.5); }
          70%  { box-shadow: 0 0 0 10px rgba(134,239,172,0); }
          100% { box-shadow: 0 0 0 0 rgba(134,239,172,0); }
        }

        .card-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 2px 6px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.06) !important;
        }

        .data-appear {
          animation: fadeIn 0.4s ease forwards;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        @media (max-width: 680px) {
          .gauge-grid { grid-template-columns: 1fr 1fr !important; }
          .header-inner { flex-direction: column; gap: 10px; align-items: flex-start !important; }
        }

        @media (max-width: 420px) {
          .gauge-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Header ── */}
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

      {/* ── Main ── */}
      <main
        style={{
          flex: 1,
          maxWidth: 860,
          width: "100%",
          margin: "0 auto",
          padding: "44px 24px 60px",
        }}
      >
        {/* Loading */}
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

        {/* Waiting */}
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

        {/* Error */}
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

        {/* Data */}
        {data && (
          <div
            className="data-appear"
            style={{ display: "flex", flexDirection: "column", gap: 20 }}
          >
            {/* Device + time row */}
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
                ...(flash ? { animation: "flashPulse 0.6s ease" } : {}),
              }}
            >
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

              {/* Motion badge */}
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

            {/* Gauges */}
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

            {/* Comfort + Light condition row */}
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

            {/* Raw output */}
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
                {`{
  "temperature": `}
                <span style={{ color: "#f97316" }}>
                  {data.temperature.toFixed(2)}
                </span>
                {`,
  "humidity":    `}
                <span style={{ color: "#38bdf8" }}>
                  {data.humidity.toFixed(2)}
                </span>
                {`,
  "lux":         `}
                <span style={{ color: "#fbbf24" }}>
                  {(data.lux ?? 0).toFixed(0)}
                </span>
                {`,
  "motion":      `}
                <span style={{ color: data.motion ? "#22c55e" : "#b8a99a" }}>
                  {String(data.motion)}
                </span>
                {`,
  "device_id":   `}
                <span style={{ color: "#c2410c" }}>
                  &quot;{data.device_id ?? "esp32"}&quot;
                </span>
                {`,
  "created_at":  `}
                <span style={{ color: "#94a3b8" }}>
                  &quot;{data.created_at}&quot;
                </span>
                {`
}`}
              </pre>
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
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
