import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return Response.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const imageBytes = await req.arrayBuffer();
    const base64 = Buffer.from(imageBytes).toString("base64");

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64,
        },
      },
      "Is there a human in this image? Answer only: yes or no",
    ]);

    const answer = result.response.text().toLowerCase().trim();
    const human = answer.startsWith("yes");

    return Response.json({ human, human_detected: human });
  } catch (err: any) {
    console.error("Vision error:", err?.message ?? err);
    return Response.json(
      {
        error: "Vision check failed",
        detail: err?.message ?? String(err), // ← return actual error
      },
      { status: 500 },
    );
  }
}
