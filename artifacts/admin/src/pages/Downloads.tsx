import { useQuery } from "@tanstack/react-query";
import { getAdminKey } from "@/lib/adminAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Monitor, Smartphone, Download, CheckCircle2, AlertCircle, Copy, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DownloadEntry {
  available: boolean;
  filename: string;
  sizeBytes: number;
  sizeMB: number;
  platform?: string;
  downloadUrl: string;
}

interface DownloadInfo {
  available: boolean;
  windows64: DownloadEntry;
  windows32: DownloadEntry;
  android: DownloadEntry;
}

function useDownloadInfo() {
  return useQuery<DownloadInfo>({
    queryKey: ["download-info"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/download/info`, {
        headers: { "x-admin-api-key": getAdminKey() || "" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
}

function resolveDownloadUrl(relativeOrAbsolute: string): string {
  if (relativeOrAbsolute.startsWith("http")) return relativeOrAbsolute;
  return `${window.location.origin}${relativeOrAbsolute}`;
}

function DownloadCard({
  icon,
  title,
  description,
  entry,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  entry: DownloadEntry | undefined;
}) {
  const loading = !entry;
  const available = entry?.available ?? false;
  const downloadHref = entry?.downloadUrl ? resolveDownloadUrl(entry.downloadUrl) : undefined;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              {icon}
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-5 w-16" />
          ) : available ? (
            <Badge variant="default" className="gap-1 flex-shrink-0">
              <CheckCircle2 className="h-3 w-3" />
              Ready
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1 flex-shrink-0">
              <AlertCircle className="h-3 w-3" />
              Unavailable
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-end gap-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : entry ? (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="font-mono text-xs truncate">{entry.filename}</p>
            <p>{entry.sizeMB} MB</p>
          </div>
        ) : null}

        {available && downloadHref ? (
          <a
            href={downloadHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        ) : (
          <Button className="w-full gap-2" disabled>
            <Download className="h-4 w-4" />
            {loading ? "Loading…" : "Unavailable"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function CopyableLinkRow({ label, href }: { label: string; href: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex items-start gap-2 group">
      <div className="flex-1 min-w-0">
        <span className="text-foreground font-medium">{label}: </span>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
        >
          {href}
        </a>
      </div>
      <div className="flex gap-1 flex-shrink-0 mt-0.5">
        <button
          onClick={copy}
          title="Copy link"
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in new tab"
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

export function Downloads() {
  const { data, isLoading, error } = useDownloadInfo();
  const origin = window.location.origin;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Downloads</h1>
        <p className="text-muted-foreground mt-1">
          Latest Al Salik POS installers — always version 2.0.0.
        </p>
      </div>

      {error ? (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-6 flex flex-col items-center text-center space-y-2">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive/80">
              Could not load download info. Check your connection and API key.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DownloadCard
            icon={<Monitor className="h-5 w-5 text-primary" />}
            title="Windows 64-bit"
            description="Windows 10 / 11 (64-bit)"
            entry={isLoading ? undefined : data?.windows64}
          />
          <DownloadCard
            icon={<Monitor className="h-5 w-5 text-primary" />}
            title="Windows 32-bit"
            description="Windows 7 SP1+ / 10 / 11 (32-bit)"
            entry={isLoading ? undefined : data?.windows32}
          />
          <DownloadCard
            icon={<Smartphone className="h-5 w-5 text-primary" />}
            title="Android APK"
            description="Android 6.0+ (direct install)"
            entry={isLoading ? undefined : data?.android}
          />
        </div>
      )}

      <Card className="bg-muted/40 border-dashed">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm font-medium text-foreground mb-3">
            Direct download links — share these with your customers:
          </p>
          <div className="space-y-2 font-mono text-xs text-muted-foreground">
            <CopyableLinkRow label="Windows 64-bit" href={`${origin}/api/download/installer`} />
            <CopyableLinkRow label="Windows 32-bit" href={`${origin}/api/download/installer-32`} />
            <CopyableLinkRow label="Android APK" href={`${origin}/api/download/apk`} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
