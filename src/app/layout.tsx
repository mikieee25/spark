import type { Metadata } from "next";
import { PRODUCT } from "@/lib/product";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: { default: PRODUCT.name, template: `%s · ${PRODUCT.shortName}` },
  description: PRODUCT.description,
  icons: {
    icon: "/spark-icon.svg",
    shortcut: "/spark-icon.svg",
    apple: "/spark-icon.svg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("h-full antialiased", "font-sans", geist.variable)} suppressHydrationWarning>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
