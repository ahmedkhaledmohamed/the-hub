import type { Metadata } from "next";
import { LibraryReader } from "../../components/library";
import { readGuide, readPublication } from "../../publication";
export const metadata: Metadata = { title: "Personal overview | Personal Hub" };
export default function Page() {
  const { overviewPath } = readPublication();
  const guide = readGuide(overviewPath);
  return guide ? <LibraryReader documentPath={guide.entry.path} initialEntry={guide.entry} initialDocument={guide.document} /> : <div className="library-page"><h1>Personal overview</h1><p>An overview has not been selected for this build.</p><a href="/library/">Browse the Library</a></div>;
}
