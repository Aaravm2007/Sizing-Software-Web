import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Me {
  username: string;
  role: "u" | "e";
}

export function useMe() {
  const { data, isLoading } = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api.get("/api/auth/me").then((r) => r.data),
    staleTime: 0,
  });
  return {
    me: data ?? null,
    isExpert: data?.role === "e",
    username: data?.username ?? "",
    isLoading,
  };
}
