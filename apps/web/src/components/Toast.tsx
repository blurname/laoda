import React from "react";
import { useAtom } from "jotai";
import { toastsAtom } from "../store/atoms";

export const ToastContainer: React.FC = () => {
  const [toasts] = useAtom(toastsAtom);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-[72px] right-6 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-2.5 border shadow-lg flex items-center gap-3 min-w-[200px] transition-all animate-in slide-in-from-top-4 duration-300 ${
            toast.type === "loading"
              ? "bg-zinc-800 border-zinc-700 text-zinc-100"
              : toast.type === "success"
              ? "bg-green-600 border-green-700 text-white"
              : "bg-red-600 border-red-700 text-white"
          }`}
        >
          {toast.type === "loading" && (
            <div className="w-3 h-3 border-2 border-zinc-400 border-t-zinc-100 rounded-full animate-spin" />
          )}
          <span className="text-[11px] font-black tracking-widest">
            {toast.message}
          </span>
        </div>
      ))}
    </div>
  );
};
