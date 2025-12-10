import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  RefreshCw,
  AlertCircle,
  FileText,
} from "lucide-react";

interface CategoryStat {
  category: string;
  count: number;
}

interface CaseOrder {
  id: number;
  orderDate: string;
  url: string;
  cnr?: {
    cnr: string;
    district?: {
      name: string;
    };
  };
  metadata?: {
    caseTitle?: string;
    caseNumber?: string;
    caseType?: string;
    caseCategory?: string;
    statutoryActName?: string;
    petitionerNames?: string;
    respondentNames?: string;
    petitionerAdvocates?: string;
    respondentAdvocates?: string;
    judgeName?: string;
    courtName?: string;
    orderType?: string;
    orderSummary?: string;
    nextHearingDate?: string;
    isFreshCaseAssignment?: boolean;
    freshCasePhrase?: string;
    isSummonsOrder?: boolean;
    isNoticeOrder?: boolean;
    isFinalOrder?: boolean;
    hasBusinessEntity?: boolean;
    classificationConfidence?: string;
  };
}

const CATEGORY_LABELS: Record<string, { label: string; description: string; color: string }> = {
  NI_ACT: { label: "Section 138 NI Act", description: "Cheque Bounce Cases", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  COMMERCIAL_COURTS: { label: "Commercial Courts", description: "Commercial Disputes", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  MACT: { label: "MACT", description: "Motor Accident Claims", color: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  IPC: { label: "IPC", description: "Criminal Cases", color: "bg-red-500/10 text-red-600 dark:text-red-400" },
  CPC: { label: "CPC", description: "Civil Procedure", color: "bg-green-500/10 text-green-600 dark:text-green-400" },
  CrPC: { label: "CrPC", description: "Criminal Procedure", color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  ARBITRATION: { label: "Arbitration", description: "Arbitration Cases", color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
  EXECUTION: { label: "Execution", description: "Execution Petitions", color: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
  MAINTENANCE: { label: "Maintenance", description: "Section 125 CrPC", color: "bg-pink-500/10 text-pink-600 dark:text-pink-400" },
  DV_ACT: { label: "DV Act", description: "Domestic Violence", color: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  POCSO: { label: "POCSO", description: "Child Protection", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  NDPS: { label: "NDPS", description: "Narcotics Cases", color: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
  OTHER: { label: "Other", description: "Miscellaneous", color: "bg-gray-500/10 text-gray-600 dark:text-gray-400" },
};

export default function CaseReports() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["NI_ACT", "COMMERCIAL_COURTS"]);
  const [isExporting, setIsExporting] = useState(false);

  const { data: categoryStats, isLoading: statsLoading } = useQuery<CategoryStat[]>({
    queryKey: ["/api/reports/case-categories"],
  });

  const { data: cases, isLoading: casesLoading, refetch } = useQuery<CaseOrder[]>({
    queryKey: ["/api/reports/cases-by-category", selectedCategories.join(",")],
    queryFn: async () => {
      if (selectedCategories.length === 0) return [];
      const response = await fetch(`/api/reports/cases-by-category?categories=${selectedCategories.join(",")}&limit=500`);
      if (!response.ok) throw new Error("Failed to fetch cases");
      return response.json();
    },
    enabled: selectedCategories.length > 0,
  });

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const handleExport = async () => {
    if (selectedCategories.length === 0) return;
    
    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/reports/export-cases?categories=${selectedCategories.join(",")}`
      );
      
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedCategories.join("_")}_cases_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const totalCases = cases?.length || 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-2xl font-semibold">Case Reports</h1>
        <p className="text-sm text-muted-foreground">
          Filter and export court cases by statutory act category
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4" />
              Filter by Category
            </CardTitle>
            <CardDescription>
              Select case categories to view
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {categoryStats?.map((stat) => {
                  const info = CATEGORY_LABELS[stat.category] || CATEGORY_LABELS.OTHER;
                  const isSelected = selectedCategories.includes(stat.category);
                  
                  return (
                    <label
                      key={stat.category}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "border-border"
                      }`}
                      data-testid={`filter-category-${stat.category.toLowerCase()}`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleCategory(stat.category)}
                      />
                      <div className="flex flex-1 flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{info.label}</span>
                          <Badge variant="secondary" className="text-xs">
                            {stat.count}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {info.description}
                        </span>
                      </div>
                    </label>
                  );
                })}
                
                {(!categoryStats || categoryStats.length === 0) && (
                  <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
                    <AlertCircle className="h-8 w-8" />
                    <p className="text-sm">No classified cases yet</p>
                    <p className="text-xs">Run classification on orders first</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4" />
                    Filtered Cases
                  </CardTitle>
                  <CardDescription>
                    {totalCases} cases found
                    {selectedCategories.length > 0 && (
                      <span className="ml-1">
                        in {selectedCategories.map(c => CATEGORY_LABELS[c]?.label || c).join(", ")}
                      </span>
                    )}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={casesLoading}
                    data-testid="button-refresh-cases"
                  >
                    <RefreshCw className={`h-4 w-4 ${casesLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleExport}
                    disabled={isExporting || totalCases === 0}
                    data-testid="button-export-cases"
                  >
                    {isExporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Export Excel
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {casesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : cases && cases.length > 0 ? (
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[140px]">CNR Number</TableHead>
                        <TableHead className="w-[100px]">District</TableHead>
                        <TableHead className="w-[120px]">Category</TableHead>
                        <TableHead className="min-w-[200px]">Case Title</TableHead>
                        <TableHead className="w-[120px]">Case Number</TableHead>
                        <TableHead className="min-w-[150px]">Petitioner</TableHead>
                        <TableHead className="min-w-[150px]">Respondent</TableHead>
                        <TableHead className="w-[100px]">Order Date</TableHead>
                        <TableHead className="w-[100px]">Flags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cases.map((caseOrder) => {
                        const categoryInfo = CATEGORY_LABELS[caseOrder.metadata?.caseCategory || "OTHER"] || CATEGORY_LABELS.OTHER;
                        
                        return (
                          <TableRow key={caseOrder.id} data-testid={`case-row-${caseOrder.id}`}>
                            <TableCell className="font-mono text-xs">
                              {caseOrder.cnr?.cnr || "-"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {caseOrder.cnr?.district?.name || "-"}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${categoryInfo.color}`}>
                                {categoryInfo.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[250px] truncate text-sm" title={caseOrder.metadata?.caseTitle}>
                              {caseOrder.metadata?.caseTitle || "-"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {caseOrder.metadata?.caseNumber || "-"}
                            </TableCell>
                            <TableCell className="max-w-[150px] truncate text-xs" title={caseOrder.metadata?.petitionerNames}>
                              {caseOrder.metadata?.petitionerNames || "-"}
                            </TableCell>
                            <TableCell className="max-w-[150px] truncate text-xs" title={caseOrder.metadata?.respondentNames}>
                              {caseOrder.metadata?.respondentNames || "-"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {caseOrder.orderDate || "-"}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {caseOrder.metadata?.isFreshCaseAssignment && (
                                  <Badge variant="outline" className="text-[10px]">New</Badge>
                                )}
                                {caseOrder.metadata?.hasBusinessEntity && (
                                  <Badge variant="outline" className="text-[10px]">Biz</Badge>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <FileSpreadsheet className="h-12 w-12 text-muted-foreground/50" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">No cases found</p>
                    <p className="text-xs text-muted-foreground/70">
                      Select categories from the filter panel to view cases
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
