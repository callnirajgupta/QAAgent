import express from "express";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SYSTEM_PROMPT } from "./agent.js";
import { crawlPage, getFeatureContext, saveFeatureContext } from "./tools.js";

dotenv.config();

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const tools = [
  {
    name: "crawl_page",
    description: "Fetch a webpage and extract page structure such as title, headings, buttons, and inputs.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" }
      },
      required: ["url"]
    }
  },
  {
    name: "get_feature_context",
    description: "Get saved website feature information by feature name.",
    inputSchema: {
      type: "object",
      properties: {
        feature_name: { type: "string" }
      },
      required: ["feature_name"]
    }
  },
  {
    name: "save_feature_context",
    description: "Save website feature information for future use.",
    inputSchema: {
      type: "object",
      properties: {
        feature_name: { type: "string" },
        feature_data: { type: "object" }
      },
      required: ["feature_name", "feature_data"]
    }
  }
];

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", tools: [{ functionDeclarations: tools }] });

    let messages = [
      { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + message }] }
    ];

    let response = await model.generateContent({
      contents: messages
    });

    while (response.response.candidates[0]?.content?.parts?.some(p => p.functionCall)) {
      const functionCalls = response.response.candidates[0].content.parts.filter(p => p.functionCall);

      for (const call of functionCalls) {
        const { name, args } = call.functionCall;
        let result;

        if (name === "crawl_page") {
          result = await crawlPage(args.url);
        } else if (name === "get_feature_context") {
          result = getFeatureContext(args.feature_name);
        } else if (name === "save_feature_context") {
          result = saveFeatureContext(args.feature_name, args.feature_data);
        } else {
          result = { error: "Unknown tool" };
        }

        messages.push({ role: "user", parts: [{ text: response.response.candidates[0].content.parts.map(p => p.text).filter(Boolean).join(" ") }] });
        messages.push({
          role: "function",
          parts: [{ functionResponse: { name, response: result } }]
        });
      }

      response = await model.generateContent({
        contents: messages
      });
    }

    const textContent = response.response.candidates[0].content.parts.map(p => p.text).filter(Boolean).join(" ");
    res.json({ reply: textContent });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});