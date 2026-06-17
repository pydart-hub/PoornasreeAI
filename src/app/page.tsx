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
        } else if (user.role === "sales") {
          router.replace("/sales");
        } else if (user.role === "marketing") {
          router.replace("/marketing");
        } else if (user.role === "customer_service") {
          router.replace("/customer-service");
        } else if (user.role === "customer_support") {
          router.replace("/support-dashboard");
        } else if (user.role === "assistant_service_manager") {
          router.replace("/assistant-manager");
        } else {
          router.replace("/login");
        }
      }
  }, [user, isLoading, router]);

  return <LoadingScreen message="Loading Poornasree AI..." />;
}
