import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amirnet Studio · English practice",
  description: "Twenty full-length English practice tests with timed simulation and guided review.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
