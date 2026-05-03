// app/api/sensor/route.ts
// In-memory store (resets on cold start — swap for a DB like Neon/Upstash for persistence)
interface SensorReading {
  temperature: number;
  humidity: number;
  timestamp: string;
  device_id?: string;
}

let latestReading: SensorReading | null = null;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { temperature, humidity, device_id } = body;

    if (temperature === undefined || humidity === undefined) {
      return Response.json(
        { error: "Missing temperature or humidity" },
        { status: 400 },
      );
    }

    latestReading = {
      temperature: Number(temperature),
      humidity: Number(humidity),
      timestamp: new Date().toISOString(),
      device_id: device_id ?? "esp32",
    };

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
}

export async function GET() {
  if (!latestReading) {
    return Response.json({ data: null });
  }
  return Response.json({ data: latestReading });
}
