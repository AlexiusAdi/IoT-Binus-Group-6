// app/api/vision/route.ts
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ROBOFLOW_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "Missing ROBOFLOW_API_KEY" },
      { status: 500 },
    );
  }

  try {
    const imageBytes = await req.arrayBuffer();

    const response = await fetch(
      `https://detect.roboflow.com/coco/7?api_key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: imageBytes, // send raw binary directly, no base64
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Roboflow error ${response.status}: ${text}`);
    }

    const data = await response.json();

    const human =
      data.predictions?.some(
        (p: { class: string; confidence: number }) =>
          p.class === "person" && p.confidence > 0.4,
      ) ?? false;

    return Response.json({ human, human_detected: human });
  } catch (err: any) {
    console.error("Vision error:", err?.message ?? err);
    return Response.json(
      { error: "Vision check failed", detail: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}
