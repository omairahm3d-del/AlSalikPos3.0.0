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
import * as Updates from "expo-updates";
import React, { useEffect, useRef, useState } from "react";
import { Alert, ActivityIndicator, View, Text, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CartProvider } from "@/context/CartContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DatabaseProvider } from "@/context/DatabaseProvider";
import { StaffProvider, useStaff } from "@/context/StaffContext";
import { LicenseProvider, useLicense } from "@/context/LicenseContext";
import { WorkModeProvider } from "@/context/WorkModeContext";
import { SyncProvider } from "@/context/SyncContext";
import { LockScreen } from "@/components/LockScreen";
import { ActivationScreen } from "@/components/ActivationScreen";
import { VirtualKeyboard } from "@/components/VirtualKeyboard";
import { SyncStatusPill } from "@/components/SyncStatusPill";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function AppContent() {
  const { currentStaff, staffRequired } = useStaff();

  if (staffRequired && !currentStaff) {
    return <LockScreen />;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <VirtualKeyboard />
      <SyncStatusPill />
    </>
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
  const [updating, setUpdating] = useState(false);
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

  // OTA update check — only runs in production builds (no-op in Expo Go / dev).
  useEffect(() => {
    if (__DEV__) return;
    (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;
        Alert.alert(
          "Update Available",
          "A new version of Al Salik POS is ready to install. The app will restart after updating.",
          [
            { text: "Later", style: "cancel" },
            {
              text: "Update Now",
              onPress: async () => {
                setUpdating(true);
                try {
                  await Updates.fetchUpdateAsync();
                  await Updates.reloadAsync();
                } catch {
                  setUpdating(false);
                  Alert.alert("Update Failed", "Could not download the update. Please check your internet connection and try again.");
                }
              },
            },
          ],
          { cancelable: false },
        );
      } catch {
        // Network unavailable or EAS not configured — silently ignore.
      }
    })();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  if (updating) {
    return (
      <View style={styles.updateOverlay}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.updateTitle}>Downloading Update…</Text>
        <Text style={styles.updateSub}>Please keep the app open. It will restart automatically.</Text>
      </View>
    );
  }

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
                            <AppContent />
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

const styles = StyleSheet.create({
  updateOverlay: {
    flex: 1,
    backgroundColor: "#0F1117",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 32,
  },
  updateTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  updateSub: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
