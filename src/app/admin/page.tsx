"use client";

import { useState, useEffect } from "react";
import { Shield, FileText, Clock, Tag } from "lucide-react";

interface DashboardData {
  governance: boolean;
  auditCount: number;
  tags: Array<{ tag: string; count: number }>;
  retentionQueue: number;
  artifactCount: number;
}

export default function AdminPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch("/api/admin")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Shield size={20} className="text-accent" />
        <h1 className="text-lg font-semibold text-text">Governance & Compliance</h1>
      </div>

      {!data ? (
        <div className="text-text-dim text-[13px] animate-pulse">Loading dashboard...</div>
      ) : (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            <StatCard icon={<FileText size={16} />} label="Artifacts" value={data.artifactCount} />
            <StatCard icon={<Clock size={16} />} label="Audit Entries" value={data.auditCount} />
            <StatCard icon={<Tag size={16} />} label="Tagged" value={data.tags.reduce((s, t) => s + t.count, 0)} />
            <StatCard icon={<Shield size={16} />} label="Retention Queue" value={data.retentionQueue} color={data.retentionQueue > 0 ? "#ef4444" : undefined} />
          </div>

          {/* Compliance Tags */}
          {data.tags.length > 0 && (
            <section>
              <h2 className="text-[14px] font-semibold text-text-muted mb-3">Compliance Tags</h2>
              <div className="flex flex-wrap gap-2">
                {data.tags.map((t) => (
                  <span key={t.tag} className="text-[12px] px-3 py-1.5 bg-surface border border-border rounded-full text-text-muted">
                    {t.tag} <span className="text-text-dim">({t.count})</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Governance status */}
          <section>
            <h2 className="text-[14px] font-semibold text-text-muted mb-3">Status</h2>
            <div className="bg-surface border border-border rounded-md p-4 text-[13px] text-text-muted">
              {data.governance ? (
                <p>Governance is <span className="text-accent font-medium">enabled</span>. Audit logging active.</p>
              ) : (
                <p>Governance is <span className="text-text-dim">not configured</span>. Add a <code className="bg-surface-hover px-1 rounded">governance</code> section to hub.config.ts to enable.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color?: string }) {
  return (
    <div className="bg-surface border border-border rounded-md px-4 py-3">
      <div className="flex items-center gap-2 text-text-dim mb-1">
        {icon}
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold" style={{ color: color || "var(--text)" }}>{value}</div>
    </div>
  );
}
