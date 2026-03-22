import fs from "fs";
import { load } from "cheerio";

const FEATURES_FILE = "./data/features.json";

function loadFeatures() {
  if (!fs.existsSync(FEATURES_FILE)) return {};
  const raw = fs.readFileSync(FEATURES_FILE, "utf-8");
  return raw ? JSON.parse(raw) : {};
}

function saveFeatures(data) {
  fs.writeFileSync(FEATURES_FILE, JSON.stringify(data, null, 2));
}

export async function crawlPage(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}` };
    }
    const html = await response.text();
    const $ = load(html);

    const title = $("title").text().trim();
    const headings = $("h1, h2, h3")
      .map((i, el) => $(el).text().trim())
      .get();

    const buttons = $("button")
      .map((i, el) => $(el).text().trim())
      .get();

    const inputs = $("input, textarea, select")
      .map((i, el) => ({
        name: $(el).attr("name") || "",
        type: $(el).attr("type") || el.tagName,
        required: $(el).attr("required") !== undefined
      }))
      .get();

    return { url, title, headings, buttons, inputs };
  } catch (error) {
    return { error: `Failed to crawl ${url}: ${error.message}` };
  }
}

export function getFeatureContext(featureName) {
  const features = loadFeatures();
  return features[featureName] || null;
}

export function saveFeatureContext(featureName, featureData) {
  const features = loadFeatures();
  features[featureName] = featureData;
  saveFeatures(features);
  return { success: true, featureName };
}