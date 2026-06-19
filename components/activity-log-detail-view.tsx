export type ActivityLogDetail = {
  id: string;
  createdAt: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  category: string;
  entityType: string | null;
  entityId: string | null;
  routePath: string | null;
  httpMethod: string | null;
  statusCode: number | null;
  summary: string;
  actorName: string | null;
  actorEmail: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export function ActivityLogDetailView({ activity }: { activity: ActivityLogDetail }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2 text-sm">
        <p><span className="font-medium">Time:</span> {new Date(activity.createdAt).toLocaleString()}</p>
        <p><span className="font-medium">Actor:</span> {activity.actorEmail ?? activity.actorName ?? "System"}</p>
        <p><span className="font-medium">Action:</span> {activity.action}</p>
        <p><span className="font-medium">Category:</span> {activity.category}</p>
        <p><span className="font-medium">Path:</span> {activity.routePath ?? "-"}</p>
      </div>

      <div className="grid gap-2">
        <h3 className="font-medium">Summary</h3>
        <p className="rounded-md border bg-muted/30 p-3 text-sm">{activity.summary}</p>
      </div>

      <div className="grid gap-2">
        <h3 className="font-medium">Payload (Redacted)</h3>
        <pre className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-all">{JSON.stringify(activity.payload, null, 2)}</pre>
      </div>

      <div className="grid gap-2">
        <h3 className="font-medium">Metadata</h3>
        <pre className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-all">{JSON.stringify(activity.metadata, null, 2)}</pre>
      </div>
    </div>
  );
}
