"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, XCircle, Clock, MessageSquare,
  Send, Loader2, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

type ReviewStatus = "pending" | "approved" | "changes-requested" | "dismissed";

interface ReviewRequest {
  id: number;
  artifactPath: string;
  requestedBy: string;
  reviewer: string;
  status: ReviewStatus;
  message: string;
  responseMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ReviewPanelProps {
  artifactPath: string;
}

const STATUS_CONFIG: Record<ReviewStatus, { label: string; icon: React.ReactNode; color: string }> = {
  pending: { label: "Pending", icon: <Clock className="w-3 h-3" />, color: "text-yellow-400 bg-yellow-900/40" },
  approved: { label: "Approved", icon: <CheckCircle2 className="w-3 h-3" />, color: "text-green-400 bg-green-900/40" },
  "changes-requested": { label: "Changes Requested", icon: <MessageSquare className="w-3 h-3" />, color: "text-orange-400 bg-orange-900/40" },
  dismissed: { label: "Dismissed", icon: <XCircle className="w-3 h-3" />, color: "text-zinc-400 bg-zinc-800" },
};

// ── Component ─────────────────────────────────────────────────────

export function ReviewPanel({ artifactPath }: ReviewPanelProps) {
  const [reviews, setReviews] = useState<ReviewRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [requestedBy, setRequestedBy] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reviews?path=${encodeURIComponent(artifactPath)}`);
      const data = await res.json();
      setReviews(data.reviews || []);
    } catch { /* network error */ }
    setLoading(false);
  }, [artifactPath]);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const createReview = async () => {
    if (!requestedBy.trim() || !reviewer.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          artifactPath,
          requestedBy: requestedBy.trim(),
          reviewer: reviewer.trim(),
          message: message.trim(),
        }),
      });
      setRequestedBy("");
      setReviewer("");
      setMessage("");
      setShowForm(false);
      await loadReviews();
    } catch { /* error */ }
    setSubmitting(false);
  };

  const respondToReview = async (id: number, action: "approve" | "request-changes" | "dismiss") => {
    await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id }),
    });
    await loadReviews();
  };

  const pendingCount = reviews.filter((r) => r.status === "pending").length;

  return (
    <div className="border-t border-border">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-surface-hover transition-colors text-[12px]"
      >
        <span className="flex items-center gap-2 text-text-dim">
          <MessageSquare size={12} />
          Reviews
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-yellow-900/40 text-yellow-400 text-[10px] font-medium">
              {pendingCount} pending
            </span>
          )}
          {reviews.length > 0 && pendingCount === 0 && (
            <span className="text-text-muted">({reviews.length})</span>
          )}
        </span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {/* Existing reviews */}
          {loading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-text-dim" />
            </div>
          ) : reviews.length === 0 ? (
            <p className="text-[11px] text-text-muted py-2">No reviews requested for this document.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {reviews.map((review) => (
                <ReviewItem key={review.id} review={review} onRespond={respondToReview} />
              ))}
            </div>
          )}

          {/* Request review button / form */}
          {showForm ? (
            <div className="space-y-2 pt-1 border-t border-border">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={requestedBy}
                  onChange={(e) => setRequestedBy(e.target.value)}
                  placeholder="Your name"
                  className="px-2 py-1.5 bg-surface border border-border rounded text-[11px] text-text placeholder-text-muted focus:border-accent focus:outline-none"
                />
                <input
                  type="text"
                  value={reviewer}
                  onChange={(e) => setReviewer(e.target.value)}
                  placeholder="Reviewer name"
                  className="px-2 py-1.5 bg-surface border border-border rounded text-[11px] text-text placeholder-text-muted focus:border-accent focus:outline-none"
                />
              </div>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Message (optional)"
                className="w-full px-2 py-1.5 bg-surface border border-border rounded text-[11px] text-text placeholder-text-muted focus:border-accent focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={createReview}
                  disabled={submitting || !requestedBy.trim() || !reviewer.trim()}
                  className="flex items-center gap-1 px-2 py-1 bg-accent text-black rounded text-[11px] font-medium hover:bg-accent/80 disabled:opacity-50 transition-colors"
                >
                  {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  Request
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-2 py-1 text-[11px] text-text-dim hover:text-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-1.5 border border-dashed border-border rounded text-[11px] text-text-dim hover:border-accent hover:text-text transition-colors"
            >
              + Request Review
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Review item ───────────────────────────────────────────────────

function ReviewItem({ review, onRespond }: {
  review: ReviewRequest;
  onRespond: (id: number, action: "approve" | "request-changes" | "dismiss") => void;
}) {
  const config = STATUS_CONFIG[review.status];

  return (
    <div className="bg-surface rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={cn("flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium", config.color)}>
            {config.icon} {config.label}
          </span>
          <span className="text-[10px] text-text-muted">
            {review.requestedBy} → {review.reviewer}
          </span>
        </div>
        <span className="text-[10px] text-text-muted">
          {new Date(review.createdAt).toLocaleDateString()}
        </span>
      </div>
      {review.message && (
        <p className="text-[11px] text-text-dim mt-1">{review.message}</p>
      )}
      {review.responseMessage && (
        <p className="text-[11px] text-text-dim mt-1 italic">Response: {review.responseMessage}</p>
      )}
      {review.status === "pending" && (
        <div className="flex gap-1.5 mt-2">
          <button
            onClick={() => onRespond(review.id, "approve")}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-green-900/30 text-green-400 hover:bg-green-900/50 transition-colors"
          >
            <CheckCircle2 className="w-2.5 h-2.5" /> Approve
          </button>
          <button
            onClick={() => onRespond(review.id, "request-changes")}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-orange-900/30 text-orange-400 hover:bg-orange-900/50 transition-colors"
          >
            <MessageSquare className="w-2.5 h-2.5" /> Changes
          </button>
          <button
            onClick={() => onRespond(review.id, "dismiss")}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors"
          >
            <XCircle className="w-2.5 h-2.5" /> Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
