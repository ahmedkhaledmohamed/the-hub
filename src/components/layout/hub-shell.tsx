"use client";

import { useState, useCallback } from "react";
import { useHubConfig } from "@/components/providers/hub-provider";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { KeyboardHelp } from "./keyboard-help";
import { QuickNotes } from "@/components/quick-notes";
import { NewDocModal } from "@/components/new-doc-modal";

export function HubShell() {
  const config = useHubConfig();
  const [notesOpen, setNotesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [newDocOpen, setNewDocOpen] = useState(false);

  const toggleNotes = useCallback(() => setNotesOpen((v) => !v), []);
  const toggleHelp = useCallback(() => setHelpOpen((v) => !v), []);

  useKeyboardShortcuts({
    tabs: config.tabs,
    onToggleNotes: toggleNotes,
    onToggleHelp: toggleHelp,
  });

  // Expose newDoc opener globally so command palette can trigger it
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__hubOpenNewDoc = () => setNewDocOpen(true);
  }

  return (
    <>
      <QuickNotes open={notesOpen} onClose={() => setNotesOpen(false)} />
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <NewDocModal open={newDocOpen} onClose={() => setNewDocOpen(false)} />
    </>
  );
}
