"use client";

import { useEffect, useState, useCallback } from "react";

interface SensorReading {
  temperature: number;
  humidity: number;
  motion: boolean;
  timestamp: string;
  device_id?: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function getHeatIndex(t: number, h: number) {
  // Simple heat index approximation (Steadman, °C)
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

function comfortLabel(t: number, h: number): { label: string; color: string } {
  const hi = getHeatIndex(t, h);
  if (hi < 18) return { label: "COOL", color: "#60a5fa" };
  if (hi < 26) return { label: "COMFORT", color: "#4ade80" };
  if (hi < 32) return { label: "WARM", color: "#facc15" };
  if (hi < 41) return { label: "HOT", color: "#fb923c" };
  return { label: "DANGER", color: "#f87171" };
}

function Gauge({
  value,
  max,
  color,
  unit,
}: {
  value: number;
  max: number;
  color: string;
  unit: string;
}) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  const r = 52;
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.75;
  const filled = arc * pct;
  const offset = circ * 0.125;

  return (
    <svg viewBox="0 0 120 120" className="w-full h-full">
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke="#1a1a1a"
        strokeWidth="8"
        strokeDasharray={`${arc} ${circ - arc}`}
        strokeDashoffset={-offset}
        strokeLinecap="round"
      />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={-offset}
        strokeLinecap="round"
        style={{
          transition: "stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)",
          filter: `drop-shadow(0 0 6px ${color}88)`,
        }}
      />
      <text
        x="60"
        y="55"
        textAnchor="middle"
        fill={color}
        fontSize="22"
        fontWeight="700"
        fontFamily="'Courier New', monospace"
      >
        {value.toFixed(1)}
      </text>
      <text
        x="60"
        y="72"
        textAnchor="middle"
        fill="#555"
        fontSize="11"
        fontFamily="'Courier New', monospace"
      >
        {unit}
      </text>
    </svg>
  );
}

export default function Home() {
  const [data, setData] = useState<SensorReading | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error" | "waiting">(
    "loading",
  );
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/sensor");
      const json = await res.json();
      if (json.data) {
        setData(json.data);
        setStatus("ok");
      } else {
        setStatus("waiting");
      }
    } catch {
      setStatus("error");
    }
    setLastFetch(new Date());
  }, []);

  useEffect(() => {
    const run = () => {
      fetchData();
      setTick((t) => t + 1);
    };
    // Small timeout so the first call is inside a callback, not synchronously in the effect body
    const initial = setTimeout(run, 0);
    const interval = setInterval(run, 5000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [fetchData]);

  const comfort = data ? comfortLabel(data.temperature, data.humidity) : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#e0e0e0",
        fontFamily: "'Courier New', Courier, monospace",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid #1f1f1f",
          padding: "20px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#0d0d0d",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background:
                status === "ok"
                  ? "#4ade80"
                  : status === "error"
                    ? "#f87171"
                    : "#facc15",
              boxShadow:
                status === "ok"
                  ? "0 0 8px #4ade80"
                  : status === "error"
                    ? "0 0 8px #f87171"
                    : "0 0 8px #facc15",
              animation: status === "ok" ? "pulse 2s infinite" : "none",
            }}
          />
          <span
            style={{
              fontSize: 13,
              letterSpacing: "0.15em",
              color: "#555",
              textTransform: "uppercase",
            }}
          >
            DHT22 · ESP32
          </span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#333", letterSpacing: "0.1em" }}>
            LAST SYNC
          </div>
          <div style={{ fontSize: 12, color: "#555" }}>
            {lastFetch
              ? lastFetch.toLocaleTimeString("en-US", { hour12: false })
              : "—"}
          </div>
        </div>
      </header>

      {/* Main */}
      <main
        style={{
          flex: 1,
          maxWidth: 720,
          width: "100%",
          margin: "0 auto",
          padding: "48px 24px",
        }}
      >
        {status === "loading" && (
          <div
            style={{
              textAlign: "center",
              color: "#333",
              paddingTop: 80,
              fontSize: 13,
              letterSpacing: "0.2em",
            }}
          >
            INITIALIZING...
          </div>
        )}

        {status === "waiting" && (
          <div style={{ textAlign: "center", paddingTop: 80 }}>
            <div
              style={{
                fontSize: 13,
                color: "#555",
                letterSpacing: "0.2em",
                marginBottom: 12,
              }}
            >
              AWAITING SENSOR DATA
            </div>
            <div style={{ fontSize: 11, color: "#333" }}>
              POST to <code style={{ color: "#4ade80" }}>/api/sensor</code> from
              your ESP32
            </div>
          </div>
        )}

        {status === "error" && (
          <div
            style={{
              textAlign: "center",
              color: "#f87171",
              paddingTop: 80,
              fontSize: 13,
              letterSpacing: "0.2em",
            }}
          >
            CONNECTION ERROR
          </div>
        )}

        {data && (
          <div
            style={{
              background: "#111",
              border: `1px solid ${data.motion ? "#f87171" : "#1f1f1f"}`,
              borderRadius: 4,
              padding: "20px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.25em",
                  color: "#333",
                  marginBottom: 6,
                }}
              >
                MOTION SENSOR
              </div>

              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: data.motion ? "#f87171" : "#4ade80",
                  letterSpacing: "0.1em",
                }}
              >
                {data.motion ? "MOTION DETECTED" : "CLEAR"}
              </div>
            </div>

            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: data.motion ? "#f87171" : "#4ade80",
                boxShadow: data.motion
                  ? "0 0 12px #f87171"
                  : "0 0 12px #4ade80",
                animation: data.motion ? "pulse 1s infinite" : "none",
              }}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid #1a1a1a",
          padding: "14px 32px",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "#2a2a2a",
          letterSpacing: "0.15em",
        }}
      >
        <span>AUTO-REFRESH · 5s</span>
        <span>POLL #{tick}</span>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
