// /api/news.js
// 生产级新闻聚合引擎 (双模版：DeepSeek + Groq 自动切换)

export default async function handler(req, res) {
  // 1. 设置跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS,GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 2. 获取密钥 (同时支持 DeepSeek 和 Groq)
  const TAVILY_KEY = process.env.VITE_TAVILY_API_KEY || process.env.TAVILY_API_KEY;
  const DEEPSEEK_KEY = process.env.VITE_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;
  const GROQ_KEY = process.env.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY;

  // 3. 智能选择引擎
  let AI_PROVIDER = "none";
  let AI_KEY = "";
  let AI_URL = "";
  let AI_MODEL = "";

  if (DEEPSEEK_KEY) {
    AI_PROVIDER = "DeepSeek";
    AI_KEY = DEEPSEEK_KEY;
    AI_URL = "https://api.deepseek.com/chat/completions";
    AI_MODEL = "deepseek-chat";
  } else if (GROQ_KEY) {
    AI_PROVIDER = "Groq";
    AI_KEY = GROQ_KEY;
    AI_URL = "https://api.groq.com/openai/v1/chat/completions";
    AI_MODEL = "llama-3.3-70b-versatile"; // Groq 上最强的模型
  }

  // 4. 诊断：如果两个都没有，才报错
  if (!TAVILY_KEY || AI_PROVIDER === "none") {
    return res.status(500).json({ 
      error: "配置缺失", 
      debug: {
        Tavily: TAVILY_KEY ? "✅ OK" : "❌ Missing",
        AI_Engine: "❌ No DeepSeek or Groq Key found"
      },
      tip: "请在 Vercel 设置 VITE_DEEPSEEK_API_KEY 或 VITE_GROQ_API_KEY"
    });
  }

  if (req.method === 'GET') {
     return res.status(200).json({ 
       status: "News Engine Online", 
       engine: AI_PROVIDER, // 告诉你当前在用哪个引擎
       model: AI_MODEL 
     });
  }

  try {
    const { date } = req.body || {};
    const targetDate = date || new Date().toISOString().split('T')[0];
    console.log(`[News Engine] 启动 (${AI_PROVIDER}版): ${targetDate}`);

    // --- 第一阶段：多路并发召回 (不变) ---
    const topics = [
      { category: "AI", query: `Artificial Intelligence LLM latest news breakthroughs ${targetDate}` },
      { category: "Finance", query: `Global Stock Market Crypto Financial news headlines ${targetDate}` },
      { category: "ChinaTech", query: `China technology startups internet giants news ${targetDate}` }
    ];

    const searchPromises = topics.map(async (topic) => {
      try {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: TAVILY_KEY,
            query: topic.query,
            search_depth: "advanced",
            max_results: 6,
            include_images: false
          }),
        });
        const data = await response.json();
        return (data.results || []).map(item => ({ ...item, category: topic.category }));
      } catch (error) { return []; }
    });

    const resultsArrays = await Promise.all(searchPromises);
    const allRawResults = resultsArrays.flat();
    const validResults = allRawResults.filter(item => item.content && item.content.length > 50);

    if (validResults.length === 0) {
      throw new Error("今日全网搜索未获取到有效内容 (Tavily)");
    }

    // --- 第二阶段：AI 加工 ---
    const context = validResults.map((r, i) => 
      `【${r.category}】标题：${r.title}\n摘要：${r.content.substring(0, 300)}\n链接：${r.url}`
    ).join("\n\n");

    const prompt = `
      你是一位专业新闻主编。今天是 ${targetDate}。
      请基于以下【素材库】，整理出一份高质量的早报。
      
      【素材库】：
      ${context}

      【要求】：
      1. **合并同类项**：去重、整合。
      2. **深度摘要**：每条新闻 100-150 字，拒绝一句话新闻。
      3. **真实性**：必须保留原始 URL。
      4. **数量**：输出 10-15 条。

      【格式】：
      纯 JSON。不要使用 Markdown 代码块。
      {
        "news": [
          { "title": "...", "summary": "...", "region": "国内/国外", "sector": "科技/AI/金融", "source": "...", "url": "..." }
        ]
      }
    `;

    const aiRes = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AI_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: "输出 JSON 格式。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      })
    });

    const aiData = await aiRes.json();
    if (aiData.error) throw new Error(`${AI_PROVIDER} Error: ${aiData.error.message}`);

    const content = aiData.choices?.[0]?.message?.content || "{}";
    
    // 清洗 JSON 字符串 (防止 AI 加 ```json)
    const cleanContent = content.replace(/```json/g, "").replace(/```/g, "").trim();
    const finalData = JSON.parse(cleanContent);

    return res.status(200).json(finalData);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "News Engine Failed",
      details: error.message,
      news: [{
        title: "生成失败",
        summary: `错误详情: ${error.message} (Engine: ${AI_PROVIDER})`,
        region: "系统",
        sector: "错误",
        source: "System",
        url: "#"
      }]
    });
  }
}
