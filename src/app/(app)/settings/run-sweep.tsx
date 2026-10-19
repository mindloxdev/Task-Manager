"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type SweepResult = {
  deadlineReminders: number;
  overdueNotices: number;
  updateNudges: number;
  tasksScanned: number;
};

/** Lets an owner run the reminder sweep by hand, for testing or catch-up. */
export function RunSweepButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<SweepResult | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      const response = await fetch("/api/cron/reminders", { method: "POST", cache: "no-store" });
      const payload = (await response.json()) as { ok: boolean; data?: SweepResult; error?: string };
      if (!response.ok || !payload.ok || !payload.data) {
        toast({ tone: "error", title: "The sweep did not run", description: payload.error ?? `Server returned ${response.status}` });
        return;
      }
      setLast(payload.data);
      const created = payload.data.deadlineReminders + payload.data.overdueNotices + payload.data.updateNudges;
      toast({
        tone: "success",
        title: created > 0 ? `${created} reminders sent` : "Nothing needed sending",
        description: `Scanned ${payload.data.tasksScanned} open tasks with a deadline.`,
      });
      router.refresh();
    } catch {
      toast({ tone: "error", title: "The sweep did not run", description: "Check your connection and try again." });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" loading={running} onClick={run}>
        <Play className="size-3.5" aria-hidden="true" />
        Run the sweep now
      </Button>
      {last ? (
        <p className="text-xs text-fg-muted" aria-live="polite">
          {last.tasksScanned} tasks scanned · {last.deadlineReminders} deadline reminders ·{" "}
          {last.overdueNotices} overdue notices · {last.updateNudges} update nudges
        </p>
      ) : null}
    </div>
  );
}
