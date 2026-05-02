import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { fetchProject, fetchTasks, fetchProjectMembers, fetchProfiles, Task, TaskStatus, TaskPriority } from "@/lib/queries";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ArrowLeft, Trash2, Calendar, UserPlus, Loader2, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";
import { format, isPast, parseISO } from "date-fns";

const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(["todo", "in_progress", "done"]),
  priority: z.enum(["low", "medium", "high"]),
  due_date: z.string().optional(),
  assigned_to: z.string().optional(),
});

const PRIORITY_VARIANT: Record<TaskPriority, "secondary" | "default" | "destructive"> = {
  low: "secondary",
  medium: "default",
  high: "destructive",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
};

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [taskOpen, setTaskOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: project, isLoading: projLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => fetchProject(id!),
    enabled: !!id,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", id],
    queryFn: () => fetchTasks(id),
    enabled: !!id,
  });
  const { data: memberRows = [] } = useQuery({
    queryKey: ["project_members", id],
    queryFn: () => fetchProjectMembers(id!),
    enabled: !!id,
  });
  const { data: profiles = [] } = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const memberIds = new Set(memberRows.map((m) => m.user_id));
  const members = profiles.filter((p) => memberIds.has(p.id));
  const nonMembers = profiles.filter((p) => !memberIds.has(p.id) && p.id !== project?.created_by);

  const handleCreateTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = taskSchema.safeParse({
      title: fd.get("title"),
      description: fd.get("description") || "",
      status: fd.get("status"),
      priority: fd.get("priority"),
      due_date: fd.get("due_date") || undefined,
      assigned_to: fd.get("assigned_to") || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("tasks").insert({
      project_id: id!,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      status: parsed.data.status,
      priority: parsed.data.priority,
      due_date: parsed.data.due_date || null,
      assigned_to: parsed.data.assigned_to && parsed.data.assigned_to !== "none" ? parsed.data.assigned_to : null,
      created_by: user!.id,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Task created");
    setTaskOpen(false);
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const updateStatus = async (taskId: string, status: TaskStatus) => {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm("Delete this task?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Task deleted");
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const addMember = async (userId: string) => {
    const { error } = await supabase.from("project_members").insert({ project_id: id!, user_id: userId });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Member added");
    qc.invalidateQueries({ queryKey: ["project_members", id] });
  };

  const removeMember = async (userId: string) => {
    const { error } = await supabase.from("project_members").delete().eq("project_id", id!).eq("user_id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Member removed");
    qc.invalidateQueries({ queryKey: ["project_members", id] });
  };

  if (projLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!project) return <p className="text-sm text-muted-foreground">Project not found.</p>;

  const grouped: Record<TaskStatus, Task[]> = {
    todo: tasks.filter((t) => t.status === "todo"),
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    done: tasks.filter((t) => t.status === "done"),
  };

  // Assignee picker pulls from members + creator (so admins can assign anyone in project)
  const assignees = [
    ...(project.created_by && profileMap.get(project.created_by) ? [profileMap.get(project.created_by)!] : []),
    ...members.filter((m) => m.id !== project.created_by),
  ];

  return (
    <div className="space-y-6">
      <Link to="/projects" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" />Back to projects
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">{project.description || "No description"}</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><UserPlus className="h-4 w-4 mr-1" />Members</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Project members</DialogTitle></DialogHeader>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {members.length === 0 && <p className="text-sm text-muted-foreground">No members yet.</p>}
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg border">
                      <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{(m.name || m.email).slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.name || m.email}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeMember(m.id)}><X className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  {nonMembers.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-muted-foreground uppercase pt-3">Add</p>
                      {nonMembers.map((p) => (
                        <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg border border-dashed">
                          <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{(p.name || p.email).slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.name || p.email}</p>
                            <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => addMember(p.id)}>Add</Button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
          {isAdmin && (
            <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-1" />New task</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create task</DialogTitle></DialogHeader>
                <form onSubmit={handleCreateTask} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" name="title" required maxLength={200} autoFocus />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" name="description" rows={3} maxLength={2000} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select name="status" defaultValue="todo">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">Todo</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select name="priority" defaultValue="medium">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="due_date">Due date</Label>
                      <Input id="due_date" name="due_date" type="date" />
                    </div>
                    <div className="space-y-2">
                      <Label>Assign to</Label>
                      <Select name="assigned_to" defaultValue="none">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {assignees.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.name || a.email}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={submitting}>
                      {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="list">List</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(["todo", "in_progress", "done"] as TaskStatus[]).map((col) => (
              <Card key={col} className="p-4 shadow-card bg-secondary/30">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">{STATUS_LABELS[col]}</h3>
                  <Badge variant="outline">{grouped[col].length}</Badge>
                </div>
                <div className="space-y-2 min-h-[100px]">
                  {grouped[col].map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      assignee={t.assigned_to ? profileMap.get(t.assigned_to) : null}
                      canUpdate={isAdmin || t.assigned_to === user?.id}
                      canDelete={isAdmin}
                      onUpdateStatus={(s) => updateStatus(t.id, s)}
                      onDelete={() => deleteTask(t.id)}
                    />
                  ))}
                  {grouped[col].length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">No tasks</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <Card className="shadow-card">
            {tasks.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No tasks in this project.</p>
            ) : (
              <div className="divide-y">
                {tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    assignee={t.assigned_to ? profileMap.get(t.assigned_to) : null}
                    canUpdate={isAdmin || t.assigned_to === user?.id}
                    canDelete={isAdmin}
                    onUpdateStatus={(s) => updateStatus(t.id, s)}
                    onDelete={() => deleteTask(t.id)}
                  />
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const TaskCard = ({ task, assignee, canUpdate, canDelete, onUpdateStatus, onDelete }: any) => {
  const overdue = task.due_date && task.status !== "done" && isPast(parseISO(task.due_date));
  return (
    <Card className="p-3 shadow-sm bg-card">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm flex-1">{task.title}</p>
        {canDelete && (
          <Button variant="ghost" size="icon" className="h-6 w-6 -mt-1 -mr-1" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {task.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>}
      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        <Badge variant={PRIORITY_VARIANT[task.priority as TaskPriority]} className="text-[10px] h-4 px-1.5">{task.priority}</Badge>
        {task.due_date && (
          <span className={`inline-flex items-center text-[11px] ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
            {overdue ? <AlertCircle className="h-3 w-3 mr-0.5" /> : <Calendar className="h-3 w-3 mr-0.5" />}
            {format(parseISO(task.due_date), "MMM d")}
          </span>
        )}
        {assignee && (
          <Avatar className="h-5 w-5 ml-auto"><AvatarFallback className="text-[9px]">{(assignee.name || assignee.email).slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
        )}
      </div>
      {canUpdate && (
        <Select value={task.status} onValueChange={onUpdateStatus}>
          <SelectTrigger className="h-7 text-xs mt-2"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todo">Todo</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>
      )}
    </Card>
  );
};

const TaskRow = ({ task, assignee, canUpdate, canDelete, onUpdateStatus, onDelete }: any) => {
  const overdue = task.due_date && task.status !== "done" && isPast(parseISO(task.due_date));
  return (
    <div className="p-3 flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[180px]">
        <p className="font-medium text-sm">{task.title}</p>
        {task.description && <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>}
      </div>
      <Badge variant={PRIORITY_VARIANT[task.priority as TaskPriority]} className="text-[10px] h-4 px-1.5">{task.priority}</Badge>
      {task.due_date && (
        <span className={`inline-flex items-center text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
          {overdue ? <AlertCircle className="h-3 w-3 mr-1" /> : <Calendar className="h-3 w-3 mr-1" />}
          {format(parseISO(task.due_date), "MMM d, yyyy")}
        </span>
      )}
      {assignee ? (
        <div className="flex items-center gap-1.5">
          <Avatar className="h-6 w-6"><AvatarFallback className="text-[10px]">{(assignee.name || assignee.email).slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
          <span className="text-xs text-muted-foreground">{assignee.name || assignee.email}</span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">Unassigned</span>
      )}
      {canUpdate ? (
        <Select value={task.status} onValueChange={onUpdateStatus}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todo">Todo</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[task.status as TaskStatus]}</Badge>
      )}
      {canDelete && (
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export default ProjectDetail;
