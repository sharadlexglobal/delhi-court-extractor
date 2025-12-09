import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { useState } from "react";
import {
  BarChart3,
  TrendingUp,
  FileText,
  Briefcase,
  Building2,
  Calendar,
} from "lucide-react";

interface DistrictStats {
  districtName: string;
  cnrsCount: number;
  ordersCount: number;
  leadsCount: number;
}

interface TrendData {
  date: string;
  pdfs: number;
  leads: number;
}

interface OrderTypeData {
  type: string;
  count: number;
}

const COLORS = ["#1e3a5f", "#c9a227", "#059669", "#dc2626", "#7c3aed", "#0891b2"];

export default function Analytics() {
  const [dateRange, setDateRange] = useState("30");

  const { data: districtStats, isLoading: districtLoading } = useQuery<DistrictStats[]>({
    queryKey: ["/api/analytics/by-district"],
  });

  const { data: trends, isLoading: trendsLoading } = useQuery<TrendData[]>({
    queryKey: [`/api/analytics/trends?days=${dateRange}`],
  });

  const { data: orderTypes, isLoading: typesLoading } = useQuery<OrderTypeData[]>({
    queryKey: ["/api/analytics/order-types"],
  });

  const totalCnrs = districtStats?.reduce((sum, d) => sum + d.cnrsCount, 0) ?? 0;
  const totalOrders = districtStats?.reduce((sum, d) => sum + d.ordersCount, 0) ?? 0;
  const totalLeads = districtStats?.reduce((sum, d) => sum + d.leadsCount, 0) ?? 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold" data-testid="text-page-title">
            Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Insights and trends from court order extraction
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[160px]" data-testid="select-date-range">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total CNRs</p>
              <p className="font-serif text-3xl font-semibold">{totalCnrs.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-accent/10">
              <TrendingUp className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Orders Processed</p>
              <p className="font-serif text-3xl font-semibold">{totalOrders.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-amber-500/10">
              <Briefcase className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Business Leads</p>
              <p className="font-serif text-3xl font-semibold">{totalLeads.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Building2 className="h-5 w-5" />
              Orders by District
            </CardTitle>
          </CardHeader>
          <CardContent>
            {districtLoading ? (
              <div className="flex h-[300px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : districtStats?.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={districtStats}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                  <XAxis type="number" />
                  <YAxis dataKey="districtName" type="category" width={75} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                    }}
                  />
                  <Bar dataKey="ordersCount" fill="hsl(var(--primary))" name="Orders" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <BarChart3 className="h-5 w-5" />
              Order Type Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {typesLoading ? (
              <div className="flex h-[300px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : orderTypes?.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={orderTypes}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    dataKey="count"
                    nameKey="type"
                    label={({ type, percent }) => `${type} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {orderTypes.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <TrendingUp className="h-5 w-5" />
              Processing Trends
            </CardTitle>
            <Badge variant="secondary">{dateRange} days</Badge>
          </CardHeader>
          <CardContent>
            {trendsLoading ? (
              <div className="flex h-[300px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : trends?.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trends} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="pdfs"
                    stroke="hsl(var(--primary))"
                    name="PDFs Downloaded"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="leads"
                    stroke="hsl(var(--accent))"
                    name="Leads Generated"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                No trend data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
