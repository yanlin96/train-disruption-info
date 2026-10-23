import "@fontsource-variable/archivo";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "Line Watch Melbourne",
  description: "A live workplace transport board for Melbourne commuters.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
