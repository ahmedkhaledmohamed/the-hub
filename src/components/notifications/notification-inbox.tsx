"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell, CheckCircle2, MessageSquare, GitBranch, FileText,
  RefreshCw, Loader2, Check, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

type NotificationType = "review" | "annotation" | "change" | "decision" | "system";

interface Notification {
  id: number;
  recipient: string;
  type: NotificationType;
  title: string;
  message: string;
  artifactPath: string | null;
  read: boolean;
  createdAt: string;
}

const TYPE_CONFIG: Record<NotificationType, { icon: React.ReactNode; color: string }> = {
  review: { icon: <GitBranch className="w-4 h-4" />, color: "text-blue-400" },
  annotation: { icon: <MessageSquare className="w-4 h-4" />, color: "text-purple-400" },
  change: { icon: <FileText className="w-4 h-4" />, color: "text-green-400" },
  decision: { icon: <GitBranch className="w-4 h-4" />, color: "text-yellow-400" },
  system: { icon: <Bell className="w-4 h-4" />, color: "text-zinc-400" },
};

// ── Component ─────────────────────────────────────────────────────

export function NotificationInbox() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter === "unread" ? "?recipient=default&unread=true" : "?recipient=default";
      const res = await fetch(`/api/notifications${params}`);
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch { /* network error */ }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: number) => {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", id }),
    });
    load();
  };

  const markAllRead = async () => {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read-all", recipient: "default" }),
    });
    load();
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="w-6 h-6 text-blue-400" /> Notifications
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors"
              >
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
            <button onClick={load} className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setFilter("all")}
            className={cn("px-3 py-1.5 rounded-lg text-xs transition-colors", filter === "all" ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400")}
          >
            All
          </button>
          <button
            onClick={() => setFilter("unread")}
            className={cn("px-3 py-1.5 rounded-lg text-xs transition-colors", filter === "unread" ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400")}
          >
            Unread
          </button>
        </div>

        {/* List */}
        {loading && notifications.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            <Bell className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">{filter === "unread" ? "No unread notifications." : "No notifications yet."}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {notifications.map((notif) => {
              const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system;
              return (
                <div
                  key={notif.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 rounded-lg transition-colors",
                    notif.read ? "bg-zinc-900/30" : "bg-zinc-900/70 border border-zinc-800",
                  )}
                >
                  <span className={cn("mt-0.5 shrink-0", config.color)}>{config.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm font-medium", notif.read ? "text-zinc-400" : "text-zinc-200")}>
                        {notif.title}
                      </span>
                      {!notif.read && <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{notif.message}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-zinc-600">
                      <span>{new Date(notif.createdAt).toLocaleString()}</span>
                      {notif.artifactPath && <span className="font-mono">{notif.artifactPath}</span>}
                    </div>
                  </div>
                  {!notif.read && (
                    <button
                      onClick={() => markRead(notif.id)}
                      className="shrink-0 p-1 text-zinc-600 hover:text-blue-400 transition-colors"
                      title="Mark as read"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
