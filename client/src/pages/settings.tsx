import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DataTable } from "@/components/data-table";
import {
  Settings as SettingsIcon,
  Building2,
  Database,
  Cpu,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";
import type { District } from "@shared/schema";

export default function Settings() {
  const { data: districts, isLoading: districtsLoading, refetch } = useQuery<District[]>({
    queryKey: ["/api/districts"],
  });

  const districtColumns = [
    {
      key: "name",
      header: "District",
      render: (row: District) => (
        <span className="font-medium" data-testid={`text-district-${row.id}`}>{row.name}</span>
      ),
    },
    {
      key: "codePrefix",
      header: "Code",
      render: (row: District) => (
        <span className="font-mono text-sm">{row.codePrefix}</span>
      ),
    },
    {
      key: "establishmentCode",
      header: "Establishment",
      render: (row: District) => (
        <span className="font-mono text-sm">{row.establishmentCode}</span>
      ),
    },
    {
      key: "baseUrl",
      header: "Base URL",
      className: "max-w-[300px]",
      render: (row: District) => (
        <span className="truncate text-sm text-muted-foreground">{row.baseUrl}</span>
      ),
    },
    {
      key: "isActive",
      header: "Status",
      render: (row: District) =>
        row.isActive ? (
          <Badge variant="default" className="bg-emerald-500">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Active
          </Badge>
        ) : (
          <Badge variant="secondary">
            <XCircle className="mr-1 h-3 w-3" />
            Inactive
          </Badge>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold" data-testid="text-page-title">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure system settings and view district configuration
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Building2 className="h-5 w-5" />
                District Configuration
              </CardTitle>
              <CardDescription>
                Delhi district courts configured for data extraction
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              data-testid="button-refresh-districts"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={districtColumns}
              data={districts || []}
              isLoading={districtsLoading}
              emptyMessage="No districts configured"
              testIdPrefix="districts"
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Database className="h-5 w-5" />
                Database
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">PostgreSQL</p>
                  <p className="text-sm text-muted-foreground">Database connection</p>
                </div>
                <Badge variant="default" className="bg-emerald-500">
                  Connected
                </Badge>
              </div>
              <Separator />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tables</span>
                  <span className="font-mono">9</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CNRs</span>
                  <span className="font-mono">-</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Orders</span>
                  <span className="font-mono">-</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Cpu className="h-5 w-5" />
                AI Classification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">OpenAI</p>
                  <p className="text-sm text-muted-foreground">GPT-4o-mini for classification</p>
                </div>
                <Badge variant="secondary">
                  Not Configured
                </Badge>
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-classify">Auto-classify PDFs</Label>
                  <Switch id="auto-classify" disabled data-testid="switch-auto-classify" />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="extract-entities">Extract business entities</Label>
                  <Switch id="extract-entities" disabled data-testid="switch-extract-entities" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Add your OpenAI API key to enable AI-powered classification.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <SettingsIcon className="h-5 w-5" />
                Processing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="parallel-downloads">Parallel PDF downloads</Label>
                <Switch id="parallel-downloads" defaultChecked data-testid="switch-parallel-downloads" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="retry-failed">Retry failed downloads</Label>
                <Switch id="retry-failed" defaultChecked data-testid="switch-retry-failed" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="store-pdfs">Store PDF files locally</Label>
                <Switch id="store-pdfs" data-testid="switch-store-pdfs" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
