// /api/news.js
export default async function handler(req, res) {
  // 1. 设置 CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. 获取密钥 (注意换成了 Groq)
  const TAVILY_KEY = process.env.VITE_TAVILY_API_KEY;
  const GROQ_KEY = process.env.VITE_GROQ_API_KEY;

  if (req.method === 'GET') {
    return res.status(200).json({
      status: "API 服务在线 (Groq 版) ✅",
      check_keys: {
        Tavily: TAVILY_KEY ? "✅" : "❌",
        Groq: GROQ_KEY ? "✅" : "❌"
      }
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: "Method Not Allowed" });

  if (!TAVILY_KEY || !GROQ_KEY) {
    return res.status(500).json({ error: "API Key 缺失，请检查 Vercel 环境变量 VITE_GROQ_API_KEY" });
  }

  try {
    const { date } = req.body || {};
    const targetDate = date || new Date().toISOString().split('T')[0];

    // --- 步骤 A: Tavily 搜索 ---
    console.log(`[Server] Tavily Searching: ${targetDate}...`);
    const searchRes = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_KEY,
        query: `latest technology AI finance news headlines ${targetDate} China and Global`,
        search_depth: "basic",
        max_results: 7,
        include_images: false
      }),
    });
    const searchData = await searchRes.json();
    const results = searchData.results || [];

    // --- 步骤 B: Groq (Llama 3) 总结 ---
    const context = results.length > 0 
      ? results.map(r => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}`).join("\n\n")
      : "Search failed. Generate realistic simulation news based on recent trends.";

    const prompt = `
      You are a news editor. Today is ${targetDate}.
      Generate a news briefing JSON based on the Search Results below.
      
      SEARCH RESULTS:
      ${context}

      REQUIREMENTS:
      1. Language: Simplified Chinese (简体中文).
      2. Format: Pure JSON.
      3. If no search results, verify you generate realistic mock data.
      
      JSON STRUCTURE:
      {
        "news": [
          { "title": "...", "summary": "...", "region": "国内/国外", "sector": "科技/AI/金融", "source": "...", "url": "..." }
        ]
      }
    `;

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", // Groq 上最强的免费模型
        messages: [
          { role: "system", content: "Response must be valid JSON object." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      })
    });

    const aiData = await aiRes.json();
    if (aiData.error) throw new Error(aiData.error.message);

    const content = aiData.choices?.[0]?.message?.content || "{}";
    const result = JSON.parse(content);

    // 兜底
    if (!result.news || result.news.length === 0) {
      result.news = [{
        title: "Groq 生成为空",
        summary: "请重试。",
        region: "系统",
        sector: "调试",
        source: "System",
        url: "#"
      }];
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
