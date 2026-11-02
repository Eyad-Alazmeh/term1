import type { ReactNode } from "react";

export const inputCls =
  "w-full rounded-xl border border-[#d8d5ce] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1a7f4b] focus:ring-2 focus:ring-[#1a7f4b]/15";

export const btnPrimary =
  "rounded-xl bg-[#141413] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#2a2a28] disabled:cursor-not-allowed disabled:opacity-40";

export const btnGhost =
  "rounded-xl border border-[#d8d5ce] px-4 py-2.5 text-sm font-semibold text-[#3c3b37] transition-colors hover:bg-white disabled:opacity-40";

export const btnDanger =
  "rounded-lg px-3 py-1.5 text-xs font-semibold text-[#db3356] transition-colors hover:bg-[#fdf0f3]";

export const btnEdit =
  "rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1a5fb4] transition-colors hover:bg-[#eef4fc]";

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#d8d5ce] px-4 py-10 text-center text-sm text-[#8a887f]">
      {text}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mt-3 rounded-lg bg-[#fdf0f3] px-3 py-2 text-sm font-medium text-[#db3356]">
      {message}
    </p>
  );
}
