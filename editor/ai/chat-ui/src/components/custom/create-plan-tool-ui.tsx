/**
 * Plan Tool UI — renders exit_plan_mode calls.
 * Shows plan summary, steps, and approve/reject buttons inline.
 * "View Plan" opens the full plan content in a side drawer.
 */

import { makeAssistantToolUI, useAui } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import {
	SquareFunctionIcon,
	CircleIcon,
	CircleDotIcon,
	SkipForwardIcon,
	PlayIcon,
	XIcon,
	FileTextIcon,
	ListTodoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Streamdown } from "streamdown";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { setAgentId, setActivePlan, useActivePlan, type PlanStepState } from "@/bridge";
import { type FC, useState } from "react";

const StepIcon: FC<{ status: PlanStepState["status"] }> = ({ status }) => {
	switch (status) {
		case "done":
			return <SquareFunctionIcon className="size-3.5 text-emerald-500 shrink-0" />;
		case "in_progress":
			return <CircleDotIcon className="size-3.5 text-primary shrink-0 animate-pulse" />;
		case "skipped":
			return <SkipForwardIcon className="size-3.5 text-muted-foreground/50 shrink-0" />;
		default:
			return <CircleIcon className="size-3.5 text-muted-foreground/40 shrink-0" />;
	}
};

interface ExitPlanModeArgs {
	plan_summary: string;
	plan_content: string;
	steps: string[];
}

export const ExitPlanModeToolUI = makeAssistantToolUI<ExitPlanModeArgs, unknown>({
	toolName: "exit_plan_mode",
	render: ({ args, status }) => {
		if (!args) return null;

		const isRunning = status?.type === "running";
		const isDone = status?.type === "complete";
		const activePlan = useActivePlan();
		const steps = activePlan?.steps ?? (args.steps ?? []).map((s) => ({ title: s, status: "pending" as const }));
		const total = steps.length;
		const done = steps.filter((s) => s.status === "done").length;
		// Show approval while tool is running OR has just completed (before user decides)
		const pendingApproval = (isRunning || isDone) && !activePlan && (args.steps ?? []).length > 0;
		const [viewOpen, setViewOpen] = useState(false);

		const aui = useAui();
		const [decided, setDecided] = useState<"approved" | "rejected" | null>(null);

		const handleApprove = () => {
			setDecided("approved");
			setActivePlan({
				summary: args.plan_summary,
				steps: (args.steps ?? []).map((s) => ({ title: s, status: "pending" })),
			});
			setAgentId("agent");
			const composer = aui.thread().composer();
			const stepsRef = (args.steps ?? []).map((s, i) => `${i}. ${s}`).join("\n");
			composer.setText(
				`[PLAN_EXEC]\nThe plan has been approved. Execute the following:\n\n${args.plan_content ?? args.plan_summary}\n\n---\nStep indices for update_plan:\n${stepsRef}`,
			);
			composer.send();
		};

		const handleReject = () => {
			setDecided("rejected");
			const composer = aui.thread().composer();
			composer.setText("The plan was rejected. Please revise it.");
			composer.send();
		};

		return (
			<div className="w-full rounded-lg border border-border/60 bg-card/30 p-4">
				{/* Header */}
				<div className="flex items-center gap-2 pb-3 border-b border-border/40">
					<ListTodoIcon className="size-4 shrink-0 text-muted-foreground" />
					<span className="text-sm font-medium truncate flex-1">
						{isDone ? "Plan approved" : "Plan"}: {args.plan_summary}
					</span>
					{isDone && done > 0 && (
						<span className="text-xs text-muted-foreground/50 tabular-nums">
							{done}/{total}
						</span>
					)}
				</div>

				{/* Steps */}
				<div className="flex flex-col gap-1 pt-3 pb-1">
					{steps.map((step, i) => (
						<div key={i} className="flex items-center gap-2">
							<StepIcon status={step.status} />
							<span
								className={cn(
									"text-sm",
									step.status === "done" && "text-muted-foreground line-through",
									step.status === "skipped" && "text-muted-foreground/60 line-through",
									step.status === "in_progress" && "text-foreground font-medium",
									step.status === "pending" && "text-foreground",
								)}
							>
								{step.title}
							</span>
						</div>
					))}
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
					{/* View Plan button */}
					<DialogPrimitive.Root open={viewOpen} onOpenChange={setViewOpen}>
						<DialogPrimitive.Trigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
							<FileTextIcon className="size-3.5 shrink-0" />
							<span className="underline decoration-muted-foreground/30 underline-offset-2">
								View Plan
							</span>
						</DialogPrimitive.Trigger>
						<DialogPrimitive.Portal>
							<DialogPrimitive.Backdrop className="fixed inset-0 isolate z-50 bg-black/20 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
							<DialogPrimitive.Popup className="fixed top-2 right-2 bottom-2 z-50 flex flex-col w-[min(640px,calc(100vw-1rem))] overflow-hidden rounded-lg border border-border/70 bg-card text-card-foreground shadow-xl duration-200 outline-none data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-right-full data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-right-full">
								<div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
									<FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
									<DialogPrimitive.Title className="flex-1 text-sm font-medium truncate">
										{args.plan_summary}
									</DialogPrimitive.Title>
									<DialogPrimitive.Close
										render={<Button variant="ghost" size="icon-sm" className="-mr-1 shrink-0" />}
										aria-label="Close"
									>
										<XIcon />
									</DialogPrimitive.Close>
								</div>
								<div className="flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed">
									<Streamdown mode="static">{args.plan_content}</Streamdown>
								</div>
							</DialogPrimitive.Popup>
						</DialogPrimitive.Portal>
					</DialogPrimitive.Root>

					{/* Approval or status */}
					{decided === "approved" ? (
						<span className="text-xs text-emerald-500">Approved</span>
					) : decided === "rejected" ? (
						<span className="text-xs text-destructive">Rejected</span>
					) : pendingApproval ? (
						<div className="flex items-center gap-1.5">
							<Button variant="ghost" size="sm" onClick={handleReject}>
								<XIcon className="size-3.5" />
								Reject
							</Button>
							<Button size="sm" onClick={handleApprove}>
								<PlayIcon className="size-3.5" />
								Execute
							</Button>
						</div>
					) : null}
				</div>
			</div>
		);
	},
});
