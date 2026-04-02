"use client";

import { useState, useEffect } from "react";
import type { Manifest } from "@/lib/types";

export function useManifest() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/manifest")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setManifest)
      .catch((e) => setError(e.message));
  }, []);

  const regenerate = async () => {
    await fetch("/api/regenerate", { method: "POST" });
    const r = await fetch("/api/manifest");
    const m = await r.json();
    setManifest(m);
  };

  return { manifest, error, regenerate };
}
