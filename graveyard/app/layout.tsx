import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NFT Graveyard — here lie the dead chains",
  description: "Dead NFT collections, abandoned DAOs, rug pulls and inactive protocols. Last activity, treasury remaining, cause of death.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
