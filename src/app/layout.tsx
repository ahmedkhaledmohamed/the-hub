import type { Metadata } from "next";
import "./globals.css";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getClientConfig } from "@/lib/config-client";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getClientConfig();
  return {
    title: config.name,
    description: "A personal command center — your starting point.",
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = await getClientConfig();

  return (
    <html lang="en" className="dark">
      <body className="antialiased flex h-screen overflow-hidden">
        <AppSidebar
          name={config.name}
          tabs={config.tabs}
          defaultTab={config.defaultTab}
        />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
