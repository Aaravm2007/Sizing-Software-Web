"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function GadPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Loading…</div>}>
      <FileBrowserInner folderKey="gads" title="GAD" />
    </Suspense>
  );
}

function FileBrowserInner({ folderKey, title }: { folderKey: string; title: string }) {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading } = useQuery<{ files: string[] }>({
    queryKey: ["datafiles", folderKey, search],
    queryFn: () =>
      api.get(`/api/datafiles/${folderKey}/files`, { params: { q: search } }).then((r) => r.data),
  });

  const files = data?.files ?? [];

  const handleDownload = async (filename: string) => {
    setDownloading(true);
    try {
      const res = await api.get(
        `/api/datafiles/${folderKey}/files/${encodeURIComponent(filename)}`,
        { responseType: "blob" }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-5 gap-4">
      <h1 className="text-3xl font-bold">{title} Downloader</h1>

      <div className="flex items-center gap-3">
        <Input
          className="w-96"
          placeholder="Search by partcode or filename…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
        />
        {search && (
          <Button variant="ghost" onClick={() => { setSearch(""); setSelected(null); }}>
            Clear
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto border rounded-md">
        <table className="table-grid w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="text-left py-2 px-4">File Name</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td className="text-center py-8 text-muted-foreground">Loading…</td></tr>
            )}
            {!isLoading && files.length === 0 && (
              <tr><td className="text-center py-8 text-muted-foreground">No files found</td></tr>
            )}
            {files.map((f) => (
              <tr
                key={f}
                className={`cursor-pointer hover:bg-accent ${selected === f ? "bg-primary/20" : ""}`}
                onClick={() => setSelected(f)}
                onDoubleClick={() => handleDownload(f)}
              >
                <td className="py-2 px-4">{f}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <Button
          disabled={!selected || downloading}
          onClick={() => selected && handleDownload(selected)}
        >
          {downloading ? "Downloading…" : "Download"}
        </Button>
        <span className="text-xs text-muted-foreground self-center">
          {files.length} file{files.length !== 1 ? "s" : ""} · double-click to download
        </span>
      </div>
    </div>
  );
}
