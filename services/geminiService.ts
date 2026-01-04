
import { GoogleGenAI, Type } from "@google/genai";
import { NewsRegion, NewsSector, NewsItem, GroundingSource } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const fetchLatestNews = async (date: string): Promise<{ news: NewsItem[], sources: GroundingSource[] }> => {
  const prompt = `
    Search for today's (${date}) most important news stories. 
    You MUST find at least 10-15 high-quality, distinct news stories for EVERY combination of Region and Sector listed below.
    
    Regions: '国内' (China), '国外' (International/Global)
    Sectors for EACH region: '热门' (Trending), '科技' (Tech), '金融' (Finance), 'AI', '创投' (VC), '汽车' (Auto), '股票' (Stocks).

    Requirements:
    - Quantity: Return a large batch of news (total 100+ items if possible).
    - Language: Titles and summaries MUST be in Simplified Chinese.
    - Quality: Summaries should be concise (around 100 characters) and professional.
    - Variety: Ensure different sources are represented.
    
    Return JSON matching this schema:
    {
      "news": [
        {
          "title": "Chinese Title",
          "summary": "Chinese Summary",
          "region": "国内 or 国外",
          "sector": "Exactly one of: 热门, 科技, 金融, AI, 创投, 汽车, 股票",
          "source": "Source Name",
          "url": "Original URL"
        }
      ]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            news: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  region: { type: Type.STRING },
                  sector: { type: Type.STRING },
                  source: { type: Type.STRING },
                  url: { type: Type.STRING }
                },
                required: ["title", "summary", "region", "sector", "source", "url"]
              }
            }
          }
        }
      }
    });

    const resultText = response.text || "{}";
    const parsedData = JSON.parse(resultText);

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources: GroundingSource[] = groundingChunks
      .filter((chunk: any) => chunk.web)
      .map((chunk: any) => ({
        title: chunk.web.title,
        uri: chunk.web.uri
      }));

    const news: NewsItem[] = (parsedData.news || []).map((item: any, index: number) => ({
      ...item,
      id: `news-${index}-${Date.now()}`,
      publishedAt: new Date().toISOString(),
      region: Object.values(NewsRegion).includes(item.region as NewsRegion) 
        ? (item.region as NewsRegion) 
        : NewsRegion.GLOBAL,
      sector: Object.values(NewsSector).includes(item.sector as NewsSector)
        ? (item.sector as NewsSector)
        : NewsSector.TRENDING
    }));

    return { news, sources };
  } catch (error) {
    console.error("Error fetching news from Gemini:", error);
    throw error;
  }
};
