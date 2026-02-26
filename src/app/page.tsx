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
      router.replace(user ? "/chat" : "/login");
    }
  }, [user, isLoading, router]);

  return <LoadingScreen message="Loading Poornasree AI..." />;
}
