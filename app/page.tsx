"use client";

import { useEffect, useState, useCallback } from "react";

interface SensorReading {
  temperature: number;
  humidity: number;
  lux: number;
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
): {
  label: string;
  color: string;
} {
  const hi = getHeatIndex(t, h);

  if (hi < 18) return { label: "COOL", color: "#60a5fa" };
  if (hi < 26) return { label: "COMFORT", color: "#4ade80" };
  if (hi < 32) return { label: "WARM", color: "#facc15" };
  if (hi < 41) return { label: "HOT", color: "#fb923c" };

  return { label: "DANGER", color: "#f87171" };
}

function lightLabel(lux: number): {
  label: string;
  color: string;
} {
  if (lux < 10) {
    return { label: "DARK", color: "#64748b" };
  }

  if (lux < 50) {
    return { label: "DIM", color: "#60a5fa" };
  }

  if (lux < 200) {
    return { label: "INDOOR", color: "#4ade80" };
  }

  if (lux < 1000) {
    return { label: "BRIGHT", color: "#facc15" };
  }

  return { label: "SUNLIGHT", color: "#fb923c" };
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

    const initial = setTimeout(run, 0);

    const interval = setInterval(run, 5000);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [fetchData]);

  const comfort = data ? comfortLabel(data.temperature, data.humidity) : null;

  const light = data ? lightLabel(data.lux) : null;

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
            DHT22 · BH1750 · ESP32
          </span>
        </div>

        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: 11,
              color: "#333",
              letterSpacing: "0.1em",
            }}
          >
            LAST SYNC
          </div>

          <div style={{ fontSize: 12, color: "#555" }}>
            {lastFetch
              ? lastFetch.toLocaleTimeString("en-US", {
                  hour12: false,
                })
              : "—"}
          </div>
        </div>
      </header>

      {/* Main */}
      <main
        style={{
          flex: 1,
          maxWidth: 920,
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
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {/* Device + Timestamp */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#333",
                    letterSpacing: "0.2em",
                    marginBottom: 4,
                  }}
                >
                  DEVICE
                </div>

                <div
                  style={{
                    fontSize: 13,
                    color: "#4ade80",
                    letterSpacing: "0.1em",
                  }}
                >
                  {data.device_id?.toUpperCase() ?? "ESP32"}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, color: "#444" }}>
                  {formatDate(data.timestamp)}
                </div>

                <div
                  style={{
                    fontSize: 22,
                    color: "#777",
                    letterSpacing: "0.05em",
                  }}
                >
                  {formatTime(data.timestamp)}
                </div>
              </div>
            </div>

            {/* Gauges */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 24,
              }}
            >
              {/* Temperature */}
              <div
                style={{
                  background: "#111",
                  border: "1px solid #1f1f1f",
                  borderRadius: 4,
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.25em",
                    color: "#333",
                  }}
                >
                  TEMPERATURE
                </div>

                <div style={{ width: 140, height: 140 }}>
                  <Gauge
                    value={data.temperature}
                    max={50}
                    color="#fb923c"
                    unit="°C"
                  />
                </div>

                <div style={{ fontSize: 11, color: "#333" }}>
                  {((data.temperature * 9) / 5 + 32).toFixed(1)}°F
                </div>
              </div>

              {/* Humidity */}
              <div
                style={{
                  background: "#111",
                  border: "1px solid #1f1f1f",
                  borderRadius: 4,
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.25em",
                    color: "#333",
                  }}
                >
                  HUMIDITY
                </div>

                <div style={{ width: 140, height: 140 }}>
                  <Gauge
                    value={data.humidity}
                    max={100}
                    color="#38bdf8"
                    unit="%"
                  />
                </div>

                <div style={{ fontSize: 11, color: "#333" }}>RH</div>
              </div>

              {/* Light */}
              <div
                style={{
                  background: "#111",
                  border: "1px solid #1f1f1f",
                  borderRadius: 4,
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.25em",
                    color: "#333",
                  }}
                >
                  LIGHT
                </div>

                <div style={{ width: 140, height: 140 }}>
                  <Gauge
                    value={Math.min(data.lux, 1000)}
                    max={1000}
                    color="#facc15"
                    unit="lx"
                  />
                </div>

                <div style={{ fontSize: 11, color: "#333" }}>BH1750 SENSOR</div>
              </div>
            </div>

            {/* Comfort Index */}
            {comfort && (
              <div
                style={{
                  background: "#111",
                  border: `1px solid ${comfort.color}22`,
                  borderRadius: 4,
                  padding: "20px 24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.25em",
                      color: "#333",
                      marginBottom: 4,
                    }}
                  >
                    COMFORT INDEX
                  </div>

                  <div
                    style={{
                      fontSize: 22,
                      color: comfort.color,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                    }}
                  >
                    {comfort.label}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#333",
                      marginBottom: 4,
                    }}
                  >
                    HEAT INDEX
                  </div>

                  <div style={{ fontSize: 18, color: "#666" }}>
                    {getHeatIndex(data.temperature, data.humidity).toFixed(1)}
                    °C
                  </div>
                </div>
              </div>
            )}

            {/* Light Condition */}
            {light && (
              <div
                style={{
                  background: "#111",
                  border: `1px solid ${light.color}22`,
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
                    LIGHT SENSOR · BH1750
                  </div>

                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: light.color,
                      letterSpacing: "0.1em",
                    }}
                  >
                    {light.label}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#333",
                      marginBottom: 4,
                      letterSpacing: "0.15em",
                    }}
                  >
                    ILLUMINANCE
                  </div>

                  <div
                    style={{
                      fontSize: 22,
                      color: light.color,
                      fontWeight: 700,
                    }}
                  >
                    {data.lux.toFixed(0)} lx
                  </div>
                </div>
              </div>
            )}

            {/* Raw Output */}
            <div
              style={{
                background: "#0d0d0d",
                border: "1px solid #1a1a1a",
                borderRadius: 4,
                padding: "16px 24px",
                fontSize: 12,
              }}
            >
              <div
                style={{
                  color: "#333",
                  letterSpacing: "0.15em",
                  fontSize: 10,
                  marginBottom: 12,
                }}
              >
                RAW OUTPUT
              </div>

              <pre
                style={{
                  margin: 0,
                  color: "#4ade80",
                  lineHeight: 1.8,
                  fontSize: 12,
                }}
              >
                {`{
  "temperature": ${data.temperature.toFixed(2)},
  "humidity":    ${data.humidity.toFixed(2)},
  "lux":         ${data.lux.toFixed(0)},
  "device_id":   "${data.device_id ?? "esp32"}",
  "timestamp":   "${data.timestamp}"
}`}
              </pre>
            </div>
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

        * {
          box-sizing: border-box;
        }

        @media (max-width: 768px) {
          main {
            padding: 32px 16px !important;
          }
        }

        @media (max-width: 720px) {
          .mobile-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
