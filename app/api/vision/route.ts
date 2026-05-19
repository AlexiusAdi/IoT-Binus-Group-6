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
    const buffer = Buffer.from(imageBytes);
    const base64 = buffer.toString("base64");

    // Log for debugging
    console.log("Image size (bytes):", buffer.length);
    console.log("Base64 length:", base64.length);
    console.log(
      "JPEG magic bytes:",
      buffer[0].toString(16),
      buffer[1].toString(16),
    ); // should be ff d8

    const response = await fetch(
      `https://detect.roboflow.com/coco/7?api_key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Roboflow error ${response.status}: ${text}`);
    }

    const data = await response.json();
    console.log("Roboflow response:", JSON.stringify(data));

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
