import { useQuery } from "@tanstack/react-query";
import { StatsCard } from "@/components/stats-card";
import { DataTable } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Hash,
  FileText,
  Briefcase,
  Download,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import type { CnrOrder, OrderMetadata } from "@shared/schema";

interface RecentOrder extends CnrOrder {
  cnr?: { cnr: string };
  metadata?: OrderMetadata | null;
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalCnrs: number;
    totalOrders: number;
    pdfsDownloaded: number;
    businessLeads: number;
  }>({
    queryKey: ["/api/analytics/overview"],
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery<RecentOrder[]>({
    queryKey: ["/api/orders?limit=10"],
  });

  const orderColumns = [
    {
      key: "cnr",
      header: "CNR",
      render: (row: RecentOrder) => (
        <span className="font-mono text-sm" data-testid={`text-cnr-${row.id}`}>
          {row.cnr?.cnr || "-"}
        </span>
      ),
    },
    {
      key: "orderNo",
      header: "Order #",
      render: (row: RecentOrder) => (
        <span className="font-mono text-sm">{row.orderNo}</span>
      ),
    },
    {
      key: "orderDate",
      header: "Date",
      render: (row: RecentOrder) => (
        <span className="font-mono text-sm">{String(row.orderDate)}</span>
      ),
    },
    {
      key: "pdfExists",
      header: "Status",
      render: (row: RecentOrder) => (
        <Badge variant={row.pdfExists ? "default" : "secondary"}>
          {row.pdfExists ? (
            <>
              <CheckCircle2 className="mr-1 h-3 w-3" />
              PDF Found
            </>
          ) : (
            <>
              <Clock className="mr-1 h-3 w-3" />
              Pending
            </>
          )}
        </Badge>
      ),
    },
    {
      key: "hasBusinessEntity",
      header: "Business Lead",
      render: (row: RecentOrder) =>
        row.metadata?.hasBusinessEntity ? (
          <Badge variant="default" className="bg-amber-500 text-amber-950">
            <Briefcase className="mr-1 h-3 w-3" />
            Lead
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold" data-testid="text-page-title">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Delhi District Courts Case Extraction Overview
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/cnr-generator" data-testid="button-generate-cnrs">
              <Hash className="mr-2 h-4 w-4" />
              Generate CNRs
            </Link>
          </Button>
          <Button asChild>
            <Link href="/leads" data-testid="button-view-leads">
              <Briefcase className="mr-2 h-4 w-4" />
              View Leads
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="CNRs Generated"
          value={stats?.totalCnrs ?? 0}
          icon={Hash}
          description="Unique case numbers"
          variant="navy"
        />
        <StatsCard
          title="Orders Checked"
          value={stats?.totalOrders ?? 0}
          icon={FileText}
          description="URL combinations tested"
        />
        <StatsCard
          title="PDFs Downloaded"
          value={stats?.pdfsDownloaded ?? 0}
          icon={Download}
          description="Court orders retrieved"
        />
        <StatsCard
          title="Business Leads"
          value={stats?.businessLeads ?? 0}
          icon={Briefcase}
          description="Companies identified"
          variant="gold"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
            <CardTitle className="text-lg font-semibold">Recent Orders</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/orders" data-testid="link-view-all-orders">
                View All
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={orderColumns}
              data={recentOrders || []}
              isLoading={ordersLoading}
              emptyMessage="No orders yet. Generate CNRs to begin."
              testIdPrefix="recent-orders"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button variant="outline" className="justify-start" asChild>
              <Link href="/cnr-generator" data-testid="button-quick-generate">
                <Hash className="mr-2 h-4 w-4" />
                Generate New CNRs
              </Link>
            </Button>
            <Button variant="outline" className="justify-start" asChild>
              <Link href="/orders" data-testid="button-quick-orders">
                <FileText className="mr-2 h-4 w-4" />
                Browse Orders
              </Link>
            </Button>
            <Button variant="outline" className="justify-start" asChild>
              <Link href="/leads" data-testid="button-quick-leads">
                <Briefcase className="mr-2 h-4 w-4" />
                Manage Leads
              </Link>
            </Button>
            <Button variant="outline" className="justify-start" asChild>
              <Link href="/analytics" data-testid="button-quick-analytics">
                <Download className="mr-2 h-4 w-4" />
                View Analytics
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold">Processing Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 rounded-md bg-muted/50 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-500/10">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium">PDFs Downloaded</p>
                <p className="text-2xl font-semibold font-mono">
                  {stats?.pdfsDownloaded ?? 0}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-md bg-muted/50 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Pending Classification</p>
                <p className="text-2xl font-semibold font-mono">0</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-md bg-muted/50 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-red-500/10">
                <AlertCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Failed Jobs</p>
                <p className="text-2xl font-semibold font-mono">0</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
