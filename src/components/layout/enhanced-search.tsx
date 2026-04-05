"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Search, X, Filter, Clock, FileText, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersistedState } from "@/hooks/use-persisted-state";

// ── Types ──────────────────────────────────────────────────────────

interface SearchResult {
  path: string;
  title: string;
  type: string;
  group: string;
  snippet: string;
  score?: number;
  source?: string;
}

interface EnhancedSearchProps {
  value: string;
  onChange: (value: string) => void;
  groups: string[];
  types: string[];
  onGroupFilter?: (group: string | null) => void;
  onTypeFilter?: (type: string | null) => void;
  activeGroup?: string | null;
  activeType?: string | null;
  className?: string;
  /** When true, uses /api/search for server-side FTS5 results */
  serverSearch?: boolean;
  onServerResults?: (results: SearchResult[]) => void;
}

const MAX_RECENT = 8;

// ── Component ─────────────────────────────────────────────────────

export function EnhancedSearch({
  value,
  onChange,
  groups,
  types,
  onGroupFilter,
  onTypeFilter,
  activeGroup,
  activeType,
  className,
  serverSearch,
  onServerResults,
}: EnhancedSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [recentSearches, setRecentSearches] = usePersistedState<string[]>("recent-searches", []);
  const [serverResults, setServerResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        onChange("");
        inputRef.current?.blur();
        setShowRecent(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onChange]);

  // Server-side search with debounce
  useEffect(() => {
    if (!serverSearch || value.length < 3) {
      setServerResults([]);
      onServerResults?.([]);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: value, limit: "20" });
        const res = await fetch(`/api/search?${params}`);
        const data = await res.json();
        setServerResults(data.results || []);
        onServerResults?.(data.results || []);
      } catch {
        setServerResults([]);
      }
      setSearching(false);
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [value, serverSearch, onServerResults]);

  // Track recent searches
  const commitSearch = useCallback((query: string) => {
    if (query.trim().length < 2) return;
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s !== query.trim());
      return [query.trim(), ...filtered].slice(0, MAX_RECENT);
    });
  }, [setRecentSearches]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && value.trim()) {
      commitSearch(value);
      setShowRecent(false);
    }
  };

  const selectRecent = (query: string) => {
    onChange(query);
    setShowRecent(false);
    inputRef.current?.focus();
  };

  const clearRecent = () => {
    setRecentSearches([]);
    setShowRecent(false);
  };

  const activeFilterCount = (activeGroup ? 1 : 0) + (activeType ? 1 : 0);

  return (
    <div className={cn("relative", className)}>
      <div className="flex gap-2">
        {/* Search input */}
        <div className="relative flex-1">
          <Search
            size={14}
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2",
              searching ? "text-accent animate-pulse" : "text-text-dim",
            )}
          />
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => { setFocused(true); if (recentSearches.length > 0 && !value) setShowRecent(true); }}
            onBlur={() => { setFocused(false); setTimeout(() => setShowRecent(false), 200); }}
            onKeyDown={handleKeyDown}
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
              onClick={() => { onChange(""); setServerResults([]); onServerResults?.([]); inputRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-dim hover:text-text"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter button */}
        {(groups.length > 0 || types.length > 0) && (
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-1 px-3 py-2 bg-surface border border-border rounded-md text-[12px] transition-colors",
              showFilters ? "border-accent text-accent" : "text-text-dim hover:border-text-dim",
            )}
          >
            <Filter size={12} />
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-accent/20 text-accent text-[10px] font-medium">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Recent searches dropdown */}
      {showRecent && !value && recentSearches.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-md shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
            <span className="text-[10px] text-text-dim uppercase tracking-wider flex items-center gap-1">
              <Clock size={10} /> Recent
            </span>
            <button onClick={clearRecent} className="text-[10px] text-text-muted hover:text-text">
              Clear
            </button>
          </div>
          {recentSearches.map((query) => (
            <button
              key={query}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectRecent(query)}
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-dim hover:bg-surface-hover transition-colors text-left"
            >
              <Search size={10} className="shrink-0 text-text-muted" />
              <span className="truncate">{query}</span>
            </button>
          ))}
        </div>
      )}

      {/* Server search results dropdown */}
      {serverSearch && value.length >= 3 && serverResults.length > 0 && focused && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-md shadow-lg max-h-72 overflow-y-auto">
          <div className="px-3 py-1.5 border-b border-border">
            <span className="text-[10px] text-text-dim uppercase tracking-wider">
              {serverResults.length} result{serverResults.length !== 1 ? "s" : ""}
            </span>
          </div>
          {serverResults.map((result) => (
            <div
              key={result.path}
              className="px-3 py-2 hover:bg-surface-hover transition-colors cursor-pointer border-b border-border/50 last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase font-semibold px-1 py-0.5 rounded bg-surface-hover text-text-dim">{result.type}</span>
                <span className="text-[12px] font-medium text-text truncate">{result.title}</span>
                {result.score && (
                  <span className="text-[9px] text-text-muted ml-auto shrink-0">{Math.round(result.score * 100)}%</span>
                )}
              </div>
              {result.snippet && (
                <p className="text-[11px] text-text-muted mt-0.5 line-clamp-1">{result.snippet}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filter panel */}
      {showFilters && (
        <div className="absolute z-50 top-full right-0 mt-1 bg-surface border border-border rounded-md shadow-lg p-3 min-w-[240px]">
          {/* Group filter */}
          {groups.length > 0 && (
            <div className="mb-3">
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">Group</label>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => onGroupFilter?.(null)}
                  className={cn(
                    "px-2 py-1 rounded text-[11px] transition-colors",
                    !activeGroup ? "bg-accent text-black font-medium" : "bg-surface-hover text-text-dim hover:text-text",
                  )}
                >
                  All
                </button>
                {groups.map((g) => (
                  <button
                    key={g}
                    onClick={() => onGroupFilter?.(activeGroup === g ? null : g)}
                    className={cn(
                      "px-2 py-1 rounded text-[11px] transition-colors",
                      activeGroup === g ? "bg-accent text-black font-medium" : "bg-surface-hover text-text-dim hover:text-text",
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Type filter */}
          {types.length > 0 && (
            <div>
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">Type</label>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => onTypeFilter?.(null)}
                  className={cn(
                    "px-2 py-1 rounded text-[11px] transition-colors",
                    !activeType ? "bg-accent text-black font-medium" : "bg-surface-hover text-text-dim hover:text-text",
                  )}
                >
                  All
                </button>
                {types.map((t) => (
                  <button
                    key={t}
                    onClick={() => onTypeFilter?.(activeType === t ? null : t)}
                    className={cn(
                      "px-2 py-1 rounded text-[11px] transition-colors",
                      activeType === t ? "bg-accent text-black font-medium" : "bg-surface-hover text-text-dim hover:text-text",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeFilterCount > 0 && (
            <button
              onClick={() => { onGroupFilter?.(null); onTypeFilter?.(null); }}
              className="mt-2 text-[11px] text-text-muted hover:text-text transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
