import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useRef } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CartProvider } from "@/context/CartContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DatabaseProvider } from "@/context/DatabaseProvider";
import { StaffProvider, useStaff } from "@/context/StaffContext";
import { LicenseProvider, useLicense } from "@/context/LicenseContext";
import { WorkModeProvider } from "@/context/WorkModeContext";
import { UsbPrintProvider } from "@/context/UsbPrintContext";
import { SyncProvider } from "@/context/SyncContext";
import { LockScreen } from "@/components/LockScreen";
import { ActivationScreen } from "@/components/ActivationScreen";
import { VirtualKeyboard } from "@/components/VirtualKeyboard";
import { SyncStatusPill } from "@/components/SyncStatusPill";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const INACTIVITY_MS = 60_000; // 1 minute

function AppContent() {
  const { currentStaff, staffRequired, logout } = useStaff();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      logout();
    }, INACTIVITY_MS);
  }, [logout]);

  // Start / restart the inactivity timer whenever a staff member logs in.
  // Cancel it as soon as they log out so there are no dangling timeouts.
  useEffect(() => {
    if (!staffRequired || !currentStaff) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    resetTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [staffRequired, currentStaff, resetTimer]);

  if (staffRequired && !currentStaff) {
    return <LockScreen />;
  }

  return (
    // Capture phase: reset the inactivity timer on any touch anywhere in the
    // app without stealing the event from whichever child handles it.
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        resetTimer();
        return false;
      }}
    >
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <VirtualKeyboard />
      <SyncStatusPill />
    </View>
  );
}

/**
 * License gate. Until the device has a valid (non-expired) JWT issued by the
 * SaaS backend, nothing else mounts — no DB, no staff, no tabs. Once licensed,
 * we re-validate once on mount in the background to catch revocations.
 *
 * The refresh runs at most once per app launch so a successful refresh
 * (which mints a fresh JWT) cannot retrigger itself in a loop.
 */
function LicenseGate({ children }: { children: React.ReactNode }) {
  const { ready, session, refresh } = useLicense();
  const refreshedOnceRef = useRef(false);
  useEffect(() => {
    if (!ready || !session || refreshedOnceRef.current) return;
    refreshedOnceRef.current = true;
    refresh().catch(() => {});
  }, [ready, session, refresh]);
  if (!ready) return null;
  if (!session) return <ActivationScreen />;
  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <LicenseProvider>
                <WorkModeProvider>
                  <LicenseGate>
                    <DatabaseProvider>
                      <SyncProvider>
                        <CartProvider>
                          <StaffProvider>
                            <UsbPrintProvider>
                              <AppContent />
                            </UsbPrintProvider>
                          </StaffProvider>
                        </CartProvider>
                      </SyncProvider>
                    </DatabaseProvider>
                  </LicenseGate>
                </WorkModeProvider>
              </LicenseProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

