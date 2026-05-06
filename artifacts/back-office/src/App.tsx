import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSession } from "@/lib/session";
import LoginPage from "@/pages/LoginPage";
import Dashboard from "@/pages/Dashboard";

const queryClient = new QueryClient();

function Root() {
  const { session, setSession } = useSession();
  if (!session) {
    return <LoginPage onLoggedIn={(s) => setSession(s)} />;
  }
  return (
    <Dashboard
      session={session}
      onSession={(s) => setSession(s)}
      onLogout={() => setSession(null)}
    />
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Root />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
