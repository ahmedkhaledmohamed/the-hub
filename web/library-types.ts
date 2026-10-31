export const libraryExtensions = [".md", ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".csv", ".xlsx", ".docx", ".mmd", ".excalidraw"];
export const educationDownloadExtensions = [".pptx", ".zip", ".rar"];

export interface LibraryEntry {
  id: string;
  path: string;
  title: string;
  category: string;
  categoryTitle: string;
  folder: string;
  format: string;
  kind: "markdown" | "pdf" | "image" | "file";
  bytes: number;
  text: string;
  textSearch?: boolean;
  fileHref?: string;
}

export interface LibraryIndex {
  categories: { id: string; title: string; path: string; count: number }[];
  entries: LibraryEntry[];
}

export interface LibraryDocument {
  html?: string;
  headings?: { id: string; text: string; level: number }[];
  imageData?: string;
}

export const documentHref = (path: string) => `/library/read/?path=${encodeURIComponent(path)}`;
