import WorkspaceModeSwitch from "@/components/WorkspaceModeSwitch";
import ScholarAnalyticsDashboard from "@/components/scholar/ScholarAnalyticsDashboard";
import ScholarSectionTabs from "@/components/scholar/ScholarSectionTabs";

export default function ScholarAnalyticsPage() {
  return (
    <div className="flex h-full flex-col gap-4 px-4 py-4 sm:px-5">
      <WorkspaceModeSwitch />
      <ScholarSectionTabs />
      <div className="rounded-[32px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(12,18,30,0.88),rgba(8,12,20,0.8))] px-4 py-4 shadow-[0_30px_110px_rgba(2,8,23,0.32)] sm:px-5 sm:py-5">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-amber-100/70">
              Scholar analytics
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Subject accuracy and weak-area dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
              Review saved mock attempts, scan weak subjects, and track whether topic-level accuracy is actually improving.
            </p>
          </div>
        </div>

        <ScholarAnalyticsDashboard />
      </div>
    </div>
  );
}
