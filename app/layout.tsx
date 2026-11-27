import type { Metadata } from "next";
import { LanguageProvider } from "@/components/language-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkDeviceGate } from "@/components/work-device-gate";
import { WorkspacePresenceProvider } from "@/components/workspace-presence";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "DRIKAPEX Internal",
  description: "Không gian làm việc nội bộ và quản trị Drikapex.",
  icons: {
    icon: "/office.png",
    apple: "/office.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        <Script id="drikapex-theme-init" strategy="beforeInteractive">
          {`document.documentElement.dataset.theme = localStorage.getItem("drikapex-theme") === "dark" ? "dark" : "light";`}
        </Script>
        <LanguageProvider>
          <WorkDeviceGate><WorkspacePresenceProvider>{children}</WorkspacePresenceProvider></WorkDeviceGate>
          <ThemeToggle />
        </LanguageProvider>
      </body>
    </html>
  );
}
