import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ahmed’s Personal Hub",
  description: "Projects, tools, pages, and visualizations in one place.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>
    <div className="border-b border-border px-5 py-4 text-sm font-medium sm:px-9">Ahmed’s Personal Hub</div>
    <main>{children}</main>
  </body></html>;
}
