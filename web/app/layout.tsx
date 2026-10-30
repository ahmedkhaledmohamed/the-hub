import type { Metadata } from "next";
import "./globals.css";
import "./library.css";

export const metadata: Metadata = {
  title: "Ahmed’s Personal Hub",
  description: "Projects, tools, pages, and visualizations in one place.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>
    <header className="hub-header"><a href="/">Ahmed’s Personal Hub</a><nav aria-label="Hub navigation"><a href="/">Start</a><a href="/library/">Library</a></nav></header>
    <main>{children}</main>
  </body></html>;
}
