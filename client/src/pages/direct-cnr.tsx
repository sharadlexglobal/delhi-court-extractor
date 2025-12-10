import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  User,
  Plus,
  Search,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Calendar,
  Clock,
  Briefcase,
  Scale,
  Eye,
  Download,
  Brain,
  RefreshCw,
  Users,
  BarChart3,
  FileSearch,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface Advocate {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  barCouncilId: string | null;
  isActive: boolean;
}

interface DirectCase {
  id: number;
  cnr: string;
  districtId: number;
  advocateId: number | null;
  caseType: string | null;
  filingNumber: string | null;
  filingDate: string | null;
  registrationNumber: string | null;
  registrationDate: string | null;
  petitionerName: string | null;
  petitionerAdvocate: string | null;
  respondentName: string | null;
  respondentAdvocate: string | null;
  firstHearingDate: string | null;
  nextHearingDate: string | null;
  caseStage: string | null;
  courtName: string | null;
  caseDetailsExtracted: boolean;
  initialOrdersDownloaded: boolean;
  representedParty: string | null;
  perspectiveSetAt: string | null;
  judgeName: string | null;
  createdAt: string;
  orders?: DirectOrder[];
}

interface MasterSummary {
  id: number;
  caseId: number;
  caseProgressionSummary: string | null;
  timeline: Array<{ date: string; event: string; party: string | null; significance: string }>;
  petitionerAdjournments: number;
  respondentAdjournments: number;
  courtAdjournments: number;
  adjournmentDetails: Array<{ date: string; party: string; reason: string }>;
  advocateBirdEyeView: string | null;
  keyMilestones: Array<{ date: string; milestone: string; completed: boolean }>;
  currentStage: string | null;
  pendingActions: string[];
  ordersIncluded: number;
  lastCompiledAt: string;
}

interface DirectOrder {
  id: number;
  caseId: number;
  orderNo: number;
  orderDate: string;
  pdfExists: boolean;
  textExtracted: boolean;
  classificationDone: boolean;
  summary?: {
    caseTitle: string | null;
    caseCategory: string | null;
    orderType: string | null;
    orderSummary: string | null;
    preparationNotes: string | null;
    actionItems: string | null;
    nextHearingDate: string | null;
  } | null;
}

interface MonitoringSchedule {
  id: number;
  caseId: number;
  triggerDate: string;
  startMonitoringDate: string;
  endMonitoringDate: string;
  isActive: boolean;
  orderFound: boolean;
  totalChecks: number;
}

const cnrFormSchema = z.object({
  cnr: z.string().length(16, "CNR must be exactly 16 characters"),
  advocateId: z.string().optional(),
});

const advocateFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  barCouncilId: z.string().optional(),
});

type CnrFormValues = z.infer<typeof cnrFormSchema>;
type AdvocateFormValues = z.infer<typeof advocateFormSchema>;

export default function DirectCnr() {
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [cnrValidation, setCnrValidation] = useState<{ valid: boolean; data?: any } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [advocateDialogOpen, setAdvocateDialogOpen] = useState(false);
  const [partyDialogOpen, setPartyDialogOpen] = useState(false);
  const [selectedParty, setSelectedParty] = useState<string>("");
  const [pdfPreviewOrderId, setPdfPreviewOrderId] = useState<number | null>(null);
  const [showMasterSummary, setShowMasterSummary] = useState(false);
  const { toast } = useToast();

  const { data: advocates, isLoading: advocatesLoading } = useQuery<{ success: boolean; data: Advocate[] }>({
    queryKey: ["/api/direct-cnr/advocates"],
  });

  const { data: cases, isLoading: casesLoading } = useQuery<{ success: boolean; data: DirectCase[] }>({
    queryKey: ["/api/direct-cnr/cases"],
  });

  const { data: selectedCase, isLoading: caseLoading } = useQuery<{ success: boolean; data: DirectCase & { orders: DirectOrder[] } }>({
    queryKey: ["/api/direct-cnr/cases", selectedCaseId],
    queryFn: async () => {
      const res = await fetch(`/api/direct-cnr/cases/${selectedCaseId}`);
      if (!res.ok) throw new Error("Failed to fetch case");
      return res.json();
    },
    enabled: selectedCaseId !== null,
  });

  const { data: monitoring } = useQuery<{ success: boolean; data: MonitoringSchedule[] }>({
    queryKey: ["/api/direct-cnr/monitoring/active"],
  });

  const { data: masterSummary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<{ success: boolean; data: MasterSummary }>({
    queryKey: ["/api/direct-cnr/cases", selectedCaseId, "summary"],
    queryFn: async () => {
      const res = await fetch(`/api/direct-cnr/cases/${selectedCaseId}/summary`);
      return res.json();
    },
    enabled: selectedCaseId !== null && showMasterSummary,
  });

  const setPartyMutation = useMutation({
    mutationFn: async ({ caseId, party }: { caseId: number; party: string }) => {
      const res = await apiRequest("POST", `/api/direct-cnr/cases/${caseId}/party`, {
        representedParty: party,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Perspective Set", description: "AI analysis will be updated with your perspective." });
      queryClient.invalidateQueries({ queryKey: ["/api/direct-cnr/cases", selectedCaseId] });
      setPartyDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const generateSummaryMutation = useMutation({
    mutationFn: async (caseId: number) => {
      const res = await apiRequest("POST", `/api/direct-cnr/cases/${caseId}/summary/refresh`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Summary Generated", description: "Master summary has been created." });
      refetchSummary();
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const cnrForm = useForm<CnrFormValues>({
    resolver: zodResolver(cnrFormSchema),
    defaultValues: { cnr: "", advocateId: "" },
  });

  const advocateForm = useForm<AdvocateFormValues>({
    resolver: zodResolver(advocateFormSchema),
    defaultValues: { name: "", email: "", phone: "", barCouncilId: "" },
  });

  const validateCnr = async (cnr: string) => {
    if (cnr.length !== 16) {
      setCnrValidation(null);
      return;
    }
    setIsValidating(true);
    try {
      const response = await fetch(`/api/direct-cnr/validate-cnr/${cnr.toUpperCase()}`);
      const data = await response.json();
      setCnrValidation(data);
    } catch {
      setCnrValidation({ valid: false });
    }
    setIsValidating(false);
  };

  const registerCaseMutation = useMutation({
    mutationFn: async (data: CnrFormValues) => {
      const res = await apiRequest("POST", "/api/direct-cnr/cases/register", {
        cnr: data.cnr.toUpperCase(),
        advocateId: data.advocateId ? parseInt(data.advocateId) : undefined,
      });
      return res.json();
    },
    onSuccess: (response: any) => {
      toast({ title: "Case Registered", description: "Now extracting details from eCourts..." });
      queryClient.invalidateQueries({ queryKey: ["/api/direct-cnr/cases"] });
      cnrForm.reset();
      setCnrValidation(null);
      if (response.data?.id) {
        extractCaseMutation.mutate(response.data.id);
      }
    },
    onError: (error: any) => {
      toast({ title: "Registration Failed", description: error.message, variant: "destructive" });
    },
  });

  const extractCaseMutation = useMutation({
    mutationFn: async (caseId: number) => {
      const res = await apiRequest("POST", `/api/direct-cnr/cases/${caseId}/extract`);
      const data = await res.json();
      return { ...data, caseId };
    },
    onSuccess: (response: any) => {
      const ordersFound = response.data?.ordersCreated || 0;
      toast({
        title: "Case Details Extracted",
        description: ordersFound > 0 ? `Found ${ordersFound} orders. Processing...` : "No orders found on eCourts",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/direct-cnr/cases"] });
      if (response.caseId) {
        queryClient.invalidateQueries({ queryKey: ["/api/direct-cnr/cases", response.caseId] });
      }
      if (ordersFound > 0 && response.caseId) {
        processCaseMutation.mutate(response.caseId);
      }
    },
    onError: (error: any) => {
      toast({ title: "Extraction Failed", description: error.message, variant: "destructive" });
    },
  });

  const processCaseMutation = useMutation({
    mutationFn: async (caseId: number) => {
      const res = await apiRequest("POST", `/api/direct-cnr/cases/${caseId}/process`);
      const data = await res.json();
      return { ...data, caseId };
    },
    onSuccess: (response: any) => {
      const data = response.data;
      toast({
        title: "Processing Complete",
        description: `PDFs: ${data?.pdfDownload?.successful || 0}/${data?.pdfDownload?.total || 0}, Classification: ${data?.classification?.successful || 0}/${data?.classification?.total || 0}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/direct-cnr/cases"] });
      if (response.caseId) {
        queryClient.invalidateQueries({ queryKey: ["/api/direct-cnr/cases", response.caseId] });
      }
    },
    onError: (error: any) => {
      toast({ title: "Processing Failed", description: error.message, variant: "destructive" });
    },
  });

  const createAdvocateMutation = useMutation({
    mutationFn: async (data: AdvocateFormValues) => {
      const res = await apiRequest("POST", "/api/direct-cnr/advocates", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Advocate Created" });
      queryClient.invalidateQueries({ queryKey: ["/api/direct-cnr/advocates"] });
      advocateForm.reset();
      setAdvocateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const runMonitoringMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/direct-cnr/monitoring/run");
      return res.json();
    },
    onSuccess: (response: any) => {
      toast({
        title: "Monitoring Check Complete",
        description: `Checked ${response.data?.schedulesChecked || 0} schedules, found ${response.data?.newOrdersFound || 0} new orders`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/direct-cnr/monitoring/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/direct-cnr/cases"] });
      if (selectedCaseId) {
        queryClient.invalidateQueries({ queryKey: ["/api/direct-cnr/cases", selectedCaseId] });
      }
    },
    onError: (error: any) => {
      toast({ title: "Monitoring Check Failed", description: error.message, variant: "destructive" });
    },
  });

  const onCnrSubmit = (data: CnrFormValues) => {
    registerCaseMutation.mutate(data);
  };

  const onAdvocateSubmit = (data: AdvocateFormValues) => {
    createAdvocateMutation.mutate(data);
  };

  const isProcessing = registerCaseMutation.isPending || extractCaseMutation.isPending || processCaseMutation.isPending;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Direct CNR Management</h1>
          <p className="text-muted-foreground">Single-case workflow with eCourts integration and AI classification</p>
        </div>
      </div>

      <Tabs defaultValue="cases" className="space-y-4">
        <TabsList data-testid="tabs-direct-cnr">
          <TabsTrigger value="cases" data-testid="tab-cases">
            <Scale className="h-4 w-4 mr-2" />
            Cases
          </TabsTrigger>
          <TabsTrigger value="advocates" data-testid="tab-advocates">
            <User className="h-4 w-4 mr-2" />
            Advocates
          </TabsTrigger>
          <TabsTrigger value="monitoring" data-testid="tab-monitoring">
            <Clock className="h-4 w-4 mr-2" />
            Monitoring
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cases" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Register New Case
                </CardTitle>
                <CardDescription>Enter CNR to fetch from eCourts</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...cnrForm}>
                  <form onSubmit={cnrForm.handleSubmit(onCnrSubmit)} className="space-y-4">
                    <FormField
                      control={cnrForm.control}
                      name="cnr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CNR Number</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                {...field}
                                placeholder="DLWT010127152025"
                                className="font-mono uppercase"
                                maxLength={16}
                                onChange={(e) => {
                                  field.onChange(e);
                                  validateCnr(e.target.value);
                                }}
                                data-testid="input-cnr"
                              />
                              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                {isValidating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                {cnrValidation?.valid && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                                {cnrValidation && !cnrValidation.valid && <XCircle className="h-4 w-4 text-destructive" />}
                              </div>
                            </div>
                          </FormControl>
                          <FormDescription className="text-xs space-y-1">
                            <div>Format: DL + District(2) + Est(00-10) + Serial(6) + Year(4)</div>
                            <div className="text-muted-foreground/70">Districts: CT, ET, ND, NT, NE, NW, SH, ST, SE, SW, WT | Years: 2010-2026</div>
                          </FormDescription>
                          {cnrValidation?.valid && cnrValidation.data && (
                            <div className="text-xs text-muted-foreground mt-1">
                              District: {cnrValidation.data.districtCode} | Serial: {cnrValidation.data.serialNumber} | Year: {cnrValidation.data.year}
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={cnrForm.control}
                      name="advocateId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assign Advocate (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-advocate">
                                <SelectValue placeholder="Select advocate" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {advocates?.data?.map((adv) => (
                                <SelectItem key={adv.id} value={adv.id.toString()}>
                                  {adv.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={!cnrValidation?.valid || isProcessing}
                      data-testid="button-register-case"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4 mr-2" />
                          Register & Extract
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Registered Cases</CardTitle>
                <CardDescription>{cases?.data?.length || 0} cases tracked</CardDescription>
              </CardHeader>
              <CardContent>
                {casesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : cases?.data?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Scale className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No cases registered yet</p>
                    <p className="text-sm">Enter a CNR to get started</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {cases?.data?.map((c) => (
                        <div
                          key={c.id}
                          className={`p-3 rounded-md border cursor-pointer transition-colors ${
                            selectedCaseId === c.id ? "border-primary bg-accent/50" : "hover-elevate"
                          }`}
                          onClick={() => setSelectedCaseId(c.id)}
                          data-testid={`case-row-${c.id}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
                                {c.cnr}
                              </code>
                              {c.caseDetailsExtracted && (
                                <Badge variant="outline" className="shrink-0">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Extracted
                                </Badge>
                              )}
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCaseId(c.id);
                              }}
                              data-testid={`button-view-case-${c.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                          {c.petitionerName && (
                            <p className="text-sm text-muted-foreground mt-1 truncate">
                              {c.petitionerName} vs {c.respondentName}
                            </p>
                          )}
                          {c.nextHearingDate && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              Next: {c.nextHearingDate}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          {selectedCase?.data && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="font-mono">{selectedCase.data.cnr}</CardTitle>
                    <CardDescription>
                      {selectedCase.data.petitionerName} vs {selectedCase.data.respondentName}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {!selectedCase.data.caseDetailsExtracted && (
                      <Button
                        variant="outline"
                        onClick={() => extractCaseMutation.mutate(selectedCase.data.id)}
                        disabled={extractCaseMutation.isPending}
                        data-testid="button-extract-details"
                      >
                        {extractCaseMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Extract from eCourts
                      </Button>
                    )}
                    {selectedCase.data.caseDetailsExtracted && (
                      <Button
                        onClick={() => processCaseMutation.mutate(selectedCase.data.id)}
                        disabled={processCaseMutation.isPending}
                        variant={(selectedCase.data.orders?.length || 0) === 0 ? "outline" : "default"}
                        data-testid="button-process-case"
                      >
                        {processCaseMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Brain className="h-4 w-4 mr-2" />
                        )}
                        {(selectedCase.data.orders?.length || 0) === 0 ? "Retry Processing" : "Process All Orders"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4 mb-6">
                  <div className="text-center p-3 bg-muted/50 rounded-md" data-testid="stat-orders-count">
                    <div className="text-2xl font-semibold">{selectedCase.data.orders?.length || 0}</div>
                    <div className="text-xs text-muted-foreground">Orders</div>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-md" data-testid="stat-pdfs-count">
                    <div className="text-2xl font-semibold">
                      {selectedCase.data.orders?.filter((o) => o.pdfExists).length || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">PDFs Downloaded</div>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-md" data-testid="stat-texts-count">
                    <div className="text-2xl font-semibold">
                      {selectedCase.data.orders?.filter((o) => o.textExtracted).length || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Text Extracted</div>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-md" data-testid="stat-classified-count">
                    <div className="text-2xl font-semibold">
                      {selectedCase.data.orders?.filter((o) => o.classificationDone).length || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Classified</div>
                  </div>
                </div>

                {selectedCase.data.caseDetailsExtracted && (
                  <>
                    <h3 className="text-lg font-medium mb-3">Case Details</h3>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 mb-4">
                      <div className="p-3 bg-muted/30 rounded-md">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Case Type</div>
                        <div className="font-medium">{selectedCase.data.caseType || "—"}</div>
                      </div>
                      <div className="p-3 bg-muted/30 rounded-md">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Filing Number</div>
                        <div className="font-medium">{selectedCase.data.filingNumber || "—"}</div>
                      </div>
                      <div className="p-3 bg-muted/30 rounded-md">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Registration Number</div>
                        <div className="font-medium">{selectedCase.data.registrationNumber || "—"}</div>
                      </div>
                      <div className="p-3 bg-muted/30 rounded-md">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">First Hearing</div>
                        <div className="font-medium">{selectedCase.data.firstHearingDate || "—"}</div>
                      </div>
                      <div className="p-3 bg-muted/30 rounded-md">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Next Hearing</div>
                        <div className="font-medium">{selectedCase.data.nextHearingDate || "—"}</div>
                      </div>
                      <div className="p-3 bg-muted/30 rounded-md">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Case Stage</div>
                        <div className="font-medium">{selectedCase.data.caseStage || "—"}</div>
                      </div>
                      <div className="p-3 bg-muted/30 rounded-md md:col-span-2 lg:col-span-3">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Court</div>
                        <div className="font-medium">{selectedCase.data.courtName || "—"}</div>
                      </div>
                    </div>

                    <h4 className="text-sm font-medium mb-2">Parties</h4>
                    <div className="grid gap-3 md:grid-cols-2 mb-4">
                      <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md">
                        <div className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide">Petitioner</div>
                        <div className="font-medium">{selectedCase.data.petitionerName || "—"}</div>
                        {selectedCase.data.petitionerAdvocate && (
                          <div className="text-sm text-muted-foreground mt-1">
                            Adv: {selectedCase.data.petitionerAdvocate}
                          </div>
                        )}
                      </div>
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md">
                        <div className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide">Respondent</div>
                        <div className="font-medium">{selectedCase.data.respondentName || "—"}</div>
                        {selectedCase.data.respondentAdvocate && (
                          <div className="text-sm text-muted-foreground mt-1">
                            Adv: {selectedCase.data.respondentAdvocate}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                <Separator className="my-4" />

                {/* Party Perspective & Master Summary Controls */}
                <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-medium">Orders & AI Summaries</h3>
                    {selectedCase.data.representedParty && (
                      <Badge variant="outline" className="ml-2">
                        <Users className="h-3 w-3 mr-1" />
                        {selectedCase.data.representedParty === "petitioner" ? "Petitioner" : "Respondent"} View
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedParty(selectedCase.data.representedParty || "");
                        setPartyDialogOpen(true);
                      }}
                      data-testid="button-set-party"
                    >
                      <Users className="h-4 w-4 mr-2" />
                      {selectedCase.data.representedParty ? "Change Perspective" : "Set Party Perspective"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowMasterSummary(!showMasterSummary)}
                      data-testid="button-master-summary"
                    >
                      <BarChart3 className="h-4 w-4 mr-2" />
                      {showMasterSummary ? "Hide Summary" : "Master Summary"}
                    </Button>
                  </div>
                </div>

                {/* Master Summary Panel */}
                {showMasterSummary && (
                  <Card className="mb-4 bg-primary/5 border-primary/20">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-4">
                        <CardTitle className="text-base flex items-center gap-2">
                          <BarChart3 className="h-5 w-5" />
                          Master Case Summary
                        </CardTitle>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateSummaryMutation.mutate(selectedCaseId!)}
                          disabled={generateSummaryMutation.isPending}
                          data-testid="button-generate-summary"
                        >
                          {generateSummaryMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-1" />
                          )}
                          {masterSummary?.success ? "Refresh" : "Generate"}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {summaryLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : masterSummary?.success && masterSummary.data ? (
                        <div className="space-y-4">
                          {/* Current Stage */}
                          {masterSummary.data.currentStage && (
                            <div>
                              <h4 className="text-sm font-medium mb-1">Current Stage</h4>
                              <Badge>{masterSummary.data.currentStage}</Badge>
                            </div>
                          )}

                          {/* Bird's Eye View */}
                          {masterSummary.data.advocateBirdEyeView && (
                            <div>
                              <h4 className="text-sm font-medium mb-1">Advocate Overview</h4>
                              <p className="text-sm text-muted-foreground whitespace-pre-line">
                                {masterSummary.data.advocateBirdEyeView}
                              </p>
                            </div>
                          )}

                          {/* Adjournment Stats */}
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="p-3 rounded-md bg-background border">
                              <div className="text-2xl font-bold">{masterSummary.data.petitionerAdjournments}</div>
                              <div className="text-xs text-muted-foreground">Petitioner Adjournments</div>
                            </div>
                            <div className="p-3 rounded-md bg-background border">
                              <div className="text-2xl font-bold">{masterSummary.data.respondentAdjournments}</div>
                              <div className="text-xs text-muted-foreground">Respondent Adjournments</div>
                            </div>
                            <div className="p-3 rounded-md bg-background border">
                              <div className="text-2xl font-bold">{masterSummary.data.courtAdjournments}</div>
                              <div className="text-xs text-muted-foreground">Court Adjournments</div>
                            </div>
                          </div>

                          {/* Pending Actions */}
                          {masterSummary.data.pendingActions?.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium mb-2">Pending Actions</h4>
                              <ul className="space-y-1">
                                {masterSummary.data.pendingActions.map((action, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm">
                                    <AlertCircle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                                    {action}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Timeline */}
                          {masterSummary.data.timeline?.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium mb-2">Timeline</h4>
                              <div className="space-y-2 max-h-48 overflow-y-auto">
                                {masterSummary.data.timeline.map((item, i) => (
                                  <div key={i} className="flex items-start gap-3 text-sm p-2 rounded bg-background border">
                                    <span className="font-mono text-xs text-muted-foreground shrink-0">{item.date}</span>
                                    <span>{item.event}</span>
                                    {item.party && (
                                      <Badge variant="outline" className="shrink-0">{item.party}</Badge>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="text-xs text-muted-foreground pt-2 border-t">
                            Last updated: {new Date(masterSummary.data.lastCompiledAt).toLocaleString()} | {masterSummary.data.ordersIncluded} orders analyzed
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-6 text-muted-foreground">
                          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No master summary generated yet</p>
                          <p className="text-sm">Click "Generate" to create a comprehensive case overview</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
                {!selectedCase.data.orders || selectedCase.data.orders.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    {!selectedCase.data.caseDetailsExtracted ? (
                      <>
                        <p>Case not yet extracted from eCourts</p>
                        <p className="text-sm">Click "Extract from eCourts" to fetch case details and orders</p>
                      </>
                    ) : (
                      <>
                        <p>No orders found for this case</p>
                        <p className="text-sm">The case may not have any orders yet on eCourts</p>
                      </>
                    )}
                  </div>
                ) : (
                  <Accordion type="single" collapsible className="space-y-2">
                    {selectedCase.data.orders?.map((order) => (
                      <AccordionItem key={order.id} value={`order-${order.id}`} className="border rounded-md px-4">
                        <AccordionTrigger className="hover:no-underline py-3" data-testid={`accordion-order-${order.id}`}>
                          <div className="flex items-center gap-3 text-left flex-wrap">
                            <Badge variant={order.classificationDone ? "default" : "secondary"}>
                              Order {order.orderNo}
                            </Badge>
                            <span className="text-sm text-muted-foreground">{order.orderDate}</span>
                            <div className="flex items-center gap-1">
                              {order.pdfExists ? (
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                              ) : (
                                <XCircle className="h-3 w-3 text-muted-foreground" />
                              )}
                              {order.textExtracted ? (
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                              ) : (
                                <XCircle className="h-3 w-3 text-muted-foreground" />
                              )}
                              {order.classificationDone ? (
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                              ) : (
                                <XCircle className="h-3 w-3 text-muted-foreground" />
                              )}
                            </div>
                            {order.pdfExists && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="ml-auto"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPdfPreviewOrderId(order.id);
                                }}
                                data-testid={`button-preview-pdf-${order.id}`}
                              >
                                <FileSearch className="h-3 w-3 mr-1" />
                                View PDF
                              </Button>
                            )}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 pb-4">
                          {order.summary ? (
                            <div className="space-y-4">
                              <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                  <h4 className="text-sm font-medium mb-1">Case Category</h4>
                                  <Badge variant="outline">{order.summary.caseCategory || "N/A"}</Badge>
                                </div>
                                <div>
                                  <h4 className="text-sm font-medium mb-1">Order Type</h4>
                                  <Badge variant="outline">{order.summary.orderType || "N/A"}</Badge>
                                </div>
                              </div>
                              {order.summary.orderSummary && (
                                <div>
                                  <h4 className="text-sm font-medium mb-1">Summary</h4>
                                  <p className="text-sm text-muted-foreground">{order.summary.orderSummary}</p>
                                </div>
                              )}
                              {order.summary.preparationNotes && (
                                <div className="p-3 bg-primary/5 rounded-md border border-primary/20">
                                  <h4 className="text-sm font-medium mb-1 flex items-center gap-2">
                                    <Briefcase className="h-4 w-4" />
                                    Advocate Preparation Notes
                                  </h4>
                                  <p className="text-sm">{order.summary.preparationNotes}</p>
                                </div>
                              )}
                              {order.summary.actionItems && (() => {
                                try {
                                  const items = JSON.parse(order.summary.actionItems);
                                  if (Array.isArray(items) && items.length > 0) {
                                    return (
                                      <div>
                                        <h4 className="text-sm font-medium mb-2">Action Items</h4>
                                        <ul className="space-y-1">
                                          {items.map((item: string, i: number) => (
                                            <li key={i} className="flex items-start gap-2 text-sm">
                                              <AlertCircle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                                              {item}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    );
                                  }
                                  return null;
                                } catch {
                                  return null;
                                }
                              })()}
                              {order.summary.nextHearingDate && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Calendar className="h-4 w-4" />
                                  <span className="font-medium">Next Hearing:</span>
                                  {order.summary.nextHearingDate}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-center py-4 text-muted-foreground">
                              <p>Order not yet classified</p>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="advocates" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Advocates</CardTitle>
                  <CardDescription>Manage advocates for case assignments</CardDescription>
                </div>
                <Dialog open={advocateDialogOpen} onOpenChange={setAdvocateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-add-advocate">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Advocate
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Advocate</DialogTitle>
                    </DialogHeader>
                    <Form {...advocateForm}>
                      <form onSubmit={advocateForm.handleSubmit(onAdvocateSubmit)} className="space-y-4">
                        <FormField
                          control={advocateForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Name</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Advocate name" data-testid="input-advocate-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={advocateForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input {...field} type="email" placeholder="email@example.com" data-testid="input-advocate-email" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={advocateForm.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Phone</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="+91 98765 43210" data-testid="input-advocate-phone" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={advocateForm.control}
                          name="barCouncilId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Bar Council ID</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="DL/12345/2020" data-testid="input-advocate-barid" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button type="submit" className="w-full" disabled={createAdvocateMutation.isPending} data-testid="button-save-advocate">
                          {createAdvocateMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : null}
                          Save Advocate
                        </Button>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {advocatesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : advocates?.data?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No advocates added yet</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {advocates?.data?.map((adv) => (
                    <Card key={adv.id} className="bg-muted/30">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-medium">{adv.name}</h3>
                            {adv.barCouncilId && (
                              <p className="text-xs font-mono text-muted-foreground">{adv.barCouncilId}</p>
                            )}
                          </div>
                          <Badge variant={adv.isActive ? "default" : "secondary"}>
                            {adv.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        {adv.email && <p className="text-sm mt-2">{adv.email}</p>}
                        {adv.phone && <p className="text-sm text-muted-foreground">{adv.phone}</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Active Monitoring Schedules</CardTitle>
                  <CardDescription>30-day automated order checks after hearings</CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={() => runMonitoringMutation.mutate()}
                  disabled={runMonitoringMutation.isPending}
                  data-testid="button-run-monitoring"
                >
                  {runMonitoringMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Run Check Now
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {monitoring?.data?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No active monitoring schedules</p>
                  <p className="text-sm">Schedules are created automatically after case processing</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {monitoring?.data?.map((schedule) => (
                    <div
                      key={schedule.id}
                      className="flex items-center justify-between gap-4 p-4 border rounded-md"
                      data-testid={`monitoring-schedule-${schedule.id}`}
                    >
                      <div>
                        <div className="font-medium">Case ID: {schedule.caseId}</div>
                        <div className="text-sm text-muted-foreground">
                          Trigger: {schedule.triggerDate} | Monitoring: {schedule.startMonitoringDate} to {schedule.endMonitoringDate}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={schedule.orderFound ? "default" : "secondary"}>
                          {schedule.orderFound ? "Order Found" : `${schedule.totalChecks} checks`}
                        </Badge>
                        {schedule.isActive ? (
                          <Badge variant="outline" className="border-green-500 text-green-500">Active</Badge>
                        ) : (
                          <Badge variant="outline">Completed</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Party Selection Dialog */}
      <Dialog open={partyDialogOpen} onOpenChange={setPartyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Select Your Party
            </DialogTitle>
            <DialogDescription>
              Choose which party you represent. AI analysis will be tailored to provide strategic guidance from your perspective.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={selectedParty} onValueChange={setSelectedParty} className="space-y-3 pt-4">
            <div className="flex items-center space-x-3 p-3 border rounded-md hover-elevate cursor-pointer" onClick={() => setSelectedParty("petitioner")}>
              <RadioGroupItem value="petitioner" id="petitioner" data-testid="radio-petitioner" />
              <Label htmlFor="petitioner" className="flex-1 cursor-pointer">
                <div className="font-medium">Petitioner / Complainant</div>
                <div className="text-sm text-muted-foreground">You represent the party who filed the case</div>
              </Label>
            </div>
            <div className="flex items-center space-x-3 p-3 border rounded-md hover-elevate cursor-pointer" onClick={() => setSelectedParty("respondent")}>
              <RadioGroupItem value="respondent" id="respondent" data-testid="radio-respondent" />
              <Label htmlFor="respondent" className="flex-1 cursor-pointer">
                <div className="font-medium">Respondent / Defendant</div>
                <div className="text-sm text-muted-foreground">You represent the party against whom the case was filed</div>
              </Label>
            </div>
          </RadioGroup>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setPartyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedCaseId && selectedParty) {
                  setPartyMutation.mutate({ caseId: selectedCaseId, party: selectedParty });
                }
              }}
              disabled={!selectedParty || setPartyMutation.isPending}
              data-testid="button-confirm-party"
            >
              {setPartyMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Set Perspective
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Preview Dialog */}
      <Dialog open={pdfPreviewOrderId !== null} onOpenChange={(open) => !open && setPdfPreviewOrderId(null)}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Order PDF Preview
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 h-full min-h-0">
            {pdfPreviewOrderId && (
              <iframe
                src={`/api/direct-cnr/orders/${pdfPreviewOrderId}/pdf`}
                className="w-full h-full border rounded-md"
                title="PDF Preview"
                data-testid="iframe-pdf-preview"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
