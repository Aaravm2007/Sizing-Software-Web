"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, DollarSign, FileText, BookOpen, Layout, FlaskConical, Archive, FolderOpen, ClipboardCheck, ClipboardList } from "lucide-react";
import { getUsername, api } from "@/lib/api";
import { useMe } from "@/lib/use-me";

const SECTIONS = [
  { label: "Sizing",        href: "/dashboard/sizing",    icon: BarChart2,     desc: "Size battery packs for UPS applications",               expertOnly: false },
  { label: "Costing",       href: "/dashboard/costing",   icon: DollarSign,    desc: "Build and manage costing trees",                        expertOnly: false },
  { label: "Quotation",     href: "/dashboard/quote",     icon: FileText,      desc: "Create, edit, and export customer quotations",          expertOnly: false },
  { label: "Datasheet",     href: "/dashboard/datasheet", icon: BookOpen,      desc: "Browse and download product datasheets",                expertOnly: false },
  { label: "GAD",           href: "/dashboard/gad",       icon: Layout,        desc: "Browse and download General Arrangement Drawings",      expertOnly: false },
  { label: "Masters",       href: "/dashboard/formulas",  icon: FlaskConical,  desc: "Edit cell chemistry voltages and DC→Cell mappings",     expertOnly: true  },
  { label: "Records",       href: "/dashboard/records",   icon: Archive,       desc: "View, restore, and manage saved records",               expertOnly: false },
  { label: "Project",       href: "/dashboard/project",   icon: FolderOpen,    desc: "Bundle records, datasheets and GADs into projects and export as ZIP", expertOnly: false },
  { label: "Approvals",     href: "/dashboard/approvals", icon: ClipboardCheck,  desc: "Submit files for expert review or manage incoming requests", expertOnly: false },
  { label: "Inquiry Sheet", href: "/dashboard/inquiry",   icon: ClipboardList,   desc: "Track UPS inquiries, quotes, pricing, and document status",  expertOnly: false },
];

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  in_review: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  approved:  "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  denied:    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  revised:   "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending", in_review: "In Review", approved: "Approved", denied: "Denied", revised: "Revised",
};

export default function DashboardHome() {
  const [username, setUsername] = useState("");
  const { isExpert } = useMe();
  useEffect(() => { setUsername(getUsername()); }, []);

  const { data: approvals = [] } = useQuery<any[]>({
    queryKey: ["approvals"],
    queryFn: () => api.get("/api/approvals").then((r) => r.data),
    refetchInterval: 30000,
  });

  const previewTickets = isExpert
    ? approvals.filter((t) => t.status === "pending" || t.status === "in_review").slice(0, 5)
    : approvals.filter((t) => t.status !== "approved").slice(0, 5);

  return (
    <div className="p-8 flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Welcome{username ? `, ${username}` : ""}</h1>
        <p className="text-muted-foreground mt-1 text-sm">Select a section to get started.</p>
      </div>

      {/* Approval preview */}
      {previewTickets.length > 0 && (
        <div className="border rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <ClipboardCheck size={15} className="text-primary" />
              {isExpert ? "Pending Approval Requests" : "My Approval Requests"}
            </h2>
            <Link href="/dashboard/approvals" className="text-xs text-primary hover:underline">
              View all →
            </Link>
          </div>
          <table className="table-grid w-full text-xs">
            <thead className="bg-muted">
              <tr>
                <th className="text-left py-1.5 px-2">Name</th>
                <th className="text-center py-1.5 px-2 w-24">Type</th>
                <th className="text-center py-1.5 px-2 w-24">Status</th>
                {isExpert && <th className="text-left py-1.5 px-2 w-24">From</th>}
              </tr>
            </thead>
            <tbody>
              {previewTickets.map((t) => (
                <tr key={t.id} className="hover:bg-accent">
                  <td className="py-1.5 px-2 font-medium truncate max-w-[200px]">{t.name}</td>
                  <td className="py-1 px-2 text-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold capitalize ${STATUS_COLORS[t.type] ?? "bg-muted"}`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="py-1 px-2 text-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${STATUS_COLORS[t.status] ?? ""}`}>
                      {STATUS_LABELS[t.status] ?? t.status}
                    </span>
                  </td>
                  {isExpert && <td className="py-1.5 px-2 text-muted-foreground">{t.submitted_by}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {SECTIONS.filter(({ expertOnly }) => !expertOnly || isExpert).map(({ label, href, icon: Icon, desc }) => (
          <Link key={href} href={href}>
            <div className="border rounded-lg p-5 flex flex-col gap-2 cursor-pointer hover:bg-accent transition-colors h-full">
              <div className="flex items-center gap-2">
                <Icon size={18} className="text-primary" />
                <span className="font-semibold text-sm">{label}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
