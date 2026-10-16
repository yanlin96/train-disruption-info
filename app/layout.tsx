import "@fontsource-variable/archivo";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

export const metadata = {
  title: "Line Watch Melbourne",
  description: "A live workplace transport board for Melbourne commuters.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-AU"><body>{children}</body></html>;
}
