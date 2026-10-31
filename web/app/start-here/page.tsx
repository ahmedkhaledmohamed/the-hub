import type { Metadata } from "next";
import { LibraryReader } from "../../components/library";
import { readGuide, readPublication } from "../../publication";
export const metadata: Metadata = { title: "Start here | Personal Hub" };
export default function Page() {
  const { guidePath } = readPublication();
  const guide = readGuide(guidePath);
  return guide ? <LibraryReader documentPath={guide.entry.path} initialEntry={guide.entry} initialDocument={guide.document} /> : <div className="library-page"><h1>Start here</h1><p>A guide has not been selected for this build.</p><a href="/library/">Browse the Library</a></div>;
}
