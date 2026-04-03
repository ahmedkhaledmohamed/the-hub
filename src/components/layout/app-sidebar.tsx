"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import {
  Calendar, BookOpen, Package, Lock, LayoutGrid,
  type LucideIcon, Layers, ChevronsLeft, ChevronsRight, Sun, GitFork,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TabConfig } from "@/lib/types";
import { usePersistedState } from "@/hooks/use-persisted-state";

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

  const activeTab = pathname === "/" ? defaultTab : pathname.replace("/", "");

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
        {[
          { href: "/briefing", label: "Briefing", Icon: Sun },
          { href: "/repos", label: "Repos", Icon: GitFork },
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
            {!collapsed && label}
          </Link>
        ))}
        <div className={cn("border-b border-border my-1.5", collapsed ? "mx-1" : "mx-2")} />
        {tabs.map((tab) => {
          const Icon = iconMap[tab.icon || "layers"] || Layers;
          const isActive = activeTab === tab.id;
          const href = tab.id === defaultTab ? "/" : `/${tab.id}`;

          return (
            <Link
              key={tab.id}
              href={href}
              title={collapsed ? tab.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md text-[13px] no-underline transition-colors",
                collapsed
                  ? "justify-center px-2 py-2.5"
                  : "px-3 py-2",
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
