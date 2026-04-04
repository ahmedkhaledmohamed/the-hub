"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface GraphNode {
  id: string;
  title: string;
  group: string;
  type: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  linkType: string;
}

const GROUP_COLORS: Record<string, string> = {
  docs: "#3b82f6",
  planning: "#22c55e",
  strategy: "#f59e0b",
  knowledge: "#a855f7",
  code: "#ec4899",
  other: "#6b7280",
};

function getColor(group: string): string {
  return GROUP_COLORS[group] || GROUP_COLORS.other;
}

const EDGE_COLORS: Record<string, string> = {
  references: "#4b5563",
  supersedes: "#ef4444",
  related: "#6366f1",
};

export default function GraphPage() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [totalLinks, setTotalLinks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const fetchGraph = useCallback(async (sync = false) => {
    setLoading(true);
    try {
      const url = sync ? "/api/graph?sync=true" : "/api/graph";
      if (sync) await fetch(url);
      const res = await fetch("/api/graph");
      const data = await res.json();
      // Initialize positions randomly
      const w = 800, h = 600;
      const initialized = (data.nodes || []).map((n: GraphNode) => ({
        ...n,
        x: Math.random() * w,
        y: Math.random() * h,
        vx: 0,
        vy: 0,
      }));
      setNodes(initialized);
      setEdges(data.edges || []);
      setTotalLinks(data.totalLinks || 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  // Simple force simulation
  useEffect(() => {
    if (nodes.length === 0) return;

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const w = canvasRef.current?.width || 800;
    const h = canvasRef.current?.height || 600;

    let iteration = 0;
    const maxIterations = 200;

    function simulate() {
      if (iteration >= maxIterations) return;
      iteration++;

      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = (b.x || 0) - (a.x || 0);
          const dy = (b.y || 0) - (a.y || 0);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 500 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx = (a.vx || 0) - fx;
          a.vy = (a.vy || 0) - fy;
          b.vx = (b.vx || 0) + fx;
          b.vy = (b.vy || 0) + fy;
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;
        const dx = (b.x || 0) - (a.x || 0);
        const dy = (b.y || 0) - (a.y || 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 120) * 0.01;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx = (a.vx || 0) + fx;
        a.vy = (a.vy || 0) + fy;
        b.vx = (b.vx || 0) - fx;
        b.vy = (b.vy || 0) - fy;
      }

      // Center gravity
      for (const node of nodes) {
        node.vx = (node.vx || 0) + ((w / 2) - (node.x || 0)) * 0.001;
        node.vy = (node.vy || 0) + ((h / 2) - (node.y || 0)) * 0.001;
      }

      // Apply velocity with damping
      const damping = 0.85;
      for (const node of nodes) {
        node.vx = (node.vx || 0) * damping;
        node.vy = (node.vy || 0) * damping;
        node.x = Math.max(20, Math.min(w - 20, (node.x || 0) + (node.vx || 0)));
        node.y = Math.max(20, Math.min(h - 20, (node.y || 0) + (node.vy || 0)));
      }

      draw();
      animRef.current = requestAnimationFrame(simulate);
    }

    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, w, h);

      // Draw edges
      for (const edge of edges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x || 0, a.y || 0);
        ctx.lineTo(b.x || 0, b.y || 0);
        ctx.strokeStyle = EDGE_COLORS[edge.linkType] || "#333";
        ctx.lineWidth = hoveredNode && (edge.source === hoveredNode || edge.target === hoveredNode) ? 2 : 0.5;
        ctx.globalAlpha = hoveredNode && (edge.source !== hoveredNode && edge.target !== hoveredNode) ? 0.15 : 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Draw nodes
      for (const node of nodes) {
        const isHovered = node.id === hoveredNode;
        const isConnected = hoveredNode && edges.some(
          (e) => (e.source === hoveredNode && e.target === node.id) || (e.target === hoveredNode && e.source === node.id)
        );
        const dimmed = hoveredNode && !isHovered && !isConnected;

        ctx.beginPath();
        ctx.arc(node.x || 0, node.y || 0, isHovered ? 8 : 5, 0, Math.PI * 2);
        ctx.fillStyle = getColor(node.group);
        ctx.globalAlpha = dimmed ? 0.2 : 1;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Label
        if (isHovered || nodes.length < 20) {
          ctx.font = isHovered ? "bold 11px system-ui" : "10px system-ui";
          ctx.fillStyle = dimmed ? "#333" : "#ccc";
          ctx.textAlign = "center";
          ctx.fillText(node.title.slice(0, 25), node.x || 0, (node.y || 0) + (isHovered ? 18 : 15));
        }
      }
    }

    animRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes, edges, hoveredNode]);

  // Mouse hover detection
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let found: string | null = null;
    for (const node of nodes) {
      const dx = (node.x || 0) - mx;
      const dy = (node.y || 0) - my;
      if (Math.sqrt(dx * dx + dy * dy) < 10) {
        found = node.id;
        break;
      }
    }
    setHoveredNode(found);
  }, [nodes]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hoveredNode) {
      window.open(`/api/file/${hoveredNode}`, "_blank");
    }
  }, [hoveredNode]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Share2 size={20} className="text-accent" />
        <h1 className="text-lg font-semibold text-text">Knowledge Graph</h1>
        <span className="text-[11px] text-text-dim ml-auto">
          {nodes.length} nodes &middot; {totalLinks} links
        </span>
        <button
          onClick={() => fetchGraph(true)}
          disabled={loading}
          className="flex items-center gap-1.5 text-[11px] text-text-dim hover:text-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Sync wiki-links
        </button>
      </div>

      {nodes.length === 0 && !loading ? (
        <div className="text-center py-16 text-text-dim text-[13px]">
          <Share2 size={24} className="mx-auto mb-3" />
          <p>No links found. Add <code className="bg-surface-hover px-1 rounded">[[wiki-links]]</code> in your markdown files,</p>
          <p className="mt-1">or click &quot;Sync wiki-links&quot; to scan for existing ones.</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="w-full"
            style={{ cursor: hoveredNode ? "pointer" : "default" }}
            onMouseMove={handleMouseMove}
            onClick={handleClick}
          />
          <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-text-dim">
            {Object.entries(EDGE_COLORS).map(([type, color]) => (
              <span key={type} className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded" style={{ backgroundColor: color }} />
                {type}
              </span>
            ))}
            <span className="ml-4">Click a node to open the artifact</span>
          </div>
        </div>
      )}
    </div>
  );
}
