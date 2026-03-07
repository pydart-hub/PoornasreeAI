"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { LoadingScreen } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace("/login");
      } else if (user.role === "customer") {
        router.replace("/customer");
      } else if (user.role === "admin") {
        router.replace("/admin");
      } else if (user.role === "service") {
        router.replace("/service");
      } else {
        router.replace("/chat");
      }
    }
  }, [user, isLoading, router]);

  return <LoadingScreen message="Loading Poornasree AI..." />;
}
