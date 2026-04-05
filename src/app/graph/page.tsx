"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { RefreshCw, Share2, Search, X, ZoomIn, ZoomOut, Maximize2, Info } from "lucide-react";
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
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatch, setSearchMatch] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [enabledEdgeTypes, setEnabledEdgeTypes] = useState<Set<string>>(new Set(["references", "supersedes", "related"]));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const fetchGraph = useCallback(async (sync = false) => {
    setLoading(true);
    try {
      const url = sync ? "/api/graph?sync=true" : "/api/graph";
      if (sync) await fetch(url);
      const res = await fetch("/api/graph");
      const data = await res.json();
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

  // Filtered edges based on enabled types
  const filteredEdges = useMemo(
    () => edges.filter((e) => enabledEdgeTypes.has(e.linkType)),
    [edges, enabledEdgeTypes],
  );

  // Search: highlight matching node
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchMatch(null); return; }
    const q = searchQuery.toLowerCase();
    const match = nodes.find((n) => n.title.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
    setSearchMatch(match?.id || null);
  }, [searchQuery, nodes]);

  // Selected node details
  const selectedNodeData = useMemo(() => {
    if (!selectedNode) return null;
    const node = nodes.find((n) => n.id === selectedNode);
    if (!node) return null;
    const inbound = filteredEdges.filter((e) => e.target === selectedNode);
    const outbound = filteredEdges.filter((e) => e.source === selectedNode);
    return { node, inbound, outbound };
  }, [selectedNode, nodes, filteredEdges]);

  // Force simulation
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

      for (const edge of filteredEdges) {
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

      for (const node of nodes) {
        node.vx = (node.vx || 0) + ((w / 2) - (node.x || 0)) * 0.001;
        node.vy = (node.vy || 0) + ((h / 2) - (node.y || 0)) * 0.001;
      }

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
      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(zoom, zoom);

      const highlight = hoveredNode || selectedNode || searchMatch;

      // Draw edges
      for (const edge of filteredEdges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x || 0, a.y || 0);
        ctx.lineTo(b.x || 0, b.y || 0);
        ctx.strokeStyle = EDGE_COLORS[edge.linkType] || "#333";
        ctx.lineWidth = highlight && (edge.source === highlight || edge.target === highlight) ? 2 : 0.5;
        ctx.globalAlpha = highlight && (edge.source !== highlight && edge.target !== highlight) ? 0.15 : 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Draw nodes
      for (const node of nodes) {
        const isHighlighted = node.id === highlight;
        const isConnected = highlight && filteredEdges.some(
          (e) => (e.source === highlight && e.target === node.id) || (e.target === highlight && e.source === node.id),
        );
        const dimmed = highlight && !isHighlighted && !isConnected;
        const isSearchMatch = node.id === searchMatch;

        ctx.beginPath();
        const radius = isHighlighted ? 8 : isSearchMatch ? 7 : 5;
        ctx.arc(node.x || 0, node.y || 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = getColor(node.group);
        ctx.globalAlpha = dimmed ? 0.2 : 1;
        ctx.fill();

        // Search match ring
        if (isSearchMatch && !isHighlighted) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.globalAlpha = 1;

        // Label
        if (isHighlighted || isSearchMatch || nodes.length < 20) {
          ctx.font = isHighlighted ? "bold 11px system-ui" : "10px system-ui";
          ctx.fillStyle = dimmed ? "#333" : "#ccc";
          ctx.textAlign = "center";
          ctx.fillText(node.title.slice(0, 25), node.x || 0, (node.y || 0) + (isHighlighted ? 18 : 15));
        }
      }

      ctx.restore();
    }

    animRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes, filteredEdges, hoveredNode, selectedNode, searchMatch, zoom, panX, panY]);

  // Mouse interactions
  const screenToCanvas = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - panX) / zoom,
      y: (e.clientY - rect.top - panY) / zoom,
    };
  }, [zoom, panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning.current) {
      setPanX((prev) => prev + e.clientX - lastMouse.current.x);
      setPanY((prev) => prev + e.clientY - lastMouse.current.y);
      lastMouse.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const { x, y } = screenToCanvas(e);
    let found: string | null = null;
    for (const node of nodes) {
      const dx = (node.x || 0) - x;
      const dy = (node.y || 0) - y;
      if (Math.sqrt(dx * dx + dy * dy) < 10) {
        found = node.id;
        break;
      }
    }
    setHoveredNode(found);
  }, [nodes, screenToCanvas]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey)) {
      isPanning.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  }, []);

  const handleMouseUp = useCallback(() => { isPanning.current = false; }, []);

  const handleClick = useCallback(() => {
    if (hoveredNode) {
      setSelectedNode(hoveredNode === selectedNode ? null : hoveredNode);
    } else {
      setSelectedNode(null);
    }
  }, [hoveredNode, selectedNode]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.max(0.3, Math.min(3, prev * delta)));
  }, []);

  const toggleEdgeType = (type: string) => {
    setEnabledEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const resetView = () => { setZoom(1); setPanX(0); setPanY(0); };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
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
          Sync
        </button>
      </div>

      {/* Controls bar */}
      <div className="flex items-center gap-3 mb-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Find node..."
            className="w-full pl-8 pr-7 py-1.5 bg-surface border border-border rounded text-[12px] text-text placeholder-text-muted focus:border-accent focus:outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-dim">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Edge type toggles */}
        <div className="flex items-center gap-1.5">
          {Object.entries(EDGE_COLORS).map(([type, color]) => (
            <button
              key={type}
              onClick={() => toggleEdgeType(type)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors",
                enabledEdgeTypes.has(type)
                  ? "border-transparent opacity-100"
                  : "border-border opacity-40",
              )}
            >
              <span className="w-2.5 h-0.5 rounded" style={{ backgroundColor: color }} />
              {type}
            </button>
          ))}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setZoom((z) => Math.min(3, z * 1.2))} className="p-1 text-text-dim hover:text-text" title="Zoom in">
            <ZoomIn size={14} />
          </button>
          <span className="text-[10px] text-text-dim w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.max(0.3, z * 0.8))} className="p-1 text-text-dim hover:text-text" title="Zoom out">
            <ZoomOut size={14} />
          </button>
          <button onClick={resetView} className="p-1 text-text-dim hover:text-text" title="Reset view">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {nodes.length === 0 && !loading ? (
        <div className="text-center py-16 text-text-dim text-[13px]">
          <Share2 size={24} className="mx-auto mb-3" />
          <p>No links found. Add <code className="bg-surface-hover px-1 rounded">[[wiki-links]]</code> in your markdown files,</p>
          <p className="mt-1">or click &quot;Sync&quot; to scan for existing ones.</p>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Canvas */}
          <div className="flex-1 bg-surface border border-border rounded-lg overflow-hidden">
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              className="w-full"
              style={{ cursor: hoveredNode ? "pointer" : isPanning.current ? "grabbing" : "grab" }}
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={handleClick}
              onWheel={handleWheel}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>

          {/* Node inspector */}
          {selectedNodeData && (
            <div className="w-64 bg-surface border border-border rounded-lg p-4 shrink-0 max-h-[600px] overflow-y-auto">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: getColor(selectedNodeData.node.group) }} />
                <h3 className="text-[13px] font-semibold text-text truncate">{selectedNodeData.node.title}</h3>
              </div>
              <div className="space-y-1.5 text-[11px] text-text-dim mb-3">
                <div><span className="text-text-muted">Path:</span> {selectedNodeData.node.id}</div>
                <div><span className="text-text-muted">Group:</span> {selectedNodeData.node.group}</div>
                <div><span className="text-text-muted">Type:</span> {selectedNodeData.node.type}</div>
              </div>

              {selectedNodeData.outbound.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Links to ({selectedNodeData.outbound.length})</h4>
                  {selectedNodeData.outbound.map((e, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedNode(e.target)}
                      className="w-full text-left text-[11px] text-text-dim hover:text-accent py-0.5 truncate transition-colors"
                    >
                      <span className="inline-block w-2 h-0.5 rounded mr-1.5" style={{ backgroundColor: EDGE_COLORS[e.linkType] }} />
                      {nodes.find((n) => n.id === e.target)?.title || e.target}
                    </button>
                  ))}
                </div>
              )}

              {selectedNodeData.inbound.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Linked from ({selectedNodeData.inbound.length})</h4>
                  {selectedNodeData.inbound.map((e, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedNode(e.source)}
                      className="w-full text-left text-[11px] text-text-dim hover:text-accent py-0.5 truncate transition-colors"
                    >
                      <span className="inline-block w-2 h-0.5 rounded mr-1.5" style={{ backgroundColor: EDGE_COLORS[e.linkType] }} />
                      {nodes.find((n) => n.id === e.source)?.title || e.source}
                    </button>
                  ))}
                </div>
              )}

              <a
                href={`/api/file/${selectedNodeData.node.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-[11px] px-3 py-1.5 bg-accent/20 text-accent rounded hover:bg-accent/30 transition-colors no-underline"
              >
                Open artifact
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
