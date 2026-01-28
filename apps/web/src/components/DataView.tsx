import React, { useState, useRef, useEffect } from "react";

export const DataView: React.FC = () => {
  const [isImporting, setIsImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [isCopying, setIsCopying] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

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

  const handleImport = () => {
    try {
      const data = JSON.parse(importText);
      if (typeof data !== "object" || data === null) {
        throw new Error("Data must be a valid JSON object.");
      }

      // Clear existing storage to avoid pollution
      // localStorage.clear(); 
      // Actually, we should probably only overwrite keys that we manage.
      
      Object.entries(data).forEach(([key, value]) => {
        localStorage.setItem(key, JSON.stringify(value));
      });

      window.location.reload();
    } catch (err: any) {
      alert("Import failed: " + err.message);
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(storageData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `laoda_storage_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    if (isCopying) return;
    
    // 清除之前的定时器
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = null;
    }
    
    setIsCopying(true);
    try {
      const jsonText = JSON.stringify(storageData, null, 2);
      await navigator.clipboard.writeText(jsonText);
      // 复制成功后，设置定时器重置状态
      copyTimeoutRef.current = setTimeout(() => {
        setIsCopying(false);
        copyTimeoutRef.current = null;
      }, 2000);
    } catch (err) {
      console.error("Copy failed:", err);
      setIsCopying(false);
      copyTimeoutRef.current = null;
    }
  };

  return (
    <div className="bg-zinc-50 border border-zinc-300 shadow-sm overflow-hidden h-full flex flex-col">
      <div className="bg-zinc-100 border-b border-zinc-300 px-4 py-2 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-[10px] font-black tracking-[0.2em] text-zinc-600">Storage raw data</h2>
          <div className="text-[9px] font-mono text-zinc-400">
            Size: {new Blob([JSON.stringify(storageData)]).size} bytes
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isImporting ? (
            <>
              <button 
                onClick={() => setIsImporting(false)}
                className="px-3 py-1 text-[9px] font-black tracking-widest text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
              <button 
                onClick={handleImport}
                className="px-3 py-1 bg-zinc-700 text-zinc-100 text-[9px] font-black tracking-widest border border-zinc-800 shadow-sm active:bg-zinc-800 active:shadow-none transition-all"
              >
                Confirm import
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={handleCopy}
                disabled={isCopying}
                className={`px-3 py-1 text-[9px] font-black tracking-widest border transition-all ${
                  isCopying
                    ? "bg-zinc-500 text-zinc-100 border-zinc-600"
                    : "bg-zinc-200 text-zinc-600 border-zinc-300 hover:bg-zinc-300 active:bg-zinc-400"
                }`}
              >
                {isCopying ? "Copied" : "Copy data"}
              </button>
              <button 
                onClick={handleExport}
                className="px-3 py-1 bg-zinc-200 text-zinc-600 text-[9px] font-black tracking-widest border border-zinc-300 hover:bg-zinc-300 active:bg-zinc-400 transition-all"
              >
                Export data
              </button>
              <button 
                onClick={() => setIsImporting(true)}
                className="px-3 py-1 bg-zinc-200 text-zinc-600 text-[9px] font-black tracking-widest border border-zinc-300 hover:bg-zinc-300 active:bg-zinc-400 transition-all"
              >
                Import data
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {isImporting ? (
          <textarea
            autoFocus
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste your JSON data here..."
            className="w-full h-full p-6 font-mono text-[11px] leading-relaxed text-zinc-700 bg-zinc-50 focus:outline-none resize-none"
          />
        ) : (
          <div className="h-full overflow-auto p-6 font-mono text-[11px] leading-relaxed text-zinc-700 bg-zinc-50/50">
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(storageData, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
