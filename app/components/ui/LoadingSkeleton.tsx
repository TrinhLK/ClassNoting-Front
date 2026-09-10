import { cn } from "@/app/lib/cn";

interface SkeletonProps {
  className?: string;
}

function SkeletonBlock({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse bg-slate-200 rounded-lg", className)} />;
}

export function TextSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock
          key={i}
          className={cn("h-4", i === lines - 1 ? "w-3/4" : "w-full")}
        />
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
      <SkeletonBlock className="h-5 w-1/3" />
      <TextSkeleton lines={2} />
      <SkeletonBlock className="h-3 w-1/4" />
    </div>
  );
}

export function MeetingListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-4">
          <SkeletonBlock className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-4 w-1/2" />
            <SkeletonBlock className="h-3 w-1/4" />
          </div>
          <SkeletonBlock className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function MeetingDetailSkeleton() {
  return (
    <div className="h-full flex flex-col">
      <SkeletonBlock className="h-16 w-full rounded-none mb-4" />
      <div className="flex-1 flex p-8 gap-6">
        <div className="flex-1 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <SkeletonBlock className="w-16 h-8" />
              <SkeletonBlock className="flex-1 h-20" />
            </div>
          ))}
        </div>
        <SkeletonBlock className="w-80" />
      </div>
    </div>
  );
}

export function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <SkeletonBlock className="h-8 w-8 rounded-lg" />
          <SkeletonBlock className="h-3 w-1/2" />
          <SkeletonBlock className="h-7 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export default SkeletonBlock;
