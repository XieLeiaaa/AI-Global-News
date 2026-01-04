// /api/news.js
// 生产级新闻聚合引擎 (诊断增强版)

export default async function handler(req, res) {
  // 1. 设置跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS,GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 2. 双重读取 Key (兼容带不带 VITE_ 前缀的情况)
  const TAVILY_KEY = process.env.VITE_TAVILY_API_KEY || process.env.TAVILY_API_KEY;
  const DEEPSEEK_KEY = process.env.VITE_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;

  // 3. 诊断逻辑：如果缺 Key，直接把服务器的环境变量清单打印出来（只打印名字）
  if (!TAVILY_KEY || !DEEPSEEK_KEY) {
    // 过滤出所有相关的变量名，帮你看看到底配了啥
    const allEnvKeys = Object.keys(process.env)
      .filter(key => key.includes('VITE') || key.includes('KEY') || key.includes('API'));
    
    console.error("[Config Error] 环境变量缺失");
    
    return res.status(500).json({ 
      error: "生产环境配置缺失: API Key 未找到", 
      debug_diagnosis: {
        "TAVILY_KEY_Status": TAVILY_KEY ? "✅ 读取成功" : "❌ 未读取到",
        "DEEPSEEK_KEY_Status": DEEPSEEK_KEY ? "✅ 读取成功" : "❌ 未读取到",
        "Server_Visible_Variables": allEnvKeys // 让你看到服务器到底配了哪些变量
      },
      tip: "请检查下方 Server_Visible_Variables 列表，看看你的变量名是不是拼错了？或者多了空格？"
    });
  }

  // 4. 仅支持 POST (但也允许 GET 用于自测连通性)
  if (req.method === 'GET') {
     return res.status(200).json({ status: "News Engine Online", keys_check: "OK" });
  }

  try {
    const { date } = req.body || {};
    const targetDate = date || new Date().toISOString().split('T')[0];
    console.log(`[News Engine] 启动生产任务: ${targetDate}`);

    // --- 第一阶段：多路并发召回 ---
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
            max_results: 5,
            include_images: false
          }),
        });
        const data = await response.json();
        return (data.results || []).map(item => ({ ...item, category: topic.category }));
      } catch (error) {
        return [];
      }
    });

    const resultsArrays = await Promise.all(searchPromises);
    const allRawResults = resultsArrays.flat();
    const validResults = allRawResults.filter(item => item.content && item.content.length > 50);

    if (validResults.length === 0) {
      // 兜底：如果搜不到，抛错让前端显示
      throw new Error("Tavily 搜索结果为空，请检查额度");
    }

    // --- 第二阶段：AI 加工 ---
    const context = validResults.map((r, i) => 
      `【${r.category}】标题：${r.title}\n摘要：${r.content.substring(0, 200)}\n链接：${r.url}`
    ).join("\n\n");

    const prompt = `
      你是由 DeepSeek 驱动的新闻主编。今天是 ${targetDate}。
      基于以下素材生成 10-12 条中文深度早报（JSON格式）。
      
      素材库：
      ${context}

      要求：
      1. 去重、整合、深度改写（每条100字+）。
      2. 必须真实，保留 URL。
      3. 格式纯 JSON。
      {
        "news": [
          { "title": "...", "summary": "...", "region": "国内/国外", "sector": "科技/AI/金融", "source": "...", "url": "..." }
        ]
      }
    `;

    const aiRes = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "输出 JSON。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      })
    });

    const aiData = await aiRes.json();
    
    // 错误处理：DeepSeek 返回 Error
    if (aiData.error) {
       throw new Error(`DeepSeek Error: ${aiData.error.message}`);
    }

    const content = aiData.choices?.[0]?.message?.content || "{}";
    let finalData = {};
    try {
        finalData = JSON.parse(content.replace(/```json/g, "").replace(/```/g, ""));
    } catch (e) {
        finalData = { news: [] };
    }

    return res.status(200).json(finalData);

  } catch (error) {
    return res.status(500).json({
      error: "News Engine Failed",
      details: error.message,
      news: [{
        title: "生成失败",
        summary: error.message,
        region: "系统",
        sector: "错误",
        source: "System",
        url: "#"
      }]
    });
  }
}
