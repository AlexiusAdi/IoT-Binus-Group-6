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
    // Receive raw JPEG bytes from ESP32
    const imageBytes = await req.arrayBuffer();
    const buffer = Buffer.from(imageBytes);

    // Debug logs
    console.log("Image size:", buffer.length);

    if (buffer.length < 100) {
      throw new Error("Image too small");
    }

    console.log(
      "JPEG magic bytes:",
      buffer[0].toString(16),
      buffer[1].toString(16),
    );

    // Verify JPEG header
    if (!(buffer[0] === 0xff && buffer[1] === 0xd8)) {
      throw new Error("Invalid JPEG format");
    }

    // Send RAW image directly to Roboflow
    const response = await fetch(
      `https://detect.roboflow.com/coco/7?api_key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: buffer,
      },
    );

    // Debug Roboflow response
    const responseText = await response.text();

    console.log("Roboflow status:", response.status);
    console.log("Roboflow raw response:", responseText);

    if (!response.ok) {
      throw new Error(`Roboflow error ${response.status}: ${responseText}`);
    }

    // Parse JSON safely
    let data: any;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("Failed to parse Roboflow JSON");
    }

    console.log("Predictions:", JSON.stringify(data.predictions ?? []));

    // Detect human/person
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
