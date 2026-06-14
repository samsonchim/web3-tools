import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Transaction What-If Simulator",
  description: "Git-diff for blockchain transactions. Replay any tx with gas, slippage, and block-delay overrides on a local Anvil fork.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
