"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { LoadingScreen } from "@/components/ui";

const DASHBOARD_ROLES = ["r_and_d", "production", "sales"];

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
      } else if (DASHBOARD_ROLES.includes(user.role)) {
        router.replace("/dashboard");
      } else {
        router.replace("/chat");
      }
    }
  }, [user, isLoading, router]);

  return <LoadingScreen message="Loading Poornasree AI..." />;
}
