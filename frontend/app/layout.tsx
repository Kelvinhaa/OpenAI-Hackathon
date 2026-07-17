import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MindMappr – AI Study Assistant",
  description: "Discover study techniques tailored to your learning style",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
