import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Building2, Settings, LogOut, Menu, X } from "lucide-react";
import { hasAdminKey, clearAdminKey } from "@/lib/adminAuth";
import { useAdminPing } from "@/hooks/useAdminApi";
import { Button } from "@/components/ui/button";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isAuth = hasAdminKey();

  useAdminPing();

  useEffect(() => {
    if (!isAuth && location !== "/signin") {
      setLocation("/signin");
    }
  }, [isAuth, location, setLocation]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  if (!isAuth) {
    return <>{children}</>;
  }

  const handleSignOut = () => {
    clearAdminKey();
    setLocation("/signin");
  };

  const navLink = (href: string, label: string, icon: React.ReactNode, exact = false) => {
    const active = exact ? location === href : location === href || location.startsWith(href + "/") || (href === "/" && location.startsWith("/companies"));
    return (
      <Link
        href={href}
        className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {icon}
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-30 w-64 border-r border-border bg-card flex flex-col transition-transform duration-200
          md:static md:translate-x-0 md:flex-shrink-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-primary">
            <Building2 className="h-5 w-5 flex-shrink-0" />
            <span className="truncate">Al Salik POS Admin</span>
          </div>
          <button
            className="md:hidden text-muted-foreground hover:text-foreground p-1 rounded"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 py-4 flex flex-col gap-1 px-2 overflow-y-auto">
          {navLink("/", "Companies", <Building2 className="h-4 w-4 flex-shrink-0" />)}
          {navLink("/settings", "Settings", <Settings className="h-4 w-4 flex-shrink-0" />, true)}
        </nav>

        <div className="p-4 border-t border-border">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 mr-2 flex-shrink-0" />
            Sign Out
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="md:hidden h-14 flex items-center gap-3 px-4 border-b border-border bg-card flex-shrink-0">
          <button
            className="text-muted-foreground hover:text-foreground p-1 rounded"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 font-semibold text-primary">
            <Building2 className="h-5 w-5 flex-shrink-0" />
            <span className="truncate text-sm">Al Salik POS Admin</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-muted/30">
          {children}
        </main>
      </div>
    </div>
  );
}
