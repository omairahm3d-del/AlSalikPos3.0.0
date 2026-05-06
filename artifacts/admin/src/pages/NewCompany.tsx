import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateCompany } from "@/hooks/useAdminApi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Building2, ArrowLeft, Copy, CheckCircle2, KeyRound, Clock } from "lucide-react";
import { License } from "@/lib/adminApi";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/, "Lowercase letters, numbers, and dashes only (2-63 chars)."),
  contactEmail: z.string().email("Invalid email address.").or(z.literal("")),
  maxDevices: z.coerce.number().min(1, "Must allow at least 1 device."),
  notes: z.string().optional(),
});

export function NewCompany() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createCompany = useCreateCompany();
  const [successData, setSuccessData] = useState<{ companyId: string; license: License } | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
      contactEmail: "",
      maxDevices: 1,
      notes: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const res = await createCompany.mutateAsync({
        name: values.name,
        slug: values.slug,
        contactEmail: values.contactEmail || undefined,
        maxDevices: values.maxDevices,
        notes: values.notes,
      });
      setSuccessData({ companyId: res.company.id, license: res.license });
      toast({ title: "Company created successfully." });
    } catch (err: any) {
      toast({
        title: "Failed to create company",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleCopy = () => {
    if (!successData?.license.key) return;
    navigator.clipboard.writeText(successData.license.key);
    setCopied(true);
    toast({ title: "License key copied to clipboard." });
    setTimeout(() => setCopied(false), 2000);
  };

  if (successData) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <Card className="border-primary/20 bg-primary/5 shadow-lg">
          <CardHeader className="text-center space-y-4 pt-8">
            <div className="mx-auto w-16 h-16 bg-primary rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">Company Provisioned</CardTitle>
            <CardDescription className="text-base">
              The company has been created and their initial license key is ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pb-8">
            <div className="bg-card border border-border rounded-lg p-6 text-center space-y-4">
              <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
                <KeyRound className="h-5 w-5" />
                <span className="font-medium uppercase tracking-wider text-sm">Initial License Key</span>
              </div>
              
              <div className="font-mono text-2xl sm:text-3xl font-bold tracking-tight py-4 bg-muted/50 rounded border border-border select-all">
                {successData.license.key}
              </div>
              
              <div className="text-sm text-destructive font-medium flex items-center justify-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                This key is shown only once. Copy it now.
              </div>

              <Button size="lg" onClick={handleCopy} className="w-full sm:w-auto min-w-[200px] mt-4" variant={copied ? "secondary" : "default"}>
                {copied ? (
                  <><CheckCircle2 className="mr-2 h-4 w-4" /> Copied</>
                ) : (
                  <><Copy className="mr-2 h-4 w-4" /> Copy License Key</>
                )}
              </Button>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center pb-8 border-t border-primary/10 pt-6">
            <Link href={`/companies/${successData.companyId}`} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
              Continue to Company Profile
              <ChevronRight className="ml-2 h-4 w-4" />
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Company</h1>
          <p className="text-muted-foreground mt-1">Onboard a new POS customer.</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme LLC" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Slug</FormLabel>
                      <FormControl>
                        <Input placeholder="acme-llc" {...field} />
                      </FormControl>
                      <FormDescription>Used for URLs and internal IDs.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Email (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="admin@acme.com" type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxDevices"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Devices</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} />
                      </FormControl>
                      <FormDescription>Device limit for the first license.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Internal Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Any setup context or contact details..." className="resize-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-4 border-t border-border">
                <Button type="submit" disabled={createCompany.isPending}>
                  {createCompany.isPending && <Clock className="mr-2 h-4 w-4 animate-spin" />}
                  Provision Company
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

function ShieldAlert(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>;
}

function ChevronRight(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m9 18 6-6-6-6"/></svg>;
}
