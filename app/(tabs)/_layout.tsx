import {
  Icon,
  Label,
  NativeTabs,
  NativeTabTrigger,
} from "expo-router/unstable-native-tabs";
import React from "react";

export default function TabLayout() {
  return (
    <NativeTabs>
      <NativeTabTrigger name="index">
        <Icon sf="house.fill" />
        <Label>Loans</Label>
      </NativeTabTrigger>

      <NativeTabTrigger name="spend-tracker">
        <Icon sf="creditcard.fill" />
        <Label>Spends</Label>
      </NativeTabTrigger>

      <NativeTabTrigger name="analytics">
        <Icon sf="chart.pie.fill" />
        <Label>Analytics</Label>
      </NativeTabTrigger>

      <NativeTabTrigger name="ai-advisor">
        <Icon sf="sparkles" />
        <Label>AI Advisor</Label>
      </NativeTabTrigger>

      <NativeTabTrigger name="settings">
        <Icon sf="gearshape.fill" />
        <Label>Settings</Label>
      </NativeTabTrigger>
    </NativeTabs>
  );
}
