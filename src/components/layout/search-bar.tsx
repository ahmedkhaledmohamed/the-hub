"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SearchBar({ value, onChange, className }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "/" && document.activeElement !== inputRef.current) {
      e.preventDefault();
      inputRef.current?.focus();
    }
    if (e.key === "Escape" && document.activeElement === inputRef.current) {
      onChange("");
      inputRef.current?.blur();
    }
  }, [onChange]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className={cn("relative", className)}>
      <Search
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Search artifacts... ( / )"
        className={cn(
          "w-full pl-9 pr-8 py-2 bg-surface border border-border rounded-md",
          "text-[13px] text-text outline-none transition-colors",
          focused ? "border-accent" : "hover:border-text-dim",
        )}
        autoComplete="off"
      />
      {value && (
        <button
          onClick={() => { onChange(""); inputRef.current?.focus(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-dim hover:text-text"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
