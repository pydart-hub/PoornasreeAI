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
      } else if (user.role === "service" || user.role === "service_engineer") {
        router.replace("/service");
      } else if (user.role === "service_manager") {
        router.replace("/service-manager");
      } else if (user.role === "dealer") {
        router.replace("/dealer");
      } else {
        router.replace("/chat");
      }
    }
  }, [user, isLoading, router]);

  return <LoadingScreen message="Loading Poornasree AI..." />;
}
