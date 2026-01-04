// /api/news.js
// 这个文件运行在 Vercel 的服务器端 (Serverless Function)
// 它拥有美国原生网络环境，可以秒连 Tavily 和 DeepSeek

export default async function handler(req, res) {
  // 1. 获取密钥 (从 Vercel 环境变量)
  const TAVILY_KEY = process.env.VITE_TAVILY_API_KEY;
  const DEEPSEEK_KEY = process.env.VITE_DEEPSEEK_API_KEY;

  if (!TAVILY_KEY || !DEEPSEEK_KEY) {
    return res.status(500).json({ error: "服务器端缺失 API Key，请检查 Vercel 设置" });
  }

  try {
    const { date } = req.body || { date: new Date().toISOString().split('T')[0] };
    console.log(`[Server] 开始执行真实搜索任务，日期: ${date}`);

    // --- 步骤 A: 真正的联网搜索 (Tavily) ---
    // 搜索词：涵盖科技、AI、金融的重大新闻
    const query = `important technology AI finance news headlines ${date} China and World`;
    
    const searchResponse = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_KEY,
        query: query,
        search_depth: "basic",
        max_results: 10, // 抓取 10 条真实新闻源
        include_images: false
      }),
    });

    const searchData = await searchResponse.json();
    const results = searchData.results || [];

    // ⚠️ 关键检查：如果没有搜到真新闻，直接报错，绝不瞎编
    if (results.length === 0) {
      console.error("Tavily 搜索结果为空");
      return res.status(404).json({ error: "未搜索到今日有效新闻，请稍后再试或检查 Tavily 额度。" });
    }

    console.log(`[Server] 成功搜索到 ${results.length} 条真实来源`);

    // --- 步骤 B: DeepSeek 阅读并总结 ---
    const context = results.map(r => `【标题】${r.title}\n【来源】${r.url}\n【内容】${r.content}`).join("\n\n");

    const prompt = `
      你是一个严谨的新闻编辑。今天是 ${date}。
      请阅读以下【真实搜索结果】，撰写一份新闻简报。
      
      【搜索结果】：
      ${context}

      【绝对指令】：
      1. **只能**基于上述搜索结果撰写，严禁编造或使用训练数据中的旧闻。
      2. 每一条新闻都必须有搜索结果中的 url 作为来源支撑。
      3. 语言：简体中文。
      4. 格式：纯 JSON。

      【JSON 结构】：
      {
        "news": [
          {
            "title": "中文标题",
            "summary": "简练摘要",
            "region": "国内" 或 "国外",
            "sector": "热门/科技/金融/AI/创投/汽车/股票",
            "source": "来源媒体名",
            "url": "真实URL"
          }
        ]
      }
    `;

    const aiResponse = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "你是一个只输出 JSON 的新闻助手。" },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      })
    });

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";
    
    // 返回给前端
    return res.status(200).json(JSON.parse(content));

  } catch (error) {
    console.error("[Server Error]", error);
    return res.status(500).json({ error: `服务器内部错误: ${error.message}` });
  }
}
