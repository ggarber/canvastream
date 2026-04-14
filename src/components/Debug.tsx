"use client";

import React from "react";
import { Activity, Cpu, Database, Network, User as UserIcon, Video, Monitor } from "lucide-react";

interface DebugProps {
    status: 'connecting' | 'connected' | 'disconnected';
    participants: Record<string, string>;
    streams: Record<string, { streamId: string, source: string; from: string }>;
    myClientId: string | null;
    streamConnections: Record<string, string>;
    sessionState?: any;
    hideHeader?: boolean;
}

export default function Debug({ status, participants, streams, myClientId, streamConnections = {}, sessionState = {}, hideHeader = false }: DebugProps) {
    const participantIds = Object.keys(participants);
    
    // Group streams by participant
    const streamsByParticipant: Record<string, any[]> = {};
    Object.values(streams).forEach(stream => {
        if (!streamsByParticipant[stream.from]) {
            streamsByParticipant[stream.from] = [];
        }
        streamsByParticipant[stream.from].push(stream);
    });

    // Group connections by participant
    const connectionsByParticipant: Record<string, { streamId: string, status: string }[]> = {};
    Object.entries(streamConnections).forEach(([key, connStatus]) => {
        const [remoteId, streamId] = key.split('||');
        if (!connectionsByParticipant[remoteId]) {
            connectionsByParticipant[remoteId] = [];
        }
        connectionsByParticipant[remoteId].push({ streamId, status: connStatus });
    });

    return (
        <div className="flex flex-col h-full relative overflow-hidden group">
            {/* Debug Header */}
            {!hideHeader && (
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white/50">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-black text-gray-900 leading-tight">Session Debug</h2>
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 rounded-lg text-amber-600 font-bold text-xs uppercase tracking-tight">
                            <Activity size={14} />
                            <span>Live Stats</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Debug Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 scroll-smooth custom-scrollbar">
                {/* Connection Status Section */}
                <section>
                    <div className="flex items-center gap-2 mb-3">
                        <Network size={16} className="text-blue-500" />
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Network</h3>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500 font-medium">WebSocket Status</span>
                            <span className={`font-bold uppercase tracking-tight ${
                                status === 'connected' ? 'text-emerald-500' : 
                                status === 'connecting' ? 'text-blue-500' : 'text-red-500'
                            }`}>
                                {status}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500 font-medium">My Client ID</span>
                            <code className="bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-700 font-mono text-[10px]">
                                {myClientId || 'Not Assigned'}
                            </code>
                        </div>
                    </div>
                </section>

                {/* Session State Section */}
                <section>
                    <div className="flex items-center gap-2 mb-3">
                        <Cpu size={16} className="text-emerald-500" />
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Session State</h3>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                        <pre className="text-[10px] font-mono text-gray-700 bg-white p-3 rounded-xl border border-gray-100 overflow-x-auto">
                            {JSON.stringify(sessionState, null, 2)}
                        </pre>
                    </div>
                </section>

                {/* Connections & Streams Section */}
                <section>
                    <div className="flex items-center gap-2 mb-3">
                        <Database size={16} className="text-indigo-500" />
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Active Connections</h3>
                    </div>
                    
                    <div className="space-y-4">
                        {/* Me */}
                        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                                    <UserIcon size={14} />
                                </div>
                                <span className="text-sm font-bold text-gray-900">You (Local)</span>
                            </div>
                            
                            <div className="space-y-2">
                                {streamsByParticipant[myClientId || '']?.length ? (
                                    streamsByParticipant[myClientId || '']?.map(stream => (
                                        <div key={stream.streamId} className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-100 ml-2">
                                            <div className="p-1.5 bg-gray-50 text-gray-400 rounded-lg">
                                                {stream.source === 'camera' ? <Video size={12} /> : <Monitor size={12} />}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-bold text-gray-700 uppercase tracking-tight">{stream.source}</span>
                                                <span className="text-[9px] font-mono text-gray-400">{stream.streamId}</span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-[10px] text-gray-400 italic ml-2">No active streams</p>
                                )}
                            </div>

                            {/* Self connections (outgoing) */}
                            {connectionsByParticipant[myClientId || '']?.length ? (
                                <div className="mt-3 space-y-1.5 ml-2 border-l-2 border-blue-100 pl-3">
                                    <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Outgoing Connections</p>
                                    {connectionsByParticipant[myClientId || '']?.map((conn, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-white/50 p-1.5 rounded-lg border border-blue-50/50">
                                            <span className="text-[9px] font-mono text-gray-400 truncate max-w-[100px]">{conn.streamId}</span>
                                            <span className={`text-[9px] font-bold uppercase ${
                                                conn.status === 'connected' ? 'text-emerald-500' : 'text-blue-500'
                                            }`}>{conn.status}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        {/* Others */}
                        {participantIds.length > 0 ? participantIds.map(id => (
                            <div key={id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="p-1.5 bg-gray-200 text-gray-500 rounded-lg">
                                        <UserIcon size={14} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-gray-900">{participants[id]}</span>
                                        <span className="text-[9px] font-mono text-gray-400">{id}</span>
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                    {streamsByParticipant[id]?.length ? (
                                        streamsByParticipant[id]?.map(stream => (
                                            <div key={stream.streamId} className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-100 ml-2">
                                                <div className="p-1.5 bg-gray-50 text-gray-400 rounded-lg">
                                                    {stream.source === 'camera' ? <Video size={12} /> : <Monitor size={12} />}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[11px] font-bold text-gray-700 uppercase tracking-tight">{stream.source}</span>
                                                    <span className="text-[9px] font-mono text-gray-400">{stream.streamId}</span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-[10px] text-gray-400 italic ml-2">No active streams</p>
                                    )}
                                </div>

                                {/* Peer connections with this participant */}
                                {connectionsByParticipant[id]?.length ? (
                                    <div className="mt-3 space-y-1.5 ml-2 border-l-2 border-indigo-100 pl-3">
                                        <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Peer Connection</p>
                                        {connectionsByParticipant[id]?.map((conn, idx) => (
                                            <div key={idx} className="flex items-center justify-between bg-white/50 p-1.5 rounded-lg border border-indigo-50/50">
                                                <span className="text-[9px] font-mono text-gray-400 truncate max-w-[100px]">{conn.streamId}</span>
                                                <span className={`text-[9px] font-bold uppercase ${
                                                    conn.status === 'connected' ? 'text-emerald-500' : 'text-blue-500'
                                                }`}>{conn.status}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        )) : (
                           <div className="flex flex-col items-center py-4 opacity-30">
                               <p className="text-[10px] font-bold uppercase tracking-widest">No other participants</p>
                           </div>
                        )}
                    </div>
                </section>
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
