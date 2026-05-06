import { useState } from "react";
import { useLocation } from "wouter";
import { setAdminKey } from "@/lib/adminAuth";
import { adminApi, AdminApiError } from "@/lib/adminApi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, KeyRound } from "lucide-react";

export function SignIn() {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;

    setLoading(true);
    setAdminKey(key.trim());

    try {
      await adminApi.ping();
      toast({
        title: "Authenticated",
        description: "Successfully connected to Al Salik admin.",
      });
      setLocation("/");
    } catch (err) {
      if (err instanceof AdminApiError) {
        toast({
          title: "Authentication Failed",
          description: err.message,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg border-border">
        <CardHeader className="space-y-2 pb-6 text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Admin Access</CardTitle>
          <CardDescription>
            Enter the shared admin API key to access the Al Salik POS control panel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <div className="relative">
                <div className="absolute left-3 top-2.5 text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                </div>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="sk_admin_..."
                  className="pl-9"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  disabled={loading}
                  autoComplete="off"
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading || !key.trim()}>
              {loading ? "Verifying..." : "Connect"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
