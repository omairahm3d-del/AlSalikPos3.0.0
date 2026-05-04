import React, { Suspense } from "react";
import { ActivityIndicator, View } from "react-native";
import { SQLiteProvider } from "expo-sqlite";
import { initDatabase } from "@/lib/database";
import { NativeDatabaseProvider } from "./DatabaseContext";

function DBLoadingFallback() {
  return (
    <View style={{ flex: 1, backgroundColor: "#0F1117", alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color="#4F8EF7" />
    </View>
  );
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<DBLoadingFallback />}>
      <SQLiteProvider databaseName="pos.db" onInit={initDatabase} useSuspense>
        <NativeDatabaseProvider>{children}</NativeDatabaseProvider>
      </SQLiteProvider>
    </Suspense>
  );
}
