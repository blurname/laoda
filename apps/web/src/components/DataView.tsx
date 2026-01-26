import React, { useState } from "react";

export const DataView: React.FC = () => {
  const [storageData] = useState<Record<string, any>>(() => {
    const data: Record<string, any> = {};
    if (typeof window === "undefined") return data;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        try {
          data[key] = JSON.parse(localStorage.getItem(key) || "");
        } catch {
          data[key] = localStorage.getItem(key);
        }
      }
    }
    return data;
  });

  return (
    <div className="bg-zinc-50 border border-zinc-300 shadow-sm overflow-hidden h-full flex flex-col">
      <div className="bg-zinc-100 border-b border-zinc-300 px-4 py-2 flex justify-between items-center">
        <h2 className="text-[10px] font-black capitalize tracking-[0.2em] text-zinc-600">Storage_Raw_Data</h2>
        <div className="text-[9px] font-mono text-zinc-400">
          Size: {new Blob([JSON.stringify(storageData)]).size} bytes
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6 font-mono text-[11px] leading-relaxed text-zinc-700 bg-zinc-50/50">
        <pre className="whitespace-pre-wrap">
          {JSON.stringify(storageData, null, 2)}
        </pre>
      </div>
    </div>
  );
};
