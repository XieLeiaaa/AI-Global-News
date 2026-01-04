// /api/news.js
// 生产级新闻聚合引擎：多路并发召回 + 深度清洗 + AI主编加工

export default async function handler(req, res) {
  // 1. 基础配置与跨域处理
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const TAVILY_KEY = process.env.VITE_TAVILY_API_KEY;
  const DEEPSEEK_KEY = process.env.VITE_DEEPSEEK_API_KEY;

  // 检查环境
  if (!TAVILY_KEY || !DEEPSEEK_KEY) {
    return res.status(500).json({ error: "生产环境配置缺失: API Key 未找到" });
  }

  // 仅支持 POST
  if (req.method !== 'POST') return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { date } = req.body || {};
    const targetDate = date || new Date().toISOString().split('T')[0];
    console.log(`[News Engine] 启动生产任务，目标日期: ${targetDate}`);

    // --- 第一阶段：多路并发召回 (Multi-Channel Sourcing) ---
    // 我们不只搜一次，而是针对三个核心垂直领域分别搜索，保证内容的广度和深度。
    const topics = [
      { category: "AI", query: `Artificial Intelligence LLM latest news breakthroughs ${targetDate}` },
      { category: "Finance", query: `Global Stock Market Crypto Financial news headlines ${targetDate}` },
      { category: "ChinaTech", query: `China technology startups internet giants news ${targetDate}` }
    ];

    console.log(`[News Engine] 正在并发执行 ${topics.length} 路搜索任务...`);

    // 使用 Promise.all 并发请求，速度快，不阻塞
    const searchPromises = topics.map(async (topic) => {
      try {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: TAVILY_KEY,
            query: topic.query,
            search_depth: "advanced", // 必须用高级模式获取正文
            max_results: 7,           // 每个领域抓 7 条，总共 21 条
            include_images: false
          }),
        });
        const data = await response.json();
        // 给结果打上分类标签，方便 AI 识别
        return (data.results || []).map(item => ({ ...item, category: topic.category }));
      } catch (error) {
        console.error(`[Search Error] 领域 ${topic.category} 搜索失败:`, error);
        return []; // 失败返回空数组，不影响整体
      }
    });

    // 等待所有搜索完成
    const resultsArrays = await Promise.all(searchPromises);
    const allRawResults = resultsArrays.flat();

    // --- 第二阶段：数据清洗 (Cleaning) ---
    // 过滤掉内容太短的无效页面（往往是广告或目录页）
    const validResults = allRawResults.filter(item => item.content && item.content.length > 50);
    console.log(`[News Engine] 原始抓取 ${allRawResults.length} 条，清洗后保留 ${validResults.length} 条有效素材`);

    if (validResults.length === 0) {
      throw new Error("今日全网搜索未获取到有效内容，请检查 Tavily 额度或网络状态");
    }

    // --- 第三阶段：AI 主编加工 (Editorial Processing) ---
    // 构造结构化素材喂给 AI
    const context = validResults.map((r, i) => 
      `【${r.category} | ID:${i}】标题：${r.title}\n内容摘要：${r.content.substring(0, 300)}\n链接：${r.url}`
    ).join("\n\n----------------\n\n");

    const prompt = `
      你是由 DeepSeek 驱动的专业科技财经新闻主编。今天是 ${targetDate}。
      
      我们刚刚通过全网搜索收集了以下【原始素材库】（包含 AI、金融、中国科技三个板块）。
      你的任务是清洗、去重、整合，并输出一份**高质量、信息量大**的早报。

      【原始素材库】：
      ${context}

      【生产标准 - 必须严格执行】：
      1. **筛选与去重**：素材中可能有重复报道，请合并同类项。剔除琐碎无意义的消息。
      2. **总量控制**：必须输出 **10 到 15 条** 最具价值的新闻。
      3. **深度改写**：不要直接照抄素材。每条新闻必须包含：
         - **核心事实**：发生了什么？
         - **关键数据**：(如果有) 股价变动、融资金融、版本号等。
         - **一句话背景**：为什么这件事重要？
         - **字数要求**：每条摘要 **100-150 字**。
      4. **严禁造假**：所有新闻必须基于素材库，如果素材不足，宁缺毋滥，但必须保证真实性。来源必须引用素材中的真实 URL。

      【输出格式】：
      严格的 JSON 格式，不要包含 Markdown 代码块标记（如 \`\`\`json）。
      {
        "news": [
          {
            "title": "精炼的中文标题 (不超过20字)",
            "summary": "深度摘要内容...",
            "region": "国内/国外",
            "sector": "AI/金融/科技/创投/汽车",
            "source": "媒体名称",
            "url": "保留原始链接"
          }
        ]
      }
    `;

    console.log("[News Engine] 正在生成深度简报...");
    const aiRes = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "你是一个严格遵循 JSON 格式输出的新闻主编。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.2, // 低温度，保证事实准确，不瞎编
        response_format: { type: "json_object" }
      })
    });

    const aiData = await aiRes.json();
    if (aiData.error) throw new Error(`DeepSeek API Error: ${aiData.error.message}`);

    const content = aiData.choices?.[0]?.message?.content || "{}";
    
    // 解析 JSON
    let finalData;
    try {
        finalData = JSON.parse(content);
    } catch (e) {
        // 简单的清洗，防止 AI 加了 ```json
        const cleanContent = content.replace(/```json/g, "").replace(/```/g, "");
        finalData = JSON.parse(cleanContent);
    }

    console.log(`[News Engine] 生产完成，产出新闻 ${finalData.news?.length || 0} 条`);
    return res.status(200).json(finalData);

  } catch (error) {
    console.error("[News Engine Crash]", error);
    return res.status(500).json({
      error: "新闻生产线中断",
      details: error.message,
      news: [{
        title: "生产中断报告",
        summary: `系统在处理请求时遇到问题：${error.message}。建议稍后重试。`,
        region: "系统",
        sector: "错误",
        source: "System",
        url: "#"
      }]
    });
  }
}
