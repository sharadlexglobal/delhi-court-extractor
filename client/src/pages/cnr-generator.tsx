import { useState } from "react";
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
import { Hash, ChevronDown, Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { District, Cnr } from "@shared/schema";

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
  const { toast } = useToast();

  const { data: districts, isLoading: districtsLoading } = useQuery<District[]>({
    queryKey: ["/api/districts"],
  });

  const { data: recentCnrs, isLoading: cnrsLoading } = useQuery<GeneratedCnr[]>({
    queryKey: ["/api/cnrs?limit=50"],
  });

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

  const onSubmit = (values: GenerateFormValues) => {
    generateMutation.mutate(values);
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
            <Badge variant="secondary" size="sm">
              Pending
            </Badge>
          );
        }
        return row.isValid ? (
          <Badge variant="default" size="sm" className="bg-emerald-500">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Valid
          </Badge>
        ) : (
          <Badge variant="secondary" size="sm">
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
          </CardContent>
        </Card>

        <Card className="flex-1">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
            <CardTitle className="text-lg font-semibold">
              Generated CNRs
            </CardTitle>
            <Badge variant="secondary" size="sm">
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
