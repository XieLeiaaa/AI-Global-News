
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { NewsItem, NewsRegion, NewsSector, GroundingSource } from './types';
import { fetchLatestNews } from './services/geminiService';
import { NewsCard } from './components/NewsCard';

const LoadingNeural: React.FC = () => (
  <div className="fixed inset-0 z-[100] bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-6">
    <div className="relative w-32 h-32 mb-12">
      <div className="absolute inset-0 border-2 border-dashed border-indigo-500/20 rounded-full animate-[spin_10s_linear_infinite]" />
      <div className="absolute inset-4 bg-indigo-600/10 rounded-full animate-pulse-slow flex items-center justify-center">
        <div className="w-12 h-12 bg-indigo-600 rounded-[1.5rem] neural-glow animate-float flex items-center justify-center">
          <i className="fa-solid fa-brain text-white text-xl"></i>
        </div>
      </div>
      {[0, 1, 2].map(i => (
        <div 
          key={i} 
          className="absolute w-2 h-2 bg-indigo-400 rounded-full" 
          style={{ 
            top: '50%', left: '50%',
            transform: `rotate(${i * 120}deg) translateX(60px)`,
            animation: `spin ${3 + i}s linear infinite`
          }}
        />
      ))}
    </div>
    <div className="text-center">
      <h2 className="text-xl font-black tracking-tighter text-slate-900 dark:text-white mb-2 uppercase">Neural Processing</h2>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.4em] animate-pulse">Syncing Global Intelligence</p>
    </div>
    <div className="absolute bottom-12 w-48 h-1 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
      <div className="h-full bg-indigo-600 animate-[loading-bar_2s_ease-in-out_infinite]" style={{ width: '40%' }}></div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [allNews, setAllNews] = useState<NewsItem[]>([]);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadMoreLoading, setLoadMoreLoading] = useState<boolean>(false);
  const [isDark, setIsDark] = useState<boolean>(false);
  
  const [activeRegion, setActiveRegion] = useState<NewsRegion>(NewsRegion.CHINA);
  const [activeSector, setActiveSector] = useState<NewsSector | '全部'>('全部');
  const [visibleCount, setVisibleCount] = useState<number>(10);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    setIsDark(initialDark);
    document.documentElement.classList.toggle('dark', initialDark);
  }, []);

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    document.documentElement.classList.toggle('dark', newDark);
    localStorage.setItem('theme', newDark ? 'dark' : 'light');
  };

  const generateBriefing = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const result = await fetchLatestNews(today);
      setAllNews(result.news);
      setSources(result.sources);
      setLastUpdated(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
      setVisibleCount(10); 
    } catch (err) {
      setError('Connection to intelligence relay failed.');
    } finally {
      setTimeout(() => setLoading(false), 1200); 
    }
  }, []);

  useEffect(() => {
    generateBriefing();
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [generateBriefing]);

  useEffect(() => { setVisibleCount(10); }, [activeRegion, activeSector]);

  const filteredNews = useMemo(() => {
    return allNews.filter(item => (item.region === activeRegion) && (activeSector === '全部' || item.sector === activeSector));
  }, [allNews, activeRegion, activeSector]);

  const visibleNews = useMemo(() => filteredNews.slice(0, visibleCount), [filteredNews, visibleCount]);

  const handleLoadMore = async () => {
    setLoadMoreLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setVisibleCount(p => p + 10);
    setLoadMoreLoading(false);
  };

  const sectors: (NewsSector | '全部')[] = ['全部', ...Object.values(NewsSector)];
  const parallaxOffset = Math.min(scrollY * 0.05, 12);

  if (loading) return <LoadingNeural />;

  return (
    <div className="min-h-screen transition-colors duration-500 dark:bg-slate-950">
      <div className="fixed top-0 left-0 w-full h-[3px] z-[100] pointer-events-none">
        <div 
          className="h-full bg-indigo-600 shadow-[0_0_10px_#4f46e5] transition-all duration-300"
          style={{ width: `${(visibleNews.length / (filteredNews.length || 1)) * 100}%` }}
        />
      </div>

      {/* Primary Header - Now holds Regions and Toggles */}
      <nav className="sticky top-0 z-50 glass border-b dark:border-white/5 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="relative h-10 w-10 bg-slate-900 dark:bg-white rounded-2xl flex items-center justify-center transition-transform active:scale-90">
               <i className="fa-solid fa-bolt-lightning text-white dark:text-slate-900 text-sm"></i>
            </div>
            <div className="hidden xs:block">
              <h1 className="text-sm font-black tracking-tighter uppercase dark:text-white leading-none">Aura Intel</h1>
              <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em]">Briefing Relay</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Region Switcher Segmented Control */}
            <div className="flex bg-slate-100 dark:bg-slate-800/50 p-1 rounded-2xl border dark:border-white/5">
              {Object.values(NewsRegion).map((region) => (
                <button
                  key={region}
                  onClick={() => setActiveRegion(region)}
                  className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeRegion === region 
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' 
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {region}
                </button>
              ))}
            </div>

            <div className="h-8 w-px bg-slate-200 dark:bg-white/10 hidden sm:block" />

            <div className="flex items-center gap-2">
              <button 
                onClick={toggleTheme}
                className="h-10 w-10 rounded-2xl flex items-center justify-center border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-slate-600 dark:text-slate-400 active:scale-90"
              >
                <i className={`fa-solid ${isDark ? 'fa-sun' : 'fa-moon'} text-xs`}></i>
              </button>
              <button 
                onClick={generateBriefing}
                className="px-4 h-10 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black text-[10px] tracking-widest uppercase hover:scale-[1.02] active:scale-95 transition-all hidden sm:flex items-center gap-2"
              >
                SYNC <i className="fa-solid fa-rotate text-[10px]"></i>
              </button>
            </div>
          </div>
        </div>

        {/* Secondary Navigation - Sector List moved here */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 overflow-x-auto no-scrollbar py-3 border-t dark:border-white/5 flex items-center gap-2 sm:justify-center">
          {sectors.map(sector => (
            <button
              key={sector}
              onClick={() => setActiveSector(sector)}
              className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border whitespace-nowrap active:scale-90 ${
                activeSector === sector 
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100 dark:shadow-none' 
                  : 'bg-white/50 dark:bg-slate-900/40 backdrop-blur-md text-slate-400 border-slate-200 dark:border-white/5'
              }`}
            >
              {sector}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-10 pb-32">
        {!error && (
          <div className="flex items-center justify-between mb-10 px-2">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {visibleNews.length} Signals Locked
              </span>
            </div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-900/50 px-3 py-1.5 rounded-xl border dark:border-white/5">
              Synced: {lastUpdated}
            </div>
          </div>
        )}

        {error ? (
          <div className="py-32 text-center max-w-lg mx-auto">
            <h3 className="text-2xl font-black dark:text-white mb-4">UPLINK DROPPED</h3>
            <p className="text-slate-500 text-sm mb-12">{error}</p>
            <button onClick={generateBriefing} className="px-10 py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-3xl font-black text-xs uppercase transition-all">
              RETRY
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {visibleNews.map((item) => <NewsCard key={item.id} item={item} />)}
            </div>

            {filteredNews.length === 0 && (
              <div className="py-40 text-center">
                <i className="fa-solid fa-wind text-slate-200 text-4xl mb-4"></i>
                <h3 className="text-xl font-black dark:text-white opacity-40 uppercase tracking-widest">Quiet Sector</h3>
              </div>
            )}

            {filteredNews.length > visibleCount && (
              <div className="mt-20 flex flex-col items-center">
                <button 
                  onClick={handleLoadMore}
                  disabled={loadMoreLoading}
                  className={`px-16 py-6 rounded-[2.5rem] font-black text-[11px] tracking-[0.3em] uppercase transition-all active:scale-95 border-2 ${
                    loadMoreLoading 
                      ? 'bg-slate-50 dark:bg-slate-900 text-slate-300 border-slate-100' 
                      : 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white border-slate-900 dark:border-white shadow-xl'
                  }`}
                >
                  {loadMoreLoading ? <i className="fa-solid fa-circle-notch animate-spin"></i> : 'EXPAND HORIZON'}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Persistent Controls */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 p-2 bg-slate-900/95 dark:bg-white/10 backdrop-blur-2xl rounded-[2rem] border border-white/10 shadow-2xl">
        <button 
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="h-12 w-12 rounded-full flex items-center justify-center text-white"
        >
          <i className="fa-solid fa-arrow-up text-xs"></i>
        </button>
        <div className="h-4 w-px bg-white/20" />
        <button className="h-12 px-6 text-[10px] font-black text-white tracking-widest uppercase">
          {activeRegion}·{activeSector}
        </button>
      </div>

      <footer className="py-32 bg-white dark:bg-slate-950 border-t dark:border-white/5 text-center">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-12">System Architecture: Aura Intel V3</p>
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
            <span>© 2024 Aura Intelligence</span>
            <div className="flex gap-12">
              <a href="#" className="hover:text-indigo-600 transition-colors">Protocol</a>
              <a href="#" className="hover:text-indigo-600 transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
