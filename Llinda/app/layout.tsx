import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Llinda — Why Did My Transaction Fail?",
  description: "Paste a failed tx hash and get the real revert reason in plain English, with a likely fix.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
