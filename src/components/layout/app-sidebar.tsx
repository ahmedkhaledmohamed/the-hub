"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Calendar, BookOpen, Package, Lock, LayoutGrid,
  type LucideIcon, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TabConfig } from "@/lib/types";

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

  const activeTab = pathname === "/"
    ? defaultTab
    : pathname.replace("/", "");

  return (
    <aside className="w-56 h-screen flex flex-col border-r border-border bg-surface shrink-0">
      <div className="px-4 py-5 border-b border-border">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-black font-bold text-sm shrink-0">
            {name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
          </div>
          <span className="font-semibold text-sm text-text">{name}</span>
        </Link>
      </div>

      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5">
        {tabs.map((tab) => {
          const Icon = iconMap[tab.icon || "layers"] || Layers;
          const isActive = activeTab === tab.id;
          const href = tab.id === defaultTab ? "/" : `/${tab.id}`;

          return (
            <Link
              key={tab.id}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-[13px] no-underline transition-colors",
                isActive
                  ? "bg-accent text-black font-semibold"
                  : "text-text-dim hover:text-text hover:bg-surface-hover",
              )}
            >
              <Icon size={16} />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-border text-[11px] text-text-dim">
        Press <kbd className="px-1 py-0.5 rounded bg-surface-hover text-text-muted text-[10px]">/</kbd> to search
      </div>
    </aside>
  );
}
