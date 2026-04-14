"use client";

import { useEffect, useState } from "react";
import { Globe, X, AlertCircle } from "lucide-react";

export default function ChromeWarning() {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    // Check if browser is NOT Chrome
    // A robust check for "Real" Chrome (not Edge, Brave, etc. if we want to be strict)
    const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
    
    // For this app, maybe any Chromium is fine? 
    // But the user specifically asked for "suggesting to switch to Chrome".
    
    try {
      const isDismissed = localStorage.getItem("chrome_warning_dismissed") === "true";
      if (!isChrome && !isDismissed) {
        setShouldRender(true);
        // Delay visibility for animation
        setTimeout(() => setIsVisible(true), 100);
      }
    } catch (e) {
      console.error("Failed to access localStorage", e);
    }
  }, []);

  const dismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      setShouldRender(false);
      try {
        localStorage.setItem("chrome_warning_dismissed", "true");
      } catch (e) {
        console.error("Failed to set localStorage", e);
      }
    }, 500);
  };

  if (!shouldRender) return null;

  return (
    <div 
      className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ease-in-out transform ${
        isVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
      }`}
    >
      <div className="bg-gradient-to-r from-[#FF512F] via-[#DD2476] to-[#FF512F] text-white px-4 py-2.5 shadow-2xl flex items-center justify-between border-b border-white/10 backdrop-blur-md bg-opacity-90">
        <div className="flex items-center gap-4 max-w-5xl mx-auto w-full justify-center">
          <div className="bg-white/20 p-2 rounded-xl flex items-center justify-center">
            <AlertCircle size={20} className="text-white animate-pulse" />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <p className="text-sm font-semibold tracking-tight">
              Optimized for Chrome
            </p>
            <p className="text-xs text-white/90 font-medium">
              For the fastest streaming and best canvas performance, we recommend switching to Chrome.
            </p>
          </div>
          <a
            href="https://www.google.com/chrome/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-white text-[#DD2476] px-4 py-1.5 rounded-full text-xs font-bold hover:scale-105 active:scale-95 transition-all shadow-lg hover:shadow-white/20 ml-2 group"
          >
            <Globe size={14} className="group-hover:rotate-12 transition-transform" />
            Download Chrome
          </a>
        </div>
        <button
          onClick={dismiss}
          className="p-2 hover:bg-white/10 rounded-xl transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
