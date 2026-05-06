import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AppLayout } from "@/components/layout/AppLayout";
import { SignIn } from "@/pages/SignIn";
import { Dashboard } from "@/pages/Dashboard";
import { NewCompany } from "@/pages/NewCompany";
import { CompanyDetail } from "@/pages/CompanyDetail";
import { Settings } from "@/pages/Settings";
import NotFound from "@/pages/not-found";
import { AdminApiError } from "@/lib/adminApi";
import { clearAdminKey } from "@/lib/adminAuth";
import { toast } from "@/hooks/use-toast";

const SIGNIN_PATH = `${import.meta.env.BASE_URL}signin`.replace(/\/+/g, "/");

function handleAuthError(err: unknown) {
  if (!(err instanceof AdminApiError)) return false;
  if (err.status !== 401 && err.status !== 403) return false;
  clearAdminKey();
  queryClient.clear();
  if (!window.location.pathname.endsWith("/signin")) {
    toast({
      title: "Session expired",
      description: "Your admin key was rejected. Please sign in again.",
      variant: "destructive",
    });
    window.location.assign(SIGNIN_PATH);
  }
  return true;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
  queryCache: new QueryCache({
    onError: (err) => {
      handleAuthError(err);
    },
  }),
  mutationCache: new MutationCache({
    onError: (err) => {
      handleAuthError(err);
    },
  }),
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/signin" component={SignIn} />
        <Route path="/" component={Dashboard} />
        <Route path="/companies/new" component={NewCompany} />
        <Route path="/companies/:companyId" component={CompanyDetail} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
