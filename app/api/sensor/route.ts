// app/api/sensor/route.ts

interface SensorReading {
  temperature: number;
  humidity: number;
  lux: number;
  timestamp: string;
  device_id?: string;
}

let latestReading: SensorReading | null = null;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { temperature, humidity, lux, device_id } = body;

    if (
      temperature === undefined ||
      humidity === undefined ||
      lux === undefined
    ) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    latestReading = {
      temperature: Number(temperature),
      humidity: Number(humidity),
      lux: Number(lux),
      timestamp: new Date().toISOString(),
      device_id: device_id ?? "esp32",
    };

    return Response.json({
      ok: true,
      data: latestReading,
    });
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
}

export async function GET() {
  return Response.json({
    data: latestReading,
  });
}
