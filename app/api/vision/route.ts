import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const imageBytes = await req.arrayBuffer();
    const base64 = Buffer.from(imageBytes).toString("base64");

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Vision check failed" }, { status: 500 });
  }
}
