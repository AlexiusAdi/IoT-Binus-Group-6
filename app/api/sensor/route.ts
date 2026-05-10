// app/api/sensor/route.ts

interface SensorReading {
  temperature: number;
  humidity: number;
  motion: boolean;
  timestamp: string;
  device_id?: string;
}

let latestReading: SensorReading | null = null;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { temperature, humidity, motion, device_id } = body;

    if (
      temperature === undefined ||
      humidity === undefined ||
      motion === undefined
    ) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    latestReading = {
      temperature: Number(temperature),
      humidity: Number(humidity),
      motion: Boolean(motion),
      timestamp: new Date().toISOString(),
      device_id: device_id ?? "esp32",
    };

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
}

export async function GET() {
  return Response.json({
    data: latestReading,
  });
}
