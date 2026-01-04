import { NewsItem, GroundingSource } from "../types";

export const fetchLatestNews = async (date: string): Promise<{ news: NewsItem[], sources: GroundingSource[] }> => {
  try {
    // 呼叫我们刚刚写的后端 API (它在美国运行)
    const response = await fetch("/api/news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "获取新闻失败");
    }

    const data = await response.json();
    const newsList = data.news || [];

    // 格式化数据以适应前端 UI
    const formattedNews: NewsItem[] = newsList.map((item: any, index: number) => ({
      ...item,
      id: `news-${index}-${Date.now()}`,
      publishedAt: new Date().toISOString(),
      // 简单的容错处理，防止 API 返回奇怪的分类
      region: ["国内", "国外"].includes(item.region) ? item.region : "国外",
      sector: ["热门", "科技", "金融", "AI", "创投", "汽车", "股票"].includes(item.sector) ? item.sector : "热门"
    }));

    // 提取来源用于显示
    const sources: GroundingSource[] = formattedNews.map(n => ({
      title: n.source,
      uri: n.url
    }));

    return { news: formattedNews, sources };

  } catch (error: any) {
    console.error("Frontend Fetch Error:", error);
    throw error; // 把错误抛出去，让 UI 显示报错信息，而不是假新闻
  }
};
