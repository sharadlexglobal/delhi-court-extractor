import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DataTable } from "@/components/data-table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Hash, ChevronDown, Loader2, CheckCircle2, XCircle, Download, Play } from "lucide-react";
import type { District, Cnr, ProcessingJob } from "@shared/schema";

const generateFormSchema = z.object({
  districtId: z.string().min(1, "Select a district"),
  startSerial: z.coerce.number().int().positive("Must be positive"),
  endSerial: z.coerce.number().int().positive("Must be positive"),
  year: z.coerce.number().int().min(2000).max(2030),
  daysAhead: z.coerce.number().int().min(1).max(60).default(30),
  maxOrderNo: z.coerce.number().int().min(1).max(20).default(10),
});

type GenerateFormValues = z.infer<typeof generateFormSchema>;

interface GeneratedCnr extends Cnr {
  district?: District;
  ordersCount?: number;
}

export default function CnrGenerator() {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const lastCompletedJobIdRef = useRef<number | null>(null);
  const { toast } = useToast();

  const { data: districts, isLoading: districtsLoading } = useQuery<District[]>({
    queryKey: ["/api/districts"],
  });

  const { data: recentCnrs, isLoading: cnrsLoading } = useQuery<GeneratedCnr[]>({
    queryKey: ["/api/cnrs?limit=50"],
  });

  const { data: activeJob, isLoading: jobLoading } = useQuery<ProcessingJob>({
    queryKey: ["/api/jobs", activeJobId],
    enabled: activeJobId !== null,
    refetchInterval: activeJobId ? 2000 : false,
  });

  const { data: allJobs } = useQuery<ProcessingJob[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: activeJobId ? 2000 : 10000,
  });

  useEffect(() => {
    if (allJobs && !activeJobId) {
      const runningJob = allJobs.find(job => job.status === "processing" || job.status === "pending");
      if (runningJob) {
        setActiveJobId(runningJob.id);
      }
    }
  }, [allJobs, activeJobId]);

  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(generateFormSchema),
    defaultValues: {
      districtId: "",
      startSerial: 1,
      endSerial: 100,
      year: new Date().getFullYear(),
      daysAhead: 30,
      maxOrderNo: 10,
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (values: GenerateFormValues) => {
      const response = await apiRequest("POST", "/api/cnrs/generate", {
        districtId: parseInt(values.districtId),
        startSerial: values.startSerial,
        endSerial: values.endSerial,
        year: values.year,
        daysAhead: values.daysAhead,
        maxOrderNo: values.maxOrderNo,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "CNRs Generated",
        description: `Created ${data.cnrsCreated} CNRs with ${data.ordersCreated} order combinations`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cnrs?limit=50"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders?limit=10"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const startDownloadMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/jobs/start-pdf-download", {
        limit: 50,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.jobId) {
        lastCompletedJobIdRef.current = null;
        setActiveJobId(data.jobId);
        if (data.alreadyRunning) {
          toast({
            title: "Job Already Running",
            description: `Tracking existing job (${data.totalOrders} orders)`,
          });
        } else {
          toast({
            title: "PDF Download Started",
            description: `Processing ${data.totalOrders} orders`,
          });
        }
      } else {
        toast({
          title: "No Pending Orders",
          description: "All orders have been processed",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Download Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (activeJobId === null) return;
    if (!activeJob) return;
    
    const jobId = activeJob.id;
    const status = activeJob.status;
    
    if ((status === "completed" || status === "failed") && lastCompletedJobIdRef.current !== jobId) {
      lastCompletedJobIdRef.current = jobId;
      setActiveJobId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/orders?limit=100"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    }
  }, [activeJobId, activeJob?.id, activeJob?.status]);

  const onSubmit = (values: GenerateFormValues) => {
    generateMutation.mutate(values);
  };

  const handleStartDownload = () => {
    startDownloadMutation.mutate();
  };

  const cnrColumns = [
    {
      key: "cnr",
      header: "CNR Number",
      render: (row: GeneratedCnr) => (
        <span className="font-mono text-sm font-medium" data-testid={`text-cnr-${row.id}`}>
          {row.cnr}
        </span>
      ),
    },
    {
      key: "district",
      header: "District",
      render: (row: GeneratedCnr) => (
        <span>{row.district?.name || "-"}</span>
      ),
    },
    {
      key: "serialNumber",
      header: "Serial",
      render: (row: GeneratedCnr) => (
        <span className="font-mono text-sm">{row.serialNumber}</span>
      ),
    },
    {
      key: "year",
      header: "Year",
      render: (row: GeneratedCnr) => (
        <span className="font-mono text-sm">{row.year}</span>
      ),
    },
    {
      key: "isValid",
      header: "Status",
      render: (row: GeneratedCnr) => {
        if (row.isValid === null) {
          return (
            <Badge variant="secondary">
              Pending
            </Badge>
          );
        }
        return row.isValid ? (
          <Badge variant="default" className="bg-emerald-500">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Valid
          </Badge>
        ) : (
          <Badge variant="secondary">
            <XCircle className="mr-1 h-3 w-3" />
            Invalid
          </Badge>
        );
      },
    },
    {
      key: "ordersCount",
      header: "Orders",
      render: (row: GeneratedCnr) => (
        <span className="font-mono text-sm">{row.ordersCount ?? 0}</span>
      ),
    },
  ];

  return (
    <div className="flex h-full">
      <div className="flex w-full flex-col gap-6 p-6 lg:flex-row">
        <Card className="lg:w-[400px] lg:shrink-0">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Hash className="h-5 w-5" />
              Generate CNR Numbers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="districtId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>District</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-district">
                            <SelectValue placeholder="Select district" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {districts?.map((district) => (
                            <SelectItem
                              key={district.id}
                              value={String(district.id)}
                              data-testid={`option-district-${district.id}`}
                            >
                              {district.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startSerial"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>From Serial</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            data-testid="input-start-serial"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endSerial"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>To Serial</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            data-testid="input-end-serial"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="year"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Year</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} data-testid="input-year" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between"
                      type="button"
                      data-testid="button-advanced-options"
                    >
                      Advanced Options
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          advancedOpen ? "rotate-180" : ""
                        }`}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4 space-y-4">
                    <FormField
                      control={form.control}
                      name="daysAhead"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Days Ahead</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              data-testid="input-days-ahead"
                            />
                          </FormControl>
                          <FormDescription>
                            Generate order dates for the next N days
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="maxOrderNo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Order Number</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              data-testid="input-max-order"
                            />
                          </FormControl>
                          <FormDescription>
                            Maximum order number per date (1-20)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CollapsibleContent>
                </Collapsible>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={generateMutation.isPending}
                  data-testid="button-generate"
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Hash className="mr-2 h-4 w-4" />
                      Generate CNRs
                    </>
                  )}
                </Button>
              </form>
            </Form>

            {generateMutation.isPending && (
              <div className="mt-4">
                <Progress value={50} className="h-2" />
                <p className="mt-2 text-center text-sm text-muted-foreground">
                  Creating CNR combinations...
                </p>
              </div>
            )}

            <div className="mt-6 border-t pt-6">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                Step 2: Download PDFs
              </h3>
              <Button
                variant="secondary"
                className="w-full"
                onClick={handleStartDownload}
                disabled={startDownloadMutation.isPending || !!activeJobId}
                data-testid="button-start-download"
              >
                {startDownloadMutation.isPending || activeJobId ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Downloading PDFs...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Start PDF Download
                  </>
                )}
              </Button>

              {activeJob && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress:</span>
                    <span className="font-mono">
                      {activeJob.processedItems} / {activeJob.totalItems}
                    </span>
                  </div>
                  <Progress
                    value={activeJob.totalItems > 0 
                      ? (activeJob.processedItems / activeJob.totalItems) * 100 
                      : 0
                    }
                    className="h-2"
                  />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-600">
                      Success: {activeJob.successfulItems}
                    </span>
                    <span className="text-red-600">
                      Failed: {activeJob.failedItems}
                    </span>
                  </div>
                </div>
              )}

              {allJobs && allJobs.length > 0 && !activeJobId && (
                <div className="mt-4">
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                    Recent Jobs
                  </h4>
                  <div className="space-y-2">
                    {allJobs.slice(0, 3).map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between rounded-md bg-muted/50 p-2 text-xs"
                      >
                        <span className="font-mono">Job #{job.id}</span>
                        <Badge 
                          variant={job.status === "completed" ? "default" : "secondary"}
                          className={job.status === "completed" ? "bg-emerald-500" : ""}
                        >
                          {job.status}
                        </Badge>
                        <span>
                          {job.successfulItems}/{job.totalItems}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="flex-1">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
            <CardTitle className="text-lg font-semibold">
              Generated CNRs
            </CardTitle>
            <Badge variant="secondary">
              {recentCnrs?.length ?? 0} CNRs
            </Badge>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={cnrColumns}
              data={recentCnrs || []}
              isLoading={cnrsLoading}
              emptyMessage="No CNRs generated yet. Use the form to create CNR combinations."
              testIdPrefix="cnrs"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
