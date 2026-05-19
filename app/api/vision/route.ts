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
    // Receive raw JPEG from ESP32
    const imageBytes = await req.arrayBuffer();
    const buffer = Buffer.from(imageBytes);

    console.log("Image size:", buffer.length);

    // Validate JPEG
    if (buffer.length < 100 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      throw new Error("Invalid JPEG image");
    }

    // Convert to PURE base64
    const base64 = buffer.toString("base64");

    console.log("Base64 length:", base64.length);

    // Send to Roboflow
    const response = await fetch(
      `https://detect.roboflow.com/coco/7?api_key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: base64,
      },
    );

    const text = await response.text();

    console.log("Roboflow status:", response.status);
    console.log("Roboflow raw:", text);

    if (!response.ok) {
      throw new Error(`Roboflow error ${response.status}: ${text}`);
    }

    const data = JSON.parse(text);

    const human =
      data.predictions?.some(
        (p: { class: string; confidence: number }) =>
          p.class === "person" && p.confidence > 0.4,
      ) ?? false;

    console.log("Human detected:", human);

    return Response.json({
      success: true,
      human,
      human_detected: human,
      predictions: data.predictions ?? [],
    });
  } catch (err: any) {
    console.error("Vision error:", err?.message ?? err);

    return Response.json(
      {
        error: "Vision check failed",
        detail: err?.message ?? String(err),
      },
      { status: 500 },
    );
  }
}
