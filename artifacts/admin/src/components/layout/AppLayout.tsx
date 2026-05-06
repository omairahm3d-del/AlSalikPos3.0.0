import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Building2, Settings, ShieldAlert, LogOut, ChevronRight } from "lucide-react";
import { hasAdminKey, clearAdminKey } from "@/lib/adminAuth";
import { useAdminPing } from "@/hooks/useAdminApi";
import { Button } from "@/components/ui/button";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const isAuth = hasAdminKey();
  
  const ping = useAdminPing();

  useEffect(() => {
    if (!isAuth && location !== "/signin") {
      setLocation("/signin");
    }
  }, [isAuth, location, setLocation]);

  if (!isAuth) {
    return <>{children}</>;
  }

  const handleSignOut = () => {
    clearAdminKey();
    setLocation("/signin");
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <aside className="w-64 border-r border-border bg-card flex flex-col flex-shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-primary">
            <Building2 className="h-5 w-5" />
            <span>Al Salik POS Admin</span>
          </div>
        </div>
        
        <nav className="flex-1 py-4 flex flex-col gap-1 px-2">
          <Link href="/" className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${location === "/" || location.startsWith("/companies") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            <Building2 className="h-4 w-4" />
            <span>Companies</span>
          </Link>
          <Link href="/settings" className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${location === "/settings" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </Link>
        </nav>

        <div className="p-4 border-t border-border">
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-muted/30">
        {children}
      </main>
    </div>
  );
}
