import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { fetchProjects, fetchTasks } from "@/lib/queries";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, FolderKanban, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

const schema = z.object({
  name: z.string().trim().min(1, "Name required").max(120),
  description: z.string().trim().max(500).optional(),
});

const Projects = () => {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => fetchTasks() });
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      name: fd.get("name"),
      description: fd.get("description") || "",
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("projects").insert({
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      created_by: user!.id,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Project created");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin ? "Create projects and assign work to your team." : "Projects you belong to."}
          </p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" />New project</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create project</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" required maxLength={120} autoFocus />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" maxLength={500} rows={3} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <Card className="p-12 text-center shadow-card">
          <FolderKanban className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No projects yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin ? "Create your first project to start organizing tasks." : "An admin needs to add you to a project."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => {
            const projectTasks = tasks.filter((t) => t.project_id === p.id);
            const done = projectTasks.filter((t) => t.status === "done").length;
            return (
              <Link key={p.id} to={`/projects/${p.id}`}>
                <Card className="p-5 shadow-card hover:shadow-elegant transition-shadow h-full flex flex-col group">
                  <div className="flex items-start justify-between">
                    <div className="h-10 w-10 rounded-lg bg-gradient-primary flex items-center justify-center">
                      <FolderKanban className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-foreground transition-all" />
                  </div>
                  <h3 className="font-semibold mt-4 truncate">{p.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2 flex-1">
                    {p.description || "No description"}
                  </p>
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                    <Badge variant="secondary" className="text-[10px]">
                      {projectTasks.length} task{projectTasks.length !== 1 ? "s" : ""}
                    </Badge>
                    {projectTasks.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {done}/{projectTasks.length} done
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {format(parseISO(p.created_at), "MMM d")}
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Projects;
