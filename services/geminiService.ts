import { GoogleGenerativeAI } from "@google/generative-ai";
import { NewsRegion, NewsSector, NewsItem, GroundingSource } from "../types";

export const fetchLatestNews = async (date: string): Promise<{ news: NewsItem[], sources: GroundingSource[] }> => {
  // 1. 获取 Key
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found. Please check Vercel environment variables.");
  }

  // 2. 初始化稳定版 SDK
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // 3. 使用最广泛支持的模型 gemini-1.5-flash
  const model = genAI.getGenerativeModel({ 
  // ✅ 使用具体的稳定版本号 "gemini-1.5-flash-001"
  // 或者尝试 "gemini-1.5-flash-8b" (更轻量级)
  model: "gemini-1.5-flash-001", 
  generationConfig: { responseMimeType: "application/json" } 
});

  const prompt = `
    Search for today's (${date}) most important news stories. 
    You MUST find at least 10-15 high-quality, distinct news stories.
    
    Regions: '国内' (China), '国外' (International/Global)
    Sectors: '热门', '科技', '金融', 'AI', '创投', '汽车', '股票'.

    Requirements:
    - Language: Simplified Chinese.
    - Return a JSON object with a "news" array.
    
    Schema:
    {
      "news": [
        {
          "title": "...",
          "summary": "...",
          "region": "国内/国外",
          "sector": "...",
          "source": "...",
          "url": "..."
        }
      ]
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // 4. 解析数据
    const parsedData = JSON.parse(text);
    
    // 5. 处理 Grounding (旧版 SDK 的结构可能不同，做安全访问)
    // 注意：标准版 Gemini 1.5 Flash 并不总是返回 groundingMetadata，除非使用了 Search Tool
    // 这里为了兼容性，我们先返回空源，重点保证新闻能显示
    const sources: GroundingSource[] = []; 

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
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error?.message || "Failed to fetch news.");
  }
};
