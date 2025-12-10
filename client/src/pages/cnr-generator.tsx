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
import { DataTable } from "@/components/data-table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Hash, Loader2, CheckCircle2, XCircle, Download, Play, FileText, Brain, Sparkles, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import type { District, Cnr, ProcessingJob } from "@shared/schema";

const generateFormSchema = z.object({
  districtId: z.string().min(1, "Select a district"),
  startSerial: z.coerce.number().int().positive("Must be positive"),
  endSerial: z.coerce.number().int().positive("Must be positive"),
  year: z.coerce.number().int().min(2000).max(2030),
});

type GenerateFormValues = z.infer<typeof generateFormSchema>;

const orderFormSchema = z.object({
  startDate: z.date(),
  endDate: z.date(),
  startOrderNo: z.coerce.number().int().min(1).max(20).default(1),
  endOrderNo: z.coerce.number().int().min(1).max(20).default(1),
}).refine((data) => data.endDate >= data.startDate, {
  message: "End date must be after start date",
  path: ["endDate"],
}).refine((data) => data.endOrderNo >= data.startOrderNo, {
  message: "End order must be >= start order",
  path: ["endOrderNo"],
});

type OrderFormValues = z.infer<typeof orderFormSchema>;

interface GeneratedCnr extends Cnr {
  district?: District;
  ordersCount?: number;
}

export default function CnrGenerator() {
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [generatedCnrIds, setGeneratedCnrIds] = useState<number[]>([]);
  const [generatedOrderIds, setGeneratedOrderIds] = useState<number[]>([]);
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

  // Only auto-attach to pdf_download jobs to prevent spinner hijacking by other job types
  useEffect(() => {
    if (allJobs && !activeJobId) {
      const runningPdfJob = allJobs.find(
        job => job.jobType === "pdf_download" && 
               (job.status === "processing" || job.status === "pending")
      );
      if (runningPdfJob) {
        setActiveJobId(runningPdfJob.id);
      }
    }
  }, [allJobs, activeJobId]);

  // Auto-clear activeJobId when pdf_download job completes or fails
  useEffect(() => {
    if (activeJob && activeJob.jobType === "pdf_download") {
      if (activeJob.status === "completed" || activeJob.status === "failed") {
        lastCompletedJobIdRef.current = activeJob.id;
        setActiveJobId(null);
        toast({
          title: activeJob.status === "completed" ? "Download Complete" : "Download Finished",
          description: `${activeJob.successfulItems} successful, ${activeJob.failedItems} failed out of ${activeJob.totalItems}`,
          variant: activeJob.failedItems > 0 ? "destructive" : "default",
        });
      }
    }
  }, [activeJob, toast]);

  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(generateFormSchema),
    defaultValues: {
      districtId: "",
      startSerial: 1,
      endSerial: 10,
      year: new Date().getFullYear(),
    },
  });

  const orderForm = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      startDate: new Date(),
      endDate: new Date(),
      startOrderNo: 1,
      endOrderNo: 1,
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (values: GenerateFormValues) => {
      const response = await apiRequest("POST", "/api/cnrs/generate", {
        districtId: parseInt(values.districtId),
        startSerial: values.startSerial,
        endSerial: values.endSerial,
        year: values.year,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedCnrIds(data.cnrIds || []);
      setGeneratedOrderIds([]);
      toast({
        title: "CNRs Generated",
        description: `Created ${data.cnrsCreated} CNRs: ${data.cnrs?.slice(0, 3).join(", ")}${data.cnrsCreated > 3 ? "..." : ""}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cnrs?limit=50"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/overview"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateOrdersMutation = useMutation({
    mutationFn: async (values: OrderFormValues) => {
      const response = await apiRequest("POST", "/api/orders/generate", {
        cnrIds: generatedCnrIds,
        startDate: values.startDate.toISOString().split("T")[0],
        endDate: values.endDate.toISOString().split("T")[0],
        startOrderNo: values.startOrderNo,
        endOrderNo: values.endOrderNo,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedOrderIds(data.orderIds || []);
      toast({
        title: "Order URLs Created",
        description: `Created ${data.ordersCreated} order URLs ready for download`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders?limit=10"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Order Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const startDownloadMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/jobs/start-pdf-download-zenrows", {
        orderIds: generatedOrderIds,
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
            title: "ZenRows PDF Download Started",
            description: `Processing ${data.totalOrders} orders via ZenRows`,
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

  const extractTextsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/jobs/extract-texts", {
        limit: 100,
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
            description: `Tracking existing text extraction job`,
          });
        } else {
          toast({
            title: "Text Extraction Started",
            description: `Processing ${data.totalOrders} orders`,
          });
        }
      } else {
        toast({
          title: "No Orders to Process",
          description: "All PDFs have been extracted",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Text Extraction Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const classifyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/jobs/classify", {
        limit: 100,
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
            description: `Tracking existing classification job`,
          });
        } else {
          toast({
            title: "Classification Started",
            description: `Analyzing ${data.totalOrders} orders`,
          });
        }
      } else {
        toast({
          title: "No Orders to Classify",
          description: "All orders have been classified",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Classification Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const enrichEntitiesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/jobs/enrich-entities", {
        limit: 100,
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
            description: `Tracking existing enrichment job`,
          });
        } else {
          toast({
            title: "Enrichment Started",
            description: `Enriching ${data.totalEntities} entities`,
          });
        }
      } else {
        toast({
          title: "No Entities to Enrich",
          description: "All entities have been enriched",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Enrichment Failed",
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

  const onOrderSubmit = (values: OrderFormValues) => {
    generateOrdersMutation.mutate(values);
  };

  const handleStartDownload = () => {
    startDownloadMutation.mutate();
  };

  const handleExtractTexts = () => {
    extractTextsMutation.mutate();
  };

  const handleClassify = () => {
    classifyMutation.mutate();
  };

  const handleEnrichEntities = () => {
    enrichEntitiesMutation.mutate();
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
                Step 2: Create Order URLs
              </h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Select date range and order numbers to search. Max: 30 days, 10 orders.
              </p>
              <Form {...orderForm}>
                <form onSubmit={orderForm.handleSubmit(onOrderSubmit)} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={orderForm.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>From Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className="w-full justify-start text-left font-normal text-xs px-2"
                                  data-testid="button-start-date"
                                >
                                  <CalendarIcon className="mr-1 h-3 w-3" />
                                  {field.value ? format(field.value, "dd/MM/yy") : "Start"}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={orderForm.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>To Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className="w-full justify-start text-left font-normal text-xs px-2"
                                  data-testid="button-end-date"
                                >
                                  <CalendarIcon className="mr-1 h-3 w-3" />
                                  {field.value ? format(field.value, "dd/MM/yy") : "End"}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={orderForm.control}
                      name="startOrderNo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>From Order #</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              value={field.value}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                              data-testid="input-start-order-no" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={orderForm.control}
                      name="endOrderNo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>To Order #</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              value={field.value}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                              data-testid="input-end-order-no" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="secondary"
                    className="w-full"
                    disabled={generateOrdersMutation.isPending || generatedCnrIds.length === 0}
                    data-testid="button-create-orders"
                  >
                    {generateOrdersMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Order URLs...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        {generatedCnrIds.length > 0 
                          ? `Create URLs for ${generatedCnrIds.length} CNRs` 
                          : "Generate CNRs First"}
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </div>

            <div className="mt-6 border-t pt-6">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                Step 3: Download PDFs
              </h3>
              <Button
                variant="secondary"
                className="w-full"
                onClick={handleStartDownload}
                disabled={startDownloadMutation.isPending || !!activeJobId || generatedOrderIds.length === 0}
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
                    {generatedOrderIds.length > 0 
                      ? `Download PDFs (${generatedOrderIds.length} orders)` 
                      : "Create Order URLs First"}
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => {
                      lastCompletedJobIdRef.current = activeJobId;
                      setActiveJobId(null);
                      toast({
                        title: "Job Cleared",
                        description: "You can now start a new job",
                      });
                    }}
                    data-testid="button-clear-job"
                  >
                    <XCircle className="mr-2 h-3 w-3" />
                    Clear / Cancel Tracking
                  </Button>
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

            <div className="mt-6 border-t pt-6">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                Step 4: Extract Text
              </h3>
              <Button
                variant="secondary"
                className="w-full"
                onClick={handleExtractTexts}
                disabled={extractTextsMutation.isPending || !!activeJobId}
                data-testid="button-extract-texts"
              >
                {extractTextsMutation.isPending || (activeJobId && activeJob?.jobType === "text_extraction") ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Extracting Text...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Extract Text from PDFs
                  </>
                )}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Extract text content from downloaded PDF orders
              </p>
            </div>

            <div className="mt-6 border-t pt-6">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                Step 5: Classify Orders
              </h3>
              <Button
                variant="secondary"
                className="w-full"
                onClick={handleClassify}
                disabled={classifyMutation.isPending || !!activeJobId}
                data-testid="button-classify"
              >
                {classifyMutation.isPending || (activeJobId && activeJob?.jobType === "classification") ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Classifying...
                  </>
                ) : (
                  <>
                    <Brain className="mr-2 h-4 w-4" />
                    Classify with AI
                  </>
                )}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Use AI to analyze orders and extract business leads
              </p>
            </div>

            <div className="mt-6 border-t pt-6">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                Step 6: Enrich Leads
              </h3>
              <Button
                variant="secondary"
                className="w-full"
                onClick={handleEnrichEntities}
                disabled={enrichEntitiesMutation.isPending || !!activeJobId}
                data-testid="button-enrich"
              >
                {enrichEntitiesMutation.isPending || (activeJobId && activeJob?.jobType === "enrichment") ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enriching...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Enrich Business Leads
                  </>
                )}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Add location and contact details to extracted leads
              </p>
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

      {/* Downloaded PDFs Section */}
      <DownloadedPdfsSection />
    </div>
  );
}

// Downloaded PDFs Section Component
function DownloadedPdfsSection() {
  const { data: pdfs, isLoading } = useQuery<Array<{
    id: number;
    cnrId: number;
    orderNo: number;
    orderDate: string;
    pdfPath: string | null;
    pdfSizeBytes: number | null;
    lastCheckedAt: string | null;
    cnr?: { cnr: string };
  }>>({
    queryKey: ["/api/pdfs?limit=50"],
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Downloaded PDFs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
        <CardTitle className="text-lg font-semibold">
          Downloaded PDFs
        </CardTitle>
        <Badge variant="secondary">
          {pdfs?.length ?? 0} PDFs
        </Badge>
      </CardHeader>
      <CardContent>
        {pdfs && pdfs.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {pdfs.map((pdf) => (
              <div
                key={pdf.id}
                className="flex items-center justify-between gap-2 p-3 rounded-md bg-muted/50"
                data-testid={`pdf-row-${pdf.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm truncate">
                    {pdf.cnr?.cnr || `CNR #${pdf.cnrId}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Order #{pdf.orderNo} - {pdf.orderDate}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {pdf.pdfSizeBytes ? `${Math.round(pdf.pdfSizeBytes / 1024)} KB` : "N/A"}
                  </Badge>
                  {pdf.pdfPath && (
                    <a
                      href={pdf.pdfPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex"
                      data-testid={`pdf-download-${pdf.id}`}
                    >
                      <Button size="sm" variant="outline">
                        <Download className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No PDFs downloaded yet. Generate CNRs, create order URLs, and download PDFs to see them here.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
