import type { Toast } from "../hooks/useToast";
import { clsx } from "clsx";

interface Props {
  toasts: Toast[];
  dismiss: (id: number) => void;
}

export function ToastContainer({ toasts, dismiss }: Props) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={clsx(
            "flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg cursor-pointer text-sm font-medium max-w-sm",
            t.kind === "success" && "bg-green-600 text-white",
            t.kind === "error" && "bg-red-600 text-white",
            t.kind === "info" && "bg-gray-800 text-white"
          )}
        >
          <span>{t.kind === "success" ? "✓" : t.kind === "error" ? "✗" : "i"}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
