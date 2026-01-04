
export enum NewsRegion {
  CHINA = '国内',
  GLOBAL = '国外'
}

export enum NewsSector {
  TRENDING = '热门',
  TECH = '科技',
  FINANCE = '金融',
  AI = 'AI',
  VC = '创投',
  AUTO = '汽车',
  STOCKS = '股票'
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  region: NewsRegion;
  sector: NewsSector;
  source: string;
  url: string;
  publishedAt: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface BriefingResponse {
  news: NewsItem[];
  sources: GroundingSource[];
}
