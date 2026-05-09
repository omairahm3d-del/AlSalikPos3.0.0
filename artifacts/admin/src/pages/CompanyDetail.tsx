import { useState } from "react";
import { Link, useParams } from "wouter";
import {
  useCompanies,
  useCompanyLicenses,
  useCompanyDevices,
  useIssueLicense,
  useRevokeLicense,
  useExtendLicense,
  useSetDeviceLimit,
  useDeleteLicense,
  useRemoveDevice,
  useCompanyBranches,
  useCreateBranch,
  useUpdateBranch,
  useCompanyManagers,
  useCreateManager,
  useSetManagerActive,
  useResetManagerPassword,
  useUpdateCompany,
} from "@/hooks/useAdminApi";
import type { Branch, LicenseType, Manager } from "@/lib/adminApi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ArrowLeft, CalendarClock, Copy, Eye, EyeOff, KeyRound, MonitorSmartphone, Plus, ShieldAlert, XCircle, CheckCircle2, Building2, Star, UserCog, Smartphone, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function maskKey(key: string) {
  if (!key) return "";
  const visible = key.slice(0, 4);
  return `${visible}${"•".repeat(Math.max(8, key.length - 4))}`;
}

export function CompanyDetail() {
  const { companyId } = useParams<{ companyId: string }>();
  const { data: companiesData, isLoading: companiesLoading, isError: companiesError, error: companiesErr, refetch: refetchCompanies } = useCompanies();

  const { data: licensesData, isLoading: licensesLoading } = useCompanyLicenses(companyId || "");
  const { data: devicesData, isLoading: devicesLoading } = useCompanyDevices(companyId || "");
  const { data: branchesData, isLoading: branchesLoading } = useCompanyBranches(companyId || "");
  const { data: managersData, isLoading: managersLoading } = useCompanyManagers(companyId || "");

  const issueLicense = useIssueLicense();
  const revokeLicense = useRevokeLicense();
  const extendLicense = useExtendLicense();
  const setDeviceLimit = useSetDeviceLimit();
  const deleteLicense = useDeleteLicense();
  const removeDevice = useRemoveDevice();
  const createBranch = useCreateBranch(companyId || "");
  const updateBranch = useUpdateBranch(companyId || "");
  const createManager = useCreateManager(companyId || "");
  const setManagerActive = useSetManagerActive(companyId || "");
  const resetManagerPassword = useResetManagerPassword(companyId || "");
  const updateCompany = useUpdateCompany();
  const { toast } = useToast();

  const [issueOpen, setIssueOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState<string | null>(null);
  const [extendOpen, setExtendOpen] = useState<string | null>(null);
  const [extendDate, setExtendDate] = useState("");
  const [deviceLimitOpen, setDeviceLimitOpen] = useState<string | null>(null);
  const [newDeviceLimit, setNewDeviceLimit] = useState(1);
  const [deleteLicenseOpen, setDeleteLicenseOpen] = useState<string | null>(null);
  const [removeDeviceOpen, setRemoveDeviceOpen] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});

  const [branchOpen, setBranchOpen] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchAddress, setBranchAddress] = useState("");

  const [managerOpen, setManagerOpen] = useState(false);
  const [managerEmail, setManagerEmail] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [resetPwOpen, setResetPwOpen] = useState<Manager | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const [maxDevices, setMaxDevices] = useState(1);
  const [notes, setNotes] = useState("");
  const [licenseType, setLicenseType] = useState<LicenseType>("online");
  // Stored as a `yyyy-MM-dd` string from <input type="date">. Empty string = no expiry.
  const [expiresAt, setExpiresAt] = useState("");

  if (companiesLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (companiesError) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> Couldn't load company
            </CardTitle>
            <CardDescription>{(companiesErr as Error)?.message ?? "Network error."}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button onClick={() => refetchCompanies()}>Retry</Button>
            <Button variant="outline" asChild><Link href="/">Back to companies</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const company = companiesData?.companies.find(c => c.id === companyId);
  if (!company) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Company not found</CardTitle>
            <CardDescription>
              No company matches that ID. It may have been removed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild><Link href="/">Back to companies</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const licenses = licensesData?.licenses || [];
  const devices = devicesData?.devices || [];
  const branches = branchesData?.branches || [];
  const managers = managersData?.managers || [];

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createManager.mutateAsync({
        email: managerEmail.trim().toLowerCase(),
        name: managerName.trim(),
        password: managerPassword,
      });
      toast({
        title: "Manager created.",
        description: `${managerEmail} can now sign in to the Back Office.`,
      });
      setManagerOpen(false);
      setManagerEmail("");
      setManagerName("");
      setManagerPassword("");
    } catch (err: any) {
      toast({ title: "Failed to create manager", description: err.message, variant: "destructive" });
    }
  };

  const handleToggleManagerActive = async (m: Manager) => {
    try {
      await setManagerActive.mutateAsync({ managerId: m.id, isActive: !m.isActive });
      toast({ title: m.isActive ? "Manager deactivated." : "Manager activated." });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPwOpen) return;
    try {
      await resetManagerPassword.mutateAsync({
        managerId: resetPwOpen.id,
        newPassword,
      });
      toast({
        title: "Password reset.",
        description: "Active back-office sessions for this manager have been signed out.",
      });
      setResetPwOpen(null);
      setNewPassword("");
    } catch (err: any) {
      toast({ title: "Failed to reset password", description: err.message, variant: "destructive" });
    }
  };

  const openCreateBranch = () => {
    setEditBranch(null);
    setBranchName("");
    setBranchAddress("");
    setBranchOpen(true);
  };

  const openEditBranch = (b: Branch) => {
    setEditBranch(b);
    setBranchName(b.name);
    setBranchAddress(b.address ?? "");
    setBranchOpen(true);
  };

  const handleBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editBranch) {
        await updateBranch.mutateAsync({
          branchId: editBranch.id,
          name: branchName,
          address: branchAddress || null,
        });
        toast({ title: "Branch updated." });
      } else {
        await createBranch.mutateAsync({
          name: branchName,
          address: branchAddress || null,
        });
        toast({ title: "Branch created." });
      }
      setBranchOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to save branch", description: err.message, variant: "destructive" });
    }
  };

  const handleSetDefault = async (branchId: string) => {
    try {
      await updateBranch.mutateAsync({ branchId, isDefault: true });
      toast({ title: "Default branch updated." });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleToggleActive = async (b: Branch) => {
    try {
      await updateBranch.mutateAsync({ branchId: b.id, isActive: !b.isActive });
      toast({ title: b.isActive ? "Branch deactivated." : "Branch activated." });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard." });
  };

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await issueLicense.mutateAsync({
        companyId: company.id,
        maxDevices,
        notes: notes || undefined,
        licenseType,
        // No trailing Z — JavaScript parses without Z as local time,
        // so end-of-day is 23:59:59 in the admin user's browser timezone.
        expiresAt: expiresAt
          ? new Date(`${expiresAt}T23:59:59`).toISOString()
          : null,
      });
      toast({ title: "License issued successfully." });
      setIssueOpen(false);
      setMaxDevices(1);
      setNotes("");
      setLicenseType("online");
      setExpiresAt("");
    } catch (err: any) {
      toast({ title: "Failed to issue license", description: err.message, variant: "destructive" });
    }
  };

  const handleRevoke = async (licenseId: string) => {
    try {
      await revokeLicense.mutateAsync({ companyId: company.id, licenseId });
      toast({ title: "License revoked." });
      setRevokeOpen(null);
    } catch (err: any) {
      toast({ title: "Failed to revoke license", description: err.message, variant: "destructive" });
    }
  };

  const handleExtend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendOpen) return;
    try {
      await extendLicense.mutateAsync({
        companyId: company.id,
        licenseId: extendOpen,
        expiresAt: extendDate
          ? new Date(`${extendDate}T23:59:59`).toISOString()
          : null,
      });
      toast({ title: "License extended.", description: extendDate ? `New expiry: ${extendDate}` : "Expiry cleared (no expiry)." });
      setExtendOpen(null);
      setExtendDate("");
    } catch (err: any) {
      toast({ title: "Failed to extend license", description: err.message, variant: "destructive" });
    }
  };

  const handleSetDeviceLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceLimitOpen) return;
    try {
      await setDeviceLimit.mutateAsync({
        companyId: company.id,
        licenseId: deviceLimitOpen,
        maxDevices: newDeviceLimit,
      });
      toast({ title: "Device limit updated.", description: `New limit: ${newDeviceLimit} device(s).` });
      setDeviceLimitOpen(null);
    } catch (err: any) {
      toast({ title: "Failed to update device limit", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteLicense = async (licenseId: string) => {
    try {
      await deleteLicense.mutateAsync({ companyId: company.id, licenseId });
      toast({ title: "License deleted.", description: "All devices using this license have been disconnected." });
      setDeleteLicenseOpen(null);
    } catch (err: any) {
      toast({ title: "Failed to delete license", description: err.message, variant: "destructive" });
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    try {
      await removeDevice.mutateAsync({ companyId: company.id, deviceId });
      toast({ title: "Device removed.", description: "The device will need to re-activate with its license key." });
      setRemoveDeviceOpen(null);
    } catch (err: any) {
      toast({ title: "Failed to remove device", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 md:space-y-6">
      <div className="flex items-center gap-3 min-w-0">
        <Button variant="ghost" size="icon" asChild className="flex-shrink-0">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">{company.name}</h1>
          <Badge variant={company.status === "active" ? "default" : "secondary"} className="flex-shrink-0">
            {company.status}
          </Badge>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Slug</p>
              <p className="font-mono mt-1">{company.slug}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Contact</p>
              <p className="mt-1">{company.contactEmail || "—"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Created</p>
              <p className="mt-1">{format(parseISO(company.createdAt), "PPP")}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Work Mode</p>
              <select
                className="mt-1 w-full border border-border rounded px-2 py-1.5 text-sm bg-background"
                value={company.workMode ?? "standard"}
                onChange={async (e) => {
                  try {
                    await updateCompany.mutateAsync({
                      companyId: company.id,
                      workMode: e.target.value as "standard" | "saloon" | "laundry" | "retail",
                    });
                    toast({ title: "Work mode updated." });
                  } catch (err: any) {
                    toast({ title: "Failed to update work mode", description: err.message, variant: "destructive" });
                  }
                }}
              >
                <option value="standard">Standard (Restaurant)</option>
                <option value="saloon">Saloon / Beauty</option>
                <option value="laundry">Laundry / Dry-Cleaning</option>
                <option value="retail">Retail Shop</option>
              </select>
            </div>
            {company.notes && (
              <div className="md:col-span-3">
                <p className="text-sm font-medium text-muted-foreground">Notes</p>
                <p className="mt-1 whitespace-pre-wrap">{company.notes}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="licenses" className="w-full">
        <div className="overflow-x-auto pb-1 -mb-1">
          <TabsList className="flex w-max min-w-full sm:grid sm:w-full sm:max-w-[800px] sm:grid-cols-4">
            <TabsTrigger value="licenses" className="flex-1 whitespace-nowrap">Licenses ({licenses.length})</TabsTrigger>
            <TabsTrigger value="devices" className="flex-1 whitespace-nowrap">Devices ({devices.length})</TabsTrigger>
            <TabsTrigger value="branches" className="flex-1 whitespace-nowrap">Branches ({branches.length})</TabsTrigger>
            <TabsTrigger value="managers" className="flex-1 whitespace-nowrap">Managers ({managers.length})</TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="licenses" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Licenses</h2>
            <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" /> Issue License
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleIssue}>
                  <DialogHeader>
                    <DialogTitle>Issue New License</DialogTitle>
                    <DialogDescription>
                      Generate a new license key for {company.name}.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="licenseType">License Type</Label>
                      <select
                        id="licenseType"
                        value={licenseType}
                        onChange={(e) => setLicenseType(e.target.value as LicenseType)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="online">Online — cloud sync enabled</option>
                        <option value="offline">Offline — sync disabled, expiry enforced locally</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxDevices">Max Devices</Label>
                      <Input
                        id="maxDevices"
                        type="number"
                        min={1}
                        value={maxDevices}
                        onChange={(e) => setMaxDevices(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expiresAt">
                        Expiry Date {licenseType === "offline" ? "(required for offline)" : "(optional)"}
                      </Label>
                      <Input
                        id="expiresAt"
                        type="date"
                        value={expiresAt}
                        onChange={(e) => setExpiresAt(e.target.value)}
                        required={licenseType === "offline"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes (Optional)</Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Internal notes about this license..."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" type="button" onClick={() => setIssueOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={issueLicense.isPending}>
                      Issue Key
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {licensesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : licenses.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="pt-8 pb-8 text-center text-muted-foreground">
                No licenses found. Issue one to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {licenses.map(license => {
                const activeDevices = devices.filter(d => d.licenseId === license.id).length;
                return (
                  <Card key={license.id} className={license.status === 'revoked' ? 'opacity-70 bg-muted/50' : ''}>
                    <CardHeader className="pb-2">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge variant={license.status === "active" ? "default" : "destructive"}>
                            {license.status}
                          </Badge>
                          <Badge variant={license.licenseType === "offline" ? "secondary" : "outline"}>
                            {license.licenseType === "offline" ? "Offline" : "Online"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(parseISO(license.createdAt), "PPP")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 min-w-0">
                          <code className="font-mono text-sm md:text-base font-semibold bg-muted px-2 py-1 rounded break-all min-w-0">
                            {revealedKeys[license.id] ? license.key : maskKey(license.key)}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="flex-shrink-0"
                            onClick={() => setRevealedKeys(prev => ({ ...prev, [license.id]: !prev[license.id] }))}
                            title={revealedKeys[license.id] ? "Hide key" : "Reveal key"}
                          >
                            {revealedKeys[license.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={() => handleCopy(license.key)} title="Copy key">
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:flex-shrink-0">
                        {license.status !== 'revoked' && (
                          <Dialog open={extendOpen === license.id} onOpenChange={(open) => {
                            if (open) {
                              const cur = license.expiresAt ? license.expiresAt.slice(0, 10) : "";
                              setExtendDate(cur);
                              setExtendOpen(license.id);
                            } else {
                              setExtendOpen(null);
                            }
                          }}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <CalendarClock className="mr-2 h-4 w-4" /> Extend
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <form onSubmit={handleExtend}>
                                <DialogHeader>
                                  <DialogTitle className="flex items-center gap-2">
                                    <CalendarClock className="h-5 w-5 text-primary" /> Extend License
                                  </DialogTitle>
                                  <DialogDescription>
                                    Set a new expiry date. The POS device will automatically reconnect the next time it opens — no need for the customer to re-enter the key.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="py-4 space-y-4">
                                  <code className="font-mono text-center block bg-muted p-2 rounded text-sm">{license.key}</code>
                                  <div className="space-y-2">
                                    <Label htmlFor="extendDate">New Expiry Date</Label>
                                    <Input
                                      id="extendDate"
                                      type="date"
                                      value={extendDate}
                                      onChange={(e) => setExtendDate(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">Leave blank to remove the expiry date (license never expires).</p>
                                  </div>
                                </div>
                                <DialogFooter>
                                  <Button variant="outline" type="button" onClick={() => setExtendOpen(null)}>Cancel</Button>
                                  <Button type="submit" disabled={extendLicense.isPending}>
                                    {extendLicense.isPending ? "Saving…" : "Save New Expiry"}
                                  </Button>
                                </DialogFooter>
                              </form>
                            </DialogContent>
                          </Dialog>
                        )}
                        {license.status !== 'revoked' && (
                          <Dialog open={deviceLimitOpen === license.id} onOpenChange={(open) => {
                            if (open) {
                              setNewDeviceLimit(license.maxDevices);
                              setDeviceLimitOpen(license.id);
                            } else {
                              setDeviceLimitOpen(null);
                            }
                          }}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Smartphone className="mr-2 h-4 w-4" /> Devices
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <form onSubmit={handleSetDeviceLimit}>
                                <DialogHeader>
                                  <DialogTitle className="flex items-center gap-2">
                                    <Smartphone className="h-5 w-5 text-primary" /> Set Device Limit
                                  </DialogTitle>
                                  <DialogDescription>
                                    Change the maximum number of devices that can activate with this license key. Currently {devices.filter(d => d.licenseId === license.id).length} device(s) are active.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="py-4 space-y-4">
                                  <code className="font-mono text-center block bg-muted p-2 rounded text-sm">{license.key}</code>
                                  <div className="space-y-2">
                                    <Label htmlFor="newDeviceLimit">Max Devices</Label>
                                    <Input
                                      id="newDeviceLimit"
                                      type="number"
                                      min={1}
                                      max={1000}
                                      value={newDeviceLimit}
                                      onChange={(e) => setNewDeviceLimit(Number(e.target.value))}
                                    />
                                    <p className="text-xs text-muted-foreground">Must be at least 1. Setting it lower than the current active device count will prevent new activations but won't disconnect existing devices.</p>
                                  </div>
                                </div>
                                <DialogFooter>
                                  <Button variant="outline" type="button" onClick={() => setDeviceLimitOpen(null)}>Cancel</Button>
                                  <Button type="submit" disabled={setDeviceLimit.isPending}>
                                    {setDeviceLimit.isPending ? "Saving…" : "Save Device Limit"}
                                  </Button>
                                </DialogFooter>
                              </form>
                            </DialogContent>
                          </Dialog>
                        )}
                        {license.status === 'active' && (
                          <Dialog open={revokeOpen === license.id} onOpenChange={(open) => setRevokeOpen(open ? license.id : null)}>
                            <DialogTrigger asChild>
                              <Button variant="destructive" size="sm" className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground">
                                <XCircle className="mr-2 h-4 w-4" /> Revoke
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle className="text-destructive flex items-center gap-2">
                                  <ShieldAlert className="h-5 w-5" /> Revoke License
                                </DialogTitle>
                                <DialogDescription>
                                  Are you sure you want to revoke this license? This action cannot be undone. Devices using this license will be disconnected.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="py-4">
                                <code className="font-mono text-center block bg-muted p-2 rounded">{license.key}</code>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setRevokeOpen(null)}>Cancel</Button>
                                <Button variant="destructive" onClick={() => handleRevoke(license.id)} disabled={revokeLicense.isPending}>
                                  Yes, Revoke Key
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        )}
                        <Dialog open={deleteLicenseOpen === license.id} onOpenChange={(open) => setDeleteLicenseOpen(open ? license.id : null)}>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Delete license">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle className="text-destructive flex items-center gap-2">
                                <Trash2 className="h-5 w-5" /> Delete License
                              </DialogTitle>
                              <DialogDescription>
                                This permanently removes the license and disconnects all devices using it. This cannot be undone.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="py-4 space-y-3">
                              <code className="font-mono text-center block bg-muted p-2 rounded text-sm break-all">{license.key}</code>
                              {activeDevices > 0 && (
                                <p className="text-sm text-destructive font-medium flex items-center gap-2">
                                  <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                                  {activeDevices} active device(s) will lose access immediately.
                                </p>
                              )}
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setDeleteLicenseOpen(null)}>Cancel</Button>
                              <Button variant="destructive" onClick={() => handleDeleteLicense(license.id)} disabled={deleteLicense.isPending}>
                                {deleteLicense.isPending ? "Deleting…" : "Yes, Delete License"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-2 text-sm">
                      <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <MonitorSmartphone className="h-4 w-4" />
                          <span>{activeDevices} / {license.maxDevices} Devices</span>
                        </div>
                        {license.expiresAt && (() => {
                          const expired = new Date(license.expiresAt) < new Date();
                          return (
                            <div className="flex items-center gap-2">
                              {expired ? (
                                <span className="font-semibold text-destructive">
                                  Expired {format(parseISO(license.expiresAt), "PPP")}
                                </span>
                              ) : (
                                <span>Expires {format(parseISO(license.expiresAt), "PPP")}</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      {license.notes && (
                        <p className="mt-3 text-muted-foreground border-t border-border pt-3">
                          {license.notes}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="devices" className="mt-6 space-y-4">
          <h2 className="text-xl font-semibold">Active Devices</h2>
          
          {devicesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : devices.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="pt-8 pb-8 text-center text-muted-foreground">
                No devices have activated under this company yet.
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground">Device Name / ID</th>
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground">Platform</th>
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground">Version</th>
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground">Last Seen</th>
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground">License</th>
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map(device => {
                      const parentLicense = licenses.find(l => l.id === device.licenseId);
                      return (
                        <tr key={device.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="p-4">
                            <div className="font-medium">{device.name || "Unknown Device"}</div>
                            <div className="font-mono text-xs text-muted-foreground">{device.deviceUid.substring(0, 8)}...</div>
                          </td>
                          <td className="p-4 capitalize">{device.platform}</td>
                          <td className="p-4">{device.appVersion || "—"}</td>
                          <td className="p-4">
                            {device.lastSeenAt ? formatDistanceToNow(parseISO(device.lastSeenAt), { addSuffix: true }) : "Never"}
                          </td>
                          <td className="p-4 font-mono text-xs">
                            {parentLicense ? parentLicense.key.substring(0, 9) + "..." : "—"}
                          </td>
                          <td className="p-4">
                            <Dialog open={removeDeviceOpen === device.id} onOpenChange={(open) => setRemoveDeviceOpen(open ? device.id : null)}>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Remove device">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle className="text-destructive flex items-center gap-2">
                                    <Trash2 className="h-5 w-5" /> Remove Device
                                  </DialogTitle>
                                  <DialogDescription>
                                    This removes the device's activation record. The device will need to re-activate with its license key before it can be used again.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="py-4 space-y-2">
                                  <p className="font-medium">{device.name || "Unknown Device"}</p>
                                  <p className="text-sm text-muted-foreground font-mono">{device.deviceUid}</p>
                                </div>
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setRemoveDeviceOpen(null)}>Cancel</Button>
                                  <Button variant="destructive" onClick={() => handleRemoveDevice(device.id)} disabled={removeDevice.isPending}>
                                    {removeDevice.isPending ? "Removing…" : "Yes, Remove Device"}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="branches" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Branches</h2>
            <Dialog open={branchOpen} onOpenChange={setBranchOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={openCreateBranch}>
                  <Plus className="mr-2 h-4 w-4" /> Add Branch
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleBranchSubmit}>
                  <DialogHeader>
                    <DialogTitle>{editBranch ? "Edit Branch" : "New Branch"}</DialogTitle>
                    <DialogDescription>
                      Branches isolate products, stock, sales, staff and customers.
                      Each POS device activates against one branch.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="branchName">Name</Label>
                      <Input
                        id="branchName"
                        value={branchName}
                        onChange={(e) => setBranchName(e.target.value)}
                        placeholder="Main, Downtown, Mall of Emirates..."
                        required
                        maxLength={120}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="branchAddress">Address (optional)</Label>
                      <Textarea
                        id="branchAddress"
                        value={branchAddress}
                        onChange={(e) => setBranchAddress(e.target.value)}
                        placeholder="Street, city, emirate..."
                        maxLength={500}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" type="button" onClick={() => setBranchOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createBranch.isPending || updateBranch.isPending}>
                      {editBranch ? "Save changes" : "Create branch"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {branchesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : branches.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="pt-8 pb-8 text-center text-muted-foreground">
                No branches yet. Add one to begin per-branch isolation.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {branches.map((branch) => (
                <Card key={branch.id} className={!branch.isActive ? "opacity-70 bg-muted/50" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-lg font-semibold">{branch.name}</span>
                        {branch.isDefault && (
                          <Badge variant="default" className="gap-1">
                            <Star className="h-3 w-3" /> Default
                          </Badge>
                        )}
                        {!branch.isActive && <Badge variant="secondary">Inactive</Badge>}
                      </div>
                      {branch.address && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">
                          {branch.address}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        Created {format(parseISO(branch.createdAt), "PPP")}
                      </p>
                    </div>
                    <div className="flex flex-row sm:flex-col gap-2 sm:items-end flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={() => openEditBranch(branch)}>
                        Edit
                      </Button>
                      {!branch.isDefault && branch.isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetDefault(branch.id)}
                          disabled={updateBranch.isPending}
                        >
                          Set Default
                        </Button>
                      )}
                      {!branch.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(branch)}
                          disabled={updateBranch.isPending}
                        >
                          {branch.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      )}
                    </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2 text-sm text-muted-foreground">
                    {devices.filter((d) => (d as any).branchId === branch.id).length} device(s) bound to this branch
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="managers" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Back Office Managers</h2>
            <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" /> Add Manager
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreateManager}>
                  <DialogHeader>
                    <DialogTitle>New Manager</DialogTitle>
                    <DialogDescription>
                      Managers sign in to the Back Office at <code>/back-office</code> using
                      this company's slug, their email, and the password you set here.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="managerName">Full name</Label>
                      <Input
                        id="managerName"
                        value={managerName}
                        onChange={(e) => setManagerName(e.target.value)}
                        required
                        maxLength={200}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="managerEmail">Email</Label>
                      <Input
                        id="managerEmail"
                        type="email"
                        value={managerEmail}
                        onChange={(e) => setManagerEmail(e.target.value)}
                        required
                        maxLength={255}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="managerPassword">Initial password</Label>
                      <Input
                        id="managerPassword"
                        type="text"
                        value={managerPassword}
                        onChange={(e) => setManagerPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        required
                        minLength={8}
                        maxLength={200}
                      />
                      <p className="text-xs text-muted-foreground">
                        Share this with the manager — they can change it after signing in.
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" type="button" onClick={() => setManagerOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createManager.isPending}>
                      Create manager
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {managersLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : managers.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="pt-8 pb-8 text-center text-muted-foreground">
                No managers yet. Add one to grant Back Office access.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {managers.map((m) => (
                <Card key={m.id} className={!m.isActive ? "opacity-70 bg-muted/50" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <UserCog className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-lg font-semibold">{m.name}</span>
                          <Badge variant={m.isActive ? "default" : "secondary"}>
                            {m.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Badge variant="outline">{m.role}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{m.email}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Created {format(parseISO(m.createdAt), "PPP")}
                          {" · "}
                          {m.lastLoginAt
                            ? `Last login ${formatDistanceToNow(parseISO(m.lastLoginAt), { addSuffix: true })}`
                            : "Never signed in"}
                        </p>
                      </div>
                      <div className="flex flex-row sm:flex-col gap-2 sm:items-end flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setResetPwOpen(m);
                            setNewPassword("");
                          }}
                        >
                          <KeyRound className="mr-2 h-4 w-4" /> Reset password
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleManagerActive(m)}
                          disabled={setManagerActive.isPending}
                        >
                          {m.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}

          <Dialog
            open={!!resetPwOpen}
            onOpenChange={(open) => {
              if (!open) {
                setResetPwOpen(null);
                setNewPassword("");
              }
            }}
          >
            <DialogContent>
              <form onSubmit={handleResetPassword}>
                <DialogHeader>
                  <DialogTitle>Reset password</DialogTitle>
                  <DialogDescription>
                    Setting a new password for <strong>{resetPwOpen?.email}</strong> immediately
                    signs out any active Back Office sessions for this manager.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New password</Label>
                    <Input
                      id="newPassword"
                      type="text"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                      minLength={8}
                      maxLength={200}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" type="button" onClick={() => setResetPwOpen(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={resetManagerPassword.isPending}>
                    Reset password
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
