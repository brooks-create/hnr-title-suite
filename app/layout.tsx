import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HNR Title Suite — Huston Energy Corporation",
  description: "Internal mineral acquisition and title research platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
