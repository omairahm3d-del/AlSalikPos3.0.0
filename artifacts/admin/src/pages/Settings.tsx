import { useState } from "react";
import { getAdminKey, setAdminKey } from "@/lib/adminAuth";
import { useAdminPing } from "@/hooks/useAdminApi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Eye, EyeOff, Save } from "lucide-react";

export function Settings() {
  const currentKey = getAdminKey() || "";
  const [key, setKey] = useState(currentKey);
  const [showKey, setShowKey] = useState(false);
  const { toast } = useToast();
  const ping = useAdminPing();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;

    const oldKey = getAdminKey();
    setAdminKey(key.trim());
    
    try {
      await ping.refetch();
      toast({ title: "API Key updated successfully." });
    } catch (err) {
      // Revert if ping fails
      if (oldKey) setAdminKey(oldKey);
      toast({ 
        title: "Update failed", 
        description: "The new key was rejected. Reverted to previous key.", 
        variant: "destructive" 
      });
      setKey(oldKey || "");
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage admin configuration and access.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <CardTitle>Admin API Key</CardTitle>
          </div>
          <CardDescription>
            This key is stored locally in your browser and used to authenticate requests to the Al Salik admin API.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSave}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">Shared Secret Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="apiKey"
                    type={showKey ? "text" : "password"}
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-7 w-7 text-muted-foreground"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end border-t border-border pt-4">
            <Button type="submit" disabled={key === currentKey || ping.isFetching}>
              <Save className="mr-2 h-4 w-4" />
              Save Key
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
