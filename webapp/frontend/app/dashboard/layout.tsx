"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import {
  Home, BarChart2, DollarSign, FileText, BookOpen,
  Layout, LogOut, FlaskConical, Sun, Moon, FolderOpen, ClipboardCheck, ShieldCheck, Wand2, ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { isAuthenticated, getUsername, api } from "@/lib/api";
import { logout } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Home",      href: "/dashboard",           icon: Home,          expertOnly: false },
  { label: "Sizing",    href: "/dashboard/sizing",    icon: BarChart2,     expertOnly: false },
  { label: "Costing",   href: "/dashboard/costing",   icon: DollarSign,    expertOnly: false },
  { label: "Quote",     href: "/dashboard/quote",     icon: FileText,      expertOnly: false },
  { label: "Datasheet", href: "/dashboard/datasheet", icon: BookOpen,      expertOnly: false },
  { label: "GAD",       href: "/dashboard/gad",       icon: Layout,        expertOnly: false },
  { label: "Masters",   href: "/dashboard/formulas",  icon: FlaskConical,  expertOnly: true  },
  { label: "Project",   href: "/dashboard/project",   icon: FolderOpen,    expertOnly: false },
  { label: "Approvals", href: "/dashboard/approvals", icon: ClipboardCheck, expertOnly: false },
  { label: "Inquiry",   href: "/dashboard/inquiry",   icon: ClipboardList,  expertOnly: false },
  { label: "Wizard",    href: "/dashboard/wizard",    icon: Wand2,          expertOnly: false },
  { label: "Admin",     href: "/dashboard/admin",     icon: ShieldCheck,   expertOnly: true  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [username, setUsername] = useState("");
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    setUsername(getUsername());
  }, [router]);

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get("/api/auth/me").then((r) => r.data),
    enabled: isAuthenticated(),
    staleTime: 0,
  });

  const { data: approvals = [] } = useQuery<any[]>({
    queryKey: ["approvals"],
    queryFn: () => api.get("/api/approvals").then((r) => r.data),
    enabled: isAuthenticated(),
    refetchInterval: 30000,
  });

  const approvalBadge = me?.role === "e"
    ? approvals.filter((t: any) => t.status === "pending").length
    : approvals.filter((t: any) => ["pending", "in_review", "revised", "denied"].includes(t.status)).length;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-48 shrink-0 flex flex-col bg-secondary border-r border-border">
        <div className="px-4 py-5">
          <p className="text-base font-semibold truncate">{username}</p>
        </div>
        <Separator />
        <nav className="flex flex-col gap-1 p-2 flex-1">
          {NAV.filter(({ expertOnly }) => !expertOnly || me?.role === "e").map(({ label, href, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            const badge = label === "Approvals" && approvalBadge > 0 ? approvalBadge : 0;
            return (
              <Link key={href} href={href}>
                <Button
                  variant={active ? "default" : "ghost"}
                  className={cn("w-full justify-start gap-2 text-sm", active && "font-semibold")}
                >
                  <Icon size={15} />
                  <span className="flex-1 text-left">{label}</span>
                  {badge > 0 && (
                    <span className="text-[10px] bg-yellow-500 text-white rounded-full px-1.5 py-0.5 leading-none font-bold">
                      {badge}
                    </span>
                  )}
                </Button>
              </Link>
            );
          })}
        </nav>
        <div className="p-2 flex flex-col gap-1">
          {mounted && (
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-sm"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </Button>
          )}
          <Button
            variant="destructive"
            className="w-full justify-start gap-2 text-sm"
            onClick={logout}
          >
            <LogOut size={15} />
            Logout
          </Button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto bg-background">
        {children}
      </main>
    </div>
  );
}
