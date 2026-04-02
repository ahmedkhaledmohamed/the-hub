"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readPersistedValue } from "@/hooks/use-persisted-state";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const lastTab = readPersistedValue<string>("last-tab", "");
    router.replace(`/${lastTab || "planning"}`);
  }, [router]);

  return null;
}
