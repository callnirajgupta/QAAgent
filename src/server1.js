import express from "express";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SYSTEM_PROMPT } from "./agent.js";
import { crawlPage, getFeatureContext, saveFeatureContext } from "./tools.js";

dotenv.config();

const app = express();
app.use(express.json());

// 1. Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// 2. Define Tools (Function Declarations)
const tools = {
  functionDeclarations: [
    {
      name: "crawl_page",
      description: "Fetch a webpage and extract page structure such as title, headings, buttons, and inputs.",
      parameters: {
        type: "OBJECT",
        properties: {
          url: { type: "STRING" }
        },
        required: ["url"]
      }
    },
    {
      name: "get_feature_context",
      description: "Get saved website feature information by feature name.",
      parameters: {
        type: "OBJECT",
        properties: {
          feature_name: { type: "STRING" }
        },
        required: ["feature_name"]
      }
    },
    {
      name: "save_feature_context",
      description: "Save website feature information for future use.",
      parameters: {
        type: "OBJECT",
        properties: {
          feature_name: { type: "STRING" },
          feature_data: { type: "OBJECT" } // Note: 'object' type in Gemini is flexible
        },
        required: ["feature_name", "feature_data"]
      }
    }
  ]
};

// 3. Setup Model with System Instruction and Tools
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  systemInstruction: SYSTEM_PROMPT,
  tools: [tools],
});

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    // Gemini uses 'role' user/model. History is an array of content objects.
    let chatHistory = [];

    // Start a chat session
    const chat = model.startChat({
      history: chatHistory,
    });

    let result = await chat.sendMessage(message);
    let response = result.response;
    let responseText = "";

    // 4. Handle Tool Calls Loop
    // Gemini can return multiple parts (text + function calls)
    let calls = response.candidates[0].content.parts.filter(p => p.functionCall);

  while (calls.length > 0) {
    const functionResponses = [];

    for (const call of calls) {
      const { name, args } = call.functionCall;
      let toolResult;

      console.log(`Executing tool: ${name}`, args);

      try {
        if (name === "crawl_page") {
          toolResult = await crawlPage(args.url);
        } else if (name === "get_feature_context") {
          toolResult = getFeatureContext(args.feature_name);
        } else if (name === "save_feature_context") {
          toolResult = saveFeatureContext(args.feature_name, args.feature_data);
        } else {
          toolResult = { error: "Unknown tool" };
        }
      } catch (toolError) {
        console.error(`Tool ${name} error:`, toolError);
        toolResult = { error: `Tool execution failed: ${toolError.message}` };
      }

      functionResponses.push({
        functionResponse: {
          name: name,
          response: { content: toolResult }
        }
      });
    }

    // Send the tool results back to the model
    const nextResult = await chat.sendMessage(functionResponses);
    response = nextResult.response;
    
    // Check for more tool calls in the new response
    calls = response.candidates[0].content.parts.filter(p => p.functionCall);
  }

  // Final text output
  responseText = response.text();
  res.json({ reply: responseText });
  } catch (error) {
    console.error("Chat error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});