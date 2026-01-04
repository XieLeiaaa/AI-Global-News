import { NewsRegion, NewsSector, NewsItem, GroundingSource } from "../types";

export const fetchLatestNews = async (date: string): Promise<{ news: NewsItem[], sources: GroundingSource[] }> => {
  // 1. 获取 Keys
  const deepseekKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
  const tavilyKey = import.meta.env.VITE_TAVILY_API_KEY;

  if (!deepseekKey || !tavilyKey) {
    throw new Error("请在 Vercel 设置 VITE_DEEPSEEK_API_KEY 和 VITE_TAVILY_API_KEY");
  }

  // 2. 第一步：搜索新闻 (使用 Vercel 转发，绕过国内网络限制)
  // 我们搜索“今日科技、AI、金融新闻”
  const query = `Latest important technology, AI, and finance news in China and the World for ${date}`;
  let searchResults: any[] = [];

  try {
    // ⚠️ 注意：这里请求的是 /api/tavily，会自动转发到 api.tavily.com
    const searchResponse = await fetch("/api/tavily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: tavilyKey,
        query: query,
        search_depth: "basic",
        max_results: 10,
        include_images: false
      }),
    });

    const searchData = await searchResponse.json();
    searchResults = searchData.results || [];
    console.log("搜索结果:", searchResults);
  } catch (error) {
    console.error("搜索失败 (Tavily):", error);
    // 如果搜索挂了，代码继续，让 DeepSeek 尝试兜底
  }

  // 3. 整理搜索结果给 DeepSeek
  const context = searchResults.map(r => 
    `【标题】${r.title}\n【来源】${r.url}\n【内容片段】${r.content}`
  ).join("\n\n");

  // 4. 第二步：DeepSeek 总结新闻
  const prompt = `
    你是一个专业新闻编辑。请根据以下【搜索结果】写一份今日新闻简报。
    
    【搜索结果】：
    ${context}

    【要求】：
    1. 必须基于搜索结果，不要瞎编。如果你觉得搜索结果不够，可以补充你已知的近期重大事件。
    2. 语言：简体中文。
    3. 格式：严格的 JSON。
    
    【JSON 结构】：
    {
      "news": [
        {
          "title": "新闻标题 (中文)",
          "summary": "简练摘要 (50-100字)",
          "region": "国内" 或 "国外",
          "sector": "热门/科技/金融/AI/创投/汽车/股票",
          "source": "来源媒体名称",
          "url": "原始链接"
        }
      ]
    }
  `;

  try {
    const aiResponse = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${deepseekKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat", // 使用 V3 模型
        messages: [
          { role: "system", content: "你是一个输出 JSON 格式的新闻助手。" },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      })
    });

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";
    const parsedData = JSON.parse(content);

    // 5. 组装最终数据
    const sources: GroundingSource[] = searchResults.map(r => ({
      title: r.title,
      uri: r.url
    }));

    const news: NewsItem[] = (parsedData.news || []).map((item: any, index: number) => ({
      ...item,
      id: `news-${index}-${Date.now()}`,
      publishedAt: new Date().toISOString(),
      region: ["国内", "国外"].includes(item.region) ? item.region : "国外",
      sector: ["热门", "科技", "金融", "AI", "创投", "汽车", "股票"].includes(item.sector) ? item.sector : "热门"
    }));

    return { news, sources };

  } catch (error: any) {
    console.error("DeepSeek 生成失败:", error);
    throw new Error("新闻生成失败，请检查 API Key 或网络");
  }
};
