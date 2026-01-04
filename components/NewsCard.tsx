
import React, { useState, useRef } from 'react';
import { NewsItem, NewsSector } from '../types';

interface NewsCardProps {
  item: NewsItem;
}

const SectorIndicator: React.FC<{ sector: NewsSector }> = ({ sector }) => {
  const themes: Record<NewsSector, string> = {
    [NewsSector.TRENDING]: 'from-rose-500 to-orange-500 shadow-rose-500/20',
    [NewsSector.TECH]: 'from-blue-500 to-indigo-500 shadow-blue-500/20',
    [NewsSector.FINANCE]: 'from-emerald-500 to-teal-500 shadow-emerald-500/20',
    [NewsSector.AI]: 'from-violet-500 to-fuchsia-500 shadow-violet-500/20',
    [NewsSector.VC]: 'from-amber-500 to-yellow-500 shadow-amber-500/20',
    [NewsSector.AUTO]: 'from-cyan-500 to-blue-500 shadow-cyan-500/20',
    [NewsSector.STOCKS]: 'from-green-500 to-emerald-500 shadow-green-500/20',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full bg-gradient-to-tr shadow-lg ${themes[sector] || 'bg-slate-400'}`} />
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
        {sector}
      </span>
    </div>
  );
};

export const NewsCard: React.FC<NewsCardProps> = ({ item }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
    const words = text.split('');
    let line = '';
    let testLine = '';
    let lineCount = 0;

    for (let n = 0; n < words.length; n++) {
      testLine = line + words[n];
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n];
        y += lineHeight;
        lineCount++;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
    return y;
  };

  const generateAndShareImage = async () => {
    setIsGenerating(true);
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background - High End Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 1000);
    gradient.addColorStop(0, '#0f172a'); // slate-900
    gradient.addColorStop(1, '#1e293b'); // slate-800
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 1000);

    // Decorative Accents
    ctx.fillStyle = 'rgba(79, 70, 229, 0.15)'; // indigo-600
    ctx.beginPath();
    ctx.arc(800, 0, 400, 0, Math.PI * 2);
    ctx.fill();

    // Branding Header
    ctx.fillStyle = '#6366f1'; // indigo-500
    ctx.font = '900 24px Inter, sans-serif';
    ctx.fillText('AURA INTELLIGENCE', 60, 80);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.fillText(`RELAY V3.0 • ${new Date().toLocaleDateString('zh-CN')}`, 60, 105);

    // Content Block - Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px "Noto Serif SC", serif';
    const endTitleY = wrapText(ctx, item.title, 60, 220, 680, 65);

    // Separator
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, endTitleY + 60);
    ctx.lineTo(740, endTitleY + 60);
    ctx.stroke();

    // Summary
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = 'medium 28px Inter, sans-serif';
    wrapText(ctx, item.summary, 60, endTitleY + 130, 680, 45);

    // Footer Info
    ctx.fillStyle = '#6366f1';
    ctx.font = '900 18px Inter, sans-serif';
    ctx.fillText(item.sector.toUpperCase(), 60, 900);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.fillText(`SOURCE: ${item.source.toUpperCase()}`, 60, 930);

    // QR Code Placeholder Area / Aesthetic Mark
    ctx.strokeStyle = '#6366f1';
    ctx.strokeRect(680, 860, 60, 60);
    ctx.fillStyle = '#6366f1';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillText('SCAN', 695, 935);

    // Convert to Image and Share
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'aura-briefing.png', { type: 'image/png' });
      
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: item.title,
            text: '来自 Aura Intelligence 的全球智库摘要',
          });
        } catch (err) {
          // Fallback to download
          const link = document.createElement('a');
          link.download = `Aura-${item.id}.png`;
          link.href = URL.createObjectURL(blob);
          link.click();
        }
      } else {
        const link = document.createElement('a');
        link.download = `Aura-${item.id}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
      }
      setIsGenerating(false);
    });
  };

  return (
    <div 
      className="group relative flex flex-col bg-white dark:bg-slate-900/40 rounded-[2.5rem] border border-slate-200/50 dark:border-white/5 p-6 transition-all duration-500 hover:shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] hover:-translate-y-2 overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[60px] rounded-full transition-opacity duration-700 ${isHovered ? 'opacity-100' : 'opacity-0'}`} />

      <div className="flex items-center justify-between mb-5">
        <SectorIndicator sector={item.sector} />
        <button 
          onClick={generateAndShareImage}
          disabled={isGenerating}
          className="h-9 w-9 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-90"
          title="生成分享卡片"
        >
          {isGenerating ? <i className="fa-solid fa-circle-notch animate-spin text-xs"></i> : <i className="fa-solid fa-share-nodes text-[12px]"></i>}
        </button>
      </div>

      <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3 leading-[1.3] serif tracking-tight line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
        {item.title}
      </h3>

      <p className="text-slate-500 dark:text-slate-400 text-[13px] leading-relaxed font-medium line-clamp-3 mb-8 opacity-80 group-hover:opacity-100 transition-opacity">
        {item.summary}
      </p>

      <div className="mt-auto flex items-center justify-between pt-5 border-t border-slate-100 dark:border-white/5">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-1">
            {item.source}
          </span>
          <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600">
            {new Date(item.publishedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
          </span>
        </div>
        
        <a 
          href={item.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl text-[11px] font-black text-slate-900 dark:text-white hover:bg-indigo-600 hover:text-white transition-all active:scale-95 group/btn"
        >
          VIEW
          <i className="fa-solid fa-arrow-right text-[10px] transition-transform group-hover/btn:translate-x-1"></i>
        </a>
      </div>
    </div>
  );
};
