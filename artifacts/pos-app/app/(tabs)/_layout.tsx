import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useWorkMode } from "@/context/WorkModeContext";

function NativeTabLayout() {
  const { tableLabel, isSaloon } = useWorkMode();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "cart", selected: "cart.fill" }} />
        <Label>Register</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tables">
        <Icon sf={{ default: "tablecells", selected: "tablecells.fill" }} />
        <Label>{tableLabel}</Label>
      </NativeTabs.Trigger>
      {!isSaloon && (
        <NativeTabs.Trigger name="kds">
          <Icon sf={{ default: "fork.knife", selected: "fork.knife" }} />
          <Label>Kitchen</Label>
        </NativeTabs.Trigger>
      )}
      {isSaloon && (
        <NativeTabs.Trigger name="appointments">
          <Icon sf={{ default: "calendar", selected: "calendar" }} />
          <Label>Appointments</Label>
        </NativeTabs.Trigger>
      )}
      <NativeTabs.Trigger name="history">
        <Icon sf={{ default: "clock", selected: "clock.fill" }} />
        <Label>History</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="backoffice">
        <Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
        <Label>Back Office</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const isIOS = Platform.OS === "ios";
  const { tableLabel, isSaloon } = useWorkMode();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          shadowOpacity: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Register",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="cart" tintColor={color} size={24} />
            ) : (
              <Feather name="shopping-cart" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="tables"
        options={{
          title: tableLabel,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="tablecells" tintColor={color} size={24} />
            ) : (
              <Feather name="grid" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="kds"
        options={{
          href: isSaloon ? null : undefined,
          title: "Kitchen",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="fork.knife" tintColor={color} size={24} />
            ) : (
              <Feather name="monitor" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="clock" tintColor={color} size={24} />
            ) : (
              <Feather name="clock" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="backoffice"
        options={{
          title: "Back Office",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="gearshape" tintColor={color} size={24} />
            ) : (
              <Feather name="settings" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          href: isSaloon ? undefined : null,
          title: "Appointments",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="calendar" tintColor={color} size={24} />
            ) : (
              <Feather name="calendar" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen name="products" options={{ href: null }} />
      <Tabs.Screen name="customers" options={{ href: null }} />
      <Tabs.Screen name="reports" options={{ href: null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
