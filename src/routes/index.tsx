import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const JvApp = lazy(() => import("@/jv/JvApp"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JV Analyzer — Solar cell J–V analysis" },
      { name: "description", content: "Extract PCE, Voc, Jsc and FF from J–V scans, plot parameters and inspect forward and reverse sweeps." },
      { property: "og:title", content: "JV Analyzer — Solar cell J–V analysis" },
      { property: "og:description", content: "Extract PCE, Voc, Jsc and FF from J–V scans, plot parameters and inspect forward and reverse sweeps." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const fallback = <div className="h-screen bg-bg" />;
  return (
    <div id="app-root" className="h-screen">
      <ClientOnly fallback={fallback}>
        <Suspense fallback={fallback}>
          <JvApp />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
