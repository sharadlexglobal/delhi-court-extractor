import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Briefcase,
  Search,
  Download,
  Building2,
  Mail,
  Phone,
  MapPin,
  User,
  FileText,
  ExternalLink,
  RefreshCw,
  X,
  Calendar,
  Scale,
  UserPlus,
} from "lucide-react";
import type { BusinessEntity, EntityContact, PersonLead } from "@shared/schema";

interface EntityWithContacts extends BusinessEntity {
  contacts?: EntityContact[];
  casesCount?: number;
}

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  enriched: "bg-emerald-500",
  contacted: "bg-blue-500",
  qualified: "bg-amber-500 text-amber-950",
  won: "bg-emerald-600",
  lost: "bg-red-500",
};

export default function Leads() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedEntity, setSelectedEntity] = useState<EntityWithContacts | null>(null);
  const [selectedPersonLead, setSelectedPersonLead] = useState<PersonLead | null>(null);
  const [activeTab, setActiveTab] = useState("business");
  const { toast } = useToast();

  const { data: entities, isLoading: isLoadingEntities } = useQuery<EntityWithContacts[]>({
    queryKey: ["/api/leads"],
  });

  const { data: personLeads, isLoading: isLoadingPersonLeads } = useQuery<PersonLead[]>({
    queryKey: ["/api/person-leads"],
  });

  const enrichMutation = useMutation({
    mutationFn: async (entityId: number) => {
      const response = await apiRequest("POST", `/api/leads/${entityId}/enrich`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Enrichment Started",
        description: "Contact data enrichment has been queued",
      });
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

  const filteredEntities = entities?.filter((entity) => {
    const matchesSearch =
      !search ||
      entity.name.toLowerCase().includes(search.toLowerCase()) ||
      entity.cin?.toLowerCase().includes(search.toLowerCase()) ||
      entity.gstin?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || entity.enrichmentStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const filteredPersonLeads = personLeads?.filter((lead) => {
    const matchesSearch =
      !search ||
      lead.name.toLowerCase().includes(search.toLowerCase()) ||
      lead.caseNumber?.toLowerCase().includes(search.toLowerCase()) ||
      lead.caseType?.toLowerCase().includes(search.toLowerCase());

    return matchesSearch;
  });

  const exportBusinessCsv = () => {
    if (!filteredEntities?.length) return;

    const headers = ["Name", "Type", "CIN", "GSTIN", "Email", "Phone", "Address", "Status"];
    const rows = filteredEntities.map((e) => [
      e.name,
      e.entityType,
      e.cin || "",
      e.gstin || "",
      e.email || "",
      e.phone || "",
      e.registeredAddress || "",
      e.enrichmentStatus || "",
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `business-leads-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPersonCsv = () => {
    if (!filteredPersonLeads?.length) return;

    const headers = ["Name", "Party Role", "Case Type", "Case Number", "Petitioner", "Address", "Next Hearing", "Court", "Judge"];
    const rows = filteredPersonLeads.map((p) => [
      p.name,
      p.partyRole,
      p.caseType || "",
      p.caseNumber || "",
      p.petitionerName || "",
      p.address || "",
      p.nextHearingDate || "",
      p.courtName || "",
      p.judgeName || "",
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `person-leads-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold" data-testid="text-page-title">
            Leads
          </h1>
          <p className="text-sm text-muted-foreground">
            Business entities and individuals identified from court orders
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={activeTab === "business" ? exportBusinessCsv : exportPersonCsv} 
            data-testid="button-export"
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="business" data-testid="tab-business-leads">
            <Building2 className="mr-2 h-4 w-4" />
            Business Leads ({entities?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="person" data-testid="tab-person-leads">
            <UserPlus className="mr-2 h-4 w-4" />
            Fresh Case Leads ({personLeads?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="business">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 sm:max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, CIN, or GSTIN..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-business"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Leads</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="enriched">Enriched</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="won">Won</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
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
              {isLoadingEntities ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-4">
                        <div className="h-6 w-3/4 rounded bg-muted" />
                        <div className="mt-2 h-4 w-1/2 rounded bg-muted" />
                        <div className="mt-4 h-4 w-full rounded bg-muted" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : !filteredEntities?.length ? (
                <div className="flex min-h-[200px] items-center justify-center rounded-md border border-dashed">
                  <div className="text-center">
                    <Briefcase className="mx-auto h-10 w-10 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      No business leads found
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Leads are identified from classified orders
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredEntities.map((entity) => (
                    <Card
                      key={entity.id}
                      className="cursor-pointer hover-elevate active-elevate-2 overflow-visible"
                      onClick={() => setSelectedEntity(entity)}
                      data-testid={`card-lead-${entity.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-medium" data-testid={`text-entity-name-${entity.id}`}>
                              {entity.name}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {entity.entityType}
                            </p>
                          </div>
                          <Badge
                            className={statusColors[entity.enrichmentStatus || "pending"]}
                          >
                            {entity.enrichmentStatus || "pending"}
                          </Badge>
                        </div>

                        <div className="mt-4 space-y-2 text-sm">
                          {entity.cin && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Building2 className="h-4 w-4 shrink-0" />
                              <span className="truncate font-mono">{entity.cin}</span>
                            </div>
                          )}
                          {entity.email && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Mail className="h-4 w-4 shrink-0" />
                              <span className="truncate">{entity.email}</span>
                            </div>
                          )}
                          {entity.phone && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Phone className="h-4 w-4 shrink-0" />
                              <span>{entity.phone}</span>
                            </div>
                          )}
                          {entity.city && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <MapPin className="h-4 w-4 shrink-0" />
                              <span>
                                {entity.city}
                                {entity.state ? `, ${entity.state}` : ""}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <FileText className="h-3 w-3" />
                            {entity.casesCount ?? 0} cases
                          </div>
                          {entity.enrichmentStatus === "pending" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                enrichMutation.mutate(entity.id);
                              }}
                              disabled={enrichMutation.isPending}
                              data-testid={`button-enrich-${entity.id}`}
                            >
                              <RefreshCw className={`mr-1 h-3 w-3 ${enrichMutation.isPending ? "animate-spin" : ""}`} />
                              Enrich
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="person">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 sm:max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, case number, or type..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-person"
                  />
                </div>
                {search && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearch("")}
                    data-testid="button-clear-person-search"
                  >
                    <X className="mr-1 h-4 w-4" />
                    Clear
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingPersonLeads ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-4">
                        <div className="h-6 w-3/4 rounded bg-muted" />
                        <div className="mt-2 h-4 w-1/2 rounded bg-muted" />
                        <div className="mt-4 h-4 w-full rounded bg-muted" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : !filteredPersonLeads?.length ? (
                <div className="flex min-h-[200px] items-center justify-center rounded-md border border-dashed">
                  <div className="text-center">
                    <UserPlus className="mx-auto h-10 w-10 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      No fresh case leads found
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Individual respondents from fresh case assignments will appear here
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredPersonLeads.map((lead) => (
                    <Card
                      key={lead.id}
                      className="cursor-pointer hover-elevate active-elevate-2 overflow-visible"
                      onClick={() => setSelectedPersonLead(lead)}
                      data-testid={`card-person-lead-${lead.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-medium" data-testid={`text-person-name-${lead.id}`}>
                              {lead.name}
                            </h3>
                            <p className="text-sm text-muted-foreground capitalize">
                              {lead.partyRole}
                            </p>
                          </div>
                          {lead.isFreshCase && (
                            <Badge className="bg-amber-500 text-amber-950">
                              Fresh Case
                            </Badge>
                          )}
                        </div>

                        <div className="mt-4 space-y-2 text-sm">
                          {lead.caseType && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Scale className="h-4 w-4 shrink-0" />
                              <span className="truncate">{lead.caseType}</span>
                            </div>
                          )}
                          {lead.caseNumber && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <FileText className="h-4 w-4 shrink-0" />
                              <span className="truncate font-mono">{lead.caseNumber}</span>
                            </div>
                          )}
                          {lead.nextHearingDate && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Calendar className="h-4 w-4 shrink-0" />
                              <span>{lead.nextHearingDate}</span>
                            </div>
                          )}
                          {lead.courtName && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Building2 className="h-4 w-4 shrink-0" />
                              <span className="truncate">{lead.courtName}</span>
                            </div>
                          )}
                        </div>

                        {lead.petitionerName && (
                          <div className="mt-3 border-t pt-3">
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium">vs </span>
                              {lead.petitionerName}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedEntity} onOpenChange={() => setSelectedEntity(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              {selectedEntity?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedEntity && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-6 pr-4">
                <div className="flex items-center gap-2">
                  <Badge className={statusColors[selectedEntity.enrichmentStatus || "pending"]}>
                    {selectedEntity.enrichmentStatus || "pending"}
                  </Badge>
                  <Badge variant="outline">{selectedEntity.entityType}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {selectedEntity.cin && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">CIN</p>
                      <p className="font-mono">{selectedEntity.cin}</p>
                    </div>
                  )}
                  {selectedEntity.llpin && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">LLPIN</p>
                      <p className="font-mono">{selectedEntity.llpin}</p>
                    </div>
                  )}
                  {selectedEntity.gstin && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">GSTIN</p>
                      <p className="font-mono">{selectedEntity.gstin}</p>
                    </div>
                  )}
                  {selectedEntity.pan && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">PAN</p>
                      <p className="font-mono">{selectedEntity.pan}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Contact Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedEntity.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={`mailto:${selectedEntity.email}`}
                          className="text-sm hover:underline"
                        >
                          {selectedEntity.email}
                        </a>
                      </div>
                    )}
                    {selectedEntity.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{selectedEntity.phone}</span>
                      </div>
                    )}
                    {selectedEntity.website && (
                      <div className="flex items-center gap-2">
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={selectedEntity.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm hover:underline"
                        >
                          {selectedEntity.website}
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {selectedEntity.registeredAddress && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Registered Address</h4>
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <p className="text-sm">
                        {selectedEntity.registeredAddress}
                        {selectedEntity.city && `, ${selectedEntity.city}`}
                        {selectedEntity.state && `, ${selectedEntity.state}`}
                        {selectedEntity.pincode && ` - ${selectedEntity.pincode}`}
                      </p>
                    </div>
                  </div>
                )}

                {selectedEntity.contacts && selectedEntity.contacts.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Directors / Contacts</h4>
                    <div className="space-y-3">
                      {selectedEntity.contacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="flex items-start gap-3 rounded-md bg-muted/50 p-3"
                        >
                          <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{contact.name}</p>
                            {contact.designation && (
                              <p className="text-sm text-muted-foreground">
                                {contact.designation}
                              </p>
                            )}
                            {contact.din && (
                              <p className="font-mono text-xs text-muted-foreground">
                                DIN: {contact.din}
                              </p>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                              {contact.email && (
                                <a
                                  href={`mailto:${contact.email}`}
                                  className="hover:underline"
                                >
                                  {contact.email}
                                </a>
                              )}
                              {contact.phone && <span>{contact.phone}</span>}
                            </div>
                          </div>
                          {contact.isPrimary && (
                            <Badge variant="secondary">
                              Primary
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4">
                  {selectedEntity.enrichmentStatus === "pending" && (
                    <Button
                      onClick={() => enrichMutation.mutate(selectedEntity.id)}
                      disabled={enrichMutation.isPending}
                      data-testid="button-enrich-modal"
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${enrichMutation.isPending ? "animate-spin" : ""}`} />
                      Enrich Contact Data
                    </Button>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedPersonLead} onOpenChange={() => setSelectedPersonLead(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {selectedPersonLead?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedPersonLead && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-6 pr-4">
                <div className="flex items-center gap-2">
                  {selectedPersonLead.isFreshCase && (
                    <Badge className="bg-amber-500 text-amber-950">Fresh Case</Badge>
                  )}
                  <Badge variant="outline" className="capitalize">{selectedPersonLead.partyRole}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {selectedPersonLead.caseType && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Case Type</p>
                      <p>{selectedPersonLead.caseType}</p>
                    </div>
                  )}
                  {selectedPersonLead.caseNumber && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Case Number</p>
                      <p className="font-mono">{selectedPersonLead.caseNumber}</p>
                    </div>
                  )}
                  {selectedPersonLead.courtName && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Court</p>
                      <p>{selectedPersonLead.courtName}</p>
                    </div>
                  )}
                  {selectedPersonLead.judgeName && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Judge</p>
                      <p>{selectedPersonLead.judgeName}</p>
                    </div>
                  )}
                  {selectedPersonLead.nextHearingDate && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Next Hearing</p>
                      <p>{selectedPersonLead.nextHearingDate}</p>
                    </div>
                  )}
                  {selectedPersonLead.confidence && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Confidence</p>
                      <p>{Math.round(selectedPersonLead.confidence * 100)}%</p>
                    </div>
                  )}
                </div>

                {selectedPersonLead.petitionerName && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Petitioner / Plaintiff</h4>
                    <p className="text-sm">{selectedPersonLead.petitionerName}</p>
                  </div>
                )}

                {selectedPersonLead.address && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Address</h4>
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <p className="text-sm">{selectedPersonLead.address}</p>
                    </div>
                  </div>
                )}

                {selectedPersonLead.phone && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Contact</h4>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{selectedPersonLead.phone}</span>
                    </div>
                  </div>
                )}

                {selectedPersonLead.freshCasePhrase && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Detection Phrase</h4>
                    <p className="rounded-md bg-muted/50 p-3 text-sm italic">
                      "{selectedPersonLead.freshCasePhrase}"
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
