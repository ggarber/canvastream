"use client";

import React from "react";
import { User as UserIcon, ShieldCheck } from "lucide-react";

interface GuestsProps {
    participants: Record<string, string>;
    userName: string;
    myClientId: string | null;
}

export default function Guests({ participants, userName, myClientId }: GuestsProps) {
    const allParticipants = [
        { id: myClientId || 'me', name: userName, isMe: true },
        ...Object.entries(participants).map(([id, name]) => ({ id, name, isMe: false }))
    ];

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 custom-scrollbar">
                <div className="flex flex-col gap-2">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400 px-1 mb-2">
                        Everyone Online ({allParticipants.length})
                    </h3>
                    
                    <div className="space-y-1">
                        {allParticipants.map((participant) => (
                            <div 
                                key={participant.id}
                                className="flex items-center justify-between p-3 rounded-2xl hover:bg-gray-50 transition-colors group border border-transparent hover:border-gray-100"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold shadow-sm ${
                                        participant.isMe 
                                            ? 'bg-blue-600 text-white shadow-blue-100' 
                                            : 'bg-gray-100 text-gray-600 border border-gray-200/50'
                                    }`}>
                                        {participant.name.substring(0, 1).toUpperCase()}
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-gray-900">
                                                {participant.name}
                                            </span>
                                            {participant.isMe && (
                                                <span className="text-[9px] font-black uppercase tracking-tighter bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md border border-blue-100">
                                                    Host
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-gray-400 font-medium">
                                            {participant.isMe ? "Broadcasting" : "Watching"}
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                            </div>
                        ))}
                    </div>
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
