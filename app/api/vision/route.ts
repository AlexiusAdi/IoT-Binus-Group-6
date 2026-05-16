import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const imageBuffer = Buffer.from(await req.arrayBuffer());

    if (!imageBuffer.length) {
      return Response.json({ error: "No image received" }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    });

    const result = await model.generateContent([
      {
        inlineData: {
          data: imageBuffer.toString("base64"),
          mimeType: "image/jpeg",
        },
      },
      `
Analyze this image.

Answer ONLY with:
YES
or
NO

Question:
Is there a real human person visible in this image?

Ignore:
- posters
- photos
- screens
- reflections
- dolls
- toys
- mannequins
`,
    ]);

    const text = result.response.text().trim().toUpperCase();

    const humanDetected = text.includes("YES");

    console.log("Gemini response:", text);

    return Response.json({
      humanDetected,
    });
  } catch (error) {
    console.error("Vision API error:", error);

    return Response.json(
      {
        humanDetected: false,
        error: String(error),
      },
      { status: 500 },
    );
  }
}
