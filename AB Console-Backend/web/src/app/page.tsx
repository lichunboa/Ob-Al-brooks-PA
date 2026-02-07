export default function RootPage() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="text-center max-w-md w-full">
        <h1 className="text-2xl md:text-4xl font-bold mb-2 md:mb-4">🦁 AB Console</h1>
        <p className="text-gray-400 text-sm md:text-base mb-4 md:mb-6">
          Al Brooks 交易员控制台
        </p>
        <div className="flex flex-col md:flex-row gap-2 md:gap-4">
          <a 
            href="/dashboard" 
            className="bg-yellow-500 text-black px-4 py-2 md:px-6 md:py-2 rounded-lg font-semibold hover:bg-yellow-600 text-sm md:text-base"
          >
            进入控制台
          </a>
          <a 
            href="/data-overview" 
            className="border border-gray-600 px-4 py-2 md:px-6 md:py-2 rounded-lg hover:bg-gray-800 text-sm md:text-base"
          >
            数据概览
          </a>
        </div>
        <p className="text-xs text-gray-600 mt-8">
          v2.7.0 | 三机器人交易系统 | 币安 Demo Trading
        </p>
      </div>
    </div>
  );
}