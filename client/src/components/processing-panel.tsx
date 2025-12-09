import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Download,
  FileText,
  Brain,
  Loader2,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";

interface ProcessingStats {
  pendingTextExtraction: number;
  pendingClassification: number;
  pendingEnrichment: number;
  failedJobs: number;
  runningJobs: number;
}

interface ProcessingJob {
  id: number;
  jobType: string;
  status: string;
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  createdAt: string;
}

interface JobResponse {
  jobId: number | null;
  message: string;
  alreadyRunning?: boolean;
  totalOrders?: number;
}

export function ProcessingPanel() {
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading } = useQuery<ProcessingStats>({
    queryKey: ["/api/analytics/processing-stats"],
    refetchInterval: 5000,
  });

  const { data: jobs, isLoading: jobsLoading } = useQuery<ProcessingJob[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 5000,
  });

  const runningJobs = jobs?.filter(j => j.status === "processing" || j.status === "pending") || [];
  const latestJob = runningJobs[0];

  const fetchPdfsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/jobs/start-pdf-download", { limit: 100 });
      return res.json() as Promise<JobResponse>;
    },
    onSuccess: (data) => {
      toast({ title: "PDF Download Started", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/processing-stats"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to start PDF download", variant: "destructive" }),
  });

  const extractTextMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/jobs/extract-texts", { limit: 100 });
      return res.json() as Promise<JobResponse>;
    },
    onSuccess: (data) => {
      toast({ title: "Text Extraction Started", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/processing-stats"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to start text extraction", variant: "destructive" }),
  });

  const classifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/jobs/classify", { limit: 50 });
      return res.json() as Promise<JobResponse>;
    },
    onSuccess: (data) => {
      toast({ title: "Classification Started", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/processing-stats"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to start classification", variant: "destructive" }),
  });

  const seedDistrictsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/seed-districts");
      return res.json() as Promise<{ added: number; skipped: number }>;
    },
    onSuccess: (data) => {
      toast({ title: "Districts Seeded", description: `Added ${data.added}, skipped ${data.skipped}` });
      queryClient.invalidateQueries({ queryKey: ["/api/districts"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to seed districts", variant: "destructive" }),
  });

  const isAnyMutationPending = fetchPdfsMutation.isPending || extractTextMutation.isPending || classifyMutation.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
        <CardTitle className="text-lg font-semibold">Processing Controls</CardTitle>
        {(stats?.runningJobs ?? 0) > 0 && (
          <Badge variant="outline" className="text-amber-600 border-amber-600">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            {stats?.runningJobs} Job(s) Running
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-500/10">
              <Download className="h-4 w-4 text-blue-500" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Pending Text Extraction</p>
              <p className="text-xl font-semibold font-mono" data-testid="text-pending-extraction">
                {statsLoading ? "-" : stats?.pendingTextExtraction ?? 0}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-500/10">
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Pending Classification</p>
              <p className="text-xl font-semibold font-mono" data-testid="text-pending-classification">
                {statsLoading ? "-" : stats?.pendingClassification ?? 0}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Pending Enrichment</p>
              <p className="text-xl font-semibold font-mono" data-testid="text-pending-enrichment">
                {statsLoading ? "-" : stats?.pendingEnrichment ?? 0}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-red-500/10">
              <AlertCircle className="h-4 w-4 text-red-500" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Failed Jobs</p>
              <p className="text-xl font-semibold font-mono" data-testid="text-failed-jobs">
                {statsLoading ? "-" : stats?.failedJobs ?? 0}
              </p>
            </div>
          </div>
        </div>

        {latestJob && (
          <div className="rounded-md bg-muted/50 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{latestJob.jobType}</Badge>
                <span className="text-sm text-muted-foreground">
                  {latestJob.processedItems} / {latestJob.totalItems} items
                </span>
              </div>
              <Badge variant={latestJob.status === "processing" ? "default" : "secondary"}>
                {latestJob.status}
              </Badge>
            </div>
            <Progress 
              value={latestJob.totalItems > 0 ? (latestJob.processedItems / latestJob.totalItems) * 100 : 0} 
              className="h-2"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => fetchPdfsMutation.mutate()}
            disabled={isAnyMutationPending || (stats?.runningJobs ?? 0) > 0}
            data-testid="button-fetch-pdfs"
          >
            {fetchPdfsMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Fetch PDFs
          </Button>
          <Button
            onClick={() => extractTextMutation.mutate()}
            disabled={isAnyMutationPending || (stats?.runningJobs ?? 0) > 0}
            variant="outline"
            data-testid="button-extract-text"
          >
            {extractTextMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Extract Text
          </Button>
          <Button
            onClick={() => classifyMutation.mutate()}
            disabled={isAnyMutationPending || (stats?.runningJobs ?? 0) > 0}
            variant="outline"
            data-testid="button-classify"
          >
            {classifyMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Brain className="mr-2 h-4 w-4" />
            )}
            Classify Orders
          </Button>
          <Button
            onClick={() => seedDistrictsMutation.mutate()}
            disabled={seedDistrictsMutation.isPending}
            variant="ghost"
            size="sm"
            data-testid="button-seed-districts"
          >
            {seedDistrictsMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Seed Districts
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
