"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Calendar, BookOpen, Package, Lock, LayoutGrid,
  type LucideIcon, Layers, ChevronsLeft, ChevronsRight, Sun, GitFork, ShieldCheck, Sparkles, Share2, Settings,
  Activity, Wrench, Link2, GitBranch, Bell, Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TabConfig } from "@/lib/types";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useFeatureStatus } from "@/hooks/use-feature-status";

const iconMap: Record<string, LucideIcon> = {
  calendar: Calendar,
  "book-open": BookOpen,
  book: BookOpen,
  package: Package,
  lock: Lock,
  "layout-grid": LayoutGrid,
  layers: Layers,
};

interface AppSidebarProps {
  name: string;
  tabs: TabConfig[];
  defaultTab: string;
}

export function AppSidebar({ name, tabs, defaultTab }: AppSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = usePersistedState("sidebar-collapsed", false);
  const { aiConfigured, loading: featureLoading } = useFeatureStatus();
  const [hygieneCount, setHygieneCount] = useState<number | null>(null);
  const [notifCount, setNotifCount] = useState<number | null>(null);

  const activeTab = pathname === "/" ? defaultTab : pathname.slice(1);

  // Fetch hygiene finding count + notification count for sidebar badges
  useEffect(() => {
    fetch("/api/hygiene?count=true")
      .then((r) => r.json())
      .then((data) => setHygieneCount(data.total || 0))
      .catch(() => {});
    fetch("/api/notifications?recipient=default&count=true")
      .then((r) => r.json())
      .then((data) => setNotifCount(data.unreadCount || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setCollapsed((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [setCollapsed]);

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

  return (
    <aside
      className={cn(
        "h-screen flex flex-col border-r border-border bg-surface shrink-0 transition-all duration-200 z-10 relative",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div
        className={cn(
          "border-b border-border",
          collapsed ? "px-2 py-5" : "px-4 py-5",
        )}
      >
        <Link
          href="/"
          className="flex items-center gap-3 no-underline justify-center"
        >
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-black font-bold text-sm shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <span className="font-semibold text-sm text-text">{name}</span>
          )}
        </Link>
      </div>

      <nav
        className={cn(
          "flex-1 py-3 flex flex-col gap-0.5",
          collapsed ? "px-1" : "px-2",
        )}
      >
        {/* ── Core (daily use): primary config tabs + key pages ── */}
        {tabs.filter((t) => ["planning", "knowledge", "deliverables"].includes(t.id)).map((tab) => {
          const Icon = iconMap[tab.icon || "layers"] || Layers;
          const isActive = activeTab === tab.id;
          const href = `/${tab.id}`;
          return (
            <Link
              key={tab.id}
              href={href}
              title={collapsed ? tab.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md text-[13px] no-underline transition-colors",
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
                isActive
                  ? "bg-accent text-black font-semibold"
                  : "text-text-dim hover:text-text hover:bg-surface-hover",
              )}
            >
              <Icon size={16} />
              {!collapsed && tab.label}
            </Link>
          );
        })}
        {[
          { href: "/briefing", label: "Briefing", Icon: Sun, needsAI: false },
          { href: "/repos", label: "Repos", Icon: GitFork, needsAI: false },
          { href: "/hygiene", label: "Hygiene", Icon: ShieldCheck, needsAI: false, badge: hygieneCount && hygieneCount > 0 ? hygieneCount : undefined },
        ].map(({ href, label, Icon, needsAI, badge }: { href: string; label: string; Icon: React.ComponentType<{ size: number }>; needsAI: boolean; badge?: number }) => {
          const degraded = needsAI && !aiConfigured && !featureLoading;
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? `${label}${degraded ? " (needs AI)" : ""}` : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md text-[13px] no-underline transition-colors",
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
                pathname === href
                  ? "bg-accent text-black font-semibold"
                  : degraded
                    ? "text-text-muted hover:text-text-dim hover:bg-surface-hover"
                    : "text-text-dim hover:text-text hover:bg-surface-hover",
              )}
            >
              <Icon size={16} />
              {!collapsed && (
                <span className="flex items-center gap-2 flex-1">
                  {label}
                  {badge && !degraded && (
                    <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-orange-900/40 text-orange-400 font-medium">
                      {badge}
                    </span>
                  )}
                </span>
              )}
            </Link>
          );
        })}

        {/* ── Middle: tools + secondary tabs ── */}
        <div className={cn("border-b border-border my-1.5", collapsed ? "mx-1" : "mx-2")} />
        {[
          { href: "/ask", label: "Ask AI", Icon: Sparkles, needsAI: true },
          { href: "/decisions", label: "Decisions", Icon: GitBranch, needsAI: false },
          { href: "/notifications", label: "Inbox", Icon: Bell, needsAI: false, badge: notifCount && notifCount > 0 ? notifCount : undefined },
        ].map(({ href, label, Icon, needsAI, badge }: { href: string; label: string; Icon: React.ComponentType<{ size: number }>; needsAI: boolean; badge?: number }) => {
          const degraded = needsAI && !aiConfigured && !featureLoading;
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? `${label}${degraded ? " (needs AI)" : ""}` : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md text-[13px] no-underline transition-colors",
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
                pathname === href
                  ? "bg-accent text-black font-semibold"
                  : degraded
                    ? "text-text-muted hover:text-text-dim hover:bg-surface-hover"
                    : "text-text-dim hover:text-text hover:bg-surface-hover",
              )}
            >
              <Icon size={16} />
              {!collapsed && (
                <span className="flex items-center gap-2 flex-1">
                  {label}
                  {degraded && (
                    <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-900/40 text-yellow-500 font-medium">
                      AI
                    </span>
                  )}
                  {badge && !degraded && (
                    <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-orange-900/40 text-orange-400 font-medium">
                      {badge}
                    </span>
                  )}
                </span>
              )}
            </Link>
          );
        })}
        {tabs.filter((t) => ["ai-tools", "personal"].includes(t.id)).map((tab) => {
          const Icon = iconMap[tab.icon || "layers"] || Layers;
          const isActive = activeTab === tab.id;
          const href = `/${tab.id}`;
          return (
            <Link
              key={tab.id}
              href={href}
              title={collapsed ? tab.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md text-[13px] no-underline transition-colors",
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
                isActive
                  ? "bg-accent text-black font-semibold"
                  : "text-text-dim hover:text-text hover:bg-surface-hover",
              )}
            >
              <Icon size={16} />
              {!collapsed && tab.label}
            </Link>
          );
        })}

        {/* ── Admin ── */}
        <div className={cn("border-b border-border my-1.5", collapsed ? "mx-1" : "mx-2")} />
        {[
          { href: "/graph", label: "Graph", Icon: Share2 },
          { href: "/mcp-servers", label: "MCP Servers", Icon: Plug },
          { href: "/settings", label: "Settings", Icon: Settings },
        ].map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md text-[13px] no-underline transition-colors",
              collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
              pathname === href
                ? "bg-accent text-black font-semibold"
                : "text-text-dim hover:text-text hover:bg-surface-hover",
            )}
          >
            <Icon size={16} />
            {!collapsed && <span>{label}</span>}
          </Link>
        ))}
        {/* Config tabs now rendered inline in Core and Middle sections above */}
      </nav>

      <div
        className={cn(
          "border-t border-border flex items-center",
          collapsed ? "justify-center px-1 py-3" : "justify-between px-4 py-3",
        )}
      >
        {!collapsed && (
          <span className="text-[11px] text-text-dim flex items-center gap-2">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-surface-hover text-text-muted text-[10px]">⌘K</kbd>{" "}
              search
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-surface-hover text-text-muted text-[10px]">⌘.</kbd>{" "}
              notes
            </span>
          </span>
        )}
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="text-text-dim hover:text-text transition-colors"
          title={collapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
        >
          {collapsed ? (
            <ChevronsRight size={14} />
          ) : (
            <ChevronsLeft size={14} />
          )}
        </button>
      </div>
    </aside>
  );
}
