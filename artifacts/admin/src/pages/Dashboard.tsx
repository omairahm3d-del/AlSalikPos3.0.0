import { Link } from "wouter";
import { useCompanies } from "@/hooks/useAdminApi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Mail, Clock, ShieldAlert } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export function Dashboard() {
  const { data, isLoading, error } = useCompanies();

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-6 flex flex-col items-center justify-center text-center space-y-2">
            <ShieldAlert className="h-8 w-8 text-destructive" />
            <h2 className="text-lg font-semibold text-destructive">Failed to load companies</h2>
            <p className="text-sm text-destructive/80">Check your connection and API key.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const companies = data?.companies || [];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Companies</h1>
          <p className="text-muted-foreground mt-1">Manage POS customers and their licenses.</p>
        </div>
        <Link href="/companies/new" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
          <Plus className="mr-2 h-4 w-4" />
          New Company
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-1/3 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mt-4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : companies.length === 0 ? (
        <Card className="border-dashed border-2 bg-transparent shadow-none">
          <CardContent className="pt-12 pb-12 flex flex-col items-center justify-center text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">No companies yet</h2>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                Get started by onboarding your first customer. They will receive a license key to activate their POS devices.
              </p>
            </div>
            <Link href="/companies/new" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create Company
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <Link key={company.id} href={`/companies/${company.id}`}>
              <Card className="hover-elevate cursor-pointer transition-all border-border hover:border-primary/50 group h-full flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg font-semibold group-hover:text-primary transition-colors line-clamp-1">
                      {company.name}
                    </CardTitle>
                    <Badge variant={company.status === "active" ? "default" : "secondary"}>
                      {company.status}
                    </Badge>
                  </div>
                  <CardDescription className="font-mono text-xs mt-1">
                    {company.slug}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-4 space-y-2 text-sm text-muted-foreground">
                  {company.contactEmail && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{company.contactEmail}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 flex-shrink-0" />
                    <span>Created {formatDistanceToNow(parseISO(company.createdAt), { addSuffix: true })}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
