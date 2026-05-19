import { getSupabaseClient } from "@/lib/supabase";

export async function POST(req: Request) {
  const supabase = getSupabaseClient();

  try {
    const body = await req.json();
    const {
      temperature,
      humidity,
      lux,
      motion,
      device_id,
      human_detected,
      vision_checked,
    } = body;

    if (temperature === undefined || humidity === undefined) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("sensor_readings")
      .insert({
        temperature: Number(temperature),
        humidity: Number(humidity),
        lux: lux !== undefined ? Number(lux) : 0,
        motion: Boolean(motion),
        device_id: device_id ?? "esp32",
        human_detected: Boolean(human_detected),
        vision_checked: Boolean(vision_checked),
      })
      .select()
      .single();

    if (error) throw error;
    return Response.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Failed to insert" }, { status: 500 });
  }
}

export async function GET() {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("sensor_readings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return Response.json({ data: null });
  return Response.json({ data });
}
