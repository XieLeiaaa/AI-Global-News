// /api/news.js
// 生产级新闻聚合引擎 (高密度版：6路并发 + 原始数据混合模式)

export default async function handler(req, res) {
  // 1. 设置跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 2. 获取密钥
  const TAVILY_KEY = process.env.VITE_TAVILY_API_KEY || process.env.TAVILY_API_KEY;
  const DEEPSEEK_KEY = process.env.VITE_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;
  const GROQ_KEY = process.env.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY;

  let AI_KEY = DEEPSEEK_KEY || GROQ_KEY;
  let AI_URL = DEEPSEEK_KEY ? "https://api.deepseek.com/chat/completions" : "https://api.groq.com/openai/v1/chat/completions";
  let AI_MODEL = DEEPSEEK_KEY ? "deepseek-chat" : "llama-3.3-70b-versatile";

  if (!TAVILY_KEY || !AI_KEY) {
    return res.status(500).json({ error: "API Key 缺失" });
  }

  try {
    const { date, page = 1 } = req.body || {};
    
    // 计算日期 (支持翻页时光机)
    const today = new Date();
    const pastDate = new Date(today);
    pastDate.setDate(today.getDate() - (page - 1));
    const targetDate = pastDate.toISOString().split('T')[0];

    console.log(`[High Density Engine] 启动地毯式搜索: ${targetDate} (Page ${page})`);

    // --- 第一阶段：细分赛道 (6路并发) ---
    // 把搜索颗粒度切细，才能抓到更多长尾新闻
    const topics = [
      { category: "🤖 AI模型", query: `LLM AI model release DeepSeek OpenAI Anthropic updates ${targetDate}` },
      { category: "💰 加密/金融", query: `Crypto Bitcoin ETF stock market major moves ${targetDate}` },
      { category: "📱 消费电子", query: `New smartphones release Apple Xiaomi Huawei rumors ${targetDate}` },
      { category: "🔌 芯片半导体", query: `Nvidia TSMC Intel AMD chip semiconductor news ${targetDate}` },
      { category: "🦄 创投融资", query: `Tech startup funding rounds IPO news ${targetDate}` },
      { category: "🇨🇳 中国科技", query: `China internet giants regulation Baidu Tencent Alibaba news ${targetDate}` }
    ];

    const searchPromises = topics.map(async (topic) => {
      try {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: TAVILY_KEY,
            query: topic.query,
            search_depth: "basic", // 用 basic 够了，为了省时间，我们靠数量取胜
            max_results: 8,        // 6个赛道 * 8条 = 48条原料
            include_images: false
          }),
        });
        const data = await response.json();
        return (data.results || []).map(item => ({ ...item, category: topic.category }));
      } catch (error) { return []; }
    });

    const resultsArrays = await Promise.all(searchPromises);
    const allRawResults = resultsArrays.flat();
    
    // 清洗去重 (保留 URL 和 标题不重复的)
    const seenMap = new Map();
    const validResults = allRawResults.filter(item => {
      if (!item.title) return false;
      if (seenMap.has(item.url)) return false;
      seenMap.set(item.url, true);
      return true;
    });

    console.log(`[Engine] 抓取到 ${validResults.length} 条有效素材`);

    if (validResults.length === 0) throw new Error("未搜到有效新闻");

    // --- 第二阶段：AI 批量生产 ---
    // 我们把素材分两批喂给 AI，或者直接要求它列出清单
    // 为了防止 AI 偷懒合并，我们强制它输出“列表模式”
    
    const context = validResults.map((r, i) => 
      `${i+1}. [${r.category}] ${r.title} (${r.url})`
    ).join("\n");

    const prompt = `
      日期：${targetDate}。
      你是一个新闻聚合器。
      请基于下方的【素材清单】，**尽可能多地**提取出有价值的新闻条目。
      
      【素材清单】：
      ${context}

      【严格要求】：
      1. **数量最大化**：请从素材中提取 **20 条左右** 的新闻。如果素材足够，不要合并，一条素材生成一条新闻。
      2. **格式规范**：必须是 JSON。
      3. **内容真实**：Title 必须翻译成中文，Summary 用中文一句话概括，URL 必须保留原链接。
      
      JSON结构:
      {
        "news": [
          { 
            "title": "中文标题", 
            "summary": "简短中文摘要", 
            "region": "全球", 
            "sector": "对应分类", 
            "source": "媒体名", 
            "url": "原始URL" 
          }
        ]
      }
    `;

    const aiRes = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${AI_KEY}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
      })
    });

    const aiData = await aiRes.json();
    let finalData = { news: [] };
    
    try {
      const content = aiData.choices?.[0]?.message?.content || "{}";
      finalData = JSON.parse(content.replace(/```json/g, "").replace(/```/g, "").trim());
    } catch (e) {
      console.error("AI JSON 解析失败", e);
    }

    // --- 第三阶段：混合填充 (Hybrid Filling) ---
    // 如果 AI 生成的新闻少于 10 条，为了保证页面看起来丰富，
    // 我们把剩下没被 AI 选中的原始搜索结果，直接格式化后补在后面！
    
    const aiGeneratedCount = finalData.news?.length || 0;
    if (aiGeneratedCount < validResults.length) {
      console.log(`[Engine] AI 只生成了 ${aiGeneratedCount} 条，正在混入原始数据补充...`);
      
      // 找出 AI 没用到的素材 (简单通过 URL 比对，或者直接把没出现在结果里的补上)
      // 这里为了简单粗暴，直接把 AI 结果和 原始结果合并，前端去重
      const rawExtras = validResults.slice(0, 20).map(item => ({
        title: item.title, // 原始标题(可能是英文)
        summary: item.content || "点击查看详情...",
        region: "全球",
        sector: item.category,
        source: "Web Search",
        url: item.url,
        is_raw: true // 标记一下这是原始数据
      }));
      
      // 把 AI 生成的放在前面，原始的放在后面作为补充
      // 注意：这里可能会有重复，但为了“内容多”，暂时接受重复
      finalData.news = [...(finalData.news || []), ...rawExtras];
    }

    // 去重 (根据 URL)
    const uniqueNews = [];
    const urlSet = new Set();
    for (const item of finalData.news) {
      if (!item.url || urlSet.has(item.url)) continue;
      urlSet.add(item.url);
      uniqueNews.push(item);
    }

    console.log(`[Engine] 最终输出 ${uniqueNews.length} 条新闻`);

    return res.status(200).json({
      news: uniqueNews,
      meta: { page, date: targetDate, total: uniqueNews.length }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
