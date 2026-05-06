import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, CreateCompanyInput, IssueLicenseInput } from "@/lib/adminApi";

// Auth/401/403 handling is centralized in the QueryClient (see App.tsx),
// which clears the key, clears the cache, and hard-redirects to /signin.

export function useAdminPing() {
  return useQuery({
    queryKey: ["admin", "ping"],
    queryFn: () => adminApi.ping(),
    retry: false,
  });
}

export function useCompanies() {
  return useQuery({
    queryKey: ["admin", "companies"],
    queryFn: () => adminApi.listCompanies(),
  });
}

export function useCompanyLicenses(companyId: string) {
  return useQuery({
    queryKey: ["admin", "company", companyId, "licenses"],
    queryFn: () => adminApi.listCompanyLicenses(companyId),
    enabled: !!companyId,
  });
}

export function useCompanyDevices(companyId: string) {
  return useQuery({
    queryKey: ["admin", "company", companyId, "devices"],
    queryFn: () => adminApi.listCompanyDevices(companyId),
    enabled: !!companyId,
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCompanyInput) => adminApi.createCompany(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "companies"] });
    },
  });
}

export function useIssueLicense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: IssueLicenseInput) => adminApi.issueLicense(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "company", variables.companyId, "licenses"] });
    },
  });
}

export function useRevokeLicense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ companyId, licenseId }: { companyId: string; licenseId: string }) =>
      adminApi.revokeLicense(companyId, licenseId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "company", variables.companyId, "licenses"] });
    },
  });
}
