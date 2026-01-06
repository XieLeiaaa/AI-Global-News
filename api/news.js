// /api/news.js
// Exa.ai 驱动的新闻引擎：极速、全文、高密度

import Exa from "exa-js"; // 引入 Exa 库

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. 获取密钥
  const EXA_KEY = process.env.VITE_EXA_API_KEY || process.env.EXA_API_KEY;
  const DEEPSEEK_KEY = process.env.VITE_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;
  const GROQ_KEY = process.env.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY;

  let AI_KEY = DEEPSEEK_KEY || GROQ_KEY;
  let AI_URL = DEEPSEEK_KEY ? "https://api.deepseek.com/chat/completions" : "https://api.groq.com/openai/v1/chat/completions";
  let AI_MODEL = DEEPSEEK_KEY ? "deepseek-chat" : "llama-3.3-70b-versatile";

  if (!EXA_KEY) {
    return res.status(500).json({ 
      error: "配置缺失", 
      message: "请安装 exa-js 并在 Vercel 添加 VITE_EXA_API_KEY" 
    });
  }

  // 初始化 Exa
  const exa = new Exa(EXA_KEY);

  try {
    const { page = 1 } = req.body || {};
    
    // 计算日期
    const today = new Date();
    const pastDate = new Date(today);
    pastDate.setDate(today.getDate() - (page - 1));
    const targetDate = pastDate.toISOString().split('T')[0];
    // Exa 需要具体的日期格式，或者我们可以直接搜 "news from 2024-xx-xx"
    
    console.log(`[Exa Engine] 启动 Exa 强力搜索: ${targetDate}`);

    // --- 第一阶段：Exa 智能搜索 (Search + Contents) ---
    // Exa 的杀手锏：searchAndContents
    // 我们不需要并发很多次，因为 Exa 一次能抓很准。我们分两个大类来抓。

    const queries = [
      `Latest technology AI LLM news headlines released on ${targetDate}`,
      `Global financial market crypto stock news happened on ${targetDate}`
    ];

    // 并发执行 Exa 搜索
    const searchPromises = queries.map(async (q) => {
      try {
        const result = await exa.searchAndContents(
          q,
          {
            type: "neural", // 使用神经网络搜索，更懂语义
            useAutoprompt: true, // 让 Exa 自动优化关键词
            numResults: 8,       // 每个分类抓 8 条全文
            text: true,          // 🔥 关键：直接返回网页全文！
            highlights: true     // 🔥 关键：返回高亮重点
          }
        );
        return result.results || [];
      } catch (e) {
        console.error("Exa Search Error:", e);
        return [];
      }
    });

    const resultsArrays = await Promise.all(searchPromises);
    const allRawResults = resultsArrays.flat();

    console.log(`[Exa Engine] 获取到 ${allRawResults.length} 条带有全文的素材`);

    if (allRawResults.length === 0) throw new Error("Exa 未搜到任何内容，请检查日期或 Key");

    // --- 第二阶段：构建高密度 Context ---
    // 之前 Tavily 只有 200 字，现在 Exa 给的是全文。
    // 我们必须截断，否则会爆掉 AI 的 Token 限制。
    
    const context = allRawResults.map((r, i) => {
      // 截取前 500 个字符的全文，信息量是 Tavily 的 2-3 倍
      const rawText = r.text ? r.text.substring(0, 500).replace(/\s+/g, " ") : "";
      const highlight = r.highlights ? r.highlights.join(" ... ") : "";
      return `[${i+1}] 标题：${r.title}\n重点：${highlight}\n正文片段：${rawText}...\nURL: ${r.url}`;
    }).join("\n\n----------------\n\n");

    // --- 第三阶段：AI 生成 (内容一定会很丰富) ---
    const prompt = `
      日期：${targetDate}。
      你是一个全能新闻助手。基于下方提供的【长文本素材】，生成一份详尽的新闻简报。
      
      【素材库 (含正文片段)】：
      ${context}

      【要求】：
      1. **覆盖率**：请提取 **12-16 条** 核心新闻。
      2. **信息密度**：由于素材包含正文片段，请确保摘要中包含**具体细节**（如：谁？做了什么？数据是多少？）。
      3. **格式**：JSON。
      4. **链接**：必须保留原始 URL。

      JSON结构:
      {
        "news": [
          { "title": "...", "summary": "...", "region": "...", "sector": "AI/金融/科技", "source": "...", "url": "..." }
        ]
      }
    `;

    // 设定 8 秒超时，防止 AI 写太久
    const aiPromise = fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${AI_KEY}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
      })
    });

    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), 8000));

    let finalData = { news: [] };

    try {
      const aiRes = await Promise.race([aiPromise, timeoutPromise]);
      const aiData = await aiRes.json();
      const content = aiData.choices?.[0]?.message?.content || "{}";
      finalData = JSON.parse(content.replace(/```json/g, "").replace(/```/g, "").trim());
    } catch (e) {
      console.log("⚠️ AI 处理超时或出错，降级显示 Exa 原始结果");
      // 降级：直接把 Exa 搜到的丰富结果展示出来
      finalData.news = allRawResults.map(item => ({
        title: item.title || "Untitled News",
        summary: item.highlights?.[0] || item.text?.substring(0, 100) || "点击查看详情",
        region: "全球",
        sector: "热门",
        source: "Exa Search",
        url: item.url
      }));
    }

    return res.status(200).json({
      news: finalData.news || [],
      meta: { page, date: targetDate, engine: "Exa" }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
