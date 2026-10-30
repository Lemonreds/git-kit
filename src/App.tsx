import { useEffect } from "react";

import AppShell from "./components/layout/AppShell";
import { useHotkeys } from "./hooks/useHotkeys";
import { useAppStore } from "./store/appStore";
import { useMemoryHygiene } from "./store/lifecycle";

export default function App() {
  const bootstrap = useAppStore((state) => state.bootstrap);
  useHotkeys();
  useMemoryHygiene();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return <AppShell />;
}