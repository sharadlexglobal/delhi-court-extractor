import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/data-table";
import {
  FileText,
  Search,
  Download,
  Eye,
  Briefcase,
  CheckCircle2,
  Clock,
  X,
} from "lucide-react";
import type { CnrOrder, OrderMetadata, District } from "@shared/schema";

interface OrderWithRelations extends CnrOrder {
  cnr?: { cnr: string; district?: District };
  metadata?: OrderMetadata | null;
}

export default function Orders() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<OrderWithRelations | null>(null);

  const { data: orders, isLoading } = useQuery<OrderWithRelations[]>({
    queryKey: ["/api/orders"],
  });

  const { data: districts } = useQuery<District[]>({
    queryKey: ["/api/districts"],
  });

  const filteredOrders = orders?.filter((order) => {
    const matchesSearch =
      !search ||
      order.cnr?.cnr?.toLowerCase().includes(search.toLowerCase()) ||
      order.metadata?.caseTitle?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "pdf" && order.pdfExists) ||
      (statusFilter === "pending" && !order.pdfExists) ||
      (statusFilter === "leads" && order.metadata?.hasBusinessEntity);

    return matchesSearch && matchesStatus;
  });

  const orderColumns = [
    {
      key: "cnr",
      header: "CNR",
      render: (row: OrderWithRelations) => (
        <div className="flex flex-col">
          <span className="font-mono text-sm font-medium" data-testid={`text-cnr-${row.id}`}>
            {row.cnr?.cnr || "-"}
          </span>
          <span className="text-xs text-muted-foreground">
            {row.cnr?.district?.name}
          </span>
        </div>
      ),
    },
    {
      key: "orderNo",
      header: "Order",
      render: (row: OrderWithRelations) => (
        <span className="font-mono text-sm">#{row.orderNo}</span>
      ),
    },
    {
      key: "orderDate",
      header: "Date",
      render: (row: OrderWithRelations) => {
        const date = row.orderDate;
        const formatted = date 
          ? (typeof date === 'string' ? date.slice(0, 10) : new Date(date).toISOString().slice(0, 10))
          : "-";
        return <span className="font-mono text-sm">{formatted}</span>;
      },
    },
    {
      key: "caseTitle",
      header: "Case Title",
      className: "max-w-[300px]",
      render: (row: OrderWithRelations) => (
        <span className="line-clamp-2 text-sm">
          {row.metadata?.caseTitle || "-"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row: OrderWithRelations) => (
        <div className="flex flex-wrap gap-1">
          {row.pdfExists ? (
            <Badge variant="default" className="bg-emerald-500">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              PDF
            </Badge>
          ) : (
            <Badge variant="secondary">
              <Clock className="mr-1 h-3 w-3" />
              Pending
            </Badge>
          )}
          {row.metadata?.hasBusinessEntity && (
            <Badge variant="default" className="bg-amber-500 text-amber-950">
              <Briefcase className="mr-1 h-3 w-3" />
              Lead
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row: OrderWithRelations) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedOrder(row);
            }}
            data-testid={`button-view-${row.id}`}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {row.pdfExists && row.pdfPath && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                window.open(row.pdfPath!, "_blank");
              }}
              data-testid={`button-download-${row.id}`}
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold" data-testid="text-page-title">
            Orders Library
          </h1>
          <p className="text-sm text-muted-foreground">
            Browse and search all court orders
          </p>
        </div>
        <Badge variant="secondary">
          {filteredOrders?.length ?? 0} orders
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by CNR or case title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orders</SelectItem>
                  <SelectItem value="pdf">PDF Downloaded</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="leads">Business Leads</SelectItem>
                </SelectContent>
              </Select>
              {(search || statusFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                  }}
                  data-testid="button-clear-filters"
                >
                  <X className="mr-1 h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={orderColumns}
            data={filteredOrders || []}
            isLoading={isLoading}
            emptyMessage="No orders found. Generate CNRs to start checking for orders."
            onRowClick={setSelectedOrder}
            testIdPrefix="orders"
          />
        </CardContent>
      </Card>

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Order Details
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <Tabs defaultValue="summary" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="summary" data-testid="tab-summary">Summary</TabsTrigger>
                <TabsTrigger value="metadata" data-testid="tab-metadata">Metadata</TabsTrigger>
                <TabsTrigger value="entities" data-testid="tab-entities">Entities</TabsTrigger>
              </TabsList>
              <TabsContent value="summary" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">CNR</p>
                    <p className="font-mono">{selectedOrder.cnr?.cnr}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">District</p>
                    <p>{selectedOrder.cnr?.district?.name}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Order Number</p>
                    <p className="font-mono">#{selectedOrder.orderNo}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Order Date</p>
                    <p className="font-mono">
                      {selectedOrder.orderDate 
                        ? (typeof selectedOrder.orderDate === 'string' 
                            ? selectedOrder.orderDate.slice(0, 10) 
                            : new Date(selectedOrder.orderDate).toISOString().slice(0, 10))
                        : "-"}
                    </p>
                  </div>
                </div>
                {selectedOrder.metadata?.caseTitle && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Case Title</p>
                    <p>{selectedOrder.metadata.caseTitle}</p>
                  </div>
                )}
                {selectedOrder.metadata?.orderSummary && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Summary</p>
                    <p className="text-sm">{selectedOrder.metadata.orderSummary}</p>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="metadata" className="mt-4 space-y-4">
                {selectedOrder.metadata ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Case Type</p>
                      <p>{selectedOrder.metadata.caseType || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Judge</p>
                      <p>{selectedOrder.metadata.judgeName || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Court</p>
                      <p>{selectedOrder.metadata.courtName || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Order Type</p>
                      <p>{selectedOrder.metadata.orderType || "-"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm font-medium text-muted-foreground">Flags</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedOrder.metadata.isSummonsOrder && (
                          <Badge>Summons</Badge>
                        )}
                        {selectedOrder.metadata.isNoticeOrder && (
                          <Badge>Notice</Badge>
                        )}
                        {selectedOrder.metadata.isFreshCaseAssignment && (
                          <Badge>Fresh Case</Badge>
                        )}
                        {selectedOrder.metadata.isFinalOrder && (
                          <Badge>Final Order</Badge>
                        )}
                        {selectedOrder.metadata.hasBusinessEntity && (
                          <Badge className="bg-amber-500 text-amber-950">
                            Business Entity
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No metadata available yet</p>
                )}
              </TabsContent>
              <TabsContent value="entities" className="mt-4">
                {selectedOrder.metadata?.hasBusinessEntity ? (
                  <p className="text-muted-foreground">
                    Business entities will be listed here after enrichment.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    No business entities identified in this order.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
