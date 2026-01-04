// /api/news.js
export default async function handler(req, res) {
  // 1. 设置 CORS (允许前端跨域调用)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 获取密钥
  const TAVILY_KEY = process.env.VITE_TAVILY_API_KEY;
  const DEEPSEEK_KEY = process.env.VITE_DEEPSEEK_API_KEY;

  // 2. 【浏览器自检模式】如果你是用浏览器直接访问 (GET请求)
  if (req.method === 'GET') {
    return res.status(200).json({
      status: "API 服务在线 ✅",
      check_keys: {
        Tavily_Key: TAVILY_KEY ? "已配置 (长度: " + TAVILY_KEY.length + ")" : "❌ 未配置 (缺失)",
        DeepSeek_Key: DEEPSEEK_KEY ? "已配置 (长度: " + DEEPSEEK_KEY.length + ")" : "❌ 未配置 (缺失)"
      },
      message: "请不要直接在浏览器访问此接口搜新闻，这是给前端代码 POST 调用的。但如果上方显示 Keys 已配置，说明环境没问题。",
      time: new Date().toISOString()
    });
  }

  // 3. 正式逻辑 (POST 请求)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!TAVILY_KEY || !DEEPSEEK_KEY) {
    return res.status(500).json({ error: "服务器端 API Key 缺失，请检查 Vercel 环境变量设置" });
  }

  try {
    const { date } = req.body || {};
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    // --- 步骤 A: Tavily 搜索 ---
    console.log(`[Server] Searching Tavily for ${targetDate}...`);
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

    // --- 步骤 B: DeepSeek 总结 ---
    // 构造 Prompt
    const context = results.length > 0 
      ? results.map(r => `标题：${r.title}\n链接：${r.url}\n内容：${r.content}`).join("\n\n")
      : "搜索未返回结果。请基于你的知识库生成今日新闻。";

    const prompt = `
      你是一个新闻编辑。今天是 ${targetDate}。
      请将以下资料整理成新闻简报（JSON格式）。
      
      参考资料：
      ${context}

      要求：
      1. 如果无资料，必须生成模拟数据，不要返回空。
      2. 格式：纯 JSON。
      
      结构：
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
        response_format: { type: "json_object" }
      })
    });

    const aiData = await aiRes.json();
    
    // 检查 DeepSeek 是否返回了错误
    if (aiData.error) {
      throw new Error(`DeepSeek API Error: ${aiData.error.message}`);
    }

    const content = aiData.choices?.[0]?.message?.content || "{}";
    const result = JSON.parse(content);

    // 兜底：如果还是空，强制返回调试信息
    if (!result.news || result.news.length === 0) {
      return res.status(200).json({
        news: [{
          title: "API 调用成功但内容为空",
          summary: `Tavily 搜到 ${results.length} 条。DeepSeek 返回了空数据。`,
          region: "系统",
          sector: "调试",
          source: "System",
          url: "#"
        }]
      });
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error("[Server Error]", error);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
}
