import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insta DM",
  description: "Created by Supriyo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
