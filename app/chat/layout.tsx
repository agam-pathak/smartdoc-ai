import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";

type ProtectedLayoutProps = {
  children: React.ReactNode;
};

export default async function ChatLayout({ children }: ProtectedLayoutProps) {
  const session = await getSession();

  if (!session) {
    redirect("/auth?redirect=/chat");
  }

  return children;
}
