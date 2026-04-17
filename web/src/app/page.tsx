import { redirect } from "next/navigation";
import { Play } from "lucide-react";

export default function RootPage() {
  async function startStreaming() {
    "use server";
    const sessionId = crypto.randomUUID();
    redirect(`/sessions/${sessionId}`);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl filter" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl filter" />
      
      <main className="z-10 flex flex-col items-center text-center px-6 max-w-3xl">
        <div className="mb-6 p-4 rounded-full bg-white/5 border border-white/10 shadow-xl">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-emerald-400 rounded-xl flex items-center justify-center shadow-lg transform rotate-3">
            <span className="text-3xl font-black italic tracking-tighter">CC</span>
          </div>
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-500">
          CanvaStream
        </h1>
        
        <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-2xl leading-relaxed">
          The high-performance, real-time collaborative streaming platform. Powered by cutting-edge WebCodecs and a lightning-fast Go backend for seamless, ultra-low latency broadcasting.
        </p>

        <form action={startStreaming}>
          <button
            type="submit"
            className="group relative inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white transition-all duration-200 bg-gradient-to-r from-blue-600 to-emerald-600 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 shadow-[0_0_40px_-10px_rgba(52,211,153,0.5)] hover:shadow-[0_0_60px_-15px_rgba(52,211,153,0.7)] hover:scale-105"
          >
            Start Streaming
            <Play className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-left w-full">
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-blue-400 mb-2">WebCodecs API</h3>
            <p className="text-sm text-gray-400">Hardware-accelerated encoding straight from the browser. No native desktop apps required.</p>
          </div>
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-emerald-400 mb-2">Low Latency Go</h3>
            <p className="text-sm text-gray-400">High-throughput WebSocket to RTMP proxy server built with blazing fast Go.</p>
          </div>
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-blue-300 mb-2">Seamless Collab</h3>
            <p className="text-sm text-gray-400">Share your canvas and stream together with instantly generated sessions.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
