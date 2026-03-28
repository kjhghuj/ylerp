import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, ChevronUp, ChevronDown, Terminal } from 'lucide-react';

interface LogEntry {
  id: number;
  message: string;
  time: string;
}

export const DebugConsole: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  const addLog = (msg: string) => {
      setLogs(prev => [
        { id: Date.now() + Math.random(), message: msg, time: new Date().toLocaleTimeString() },
        ...prev
      ].slice(0, 20));
      setIsExpanded(true);
  };

  useEffect(() => {
    const originalError = console.error;
    
    console.error = (...args: any[]) => {
      originalError.apply(console, args);
      
      const msg = args.map(a => {
        try {
            if (a instanceof Error) return a.message + '\n' + a.stack;
            const str = typeof a === 'object' ? JSON.stringify(a) : String(a);
            return str.length > 500 ? str.substring(0, 500) + '...' : str;
        } catch (_e) {
            return '[Complex Object]';
        }
      }).join(' ');
      
      addLog(msg);
    };

    const handleError = (event: ErrorEvent) => {
      addLog(`Runtime Error: ${event.message}`);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      let reason = event.reason;
      if (reason instanceof Error) {
          reason = reason.message + (reason.stack ? '\n' + reason.stack : '');
      } else if (typeof reason === 'object') {
          try {
              if (reason?.isAxiosError) {
                  reason = `AxiosError: ${reason.message} ${reason.response?.status || ''}`;
              } else {
                  reason = JSON.stringify(reason);
              }
          } catch(_e) { 
              reason = String(reason); 
          }
      }
      addLog(`Unhandled Rejection: ${reason}`);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      console.error = originalError;
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  if (logs.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[9999] flex flex-col items-start font-mono text-xs shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div 
        className={`px-3 py-2 rounded-t-lg flex items-center gap-2 cursor-pointer border-t border-x transition-colors
            ${isExpanded 
                ? 'bg-slate-900 text-red-400 border-slate-700' 
                : 'bg-red-600 text-white border-red-700 hover:bg-red-700 rounded-b-lg'}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <AlertTriangle size={14} />
        <span className="font-bold">Debug: {logs.length} Error{logs.length !== 1 ? 's' : ''}</span>
        {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </div>
      
      {isExpanded && (
        <div className="bg-slate-900 text-slate-300 w-96 max-h-80 overflow-auto p-2 rounded-b-lg rounded-r-lg border border-slate-700 shadow-xl">
           <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-800">
             <div className="flex items-center gap-1 text-slate-500">
                <Terminal size={12} />
                <span>Console Errors</span>
             </div>
             <button onClick={() => setLogs([])} className="flex items-center gap-1 text-slate-400 hover:text-white transition bg-slate-800 px-2 py-1 rounded hover:bg-slate-700">
               <Trash2 size={12} /> Clear
             </button>
           </div>
           <div className="space-y-2">
             {logs.map(log => (
               <div key={log.id} className="group relative break-words border-l-2 border-red-500 pl-2 bg-slate-800/30 p-2 rounded hover:bg-slate-800 transition">
                 <div className="text-slate-500 text-[10px] mb-0.5">{log.time}</div>
                 <div className="text-red-300 font-medium whitespace-pre-wrap">{log.message}</div>
               </div>
             ))}
           </div>
        </div>
      )}
    </div>
  );
};