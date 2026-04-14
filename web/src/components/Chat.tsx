"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, User as UserIcon, ChevronLeft, ChevronRight, MessageSquare, Users } from "lucide-react";

export type Message = {
    id: string;
    text: string;
    sender: string;
    timestamp: number;
    isMe: boolean;
};

interface ChatProps {
    messages: Message[];
    onSendMessage: (text: string) => void;
    status: 'connecting' | 'connected' | 'disconnected';
    userName?: string;
    participants?: Record<string, string>;
    hideHeader?: boolean;
}

export default function Chat({ messages, onSendMessage, status, userName, participants = {}, hideHeader = false }: ChatProps) {
    const [inputValue, setInputValue] = useState("");
    const [isCollapsed, setIsCollapsed] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const handleSend = () => {
        if (inputValue.trim()) {
            onSendMessage(inputValue.trim());
            setInputValue("");
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isCollapsed]);

    if (isCollapsed) {
        return (
            <div className="flex flex-col items-center py-6 h-full bg-white/90 backdrop-blur-xl border border-white shadow-2xl w-20 rounded-xl transition-all duration-300">
                <button 
                    onClick={() => setIsCollapsed(false)}
                    className="p-3 rounded-2xl hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-all cursor-pointer"
                    title="Expand Chat"
                >
                    <ChevronLeft size={24} />
                </button>
                <div className="mt-8 flex flex-col items-center gap-6">
                    <div className="relative">
                        <MessageSquare className="text-gray-300" size={24} />
                        {messages.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white" />
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full relative overflow-hidden group">

            {/* Chat Header */}
            {!hideHeader && (
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white/50">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-black text-gray-900 leading-tight">Chat</h2>
                    </div>
                    <button 
                        onClick={() => setIsCollapsed(true)}
                        className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-900 transition-all cursor-pointer"
                        title="Collapse Chat"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            )}

            {/* Messages Area */}
            <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-6 py-4 space-y-6 scroll-smooth custom-scrollbar"
            >
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-30 space-y-3">
                        <div className="p-4 rounded-3xl bg-gray-50 border border-gray-100">
                            <MessageSquare size={32} className="text-gray-400" />
                        </div>
                        <p className="text-sm font-medium text-gray-500 text-center">No messages yet.<br/>Start the conversation!</p>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div 
                            key={msg.id} 
                            className={`flex flex-col ${msg.isMe ? "items-end" : "items-start"}`}
                        >
                            <div 
                                className={`max-w-[90%] px-4 py-1.5 rounded-2xl text-[14px] leading-relaxed shadow-sm ${
                                    msg.isMe 
                                        ? "bg-blue-600 text-white rounded-tr-none shadow-blue-200" 
                                        : "bg-gray-100 text-gray-800 rounded-tl-none border border-gray-200/50"
                                }`}
                            >
                                {msg.text}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1.5 px-1">
                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                                    {msg.isMe ? "You" : (msg.sender || "External")}
                                </span>
                                <span className="text-[10px] text-gray-300 font-medium">
                                    • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-gray-100">
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-1.5 focus-within:border-blue-500/30 focus-within:ring-4 focus-within:ring-blue-500/5 transition-all shadow-inner">
                    <textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Type a message..."
                        className="flex-1 bg-transparent border-none text-[14px] text-gray-800 placeholder:text-gray-400 focus:outline-none resize-none py-1.5 max-h-[120px]"
                        rows={1}
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!inputValue.trim()}
                        className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-20 disabled:scale-95 cursor-pointer shadow-lg shadow-blue-500/20 active:scale-90 shrink-0"
                    >
                        <Send size={16} />
                    </button>
                </div>
                <div className="mt-3 flex items-center justify-between px-1">
                    {userName && (
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                            Logged in as <span className="text-blue-600">{userName}</span>
                        </p>
                    )}
                </div>
            </div>
            
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 5px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(0, 0, 0, 0.05);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(0, 0, 0, 0.1);
                }
            `}</style>
        </div>
    );
}
