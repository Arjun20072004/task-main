import { useQuery } from "@tanstack/react-query";
import { fetchTasks, fetchProjects, fetchProfiles, Task } from "@/lib/queries";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertTriangle, ListTodo, FolderKanban, User } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { format, isPast, parseISO } from "date-fns";
import { Link } from "react-router-dom";

const STATUS_COLORS = {
  todo: "hsl(var(--muted-foreground))",
  in_progress: "hsl(var(--info))",
  done: "hsl(var(--success))",
};

const PRIORITY_VARIANT: Record<string, "secondary" | "default" | "destructive"> = {
  low: "secondary",
  medium: "default",
  high: "destructive",
};

const StatCard = ({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number | string; tone: string }) => (
  <Card className="p-5 shadow-card">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-3xl font-bold mt-2">{value}</p>
      </div>
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </Card>
);

const Dashboard = () => {
  const { user } = useAuth();
  const { data: tasks = [], isLoading } = useQuery({ queryKey: ["tasks"], queryFn: () => fetchTasks() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const { data: profiles = [] } = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const counts = {
    total: tasks.length,
    todo: tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
    overdue: tasks.filter((t) => t.due_date && t.status !== "done" && isPast(parseISO(t.due_date))).length,
    mine: tasks.filter((t) => t.assigned_to === user?.id).length,
  };

  const statusData = [
    { name: "Todo", value: counts.todo, key: "todo" },
    { name: "In Progress", value: counts.in_progress, key: "in_progress" },
    { name: "Done", value: counts.done, key: "done" },
  ];

  const projectBars = projects.slice(0, 6).map((p) => {
    const t = tasks.filter((x) => x.project_id === p.id);
    return {
      name: p.name.length > 14 ? p.name.slice(0, 14) + "…" : p.name,
      Todo: t.filter((x) => x.status === "todo").length,
      "In Progress": t.filter((x) => x.status === "in_progress").length,
      Done: t.filter((x) => x.status === "done").length,
    };
  });

  const recent = [...tasks]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your team's work.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={ListTodo} label="Total" value={counts.total} tone="bg-accent text-accent-foreground" />
        <StatCard icon={Clock} label="Todo" value={counts.todo} tone="bg-muted text-muted-foreground" />
        <StatCard icon={Clock} label="In Progress" value={counts.in_progress} tone="bg-info/10 text-info" />
        <StatCard icon={CheckCircle2} label="Done" value={counts.done} tone="bg-success/10 text-success" />
        <StatCard icon={AlertTriangle} label="Overdue" value={counts.overdue} tone="bg-destructive/10 text-destructive" />
        <StatCard icon={User} label="Assigned to me" value={counts.mine} tone="bg-primary/10 text-primary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-5 shadow-card lg:col-span-1">
          <h3 className="font-semibold mb-4">Tasks by status</h3>
          {counts.total === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No tasks yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {statusData.map((entry) => (
                    <Cell key={entry.key} fill={STATUS_COLORS[entry.key as keyof typeof STATUS_COLORS]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex justify-center gap-4 text-xs mt-2">
            {statusData.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[s.key as keyof typeof STATUS_COLORS] }} />
                {s.name}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 shadow-card lg:col-span-2">
          <h3 className="font-semibold mb-4">Tasks per project</h3>
          {projectBars.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No projects yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={projectBars}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="Todo" stackId="a" fill={STATUS_COLORS.todo} radius={[0, 0, 0, 0]} />
                <Bar dataKey="In Progress" stackId="a" fill={STATUS_COLORS.in_progress} />
                <Bar dataKey="Done" stackId="a" fill={STATUS_COLORS.done} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card className="p-5 shadow-card">
        <h3 className="font-semibold mb-4">Recent activity</h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No tasks yet — create a project to get started.</p>
        ) : (
          <div className="divide-y">
            {recent.map((t: Task) => {
              const proj = projectMap.get(t.project_id);
              const assignee = t.assigned_to ? profileMap.get(t.assigned_to) : null;
              return (
                <div key={t.id} className="py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{t.title}</span>
                      <Badge variant={PRIORITY_VARIANT[t.priority]} className="text-[10px] h-4 px-1.5">{t.priority}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      {proj && (
                        <Link to={`/projects/${proj.id}`} className="inline-flex items-center gap-1 hover:text-foreground">
                          <FolderKanban className="h-3 w-3" />{proj.name}
                        </Link>
                      )}
                      <span>· updated {format(parseISO(t.updated_at), "MMM d, HH:mm")}</span>
                      {assignee && <span>· {assignee.name || assignee.email}</span>}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{t.status.replace("_", " ")}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

export default Dashboard;
